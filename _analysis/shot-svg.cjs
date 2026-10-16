// 把 preview.svg 截成 PNG，用来肉眼确认字形有没有提取错。
// 用法: node _analysis/shot-svg.js <svg> <png> [width]
const path = require('path')
const { chromium } = require('playwright-core')

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'

;(async () => {
  const svg = path.resolve(process.argv[2] || '_analysis/home-art/preview.svg')
  const png = path.resolve(process.argv[3] || '_analysis/home-art/preview.png')
  const w = parseInt(process.argv[4] || '1600', 10)

  const browser = await chromium.launch({ executablePath: CHROME, args: ['--force-device-scale-factor=1'] })
  const page = await browser.newPage({ viewport: { width: w, height: 460 }, deviceScaleFactor: 1 })
  // 用 html 包一层强制 svg 填满视口：直接打开 .svg 会按自身 width 尺寸布局，
  // viewBox 是 4410 宽 → 浏览器按 1:1 显示 4410px，截图只拍到左上角。
  await page.setContent(
    `<!doctype html><html><body style="margin:0;background:#0a0d1a">
     <div style="width:100vw;height:100vh;display:flex;align-items:center;justify-content:center">
     ${require('fs').readFileSync(svg, 'utf8').replace(/width="[^"]*"/, 'width="100%"').replace(/height="[^"]*"/, 'height="100%"')}
     </div></body></html>`,
    { waitUntil: 'load' }
  )
  await page.waitForTimeout(400)
  await page.screenshot({ path: png })
  await browser.close()
  console.log('saved', png)
})().catch((e) => { console.error(e); process.exit(1) })