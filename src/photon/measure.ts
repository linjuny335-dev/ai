/* ============================================================================
 *  measure.ts —— 把「这张图真实解码出来的像素」整理成观测读数
 * ----------------------------------------------------------------------------
 *  这里算出来的每一个数字，来源只有一个：
 *      当前这张图真的被浏览器解码出来之后，<img> 的 naturalWidth / naturalHeight。
 *  （见 ApodMedia 的 onLoad → ApodStage 的 onImageLoad）
 *
 *  所以它是**实测**，不是从任何数据源查来的，也不是写死的 —— 这一点很重要，
 *  因为 PHOTON 这一栏的铁律是「界面上每个字都必须是真的」。
 *
 *  唯一需要动脑子的是「把宽高写成比例」这一步：
 *      3000 × 2000 → 最大公约数 1000 → 3 : 2      ✓ 干净，直接用
 *      1439 × 960  → 最大公约数 1    → 1439 : 960 ✗ 没法看
 *  后者落回常见摄影比例（容差 2%）；连常见比例都对不上，才退成小数比 1.50 : 1。
 *  **退成小数只是换一种写法，不改变「它是从真实像素算出来的」这个事实。**
 *
 *  这个是纯函数，不依赖 DOM —— 所以能单独跑一遍验算（见 _analysis/verify-measure.js）。
 * ========================================================================== */

/** 观测读数：真实像素 + 由它算出的画面比例与朝向 */
export interface PixelReadout {
  /** 真实宽度（像素） */
  w: number
  /** 真实高度（像素） */
  h: number
  /** 画面比例，形如 "3 : 2"（约分 / 落回常见比例）或 "1 : 1.13"（小数比，始终把小数放在右边） */
  ratio: string
  /** 画面的朝向 */
  orient: '横向' | '竖向' | '方形'
  /** 比例是怎么来的：约分得到 / 落回常见比例 / 退成小数比 */
  how: 'exact' | 'common' | 'decimal'
}

/** 常见摄影 / 屏幕比例。落回时按「相对误差最小」挑一个。 */
const COMMON: ReadonlyArray<readonly [number, number]> = [
  [1, 1],
  [5, 4],
  [4, 3],
  [3, 2],
  [16, 10],
  [16, 9],
  [21, 9],
  [2, 1],
  [3, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 5],
  [9, 16],
  [10, 16],
]

/** 约分后仍超过这个数就被认为「不是一个人能读的比例」，去落回常见比例 */
const MAX_TERM = 40
/** 落回常见比例时允许的相对误差 */
const TOL = 0.02

function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a))
  let y = Math.abs(Math.round(b))
  while (y) {
    const t = x % y
    x = y
    y = t
  }
  return x || 1
}

/**
 * 由真实像素算出读数。
 * 宽或高不是有限正数时返回 null —— 宁可什么都不显示，也不编一个数出来。
 */
export function pixelReadout(w: number, h: number): PixelReadout | null {
  if (!Number.isFinite(w) || !Number.isFinite(h)) return null
  const W = Math.round(w)
  const H = Math.round(h)
  if (W <= 0 || H <= 0) return null

  const d = gcd(W, H)
  let rw = W / d
  let rh = H / d
  let how: PixelReadout['how'] = 'exact'

  if (rw > MAX_TERM || rh > MAX_TERM) {
    const r = W / H
    let best: readonly [number, number] | null = null
    let bestErr = Infinity
    for (const [a, b] of COMMON) {
      const err = Math.abs(a / b - r) / r
      if (err < bestErr) {
        bestErr = err
        best = [a, b]
      }
    }
    if (best && bestErr <= TOL) {
      rw = best[0]
      rh = best[1]
      how = 'common'
    } else {
      /* 退成小数比。竖幅（宽 < 高）写成 1 : 1.13 而不是 0.89 : 1 ——
         后者虽然算得没错，但仪表读数那样写没人这么读。
         规则一句话：小数永远在右边，左边固定是 1。 */
      const k = Math.round((r < 1 ? 1 / r : r) * 100) / 100
      if (r < 1) {
        rw = 1
        rh = k
      } else {
        rw = k
        rh = 1
      }
      how = 'decimal'
    }
  }

  const orient: PixelReadout['orient'] = W === H ? '方形' : W > H ? '横向' : '竖向'
  return { w: W, h: H, ratio: `${rw} : ${rh}`, orient, how }
}
