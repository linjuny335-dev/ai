/* ============================================================================
 *  lab.ts —— CORTEX「天文实验室」的计算内核
 * ----------------------------------------------------------------------------
 *  ⚠️ 诚实底线（和 foundry/equipment.ts 同一条规则，但这里标的不是「出处」而是「公式」）
 *
 *  这个板块和其它板块的性质**根本不同**：装备展厅、发射时间轴、数据台上的每个字
 *  都来自官方页面或接口原文；而实验室里的数字**不是取回来的数据，是自己算出来的**。
 *
 *  所以这里必须做到三件事，缺一不可：
 *    ① 每个输出值都能在界面上看到它用的公式（见每张台子的 `formula` 字段）；
 *    ② 用到的常数逐条列出单位与来源类型（国际通用物理常数，CODATA/IAU 名义值）；
 *    ③ 界面上明确写着「本台数值由公式实时计算，不是官方数据」。
 *
 *  任何一条不做，这些数字就会伪装成「观测数据」——那就是造假。
 *
 *  一切计算都是纯函数：同样的输入永远给同样的输出，可以脱离界面单独验算
 *  （_analysis/verify-lab.js 就是这么做的：拿已知天体当基准反查公式）。
 * ========================================================================== */

/** 国际通用物理常数。
 *  CODATA 2018 推荐值 / IAU 2015 名义值；全部带单位，避免用的时候记错量纲。 */
export const K = {
  /** 维恩位移常数 b = hc/k_B —— 单位 m·K */
  wien: 2.897771955e-3,
  /** 斯特藩–玻尔兹曼常数 σ —— 单位 W·m⁻²·K⁻⁴ */
  sigma: 5.670374419e-8,
  /** 万有引力常数 G —— 单位 m³·kg⁻¹·s⁻² */
  G: 6.6743e-11,
  /** 真空光速 c —— 单位 m·s⁻¹（定义值，无误差） */
  c: 299792458,
  /** 约化普朗克常数 ħ = h/2π —— 单位 J·s */
  hbar: 1.054571817e-34,
  /** 玻尔兹曼常数 k_B —— 单位 J·K⁻¹（SI 定义值） */
  kB: 1.380649e-23,
  /** 普朗克常数 h —— 单位 J·s（SI 定义值） */
  h: 6.62607015e-34,
  /** 天文单位 AU —— 单位 m（IAU 2012 定义值） */
  AU: 1.495978707e11,
  /** 日心引力常数 GM☉ —— 单位 m³·s⁻²（IAU 2015 名义值） */
  GMsun: 1.32712440018e20,
  /** 太阳质量 M☉ —— 单位 kg。由 GM☉ / G 反推，不另取测量值，避免两个数打架 */
  get Msun() {
    return this.GMsun / this.G
  },
  /** 太阳半径 R☉ —— 单位 m（IAU 2015 名义值） */
  Rsun: 6.957e8,
  /** 太阳光度 L☉ —— 单位 W（IAU 2015 名义值） */
  Lsun: 3.828e26,
  /** 太阳有效温度 T☉ —— 单位 K（常用实测值 5772 K，也是 IAU 名义值的基准） */
  Tsun: 5772,
  /** 儒略年 —— 单位 s */
  year: 3.15576e7,
}

/* ══════════════════════════════ 数值格式化 ══════════════════════════════ */

const SUP: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻',
}

/** 指数转上标字符：26 → ⁺²⁶ 那种效果，用于「3.83 × 10²⁶」 */
export function sup(n: number): string {
  return String(n).split('').map((ch) => SUP[ch] ?? ch).join('')
}

/** 有效数字，去掉多余的 0：3.828e26 → "3.83" */
export function sig(x: number, n = 3): string {
  if (!Number.isFinite(x)) return '—'
  if (x === 0) return '0'
  const a = Math.abs(x)
  if (a >= 1e5 || a < 1e-3) return x.toExponential(n - 1).replace(/\.?0+e/, 'e')
  return String(Number(x.toPrecision(n)))
}

/** 科学计数法，指数用真正的上标字符（HTML 里不必再包 <sup>） */
export function sci(x: number, n = 3): string {
  if (!Number.isFinite(x)) return '—'
  if (x === 0) return '0'
  const e = Math.floor(Math.log10(Math.abs(x)))
  const m = x / Math.pow(10, e)
  return `${Number(m.toPrecision(n))} × 10${sup(e)}`
}

/** 大数量级自动切换单位，避免出现「2953.0 km」旁边站一个「1.27e10 km」 */
export function bigLen(km: number): string {
  const a = Math.abs(km)
  if (a < 1e-3) return `${sig(km * 1e5)} cm`
  if (a < 1) return `${sig(km * 1e3)} m`
  if (a < 1e4) return `${sig(km)} km`
  if (a < 1e8) return `${sci(km)} km`
  if (a < 1.496e8 * 1000) return `${sig(km / 1.496e8)} AU`
  return `${sci(km / 9.4607e12)} 光年`
}

/* ══════════════════════════════ 一、恒星光谱台 ══════════════════════════ */

/** 恒星台的一组输入 */
export interface StarInput {
  /** 有效温度，K */
  T: number
  /** 半径，以太阳半径为单位 */
  R: number
}

/** 光谱型（摩根–基南 MK 分类）按有效温度划分的档位 */
export interface StarClass {
  /** 单字母型别 */
  cls: string
  /** 中文说明 + 常见的星种 */
  name: string
  /** 这一型里大家熟的名字 */
  eg: string
  /** 温度下界（K），用于划分 */
  min: number
}

/** MK 分类的温度档位。温度从高到低，取的是各型别常用的边界值。 */
export const STAR_CLASSES: StarClass[] = [
  { cls: 'O', name: '蓝色超巨星', eg: '猎户座参宿一', min: 30000 },
  { cls: 'B', name: '蓝白星', eg: '猎户座参宿七', min: 10000 },
  { cls: 'A', name: '白色星', eg: '天狼星 A', min: 7500 },
  { cls: 'F', name: '黄白星', eg: '南河三 A', min: 6000 },
  { cls: 'G', name: '黄矮星', eg: '太阳', min: 5200 },
  { cls: 'K', name: '橙色星', eg: '金牛座天仓五', min: 3700 },
  { cls: 'M', name: '红色星', eg: '比邻星', min: 0 },
]

export function starClassOf(T: number): StarClass {
  return STAR_CLASSES.find((c) => T >= c.min) ?? STAR_CLASSES[STAR_CLASSES.length - 1]
}

/**
 * 黑体色 —— 用普朗克分布转 sRGB 的经典近似（Tanner Helland 拟合）。
 * 它不是为了「好看」随机挑的颜色：是对黑体辐射谱做 CIE 加权后得到的。
 * 有效范围 1000–40000 K，超出就夹住（再往外这个近似就不准了）。
 */
export function blackbodyRGB(T: number): [number, number, number] {
  const t = Math.min(40000, Math.max(1000, T)) / 100
  let r: number
  let g: number
  let b: number

  r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592)
  g = t <= 66
    ? 99.4708025861 * Math.log(t) - 161.1195681661
    : 288.1221695283 * Math.pow(t - 60, -0.0755148492)
  if (t >= 66) b = 255
  else if (t <= 19) b = 0
  else b = 138.5177312231 * Math.log(t - 10) - 305.0447927307

  const cl = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  return [cl(r), cl(g), cl(b)]
}

export function rgbCss(rgb: [number, number, number], a = 1): string {
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a})`
}

export function rgbHex(rgb: [number, number, number]): string {
  return '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('')
}

/** 可见光的波长边界（nm）—— 用来判断辐射峰值落在哪个波段 */
export const VISIBLE = { min: 380, max: 750 }

/** 峰值波长所处的波段名 */
export function bandOf(nm: number): string {
  if (nm < VISIBLE.min) return '紫外'
  if (nm < 450) return '紫'
  if (nm < 495) return '蓝'
  if (nm < 570) return '绿'
  if (nm < 590) return '黄'
  if (nm < 620) return '橙'
  if (nm < VISIBLE.max) return '红'
  return '红外'
}

/**
 * 普朗克黑体谱：B_λ(λ, T) = (2hc² / λ⁵) / (exp(hc / λk_BT) − 1)
 * 返回相对值（同一条曲线上取最大值为 1），只用来画形状，不参与数值结论。
 */
export function planckRelative(nm: number, T: number): number {
  const l = nm * 1e-9
  const x = (K.h * K.c) / (l * K.kB * T)
  // x 很大时 exp 会溢出成 Infinity，此时分母由 exp 主导，直接取极限即可
  const denom = x > 700 ? Infinity : Math.exp(x) - 1
  return (2 * K.h * K.c * K.c) / (Math.pow(l, 5) * denom)
}

/** 采样一条归一化的黑体谱曲线，供界面画折线 */
export function spectrumCurve(T: number, n = 96, from = 100, to = 2500): number[] {
  const out: number[] = []
  let max = 0
  for (let i = 0; i < n; i++) {
    const nm = from + ((to - from) * i) / (n - 1)
    const v = planckRelative(nm, T)
    out.push(v)
    if (Number.isFinite(v) && v > max) max = v
  }
  return out.map((v) => (Number.isFinite(v) ? v / max : 0))
}

export interface StarResult {
  rgb: [number, number, number]
  hex: string
  cls: StarClass
  /** 峰值波长 λ_max = b / T，单位 nm */
  peakNm: number
  peakBand: string
  /** 相对太阳的光度 L/L☉ */
  lumRel: number
  /** 绝对光度，W */
  lumW: number
  /** 一句话结论：比太阳怎么样 */
  verdict: string
  /** 归一化黑体谱采样，给界面画曲线 */
  curve: number[]
}

/** 恒星台：温度 + 半径 → 颜色 / 光谱型 / 峰值波长 / 光度。全是纯公式。 */
export function solveStar({ T, R }: StarInput): StarResult {
  const rgb = blackbodyRGB(T)
  const cls = starClassOf(T)
  const peakNm = (K.wien * 1e9) / T                       // 维恩位移定律
  const lumRel = R * R * Math.pow(T / K.Tsun, 4)          // 斯特藩–玻尔兹曼
  const lumW = lumRel * K.Lsun

  let verdict: string
  if (Math.abs(lumRel - 1) < 0.01) verdict = '和太阳一样亮'
  else if (lumRel >= 1e4) verdict = `光度是太阳的 ${sci(lumRel)} 倍`
  else if (lumRel >= 1.01) verdict = `比太阳亮 ${sig(lumRel)} 倍`
  else if (lumRel >= 0.01) verdict = `只有太阳的 ${sig(lumRel * 100)}%`
  else verdict = `光度仅为太阳的 ${sci(lumRel)} 倍`

  return { rgb, hex: rgbHex(rgb), cls, peakNm, peakBand: bandOf(peakNm), lumRel, lumW, verdict, curve: spectrumCurve(T) }
}

/* ══════════════════════════════ 二、行星轨道台 ══════════════════════════ */

export interface OrbitInput {
  /** 轨道半长轴，单位 AU */
  a: number
  /** 反照率（0–1），决定反射掉多少阳光 */
  albedo: number
}

export interface OrbitResult {
  /** 公转周期，儒略年 */
  periodYr: number
  /** 公转周期，地球日 */
  periodDay: number
  /** 平均轨道速度，km/s */
  speed: number
  /** 平衡温度，K */
  teq: number
  /** 与恒星的距离，百万公里 */
  distMkm: number
  /** 按平衡温度给这颗行星上的「颜色」——用同一套黑体近似，只是当示意看 */
  tint: string
  verdict: string
}

/** 行星轨道台：半长轴 + 反照率 → 周期 / 轨道速度 / 平衡温度。 */
export function solveOrbit({ a, albedo }: OrbitInput): OrbitResult {
  const periodYr = Math.pow(a, 1.5)                        // 开普勒第三定律 T² = a³（以年、AU 为单位）
  const periodDay = periodYr * 365.25
  const speed = Math.sqrt(K.GMsun / (a * K.AU)) / 1000     // 圆轨道速度 v = √(GM/a)
  // 平衡温度：吸收 = 辐射 解出来的结果，T_eq = T☉ · √(R☉/2d) · (1−A)^¼
  const teq = K.Tsun * Math.sqrt(K.Rsun / (2 * a * K.AU)) * Math.pow(1 - albedo, 0.25)

  const distMkm = (a * K.AU) / 1e9

  let verdict: string
  if (periodYr < 1) verdict = `一年只有 ${sig(periodYr * 365.25)} 个地球日`
  else verdict = `绕一圈相当于地球的 ${sig(periodYr)} 年`
  if (teq < 180) verdict += `，表面平衡温度约 ${sig(teq)} K —— 冷到二氧化碳都会结冰`
  else if (teq > 700) verdict += `，平衡温度约 ${sig(teq)} K —— 铅都会熔化`
  else verdict += `，平衡温度约 ${sig(teq)} K`

  return {
    periodYr, periodDay, speed, teq, distMkm,
    tint: rgbCss(blackbodyRGB(clamp(teq, 1000, 40000)), 1),
    verdict,
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

/* ══════════════════════════════ 三、黑洞视界台 ══════════════════════════ */

export interface HoleInput {
  /** 质量，单位太阳质量 */
  M: number
}

export interface HoleResult {
  /** 史瓦西半径 r_s = 2GM/c²，单位 km */
  rsKm: number
  /** 视界面积 A = 4πr_s²，单位 km² */
  areaKm2: number
  /** 霍金温度 T_H = ħc³/(8πGMk_B)，单位 K */
  hawkingK: number
  /** 霍金蒸发时标 t = 5120πG²M³/(ħc⁴)，单位年 */
  evapYr: number
  /** 一句话结论 */
  verdict: string
}

/**
 * 黑洞视界台：质量 → 史瓦西半径 / 视界面积 / 霍金温度 / 蒸发时标。
 * 全部取自史瓦西解与霍金辐射的标准结论，不引入自转（克尔解要再加一个 spin 参数）。
 */
export function solveHole({ M }: HoleInput): HoleResult {
  const mass = M * K.Msun
  const rsM = (2 * K.G * mass) / (K.c * K.c)              // 史瓦西半径
  const rsKm = rsM / 1000
  const areaKm2 = 4 * Math.PI * rsKm * rsKm               // 视界面积
  const hawkingK = (K.hbar * Math.pow(K.c, 3)) / (8 * Math.PI * K.G * mass * K.kB)
  const evapS = (5120 * Math.PI * Math.pow(K.G, 2) * Math.pow(mass, 3)) / (K.hbar * Math.pow(K.c, 4))
  const evapYr = evapS / K.year

  // 结论全部换算成**能想象的东西**再讲：纯数字对「10⁷ km」没有概念，
  // 但对「相当于 18 个太阳」有。这里不引入任何新计算，只是把同一个 r_s 换个说法。
  const rsunKm = K.Rsun / 1000      // 太阳半径，km
  const earthKm = 6371              // 地球半径，km
  let verdict: string
  if (rsKm < 10) {
    verdict = `视界半径 ${sig(rsKm)} km —— 比一座城市还小`
  } else if (rsKm < earthKm) {
    verdict = `视界半径 ${sig(rsKm)} km —— 还装不下一个地球（半径 ${earthKm} km）`
  } else if (rsKm < rsunKm) {
    verdict = `视界半径 ${bigLen(rsKm)} —— 相当于 ${sig(rsKm / earthKm)} 个地球排成一串`
  } else if (rsKm * 1000 < K.AU) {
    verdict = `视界半径 ${bigLen(rsKm)} —— 相当于 ${sig(rsKm / rsunKm)} 个太阳`
  } else {
    verdict = `视界半径 ${bigLen(rsKm)} —— 光从中心跑到视界要 ${sig(rsKm / (K.c / 1000) / 3600)} 小时`
  }

  return { rsKm, areaKm2, hawkingK, evapYr, verdict }
}

/* ══════════════════════════════ 预设 ══════════════════════════════════════
 *  ⚠️ 预设值取的是**常用的实测值**，不是接口数据，也不是官方发布 ——
 *     按钮上要标「本站整理」，点开才把具体数值算出来。
 *     这也是为什么预设按钮只写名字不写数字：数字由公式当场算。
 * ──────────────────────────────────────────────────────────────────────── */

export interface Preset<T> {
  id: string
  label: string
  hint: string
  value: T
}

/** 恒星预设：有效温度 K / 半径（太阳半径）——常用的实测值 */
export const STAR_PRESETS: Preset<StarInput>[] = [
  { id: 'proxima', label: '比邻星', hint: 'M5.5 红矮星 · 3050 K · 0.154 R☉（本站整理）', value: { T: 3050, R: 0.154 } },
  { id: 'sun', label: '太阳', hint: 'G2V 黄矮星 · 5772 K · 1 R☉（本站整理）', value: { T: 5772, R: 1 } },
  { id: 'procyon', label: '南河三 A', hint: 'F5 黄白星 · 6530 K · 2.05 R☉（本站整理）', value: { T: 6530, R: 2.05 } },
  { id: 'sirius', label: '天狼星 A', hint: 'A1V 白色星 · 9940 K · 1.71 R☉（本站整理）', value: { T: 9940, R: 1.71 } },
  { id: 'rigel', label: '参宿七', hint: 'B8 蓝超巨星 · 12100 K · 79 R☉（本站整理）', value: { T: 12100, R: 79 } },
  { id: 'betelgeuse', label: '参宿四', hint: 'M1 红超巨星 · 3600 K · 764 R☉（本站整理）', value: { T: 3600, R: 764 } },
]

/** 行星预设：半长轴 AU / 反照率 —— 太阳系内的实测值 */
export const ORBIT_PRESETS: Preset<OrbitInput>[] = [
  { id: 'mercury', label: '水星', hint: 'a = 0.387 AU · 反照率 0.142（本站整理）', value: { a: 0.387, albedo: 0.142 } },
  { id: 'venus', label: '金星', hint: 'a = 0.723 AU · 反照率 0.689（本站整理）', value: { a: 0.723, albedo: 0.689 } },
  { id: 'earth', label: '地球', hint: 'a = 1.000 AU · 反照率 0.306（本站整理）', value: { a: 1, albedo: 0.306 } },
  { id: 'mars', label: '火星', hint: 'a = 1.524 AU · 反照率 0.250（本站整理）', value: { a: 1.524, albedo: 0.25 } },
  { id: 'jupiter', label: '木星', hint: 'a = 5.203 AU · 反照率 0.503（本站整理）', value: { a: 5.203, albedo: 0.503 } },
  { id: 'neptune', label: '海王星', hint: 'a = 30.07 AU · 反照率 0.290（本站整理）', value: { a: 30.07, albedo: 0.29 } },
]

/** 黑洞预设：质量（太阳质量）—— 常用的估算值 */
export const HOLE_PRESETS: Preset<HoleInput>[] = [
  { id: 'solar', label: '一个太阳质量', hint: '理论上最小的恒星级黑洞量级（本站整理）', value: { M: 1 } },
  { id: 'cygx1', label: '天鹅座 X-1', hint: '约 21 M☉ · 人类第一个被确认的黑洞候选（本站整理）', value: { M: 21 } },
  { id: 'midsize', label: '中等质量黑洞', hint: '约 1000 M☉ · 观测上仍很稀少的类型（本站整理）', value: { M: 1000 } },
  { id: 'sgrA', label: '人马座 A*', hint: '约 4.3 × 10⁶ M☉ · 银河系中心（本站整理）', value: { M: 4.3e6 } },
  { id: 'm87', label: 'M87*', hint: '约 6.5 × 10⁹ M☉ · 首张黑洞照片的主角（本站整理）', value: { M: 6.5e9 } },
]

/* ══════════════════════════ 太阳系位置尺 ══════════════════════════════════
 *  行星轨道台右边那把尺子用到的数据：八大行星的轨道半长轴。
 *  ⚠️ 和 ORBIT_PRESETS 里同名行星的 a **必须一致** ——
 *     同一个数字在界面上出现两次却不一样，是最容易被抓的错。
 *     verify-lab.js 会拿这两处对着比，不一致就 FAIL。
 * ──────────────────────────────────────────────────────────────────────── */
export const PLANET_BAR: { cn: string; short: string; a: number }[] = [
  { cn: '水星', short: '水', a: 0.387 },
  { cn: '金星', short: '金', a: 0.723 },
  { cn: '地球', short: '地', a: 1 },
  { cn: '火星', short: '火', a: 1.524 },
  { cn: '木星', short: '木', a: 5.203 },
  { cn: '土星', short: '土', a: 9.537 },
  { cn: '天王星', short: '天', a: 19.191 },
  { cn: '海王星', short: '海', a: 30.07 },
]

/** 位置尺的对数量程（AU）与主刻度 */
export const PLANET_BAR_RANGE = { min: 0.1, max: 100 }
export const PLANET_BAR_TICKS = [0.1, 1, 10, 100]

/* ══════════════════════════════ 公式说明 ══════════════════════════════════
 *  界面上「依据什么算的」那一块直接渲染这张表 —— 公式和结论放在一起看，
 *  谁都能自己拿计算器复核。改公式的时候务必同步改这里。
 * ──────────────────────────────────────────────────────────────────────── */

export interface Formula {
  /** 用到的公式 */
  expr: string
  /** 每个符号什么意思 */
  legend: string
}

export const FORMULAS: Record<'star' | 'orbit' | 'hole', Formula[]> = {
  star: [
    { expr: 'λ_max = b / T', legend: '维恩位移定律：峰值波长与温度成反比。b = 2.897771955 × 10⁻³ m·K' },
    { expr: 'L = 4πR²σT⁴', legend: '斯特藩–玻尔兹曼定律：光度 ∝ 半径² × 温度⁴，σ = 5.670374419 × 10⁻⁸ W·m⁻²·K⁻⁴' },
    { expr: '黑体色', legend: '对黑体辐射谱做 CIE 加权后转 sRGB 的拟合式，1000–40000 K 内有效' },
  ],
  orbit: [
    { expr: 'T² = a³', legend: '开普勒第三定律：周期（年）的平方 = 半长轴（AU）的立方' },
    { expr: 'v = √(GM☉ / a)', legend: '圆轨道速度。GM☉ = 1.32712440018 × 10²⁰ m³·s⁻²' },
    { expr: 'T_eq = T☉ · √(R☉ / 2d) · (1 − A)^¼', legend: '平衡温度：吸收的日照 = 向外辐射，解出表面温度。A 为反照率' },
  ],
  hole: [
    { expr: 'r_s = 2GM / c²', legend: '史瓦西半径：不转动、不带电黑洞的视界。每 1 M☉ 约 2.953 km' },
    { expr: 'A = 4πr_s²', legend: '视界面积（同时也是黑洞熵的度量，S = A k_B c³ / 4Għ）' },
    { expr: 'T_H = ħc³ / (8πGMk_B)', legend: '霍金温度：质量越大越冷，1 M☉ 只有 6.17 × 10⁻⁸ K' },
    { expr: 't = 5120πG²M³ / (ħc⁴)', legend: '霍金蒸发时标：与质量三次方成正比，1 M☉ 约 2.1 × 10⁶⁷ 年' },
  ],
}

/** 界面上要列出来的常数表 —— 单位 + 数值 + 类型，摆在一起给人核 */
export const CONSTANT_TABLE: { name: string; sym: string; value: string; kind: string }[] = [
  { name: '维恩位移常数', sym: 'b', value: '2.897771955 × 10⁻³ m·K', kind: 'CODATA 2018' },
  { name: '斯特藩–玻尔兹曼常数', sym: 'σ', value: '5.670374419 × 10⁻⁸ W·m⁻²·K⁻⁴', kind: 'CODATA 2018' },
  { name: '万有引力常数', sym: 'G', value: '6.67430 × 10⁻¹¹ m³·kg⁻¹·s⁻²', kind: 'CODATA 2018' },
  { name: '真空光速', sym: 'c', value: '299 792 458 m·s⁻¹', kind: 'SI 定义值' },
  { name: '约化普朗克常数', sym: 'ħ', value: '1.054571817 × 10⁻³⁴ J·s', kind: 'SI 定义值' },
  { name: '玻尔兹曼常数', sym: 'k_B', value: '1.380649 × 10⁻²³ J·K⁻¹', kind: 'SI 定义值' },
  { name: '天文单位', sym: 'AU', value: '1.495978707 × 10¹¹ m', kind: 'IAU 2012' },
  { name: '日心引力常数', sym: 'GM☉', value: '1.32712440018 × 10²⁰ m³·s⁻²', kind: 'IAU 2015' },
  { name: '太阳半径', sym: 'R☉', value: '6.957 × 10⁸ m', kind: 'IAU 2015 名义值' },
  { name: '太阳光度', sym: 'L☉', value: '3.828 × 10²⁶ W', kind: 'IAU 2015 名义值' },
  { name: '太阳有效温度', sym: 'T☉', value: '5772 K', kind: '常用实测值' },
]

/* ══════════════════════════════ 刻度与量程 ══════════════════════════════ */

/** 滑杆量程。对数刻度用 slider 的 0–1000 线性值映射到 log 区间。 */
export const RANGE = {
  starT: { min: 2400, max: 40000 },
  starR: { min: 0.05, max: 1000 },
  orbitA: { min: 0.2, max: 50 },
  orbitA0: { min: 0, max: 1 },
  holeM: { min: 0.1, max: 1e10 },
}

/** 对数刻度的位置 ↔ 取值互转（滑杆走 0–1，取值走 log 区间） */
export function logToVal(pos: number, min: number, max: number): number {
  return min * Math.pow(max / min, pos)
}
export function valToLog(v: number, min: number, max: number): number {
  return Math.log(v / min) / Math.log(max / min)
}

/** 黑洞尺度条上要标出来的参照物（单位 km）。全是可核对的已知长度。 */
export const SCALE_MARKS: { km: number; label: string }[] = [
  { km: 1, label: '1 km' },
  { km: 6371, label: '地球半径' },
  { km: 6.957e5, label: '太阳半径' },
  { km: 1.496e8, label: '1 AU' },
  { km: 4.5e9, label: '海王星轨道' },
]
