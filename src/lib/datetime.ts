/* ============================================================================
 *  datetime.ts —— 日期 / 时间的小工具
 * ----------------------------------------------------------------------------
 *  为什么单独一个文件：PHOTON 要按「日期」翻，FOUNDRY 要按「发射时刻」算倒计时，
 *  两边都要做「ISO 字符串 ↔ 本地显示」的换算。集中在这里，避免各处各写一套。
 *
 *  ⚠️ 两个时间的语义完全不同，不要混：
 *      · APOD 的日期（YYYY-MM-DD）是 NASA 的**自然日**，按 UTC 划分。
 *        所以「今天」= UTC 的今天，不能用本地日期 —— 北京时间凌晨那几小时
 *        本地日期比 UTC 早一天，直接去查会拿到「未来日期」而报错。
 *      · 发射的 NET（2026-09-15T01:21:07Z）是一个**绝对时刻**，
 *        显示给用户时必须转成本地时区，否则中国用户看到的时间会差 8 小时。
 * ========================================================================== */

const DAY_MS = 86_400_000

const pad2 = (n: number) => String(n).padStart(2, '0')

/** Date → 'YYYY-MM-DD'（按 UTC 取值，用于 APOD 的自然日） */
export function isoDayOf(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
}

/** 'YYYY-MM-DD' → 该日 UTC 0 点的毫秒时间戳 */
export function dayToMs(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, (m ?? 1) - 1, d ?? 1)
}

/** 两个自然日相隔多少天（b - a），可正可负 */
export function daysBetween(a: string, b: string): number {
  return Math.round((dayToMs(b) - dayToMs(a)) / DAY_MS)
}

/** 自然日加减天数 */
export function addDays(iso: string, delta: number): string {
  return isoDayOf(new Date(dayToMs(iso) + delta * DAY_MS))
}

/** NASA 的「今天」：按 UTC 算，见文件头说明 */
export function utcToday(): string {
  return isoDayOf(new Date())
}

/** 校验是不是合法的 'YYYY-MM-DD'，并且真的是一个存在的日期 */
export function isValidDay(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false
  return isoDayOf(new Date(dayToMs(iso))) === iso
}

/** 在 [min, max] 之间夹取（字符串形式的日期可以直接比大小） */
export function clampDay(iso: string, min: string, max: string): string {
  if (iso < min) return min
  if (iso > max) return max
  return iso
}

const WEEKDAY_CN = ['日', '一', '二', '三', '四', '五', '六']

/** '2026-09-15' → '2026 年 9 月 15 日 · 周二'（中文界面用） */
export function formatDayCn(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const wd = WEEKDAY_CN[new Date(dayToMs(iso)).getUTCDay()]
  return `${y} 年 ${m} 月 ${d} 日 · 周${wd}`
}

/** ISO 时刻 → 本地 'YYYY-MM-DD HH:mm'（不补秒，卡片上够用） */
export function formatMomentLocal(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** ISO 时刻 → 本地「+08:00」这样的时区后缀，让用户知道这是本地时间 */
export function localZoneLabel(): string {
  const off = -new Date().getTimezoneOffset()
  const sign = off >= 0 ? '+' : '-'
  const abs = Math.abs(off)
  return `UTC${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`
}

/**
 * 剩余时长 → 倒计时各分量。
 * 返回的 `total` 可能为负（已经过了 T-0），由调用方决定怎么显示。
 */
export interface CountdownParts {
  total: number
  days: number
  hours: number
  minutes: number
  seconds: number
  /** 已经过了 T-0 */
  past: boolean
}

export function countdownParts(targetIso: string, nowMs = Date.now()): CountdownParts {
  const target = new Date(targetIso).getTime()
  const total = Number.isFinite(target) ? target - nowMs : 0
  const abs = Math.abs(total)
  const days = Math.floor(abs / DAY_MS)
  const hours = Math.floor((abs % DAY_MS) / 3_600_000)
  const minutes = Math.floor((abs % 3_600_000) / 60_000)
  const seconds = Math.floor((abs % 60_000) / 1000)
  return { total, days, hours, minutes, seconds, past: total <= 0 }
}

/** 倒计时主文案：T-02D 05H 12M 08S（已过 T-0 时前缀变成 T+） */
export function formatCountdown(iso: string, nowMs = Date.now()): string {
  const c = countdownParts(iso, nowMs)
  const sign = c.past ? 'T+' : 'T-'
  return `${sign}${pad2(c.days)}D ${pad2(c.hours)}H ${pad2(c.minutes)}M ${pad2(c.seconds)}S`
}
