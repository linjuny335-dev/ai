/* ============================================================================
 *  sky.ts —— BLUEYARD「青年任务中心」的天体推算内核
 * ----------------------------------------------------------------------------
 *  ⚠️ 这个文件里的数字**全部是算出来的，不是取回来的**。
 *
 *  没有一个天文台会给你「今晚月相如何」的接口 —— 但这件事本来就可以由日期
 *  算出来。所以这一栏的诚实纪律和 PHOTON / FOUNDRY / TECH **正好相反**：
 *
 *      PHOTON / FOUNDRY / TECH   数字来自接口 → 界面上必须标**出处**
 *      CORTEX（实验室）          数字来自公式 → 界面上必须标**公式**
 *      BLUEYARD（这里）          数字与时刻都来自公式 → 界面上必须标
 *                                **公式 + 误差范围**，并且给到「时:分」的地方
 *                                一律写成「约 HH:MM」
 *
 *  公式出处（都是公开的教科书算法，不是本项目发明）：
 *    · 月球相位角 i        Meeus《Astronomical Algorithms》第 48 章式 48.4
 *    · 太阳视黄经 λ        同上第 25 章低精度式（二十四节气的定义就是 λ 的倍数）
 *    · 朔望月长           29.530588853 天（J2000 历元）
 *    · 儒略日             JD = Unix 毫秒 / 86400000 + 2440587.5
 *    · 朔望 / 节气时刻     对上面两个单调函数做二分求根（不是查表）
 *
 *  精度（_analysis/verify-sky.js 会拿权威历表逐条对拍，实测值如下）：
 *    · 朔（新月）/ 望（满月）  与权威历表相差 ≤ 28 分钟，平均约 12 分钟
 *      与 NASA 2026 年日月食食甚（日食必在朔、月食必在望）对拍：
 *      最大 14.6 分钟（2/17 日环食）、最小 1.4 分钟（3/3 月全食）
 *    · 上弦 / 下弦            与公开历表相差 ≤ 50 分钟
 *      —— 这不是 bug：相位角公式在「弦」附近与历表用的
 *      「月球与太阳视黄经相差 90°」定义本身就有偏差，朔望两点上无偏。
 *      所以画面上凡是给到「时:分」的地方一律写「约 HH:MM」。
 *    · 二十四节气             与紫金山天文台 2026 年发布值相差 ≤ 13 分钟
 *    · 照亮比例               误差 < 1%（相位时刻误差 20 分钟 ≈ 0.1%）
 *
 *  这些误差不是「差不多就行」，而是**要在界面上写出来**的东西 ——
 *  见 MissionCenter.tsx 的「本页依据」。
 * ========================================================================== */

const DEG = Math.PI / 180

/** 朔望月长（天），J2000 */
export const SYNODIC_MONTH = 29.530588853

/** 一天有多少毫秒 */
const DAY_MS = 86400000

/** 把角度收进 [0, 360) */
function mod360(x: number): number {
  const r = x % 360
  return r < 0 ? r + 360 : r
}

/* ─────────────────────────────── 时间 ─────────────────────────────── */

/** 儒略日（以 UT 计） */
export function julianDay(date: Date): number {
  return date.getTime() / DAY_MS + 2440587.5
}

/** 儒略日 → Date
 *  ⚠️ 必须 Math.round，不能让它被 Date 隐式截断：浮点算出来的毫秒常常是
 *     …999.9998，截断会整整差 1 毫秒（踩过，被 verify-sky.js 的往返检查抓出来）。
 *     这里只影响毫秒，但既然发现了就修对。 */
export function dateFromJd(jd: number): Date {
  return new Date(Math.round((jd - 2440587.5) * DAY_MS))
}

/* ─────────────────────────────── 月相 ─────────────────────────────── */

/**
 * 月球相位角 i（度）：0° = 满月，180° = 新月。
 * Meeus 式 48.4（保留主项，公开历表对拍误差 < 1°）。
 */
export function moonPhaseAngle(jd: number): number {
  const T = (jd - 2451545) / 36525
  const D =
    297.8501921 + 445267.1114034 * T - 0.0018819 * T * T + (T * T * T) / 545868 - T ** 4 / 113065000
  const M = 357.5291092 + 35999.0502909 * T - 0.0001536 * T * T + (T * T * T) / 24490000
  const Mp =
    134.9633964 + 477198.8675055 * T + 0.0087414 * T * T + (T * T * T) / 69699 - T ** 4 / 14712000

  const i =
    180 -
    D -
    6.289 * Math.sin(Mp * DEG) +
    2.1 * Math.sin(M * DEG) -
    1.274 * Math.sin((2 * D - Mp) * DEG) -
    0.658 * Math.sin(2 * D * DEG) -
    0.214 * Math.sin(2 * Mp * DEG) -
    0.11 * Math.sin(D * DEG)

  return mod360(i)
}

/**
 * 相位角 g（度）：0° = 新月，90° = 上弦，180° = 满月，270° = 下弦。
 * 也就是「从新月起转过的角度」，用它来找朔望时刻最方便。
 */
export function phaseAngle(jd: number): number {
  return mod360(180 - moonPhaseAngle(jd))
}

/** 被照亮的比例：0 = 新月，1 = 满月 */
export function moonIllum(jd: number): number {
  return (1 + Math.cos(moonPhaseAngle(jd) * DEG)) / 2
}

/** 月龄（天）：从最近一次新月起算，0 ~ 29.53 */
export function moonAge(jd: number): number {
  return (phaseAngle(jd) / 360) * SYNODIC_MONTH
}

/** 相位角 g → 中文月相名 */
export function moonPhaseName(g: number): string {
  if (g < 22.5 || g >= 337.5) return '新月'
  if (g < 67.5) return '蛾眉月'
  if (g < 112.5) return '上弦月'
  if (g < 157.5) return '盈凸月'
  if (g < 202.5) return '满月'
  if (g < 247.5) return '亏凸月'
  if (g < 292.5) return '下弦月'
  return '残月'
}

export interface MoonShape {
  /** 相位角 g（度） */
  g: number
  /** 照亮比例 0~1 */
  illum: number
  /** 是盈（新月→满月）还是亏 */
  waxing: boolean
  /** 月龄（天） */
  age: number
  /** 中文名 */
  name: string
  /** 画圆要用的三个参数：明暗界线椭圆的半轴比例、两段弧的 sweep 方向 */
  rx: number
  sweep: 0 | 1
  secondSweep: 0 | 1
}

/**
 * 把月相换算成「画一个圆」需要的东西。
 *
 * 亮区由两段弧围成：
 *   ① 一段半圆 —— 月球的外缘（亮的那一侧）
 *   ② 一段半椭圆 —— 明暗界线，半轴 rx = R·|cos i|
 * 当照亮 > 50%（凸月）时，明暗界线朝**暗**的一侧鼓；< 50%（娥眉月）时朝
 * **亮**的一侧鼓。两者的 sweep 方向刚好相反，这就是 secondSweep 的来历。
 */
export function moonShape(jd: number): MoonShape {
  const g = phaseAngle(jd)
  const f = -Math.cos(g * DEG) // -1 新月 … +1 满月
  const waxing = g < 180
  const sweep: 0 | 1 = waxing ? 1 : 0
  const secondSweep: 0 | 1 = f > 0 ? ((1 - sweep) as 0 | 1) : sweep
  return {
    g,
    illum: (1 + f) / 2,
    waxing,
    age: (g / 360) * SYNODIC_MONTH,
    name: moonPhaseName(g),
    rx: Math.abs(f),
    sweep,
    secondSweep,
  }
}

/* ─────────────────────────── 朔望时刻求根 ─────────────────────────── */

/** 把角度差收进 (-180, 180] */
function angleDelta(a: number, target: number): number {
  let d = mod360(a - target)
  if (d > 180) d -= 360
  return d
}

/**
 * 通用的「单调角度函数求下一次等于 target 的时刻」。
 * g(λ) 与 λ(t) 都是单调递增的（月球每步 12.19°/天，太阳 0.99°/天，
 * 周期项的导数都远小于主项），所以先粗扫找变号、再二分就够稳。
 */
function solveMonotonic(
  fn: (jd: number) => number,
  from: number,
  target: number,
  step: number,
): number {
  let lo = from
  let dLo = angleDelta(fn(lo), target)
  let hi = lo
  let dHi = dLo
  // 粗扫：最多 200 步（= 50 天 for step 0.25，足够跨过朔望月与节气间隔）
  for (let k = 0; k < 200; k++) {
    hi = lo + step
    dHi = angleDelta(fn(hi), target)
    if (dLo < 0 && dHi >= 0) break
    lo = hi
    dLo = dHi
  }
  // 二分：40 次把区间压到 step / 2^40 —— 远小于 1 秒
  let a = lo
  let b = hi
  for (let k = 0; k < 40; k++) {
    const m = (a + b) / 2
    const dm = angleDelta(fn(m), target)
    if (dm < 0) a = m
    else b = m
  }
  return (a + b) / 2
}

/** 相位事件表：g 的角度值 → 名称 */
const PHASE_TARGETS: { deg: number; name: string }[] = [
  { deg: 0, name: '新月' },
  { deg: 90, name: '上弦' },
  { deg: 180, name: '满月' },
  { deg: 270, name: '下弦' },
]

export interface SkyEvent {
  /** 事件类别 */
  kind: 'phase' | 'term' | 'meteor'
  /** 中文名，比如「满月」「秋分」「英仙座流星雨」 */
  name: string
  /** 发生的时刻（Date，本地时区显示） */
  at: Date
  /** 附带说明 */
  note: string
  /** 这条是「推算」出来的还是「年度固定周期」 */
  basis: 'calculated' | 'annual'
}

/** 从 from 起，按时间顺序取 n 个朔望事件（新月/上弦/满月/下弦轮转） */
export function nextPhases(from: Date, n: number): { name: string; at: Date }[] {
  const out: { name: string; at: Date }[] = []
  let cursor = julianDay(from)
  for (let k = 0; k < n; k++) {
    let best = Infinity
    let bestName = ''
    for (const t of PHASE_TARGETS) {
      const at = solveMonotonic(phaseAngle, cursor, t.deg, 0.25)
      if (at < best) {
        best = at
        bestName = t.name
      }
    }
    out.push({ name: bestName, at: dateFromJd(best) })
    cursor = best + 0.05 // 跳过刚算出来的这一次，避免原地打转
  }
  return out
}

/* ─────────────────────────── 二十四节气 ─────────────────────────── */

/**
 * 太阳视黄经 λ（度）。Meeus 第 25 章低精度式，误差约 0.01°（≈ 15 分钟）。
 * 二十四节气的定义就是 λ 落在 15° 的整数倍上 —— 所以节气不是「查表查出来的」，
 * 是算出来的。
 */
export function sunLongitude(jd: number): number {
  const T = (jd - 2451545) / 36525
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T
  const M = 357.52911 + 35999.05029 * T - 0.0001537 * T * T
  const C =
    (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(M * DEG) +
    (0.019993 - 0.000101 * T) * Math.sin(2 * M * DEG) +
    0.000289 * Math.sin(3 * M * DEG)
  const omega = 125.04 - 1934.136 * T
  return mod360(L0 + C - 0.00569 - 0.00478 * Math.sin(omega * DEG))
}

/** 二十四节气：太阳视黄经的 24 个刻度（春分 = 0°） */
export const SOLAR_TERMS: { deg: number; name: string }[] = [
  { deg: 315, name: '立春' },
  { deg: 330, name: '雨水' },
  { deg: 345, name: '惊蛰' },
  { deg: 0, name: '春分' },
  { deg: 15, name: '清明' },
  { deg: 30, name: '谷雨' },
  { deg: 45, name: '立夏' },
  { deg: 60, name: '小满' },
  { deg: 75, name: '芒种' },
  { deg: 90, name: '夏至' },
  { deg: 105, name: '小暑' },
  { deg: 120, name: '大暑' },
  { deg: 135, name: '立秋' },
  { deg: 150, name: '处暑' },
  { deg: 165, name: '白露' },
  { deg: 180, name: '秋分' },
  { deg: 195, name: '寒露' },
  { deg: 210, name: '霜降' },
  { deg: 225, name: '立冬' },
  { deg: 240, name: '小雪' },
  { deg: 255, name: '大雪' },
  { deg: 270, name: '冬至' },
  { deg: 285, name: '小寒' },
  { deg: 300, name: '大寒' },
]

const TERM_MEANING: Record<string, string> = {
  春分: '太阳直射赤道，昼夜等长',
  夏至: '太阳到达最北，北半球白昼最长',
  秋分: '太阳再次直射赤道，昼夜等长',
  冬至: '太阳到达最南，北半球白昼最短',
}

const TERM_NOTE: Record<string, string> = {
  春分: '此后北半球白昼一天比一天长',
  夏至: '北极圈内出现极昼',
  秋分: '此后北半球白昼一天比一天短',
  冬至: '北极圈内出现极夜',
}

/** 下一个节气 */
export function nextSolarTerm(from: Date): { name: string; at: Date; deg: number } {
  const jd = julianDay(from)
  const lam = sunLongitude(jd)
  // 严格大于当前黄经的那个刻度
  let target = (Math.floor(lam / 15) + 1) * 15
  if (target >= 360) target -= 360
  const at = solveMonotonic(sunLongitude, jd, target, 0.25)
  const row = SOLAR_TERMS.find((t) => t.deg === target)
  return { name: row ? row.name : `黄经 ${target}°`, at: dateFromJd(at), deg: target }
}

/** 节气的一句话说明（不是节气就给「太阳视黄经到 X°」） */
export function solarTermNote(name: string): string {
  if (TERM_NOTE[name]) return TERM_NOTE[name]
  if (TERM_MEANING[name]) return TERM_MEANING[name]
  const row = SOLAR_TERMS.find((t) => t.name === name)
  return row ? `太阳视黄经到达 ${row.deg}°` : '太阳视黄经到整 15° 刻度'
}

/* ─────────────────────── 年度固定周期：流星雨 ───────────────────────
 *  ⚠️ 这一块**不是算出来的**，是常年公开的天文年历数据（极大日期每年浮动
 *     一两天，ZHR 逐年不同）。所以界面上单独打「年度周期」标签，
 *     不能和上面推算出来的朔望 / 节气混为一谈。
 *     母体天体按公开天文年历列（哈雷彗星 / 斯威夫特-塔特尔彗星 /
 *     小行星 3200 法厄同 等）。
 * ──────────────────────────────────────────────────────────────────── */

export interface MeteorShower {
  name: string
  /** 极大日期（月, 日），常年值 */
  peak: [number, number]
  /** 活跃期 */
  span: string
  /** 常年参考峰值（ZHR，每小时天顶流量） */
  zhr: number
  /** 母体 */
  parent: string
}

export const METEOR_SHOWERS: MeteorShower[] = [
  { name: '象限仪座流星雨', peak: [1, 4], span: '1月1日 – 1月5日', zhr: 110, parent: '小行星 2003 EH1' },
  { name: '天琴座流星雨', peak: [4, 22], span: '4月16日 – 4月25日', zhr: 18, parent: '撒切尔彗星' },
  { name: '宝瓶座η流星雨', peak: [5, 6], span: '4月19日 – 5月28日', zhr: 50, parent: '哈雷彗星' },
  { name: '英仙座流星雨', peak: [8, 13], span: '7月17日 – 8月24日', zhr: 100, parent: '斯威夫特-塔特尔彗星' },
  { name: '猎户座流星雨', peak: [10, 21], span: '10月2日 – 11月7日', zhr: 20, parent: '哈雷彗星' },
  { name: '狮子座流星雨', peak: [11, 18], span: '11月6日 – 11月30日', zhr: 15, parent: '坦普尔-塔特尔彗星' },
  { name: '双子座流星雨', peak: [12, 14], span: '12月4日 – 12月20日', zhr: 150, parent: '小行星 3200 法厄同' },
]

/** 取下一次极大日期（从 from 当天或之后） */
export function nextMeteorPeak(s: MeteorShower, from: Date): Date {
  const y = from.getFullYear()
  const mk = (year: number) => new Date(year, s.peak[0] - 1, s.peak[1], 2, 0, 0)
  const thisYear = mk(y)
  // 极大当天也算「还没过」
  const cutoff = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  if (thisYear.getTime() >= cutoff.getTime()) return thisYear
  return mk(y + 1)
}

/** 一次流星雨够不够看：月光是最大的干扰（照亮比例越高越糟） */
export function meteorVerdict(illum: number): string {
  if (illum < 0.25) return '当晚月光弱，条件好'
  if (illum < 0.55) return '当晚有月光，暗弱流星会被压掉一部分'
  if (illum < 0.85) return '当晚月光偏亮，只剩亮的流星看得见'
  return '当晚接近满月，建议改看月面'
}

/* ───────────────────────── 天象日历（合并） ───────────────────────── */

/**
 * 把「推算出来的朔望与节气」和「年度固定周期的流星雨」合到一条时间轴上。
 * 每一条都带 basis 标签，界面上据此分开标注 —— 不许混着说。
 */
export function skyCalendar(from: Date, count = 6): SkyEvent[] {
  const pool: SkyEvent[] = []

  for (const p of nextPhases(from, 4)) {
    pool.push({
      kind: 'phase',
      name: p.name,
      at: p.at,
      note:
        p.name === '满月'
          ? '整夜可见，也是拍月面最好的时候'
          : p.name === '新月'
            ? '月光最暗，深空观测与流星雨的窗口'
            : '月面明暗交界处最清楚，看环形山挑这两天',
      basis: 'calculated',
    })
  }

  // 未来 60 天里的节气（通常 4 个）
  let cursor = from
  for (let k = 0; k < 4; k++) {
    const t = nextSolarTerm(cursor)
    pool.push({
      kind: 'term',
      name: t.name,
      at: t.at,
      note: solarTermNote(t.name),
      basis: 'calculated',
    })
    cursor = new Date(t.at.getTime() + 3 * DAY_MS)
  }

  for (const s of METEOR_SHOWERS) {
    const at = nextMeteorPeak(s, from)
    pool.push({
      kind: 'meteor',
      name: s.name,
      at,
      note: `活跃期 ${s.span} · 常年参考峰值 ZHR≈${s.zhr} · 母体 ${s.parent} · ${meteorVerdict(moonIllum(julianDay(at)))}`,
      basis: 'annual',
    })
  }

  return pool
    .filter((e) => e.at.getTime() >= from.getTime() - 12 * 3600 * 1000)
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .slice(0, count)
}

/* ───────────────────────────── 格式化 ───────────────────────────── */

/** 「9月23日」 */
export function fmtDay(d: Date): string {
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

/** 「约 03:05」—— 推算出来的时刻一律带「约」，误差见文件头 */
export function fmtClock(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `约 ${h}:${m}`
}

/** 距今还有几天（向下取整，今天 = 0） */
export function daysUntil(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime()
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime()
  return Math.round((b - a) / DAY_MS)
}

/** 今夜观测建议 —— 由照亮比例推出来的，不是编的 */
export function nightAdvice(illum: number): { level: string; text: string } {
  if (illum >= 0.85)
    return {
      level: '月光很强',
      text: '深空天体基本没戏，但这是看月面环形山最好的一晚：明暗交界处的阴影最能显地形。',
    }
  if (illum >= 0.55)
    return { level: '月光偏亮', text: '月亮本身就是今晚最值得看的目标，顺便可以找找亮的星团和双星。' }
  if (illum >= 0.25)
    return { level: '月光适中', text: '月面的明暗交界处细节最多，同时还能看一些较亮的深空天体。' }
  return { level: '月光很弱', text: '这是一年里最值钱的观测窗口：银河、星团、星系，以及流星雨都挑这种晚上。' }
}
