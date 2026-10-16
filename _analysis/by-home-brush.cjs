// ============================================================================
//  _analysis/by-home-brush.cjs —— 首页「逐光而行」（素材版）验收
// ----------------------------------------------------------------------------
//  查这些（用户逐条要求的，一条都不许含糊）：
//    ① 两行标题结构：英文 CHASING PHOTONS 在上、中文素材在下
//    ② 素材真的加载成功（naturalWidth>0）、真透明（不是白底方块）
//    ③ **不变形**：渲染宽高比必须等于素材固有宽高比
//    ④ 不遮挡「开始探索」按钮，且真能点得进去
//    ⑤ 动效克制：主体**没有**缩放/旋转/抖动（用户点名不要）
//    ⑥ 鼠标靠近时星芒亮起，离开时复位
//    ⑦ 1280/1600/1920/2560 都不溢出
//    ⑧ 原有功能全在：左侧导航 / kicker / 副文案 / 底部提示
//
//  ⚠️ 踩过的坑（沿用上一轮的教训）：
//   · 不能 locator('.brush2').hover() —— pointer-events:none，
//     Playwright 会报 canvas 拦截；用 mouse.move。
//   · 「是否进了 PHOTON」用 DOM 判据（.home 消失），不要读 useThemeStore 字段
//     （它没挂到 window 上）。
// ============================================================================
const { chromium } = require('playwright-core')
const fs = require('fs')
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const URL = process.env.URL || 'http://localhost:5197/'
const OUT = '_analysis/home-art/'

let pass = 0, fail = 0
const fails = []
function ok(c, name, extra = '') {
  if (c) { pass++; console.log('  PASS  ' + name) }
  else { fail++; fails.push(name); console.log('  FAIL  ' + name + (extra ? '  <- ' + extra : '')) }
}

;(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--force-device-scale-factor=1'] })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  const errs = []
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()) })
  page.on('pageerror', (e) => errs.push(String(e)))

  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1400)

  console.log('\n=== ① 两行标题结构 ===')
  const en = page.locator('.home__title-en').first()
  ok(await en.count() === 1, '英文行 .home__title-en 存在且唯一')
  const enTxt = (await en.textContent() || '').trim()
  ok(enTxt === 'CHASING PHOTONS', '英文行 = CHASING PHOTONS', enTxt)
  const enBox = await en.boundingBox()
  const b2 = page.locator('.brush2')
  ok(await b2.count() === 1, '中文素材容器 .brush2 挂载')
  const b2Box = await b2.boundingBox()

  console.log('\n=== ② 素材真的加载且是真透明 ===')
  const img = await page.evaluate(() => {
    const i = document.querySelector('.brush2__img')
    if (!i) return null
    return {
      src: i.currentSrc || i.src,
      nw: i.naturalWidth, nh: i.naturalHeight,
      complete: i.complete,
    }
  })
  ok(!!img, 'img 元素存在')
  ok(img && img.complete && img.nw > 0, '素材加载成功（naturalWidth>0）',
     img && (img.nw + 'x' + img.nh))
  ok(img && /webp|png/.test(img.src), '走了 webp/png 素材', img && img.src.split('/').pop())
  ok(img && img.nw === 1671 && img.nh === 585,
     '素材固有尺寸 = 1671x585（与生成脚本一致）', img && (img.nw + 'x' + img.nh))

  // 真透明：把素材画到 canvas 上直接读像素
  const trans = await page.evaluate(async () => {
    const i = document.querySelector('.brush2__img')
    const bmp = await createImageBitmap(i)
    const c = document.createElement('canvas')
    c.width = bmp.width; c.height = bmp.height
    const g = c.getContext('2d')
    g.drawImage(bmp, 0, 0)
    const corners = [[0, 0], [bmp.width - 1, 0], [0, bmp.height - 1], [bmp.width - 1, bmp.height - 1]]
    const ca = corners.map(([x, y]) => g.getImageData(x, y, 1, 1).data[3])
    // 白边检测：半透明但颜色很亮的像素 = 白边特征
    const d = g.getImageData(0, 0, bmp.width, bmp.height).data
    let halo = 0, lit = 0
    for (let k = 0; k < d.length; k += 16) {
      const a = d[k + 3]
      if (a > 8) {
        lit++
        if (d[k] > 235 && d[k + 1] > 235 && d[k + 2] > 235) halo++
      }
    }
    return { ca, halo, lit }
  })
  ok(trans && trans.ca.every((v) => v === 0), '四角 alpha=0（真透明，不是白底方块）',
     trans && JSON.stringify(trans.ca))
  ok(trans && trans.halo === 0, '无白边特征像素（半透明且很亮的 = 0）',
     trans && ('halo=' + trans.halo))
  ok(trans && trans.lit > 0, '确实画出了内容（非空白）', trans && ('lit=' + trans.lit))

  console.log('\n=== ②b 艺术字周围没有灰白矩形（用户本次第一诉求）===')
  // 探针法：容器及其所有子节点都不许有「会铺满容器的半透明面」。
  // v1 的 .brush2__sheen 就是反例：inset:0 + screen + circle 620px，
  // 在 394px 高的容器里被上下边缘硬切 → 一块灰白矩形。
  const styles = await page.evaluate(() => {
    const out = []
    const root = document.querySelector('.brush2')
    const rb = root.getBoundingClientRect()
    for (const e of [root, ...root.querySelectorAll('*')]) {
      const s = getComputedStyle(e)
      const bg = s.backgroundImage
      const r = e.getBoundingClientRect()
      // ⚠️ 只有「**大面积**半透明面」才会读成矩形。局部小圆光斑/星点
      //    （.brush2__glow 240px、.brush2__spark 5~7px）是安全的，
      //    它们不铺满容器，四边也早已淡到全透明 —— 不该被这条误伤。
      //    门槛取容器面积的 25%。
      const areaRatio = rb.width * rb.height > 0
        ? (r.width * r.height) / (rb.width * rb.height) : 0
      if (areaRatio < 0.25) continue

      const bad = []
      if (bg && bg !== 'none') bad.push('background-image')
      if (s.backgroundColor && s.backgroundColor !== 'rgba(0, 0, 0, 0)') bad.push('background-color')
      if (s.backdropFilter && s.backdropFilter !== 'none') bad.push('backdrop-filter')
      if (s.boxShadow && s.boxShadow !== 'none') bad.push('box-shadow')
      // ⚠️ filter 只在「不是 blur(≈0)」时报：入场动画 brush2In 的过渡途中
      //    会经过 blur(0.042px) 这种值（animation-fill-mode: both，且截图
      //    发生在 2.95s 之前），那是**动画残值**不是常驻滤镜。
      //    判据：解析出模糊半径，< 0.5px 视为 0。
      //    真正要抓的是 drop-shadow / brightness 之类会改变整块画面观感的滤镜。
      const f = s.filter
      if (f && f !== 'none') {
        const m = f.match(/blur\(([\d.]+)px\)/)
        const blurPx = m ? parseFloat(m[1]) : NaN
        const rest = f.replace(/blur\([^)]*\)/g, '').trim()
        if (!(rest === '' && blurPx < 0.5)) bad.push('filter:' + f)
      }

      // 渐变被容器边缘硬切 → 硬边矩形
      let clipped = false
      if (/gradient/.test(bg) && r.width && r.height) {
        const radii = (bg.match(/(\d+(?:\.\d+)?)px/g) || []).map(parseFloat)
        const maxR = radii.length ? Math.max(...radii) : 0
        if (maxR > Math.min(r.width, r.height) / 2) clipped = true
      }
      if (bad.length || clipped) {
        out.push({ cls: e.className || e.tagName, bad: bad.join(','),
                   clipped, areaPct: Math.round(areaRatio * 100),
                   w: Math.round(r.width), h: Math.round(r.height),
                   bg: bg.slice(0, 90) })
      }
    }
    return out
  })
  ok(styles.length === 0,
     '没有任何大面积元素带 background/backdrop-filter/box-shadow/filter',
     JSON.stringify(styles).slice(0, 300))
  ok(!styles.some((s) => s.clipped), '没有「渐变被容器边缘硬切」的矩形风险',
     JSON.stringify(styles.filter((s) => s.clipped)).slice(0, 300))

  // 光斑与星芒必须是「局部小圆」，面积远小于容器 —— 顺带证明这点
  const smalls = await page.evaluate(() => {
    const rb = document.querySelector('.brush2').getBoundingClientRect()
    const g = document.querySelector('.brush2__glow')
    const s = document.querySelector('.brush2__spark')
    const gr = g.getBoundingClientRect(), sr = s.getBoundingClientRect()
    return {
      glow: Math.round((gr.width * gr.height) / (rb.width * rb.height) * 1000) / 10,
      glowR: Math.round(gr.width),
      rbW: Math.round(rb.width), rbH: Math.round(rb.height),
      spark: Math.round(sr.width),
      blend: getComputedStyle(g).mixBlendMode,
    }
  })
  // 光斑必须**跟随容器**而不是固定 px：容器收窄后固定尺寸会让占比翻倍。
  // 探针量的是 getBoundingClientRect 的**外接方框**（不是圆面积，圆形被
  // border-radius 裁掉的部分不算），所以：
  //   占比 = (0.25W)² / (W·H) = 0.0625 · (W/H) = 0.0625 · 2.856 ≈ 17.85%
  const expectGlow = 0.0625 * (1671 / 585) * 100
  console.log('  容器 ' + smalls.rbW + '×' + smalls.rbH + '，光斑 ' + smalls.glowR +
              'px 圆（占容器 ' + smalls.glow + '%，理论 ' + expectGlow.toFixed(1) +
              '%），星芒 ' + smalls.spark + 'px，混合=' + smalls.blend)
  ok(smalls.glow < 20, '光斑面积 <20% 容器（不是一层膜）', smalls.glow + '%')
  ok(Math.abs(smalls.glow - expectGlow) < 1.5,
     '光斑随容器缩放（25% 宽 → 理论 ' + expectGlow.toFixed(1) + '%）',
     smalls.glow + '% vs ' + expectGlow.toFixed(1) + '%')
  ok(smalls.blend === 'soft-light', '光斑用 soft-light 而不是 screen（不会发灰提亮）',
     smalls.blend)

  // 像素法：把 .brush2 整块移出视口再截一张，两张对比 ——
  // 艺术字区域**外**的像素必须逐像素一致（证明没有向外溢出的光影）。
  const box0 = await page.locator('.brush2').boundingBox()
  await page.screenshot({ path: OUT + 'rect-a.png', clip: {
    x: Math.max(0, box0.x - 90), y: Math.max(0, box0.y - 70),
    width: Math.min(1440 - Math.max(0, box0.x - 90), box0.width + 180),
    height: Math.min(900 - Math.max(0, box0.y - 70), box0.height + 140) } })
  await page.evaluate(() => {
    const e = document.querySelector('.brush2')
    e.dataset._vis = e.style.visibility
    e.style.visibility = 'hidden'
  })
  await page.waitForTimeout(120)
  await page.screenshot({ path: OUT + 'rect-b.png', clip: {
    x: Math.max(0, box0.x - 90), y: Math.max(0, box0.y - 70),
    width: Math.min(1440 - Math.max(0, box0.x - 90), box0.width + 180),
    height: Math.min(900 - Math.max(0, box0.y - 70), box0.height + 140) } })
  await page.evaluate(() => {
    const e = document.querySelector('.brush2')
    e.style.visibility = e.dataset._vis || ''
  })
  ok(fs.existsSync(OUT + 'rect-a.png') && fs.existsSync(OUT + 'rect-b.png'),
     '矩形对比图已生成（rect-a / rect-b，供 Python 做像素差分）')

  console.log('\n=== ②c 颜色落在用户指定的低饱和色号区间 ===')
  // 读素材里「完全不透明」的笔画像素均值，应贴近 #A8B5C8 (168,181,200)
  const hue = await page.evaluate(async () => {
    const i = document.querySelector('.brush2__img')
    const bmp = await createImageBitmap(i)
    const c = document.createElement('canvas')
    c.width = bmp.width; c.height = bmp.height
    const g = c.getContext('2d')
    g.drawImage(bmp, 0, 0)
    const d = g.getImageData(0, 0, bmp.width, bmp.height).data
    let r = 0, gg = 0, b = 0, n = 0, nearWhite = 0
    for (let k = 0; k < d.length; k += 16) {
      if (d[k + 3] > 200) {
        r += d[k]; gg += d[k + 1]; b += d[k + 2]; n++
        if (d[k] > 225 && d[k + 1] > 230 && d[k + 2] > 235) nearWhite++
      }
    }
    return n ? { r: r / n, g: gg / n, b: b / n, n, nearWhite } : null
  })
  if (hue) {
    const dR = Math.abs(hue.r - 168), dG = Math.abs(hue.g - 181), dB = Math.abs(hue.b - 200)
    console.log('  笔画实心平均色 = (' + Math.round(hue.r) + ',' + Math.round(hue.g) +
                ',' + Math.round(hue.b) + ')  目标 #A8B5C8 = (168,181,200)')
    ok(dR < 12 && dG < 12 && dB < 12, '笔画主色 ≈ #A8B5C8 雾蓝灰',
       '(' + Math.round(hue.r) + ',' + Math.round(hue.g) + ',' + Math.round(hue.b) + ')')
    // HSV 饱和度：#A8B5C8 的 (200-168)/200 = 0.16
    const mx = Math.max(hue.r, hue.g, hue.b), mn = Math.min(hue.r, hue.g, hue.b)
    const sat = mx ? (mx - mn) / mx : 0
    ok(sat <= 0.22, 'HSV 饱和度 ≤0.22（低饱和，不是冷白）', sat.toFixed(3))
    ok(hue.nearWhite === 0, '没有大面积近白笔画（用户点名不要纯白）',
       'nearWhite=' + hue.nearWhite)
  } else {
    ok(false, '取不到笔落实心像素')
  }

  console.log('\n=== ③ 不拉伸、不变形 ===')
  const srcRatio = 1671 / 585
  const boxRatio = b2Box.width / b2Box.height
  ok(Math.abs(boxRatio - srcRatio) / srcRatio < 0.02,
     '容器宽高比 = 素材宽高比', boxRatio.toFixed(3) + ' vs ' + srcRatio.toFixed(3))
  const imgBox = await page.locator('.brush2__img').boundingBox()
  ok(Math.abs((imgBox.width / imgBox.height) - srcRatio) / srcRatio < 0.02,
     '图片渲染宽高比 = 素材宽高比', (imgBox.width / imgBox.height).toFixed(3))
  ok(Math.abs(imgBox.width / b2Box.width - 1) < 0.01, '图片铺满容器（未被 letterbox 缩窄）')

  console.log('\n=== ④ 英文在中文上方 + 视觉居中 ===')
  ok(b2Box.y > enBox.y + enBox.height - 4, '英文行位于中文上方',
     'en.bottom=' + Math.round(enBox.y + enBox.height) + ' brush.top=' + Math.round(b2Box.y))
  const cx = b2Box.x + b2Box.width / 2
  ok(Math.abs(cx - 1440 / 2) < 180, '艺术字水平居中', 'cx=' + Math.round(cx))
  ok(b2Box.y > 900 * 0.16 && b2Box.y + b2Box.height < 900 * 0.8,
     '完整落在首屏中段', 'y=' + Math.round(b2Box.y) + '..' + Math.round(b2Box.y + b2Box.height))

  console.log('\n=== ⑤ 不遮挡按钮 / 原有功能都在 ===')
  const cta = await page.locator('.home__go').boundingBox()
  ok(b2Box.y + b2Box.height <= cta.y, '素材底边不侵入按钮顶边',
     'img.bottom=' + Math.round(b2Box.y + b2Box.height) + ' cta.top=' + Math.round(cta.y))
  ok(await page.locator('.home__kicker').count() === 1, 'kicker 还在')
  ok(await page.locator('.home__blurb').count() >= 1, '副文案还在')
  ok(await page.locator('.home__hint').count() === 1, '底部提示还在')
  ok(await page.locator('nav, .nav, .navigation').count() >= 1, '左侧导航还在')

  let entered = false
  await page.locator('.home__go').click({ timeout: 4000 })
  for (let i = 0; i < 24; i++) {
    await page.waitForTimeout(200)
    if ((await page.locator('.home').count()) === 0) { entered = true; break }
  }
  ok(entered, '点「开始探索」能进 PHOTON（素材没挡住点击）')
  if (entered) {
    await page.waitForTimeout(500)
    ok(await page.locator('.headline__line').count() >= 2, 'PHOTON 章节标题正常')
  }

  console.log('\n=== ⑥ 动效克制：主体不缩放/不旋转/不抖动 ===')
  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.waitForTimeout(3400)
  const tfs = []
  for (let i = 0; i < 4; i++) {
    tfs.push(await page.evaluate(() => {
      const e = document.querySelector('.brush2__img')
      return { tr: getComputedStyle(e).transform, w: e.clientWidth, h: e.clientHeight }
    }))
    await page.waitForTimeout(700)
  }
  ok(tfs.every((t) => t.tr === tfs[0].tr),
     '主体 transform 恒定（无旋转/抖动/缩放）', tfs[0].tr)
  ok(tfs.every((t) => t.w === tfs[0].w && t.h === tfs[0].h),
     '主体尺寸恒定（无呼吸缩放）')

  console.log('\n=== ⑦ 鼠标靠近 → 星芒微亮，离开复位 ===')
  const bx = await page.locator('.brush2').boundingBox()
  // ⚠️「远处」必须选**真的在元素外**的点：判定框是元素矩形外扩 12%，
  // 所以取左侧 12% 宽度之外的位置（原先取 200,200 恰好落在外扩框内，
  // 于是 is-near 合理地存在 → 假失败）。
  const farX = Math.max(2, bx.x - 260)
  const farY = Math.max(2, bx.y - 160)
  await page.mouse.move(farX, farY)
  await page.waitForTimeout(800)
  const far = await page.evaluate(() => {
    const e = document.querySelector('.brush2')
    const s = document.querySelector('.brush2__spark')
    return { cls: e.className, near: e.style.getPropertyValue('--near'),
             op: parseFloat(getComputedStyle(s).opacity) }
  })
  await page.mouse.move(bx.x + bx.width / 2, bx.y + bx.height / 2, { steps: 8 })
  await page.waitForTimeout(1200)
  const near = await page.evaluate(() => {
    const e = document.querySelector('.brush2')
    const s = document.querySelector('.brush2__spark')
    return { cls: e.className, near: e.style.getPropertyValue('--near'),
             op: parseFloat(getComputedStyle(s).opacity) }
  })
  console.log('  远处 (' + Math.round(farX) + ',' + Math.round(farY) + '): near=' +
              far.near + ' 星芒opacity=' + far.op.toFixed(3))
  console.log('  近处: near=' + near.near + ' 星芒opacity=' + near.op.toFixed(3))
  ok(!/is-near/.test(far.cls), '鼠标在元素外时无 is-near', far.cls)
  ok(far.op <= 0.05, '远处星芒几乎不亮（≤0.05）', far.op.toFixed(3))
  ok(/is-near/.test(near.cls), '靠近时加上了 is-near', near.cls)
  ok(near.op > far.op + 0.05, '星芒亮度随靠近提升',
     far.op.toFixed(3) + ' -> ' + near.op.toFixed(3))
  ok(near.op <= 0.45, '星芒峰值 ≤0.45（克制，不是闪烁）', near.op.toFixed(3))
  await page.screenshot({ path: OUT + 'img-1440.png' })
  await page.mouse.move(farX, farY, { steps: 6 })
  await page.waitForTimeout(900)
  const back = await page.evaluate(() => document.querySelector('.brush2').className)
  ok(!/is-near/.test(back), '移开后复位', back)

  console.log('\n=== ⑧ 多宽度不溢出 ===')
  for (const w of [1280, 1600, 1920, 2560]) {
    await page.setViewportSize({ width: w, height: 900 })
    await page.goto(URL, { waitUntil: 'networkidle' })
    await page.waitForTimeout(3400)
    const b = await page.locator('.brush2__img').boundingBox()
    ok(b.x >= -2 && b.x + b.width <= w + 2, w + 'px 下素材不溢出',
       'x=' + Math.round(b.x) + ' w=' + Math.round(b.width))
    if (w === 1280) await page.screenshot({ path: OUT + 'img-1280.png' })
  }

  console.log('\n=== ⑨ 控制台无报错 ===')
  const realErrs = errs.filter((e) => !/favicon|ResizeObserver/i.test(e))
  ok(realErrs.length === 0, '无 console error / pageerror', realErrs.slice(0, 3).join(' | '))

  await browser.close()
  console.log('\n================ ' + pass + '/' + (pass + fail) + ' ================')
  if (fail) {
    console.log('失败项:')
    fails.forEach((f) => console.log('  - ' + f))
  }
  process.exit(fail ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
