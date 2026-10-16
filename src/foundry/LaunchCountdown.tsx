/* ============================================================================
 *  LaunchCountdown —— 发射倒计时（完全由接口返回的真实 NET 时刻驱动）
 * ----------------------------------------------------------------------------
 *  两条不能违反的规则：
 *
 *   ① 倒计时必须从真实时间算。
 *      目标时刻只有一处来源：LL2 的 `net`（绝对时刻，ISO 8601）。
 *      组件每秒读一次 Date.now() 重算，**没有任何写死的剩余时长**。
 *      `net` 为 null（TBD）时不算倒计时 —— 不假装知道它什么时候发射。
 *
 *   ② 显示精度不能超过数据精度。
 *      LL2 用 `net_precision` 说明这个时刻准到什么程度（Second / Minute /
 *      Hour / Day …）。如果接口只说到「天」，却把界面显示成
 *      T-02D 05H 12M 08S，那是在用假精度骗人。所以：
 *          Second  → T-02D 05H 12M 08S
 *          Minute  → T-02D 05H 12M
 *          Hour    → T-02D 05H
 *          Day     → T-02D
 *          TBD     → 不算，直接说「时刻待定」
 * ========================================================================== */

import { useEffect, useState } from 'react'
import { countdownParts, formatMomentLocal, localZoneLabel } from '../lib/datetime'

interface Props {
  /** 接口返回的 NET（绝对时刻）。null = TBD */
  net: string | null
  /** 接口返回的时刻精度名（net_precision.name） */
  precision: string | null
  /** 紧凑排布：时间轴节点里用 */
  compact?: boolean
  /** 不显示时区后缀（紧凑模式） */
  hideZone?: boolean
}

type Unit = { value: number; label: 'D' | 'H' | 'M' | 'S' }

/** 精度名 → 最多能显示到哪个单位 */
function unitsOf(precision: string | null): Unit['label'][] {
  const p = (precision ?? '').toLowerCase()
  if (p.startsWith('second')) return ['D', 'H', 'M', 'S']
  if (p.startsWith('minute')) return ['D', 'H', 'M']
  if (p.startsWith('hour')) return ['D', 'H']
  if (p.startsWith('day')) return ['D']
  // 再粗（month / quarter / year / tbd）就不适合做倒计时了
  return []
}

const pad2 = (n: number) => String(n).padStart(2, '0')

export default function LaunchCountdown({ net, precision, compact = false, hideZone = false }: Props) {
  /** 每秒跳一下。now 是真实时钟，不是任何形式的自增计数 */
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!net) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    // 切回前台立刻对齐一次，免得标签页在后台被节流后显示成旧值
    const sync = () => setNow(Date.now())
    document.addEventListener('visibilitychange', sync)
    window.addEventListener('focus', sync)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', sync)
      window.removeEventListener('focus', sync)
    }
  }, [net])

  /* ------------------------------------------------ 没有确定时刻：如实说 */
  if (!net) {
    return (
      <span className={`cd cd--tbd${compact ? ' cd--compact' : ''}`} title="官方尚未确定发射时刻">
        <b>时刻待定</b>
        {!compact ? <i>官方还在调整窗口，暂不给倒计时</i> : null}
      </span>
    )
  }

  const labels = unitsOf(precision)
  const parts = countdownParts(net, now)

  /* 精度太粗（月/季/年）时，倒计时没有意义，只报日期 */
  if (!labels.length) {
    return (
      <span className={`cd cd--tbd${compact ? ' cd--compact' : ''}`} title={`官方精度：${precision ?? '未知'}`}>
        <b>{formatMomentLocal(net)}</b>
        {!compact ? <i>官方只给到「{precision ?? '未知'}」精度，不做倒计时</i> : null}
      </span>
    )
  }

  const values: Record<Unit['label'], number> = {
    D: parts.days,
    H: parts.hours,
    M: parts.minutes,
    S: parts.seconds,
  }

  return (
    <span
      className={`cd${parts.past ? ' is-past' : ''}${compact ? ' cd--compact' : ''}`}
      data-precision={precision ?? 'unknown'}
      role="timer"
      aria-live="off"
      /* 无障碍读屏用的一句话（数字块对读屏是碎片） */
      aria-label={
        parts.past
          ? `已过计划发射时刻 ${parts.days} 天 ${parts.hours} 小时`
          : `距离计划发射还有 ${parts.days} 天 ${parts.hours} 小时`
      }
    >
      <i className="cd__sign" aria-hidden="true">
        {parts.past ? 'T+' : 'T-'}
      </i>
      {labels.map((l) => (
        <span className="cd__unit" key={l}>
          <b>{pad2(values[l])}</b>
          <em>{l}</em>
        </span>
      ))}
      {!compact ? (
        <i className="cd__note">
          {parts.past ? '已过计划时刻' : '基于官方 NET 实时计算'}
          {hideZone ? '' : ` · 本地时间 ${formatMomentLocal(net)} (${localZoneLabel()})`}
          {precision ? ` · 官方精度 ${precision}` : ''}
        </i>
      ) : null}
    </span>
  )
}
