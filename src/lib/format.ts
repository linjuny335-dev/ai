/* ============================================================================
 *  format.ts —— 展示层的小工具（三个数据源共用）
 *  纯函数，不认识 React，也不发请求。
 * ========================================================================== */

/** 「3m ago / 5h ago / 2d ago」—— 英文界面用，简短不抢戏 */
export function timeAgo(ms: number, now = Date.now()): string {
  if (!ms) return '—'
  const s = Math.max(0, Math.round((now - ms) / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 30) return `${d}d ago`
  const mo = Math.round(d / 30)
  if (mo < 12) return `${mo}mo ago`
  return `${Math.round(mo / 12)}y ago`
}

/** 大数压缩：254208155 → 254M，1272 → 1.3k。卡片里放不下长数字 */
export function compact(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '0'
  const abs = Math.abs(n)
  if (abs >= 1e9) return `${trim(n / 1e9)}B`
  if (abs >= 1e6) return `${trim(n / 1e6)}M`
  if (abs >= 1e3) return `${trim(n / 1e3)}k`
  return String(Math.round(n))
}

function trim(v: number): string {
  const s = v >= 100 ? v.toFixed(0) : v.toFixed(1)
  return s.endsWith('.0') ? s.slice(0, -2) : s
}

/** 从 URL 里抽域名，用作卡片副信息。抽不出来返回 undefined */
export function hostOf(url?: string): string | undefined {
  if (!url) return undefined
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return undefined
  }
}

/** ISO 字符串 → 毫秒；解析不出来返回 undefined（不要让 NaN 漏进界面） */
export function timeOf(iso?: string | number): number | undefined {
  if (iso === undefined || iso === null || iso === '') return undefined
  if (typeof iso === 'number') return Number.isFinite(iso) ? iso : undefined
  const t = Date.parse(iso)
  return Number.isNaN(t) ? undefined : t
}

/** 秒 → 毫秒，兼容 HN 的时间字段 */
export function secondsToMs(sec?: number): number | undefined {
  if (typeof sec !== 'number' || !Number.isFinite(sec) || sec <= 0) return undefined
  return sec * 1000
}
