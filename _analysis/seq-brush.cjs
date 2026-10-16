// 抽流光显现过程的关键帧，验证「光线沿笔画流动逐渐显现」真的在跑，
// 并且中文先于英文、笔顺是从左到右。
const { chromium } = require('playwright-core')
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const URL = process.env.URL || 'http://localhost:5197/'

;(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--force-device-scale-factor=1'] })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })

  // 只截艺术字那一块
  const box = async () => (await page.locator('.brush').boundingBox())

  const marks = [0.35, 0.9, 1.6, 2.4, 3.4, 5.0]
  let prev = null
  for (const t of marks) {
    if (prev !== null) await page.waitForTimeout((t - prev) * 1000)
    else await page.waitForTimeout(t * 1000)
    prev = t

    // 每帧量一次「已经显形的笔画数」：直接读 animation-delay + 进度不够准，
    // 改成读 stroke-dashoffset（pathLength=1 → 当前未画出的比例）
    const stat = await page.evaluate(() => {
      const els = [...document.querySelectorAll('.brush__ink .brush__stroke')]
      let drawn = 0
      let sum = 0
      for (const e of els) {
        const off = parseFloat(getComputedStyle(e).strokeDashoffset) || 0
        const p = 1 - off
        sum += p
        if (p > 0.92) drawn++
      }
      return { n: els.length, drawn, avg: +(sum / els.length).toFixed(3) }
    })
    const b = await box()
    await page.screenshot({
      path: `_analysis/home-art/seq-${String(t).replace('.', 'p')}.png`,
      clip: { x: b.x, y: Math.max(0, b.y - 10), width: b.width, height: b.height + 20 },
    })
    console.log(`t=${t}s  drawn=${stat.drawn}/${stat.n}  avg=${stat.avg}  -> seq-${String(t).replace('.', 'p')}.png`)
  }

  // 悬停扫光：.brush 是 pointer-events:none，**不能 locator.hover()**
  //（Playwright 会报 canvas 拦截事件）—— 真实用户也是靠指针移动触发的，
  // 所以这里直接 mouse.move 到字上，验证 JS 命中判定加了 .is-hovered。
  await page.mouse.move(200, 200)
  await page.waitForTimeout(700)
  const cls0 = await page.evaluate(() => document.querySelector('.brush').className)
  const b = await box()
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 })
  await page.waitForTimeout(500)
  const cls1 = await page.evaluate(() => document.querySelector('.brush').className)
  const b2 = await box()
  await page.screenshot({
    path: '_analysis/home-art/hover-sweep.png',
    clip: { x: b2.x, y: Math.max(0, b2.y - 10), width: b2.width, height: b2.height + 20 },
  })
  console.log('class before =', JSON.stringify(cls0), '-> after =', JSON.stringify(cls1))
  console.log('hover toggled =', /is-hovered/.test(cls1) ? 'YES' : 'NO')
  console.log('saved hover-sweep.png')

  // 移出后应复位
  await page.mouse.move(60, 60, { steps: 6 })
  await page.waitForTimeout(500)
  const cls2 = await page.evaluate(() => document.querySelector('.brush').className)
  console.log('class after leave =', JSON.stringify(cls2), '| reset =', !/is-hovered/.test(cls2) ? 'YES' : 'NO')

  // 鼠标跟随：光泽变量应随指针移动而变
  const before = await page.evaluate(() => {
    const s = document.querySelector('.brush__svg')
    return [s.style.getPropertyValue('--mx'), s.style.getPropertyValue('--my')]
  })
  await page.mouse.move(1200, 300)
  await page.waitForTimeout(900)
  const after = await page.evaluate(() => {
    const s = document.querySelector('.brush__svg')
    return [s.style.getPropertyValue('--mx'), s.style.getPropertyValue('--my'), s.style.getPropertyValue('--trail-lit')]
  })
  console.log('sheen before =', before.join(','), ' after =', after.join(','))
  console.log('moved =', before[0] !== after[0] || before[1] !== after[1] ? 'YES' : 'NO')

  await browser.close()
})().catch((e) => { console.error(e); process.exit(1) })