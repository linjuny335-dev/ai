// ============================================================================
//  _analysis/brush-color-check.cjs —— 艺术字「降饱和 + 降发光」的验收（只负责出图）
// ----------------------------------------------------------------------------
//  ⚠️ 这一版**不在浏览器里量像素**。踩过的坑：
//     把 svg 序列化成 data URL 再 canvas.drawImage 会丢掉 CSS（动画态 opacity、
//     CSS 变量驱动的 transform 全失效）→ 量出来是一片平灰光，
//     「笔画峰值 0.297」vs「紧邻背景 0.279」，看着像可读性崩了，其实是量法坏了。
//     浏览器里唯一的职责是**截真图**（和用户眼睛看到的一致），
//     像素统计交给 _analysis/brush-stats.py（pillow）。
//
//  本脚本负责：
//    ① 出v2 全页截图 + 艺术字区域截图
//    ② 结构性断言：字形/排版/交互都没被这轮改动碰到（用户第 8 条只让改颜色）
//    ③ 把关键尺寸打印给python 量法用
// ============================================================================
const { chromium } = require('playwright-core')
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
  page.on('pageerror', (e) => errs.push(String(e)))
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()) })

  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.waitForTimeout(5600) // 等流光画完

  const box = await page.locator('.brush').boundingBox()

  console.log('\n=== ① 出图 ===')
  await page.screenshot({ path: OUT + 'v2-1440.png' })
  // 艺术字区域单独一张（给 python 量法用，背景只有星河 → 更接近用户视觉）
  await page.screenshot({
    path: OUT + 'v2-1440.png.brushcrop.png',
    clip: { x: box.x, y: box.y - 6, width: box.width, height: box.height + 12 },
  })
  console.log('  saved v2-1440.png + v2-1440.png.brushcrop.png')

  console.log('\n=== ② 结构性：字形 / 排版 / 交互都动没动 ===')
  const st = await page.evaluate(() => {
    const strokes = [...document.querySelectorAll('.brush__ink .brush__stroke')]
    // 逐字笔画数（按 transform 的 x 分组）——应仍是 5,2,5,2
    const counts = []
    let cur = 0, prevX = null
    for (const g of strokes) {
      const mm = /translate\(([-\d.]+)/.exec(g.getAttribute('transform') || '')
      const x = mm ? parseFloat(mm[1]) : 0
      if (prevX === null) prevX = x
      if (x !== prevX) { counts.push(cur); cur = 0; prevX = x }
      cur++
    }
    counts.push(cur)
    return {
      strokes: strokes.length,
      counts: counts.join(','),
      en: (document.querySelector('.home__title-en') || {}).textContent?.trim(),
      opacity: strokes.map((e) => parseFloat(getComputedStyle(e).opacity)),
      // 渐变端点：确认换成了低饱和银灰白（而不是还留在旧的高饱和蓝紫）
      inkStops: [...document.querySelectorAll('#btInk stop')].map((s) => s.getAttribute('stop-color')).join(' '),
      glowAlpha: document.querySelector('#btGlow feColorMatrix')?.getAttribute('values') || '',
      // 飞白遮罩还在（用户要求保留飞白质感）
      fw: !!document.querySelector('#btFwMask'),
      trails: document.querySelectorAll('.brush__trail-line').length,
    }
  })
  ok(st.strokes === 14, '仍是 14 笔', String(st.strokes))
  ok(st.counts === '5,2,5,2', '四字笔画结构未变 (5,2,5,2)', st.counts)
  ok(st.en === 'CHASING PHOTONS', '英文行未改', st.en)
  ok(st.fw, '飞白遮罩仍在（用户要求保留飞白质感）')
  ok(st.trails === 4, '4 条星轨仍在（用户要求保留流动星轨）', String(st.trails))
  ok(Math.min(...st.opacity) > 0.95, '流光已画完（14 笔 opacity≈1）')

  console.log('\n=== ③ 配色确实换成低饱和（读 DOM 而非肉眼）===')
  const stops = st.inkStops.split(' ')
  const hs = stops.map((c) => {
    const m2 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c)
    if (!m2) return { s: 0, l: 0 }
    const r = parseInt(m2[1], 16) / 255, g = parseInt(m2[2], 16) / 255, b = parseInt(m2[3], 16) / 255
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
    const l = (mx + mn) / 2
    // ⚠️⚠️ 这里必须用 **HSV 饱和度**，不能用 HSL 的。
    // HSL 在近白色上饱和度天生虚高：#f4f7fa 只有 6/255 的色差（肉眼毫无色感），
    // HSL 算出来却是 0.375 → 探针报「饱和度 0.375 太高」是**假失败**。
    // HSV 的 S = (max-min)/max，对近白色才是 0.024这种真实的「有多少颜色」。
    const s = mx === 0 ? 0 : (mx - mn) / mx
    return { s, l }
  })
  const maxSat = Math.max(...hs.map((h) => h.s))
  console.log('  btInk 端点 =', stops.join(' '))
  console.log('  端点亮度 =', hs.map((h) => h.l.toFixed(3)).join(' '))
  console.log('  端点 HSV 饱和度 =', hs.map((h) => h.s.toFixed(3)).join(' '))
  ok(!st.inkStops.includes('#ffffff'), '不再有纯白端点')
  ok(maxSat < 0.09, 'btInk 端点 HSV 饱和度全部 <0.09（低饱和银灰蓝）', maxSat.toFixed(3))
  // 明度不能太低 —— 降亮度最容易翻车的地方（深色背景上看不清）
  ok(Math.min(...hs.map((h) => h.l)) > 0.6, '端点最低亮度 >0.6（保证深底可读）',
     Math.min(...hs.map((h) => h.l)).toFixed(3))

  // ⚠️ feColorMatrix 的 values 是 **4 行 × 5 列 = 20 个数**：
  //   行1(R)=0..4，行2(G)=5..9，行3(B)=10..14，行4(A)=15..19
  //   所以 alpha 系数是 vals[18]，RGB 常数是 vals[4] / vals[9] / vals[14]。
  //   我先前写成 vals[19] 和 slice(12,15) → 读到的是 B 通道和 alpha 的**偏移量 0**，
  //   报出「alpha=0、tint 饱和度 1.0」的假失败。
  const vals = (st.glowAlpha || '').trim().split(/\s+/).map(Number)
  const glowA = vals.length >= 20 ? vals[18] : NaN
  const tr = vals[4], tg = vals[9], tb = vals[14]
  const tmx = Math.max(tr, tg, tb), tmn = Math.min(tr, tg, tb)
  const tsat = tmx === 0 ? 0 : (tmx - tmn) / tmx
  console.log('  btGlow 外层 alpha =', glowA, '（原 0.85）')
  console.log('  btGlow 外层 tint =', [tr, tg, tb].join(','), ' HSV 饱和度 =', tsat.toFixed(3))
  ok(glowA >= 0.45 && glowA <= 0.52, '辉光外层 alpha 落在 0.45~0.52（约降 40%）', String(glowA))
  ok(tsat < 0.25, '辉光 tint 低饱和（不是霓虹蓝）', tsat.toFixed(3))

  console.log('\n=== ④ 交互没被这轮改动破坏 ===')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 6 })
  await page.waitForTimeout(500)
  const hov = await page.evaluate(() => document.querySelector('.brush').className)
  ok(/is-hovered/.test(hov), '鼠标命中判定正常', hov)
  await page.screenshot({ path: OUT + 'v2-hover.png' })

  // 点按钮仍能进 PHOTON
  let entered = false
  await page.locator('.home__go').click({ timeout: 4000 })
  for (let i = 0; i < 24; i++) {
    await page.waitForTimeout(200)
    const n = await page.locator('.home').count()
    if (n === 0) { entered = true; break }
  }
  ok(entered, '点「开始探索」仍能进 PHOTON')
  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.waitForTimeout(5200)

  console.log('\n=== ⑤ 无报错 / 多宽度不溢出 ===')
  ok(errs.filter((e) => !/favicon|ResizeObserver/i.test(e)).length === 0, '控制台无报错',
     errs.slice(0, 2).join(' | '))
  for (const w of [1280, 1920]) {
    await page.setViewportSize({ width: w, height: 900 })
    await page.goto(URL, { waitUntil: 'networkidle' })
    await page.waitForTimeout(4600)
    const b = await page.locator('.brush__svg').boundingBox()
    ok(b.x >= -2 && b.x + b.width <= w + 2, w + 'px 下不溢出', 'x=' + Math.round(b.x) + ' w=' + Math.round(b.width))
  }

  await browser.close()
  console.log('\n================ ' + pass + '/' + (pass + fail) + ' ================')
  if (fail) { console.log('失败项:'); fails.forEach((f) => console.log('  - ' + f)) }
  console.log('→ 下一步：python _analysis/brush-stats.py v2-crop量亮度/饱和度/对比')
  process.exit(fail ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
