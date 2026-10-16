// 验证线上真的换成了「低饱和融入版 v2」：
//   素材 200 + 尺寸 1671x585 + 四角透明 + 无白边 + 主色命中 #A8B5C8
//   + **没有旧的 .brush2__sheen**（v1 的矩形光影元凶必须不在）+ 有 .brush2__glow
//   + 容器/子节点没有大面积 background/backdrop-filter/box-shadow
const { chromium } = require('playwright-core')
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const URL = 'https://galaxy-theme-3d.app.workbuddy.host/'

;(async () => {
  const b = await chromium.launch({ executablePath: CHROME })
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } })
  const errs = []
  const assets = []
  p.on('pageerror', (e) => errs.push(String(e)))
  p.on('response', (r) => { if (/brush\//.test(r.url())) assets.push(r.status() + ' ' + r.url().split('/').pop()) })

  await p.goto(URL, { waitUntil: 'networkidle', timeout: 60000 })
  await p.waitForTimeout(5000)

  const r = await p.evaluate(async () => {
    const i = document.querySelector('.brush2__img')
    const bmp = i ? await createImageBitmap(i) : null
    let corners = [], halo = 0, ink = null
    if (bmp) {
      const c = document.createElement('canvas')
      c.width = bmp.width; c.height = bmp.height
      const g = c.getContext('2d'); g.drawImage(bmp, 0, 0)
      corners = [[0, 0], [bmp.width - 1, 0], [0, bmp.height - 1], [bmp.width - 1, bmp.height - 1]]
        .map(([x, y]) => g.getImageData(x, y, 1, 1).data[3])
      const d = g.getImageData(0, 0, bmp.width, bmp.height).data
      let sr = 0, sg = 0, sb = 0, n = 0
      for (let k = 0; k < d.length; k += 16) {
        const a = d[k + 3]
        if (a > 8 && a < 200 && d[k] > 205) halo++
        if (a > 200) { sr += d[k]; sg += d[k + 1]; sb += d[k + 2]; n++ }
      }
      if (n) ink = { r: Math.round(sr / n), g: Math.round(sg / n), b: Math.round(sb / n), n }
    }

    // 大面积蒙层探针（同 by-home-brush.cjs 的判据）
    const root = document.querySelector('.brush2')
    const rb = root ? root.getBoundingClientRect() : { width: 0, height: 0 }
    const bigLayers = []
    if (root) {
      for (const e of [root, ...root.querySelectorAll('*')]) {
        const s = getComputedStyle(e)
        const rr = e.getBoundingClientRect()
        const areaRatio = rb.width * rb.height > 0 ? (rr.width * rr.height) / (rb.width * rb.height) : 0
        if (areaRatio < 0.25) continue
        const bad = []
        if (s.backgroundImage && s.backgroundImage !== 'none') bad.push('bg-image')
        if (s.backgroundColor && s.backgroundColor !== 'rgba(0, 0, 0, 0)') bad.push('bg-color')
        if (s.backdropFilter && s.backdropFilter !== 'none') bad.push('backdrop-filter')
        if (s.boxShadow && s.boxShadow !== 'none') bad.push('box-shadow')
        if (bad.length) bigLayers.push({ cls: e.className, bad: bad.join(','), areaPct: Math.round(areaRatio * 100) })
      }
    }

    return {
      en: (document.querySelector('.home__title-en') || {}).textContent?.trim(),
      hasImg: !!i, nw: i?.naturalWidth, nh: i?.naturalHeight,
      corners, halo, ink,
      // 2026-10-15 用户要求「字号调小一点」：宽度应是 940px（min(940px, 66vw)），
      // 旧的 1120px 必须不在线上
      boxW: root ? Math.round(rb.width) : 0,
      boxH: root ? Math.round(rb.height) : 0,
      hasOldSvg: !!document.querySelector('.brush__svg'),
      hasSheen: !!document.querySelector('.brush2__sheen'),   // v1 元凶，必须为 false
      hasGlow: !!document.querySelector('.brush2__glow'),
      glowBlend: (document.querySelector('.brush2__glow') ? getComputedStyle(document.querySelector('.brush2__glow')).mixBlendMode : null),
      bigLayers,
      go: !!document.querySelector('.home__go'),
      nav: !!document.querySelector('nav, .nav, .navigation'),
      kicker: !!document.querySelector('.home__kicker'),
      blurb: !!document.querySelector('.home__blurb'),
    }
  })

  await p.screenshot({ path: '_analysis/home-art/live-1440.png' })
  console.log(JSON.stringify(r, null, 1))
  console.log('素材请求 =', assets.length ? assets.join(', ') : '(无)')
  console.log('pageerrors:', errs.filter((e) => !/favicon/i.test(e)).slice(0, 3))

  await b.close()

  const checks = [
    ['英文标题', r.en === 'CHASING PHOTONS'],
    ['素材已加载 1671x585', r.hasImg && r.nw === 1671 && r.nh === 585],
    ['四角透明', r.corners.length === 4 && r.corners.every((v) => v === 0)],
    ['无白边特征像素', r.halo === 0],
    ['笔画主色 ≈ #A8B5C8', r.ink && Math.abs(r.ink.r - 168) < 12 && Math.abs(r.ink.g - 181) < 12 && Math.abs(r.ink.b - 200) < 12],
    ['字号已调小（容器 940px，不是旧的 1120px）', r.boxW === 940],
    ['容器宽高比未变形', Math.abs(r.boxW / r.boxH - 1671 / 585) / (1671 / 585) < 0.02],
    ['旧 .brush2__sheen 已下线', r.hasSheen === false],
    ['新 .brush2__glow 在位', r.hasGlow === true],
    ['光斑用 soft-light', r.glowBlend === 'soft-light'],
    ['无大面积蒙层', r.bigLayers.length === 0],
    ['旧 SVG 管线不在', r.hasOldSvg === false],
    ['按钮/导航/文案都在', r.go && r.nav && r.kicker && r.blurb],
    ['素材请求 200', assets.some((a) => a.startsWith('200'))],
    ['零 pageerror', errs.filter((e) => !/favicon/i.test(e)).length === 0],
  ]
  let bad = 0
  checks.forEach(([n, c]) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++ })
  console.log('\n' + (bad ? 'LIVE MISMATCH (' + bad + ')' : 'LIVE OK — 线上已是低饱和融入版 v2'))
  process.exit(bad ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
