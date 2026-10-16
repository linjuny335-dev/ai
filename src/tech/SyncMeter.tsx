/* ============================================================================
 *  SyncMeter —— 自动刷新状态指示器
 * ----------------------------------------------------------------------------
 *  显示「距离下一次自动同步还有多久」，点一下可以暂停 / 继续自动刷新。
 *
 *  为什么单独做成一个组件：倒计时需要每秒重渲染一次。
 *  如果把这个定时器放在 TechScene 里，整张卡片列表会跟着每秒重渲染一遍，
 *  在玻璃 + backdrop-filter 的场景下这是纯粹的浪费。放这里，
 *  每秒变化的只有这一小块。
 * ========================================================================== */

import { useEffect, useState } from 'react'
import GlassButton from '../ui/glass/GlassButton'

interface Props {
  /** 上一次同步成功的时间戳（ms）；0 表示还没成功过 */
  syncAt: number
  /** 自动刷新周期（ms） */
  autoMs: number
  auto: boolean
  /** 正在请求中 */
  busy: boolean
  onToggle: () => void
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export default function SyncMeter({ syncAt, autoMs, auto, busy, onToggle }: Props) {
  const [, tick] = useState(0)

  // 只在开启自动刷新时跑定时器：关掉了就没必要每秒重渲染
  useEffect(() => {
    if (!auto) return
    const id = window.setInterval(() => tick((v) => v + 1), 1000)
    return () => window.clearInterval(id)
  }, [auto])

  let text = 'Auto off'
  if (auto) {
    if (busy) {
      text = 'Syncing…'
    } else if (syncAt) {
      const remain = Math.max(0, autoMs - (Date.now() - syncAt))
      text = `${pad(Math.floor(remain / 60_000))}:${pad(Math.floor((remain % 60_000) / 1000))}`
    } else {
      text = 'Waiting…'
    }
  }

  return (
    <GlassButton
      className={`sync-meter${auto ? ' is-on' : ''}${busy ? ' is-busy' : ''}`}
      onClick={onToggle}
      title={
        auto
          ? `自动刷新已开启：每 ${Math.round(autoMs / 60_000)} 分钟静默更新一次。点击暂停。`
          : '自动刷新已暂停。点击恢复。'
      }
      aria-pressed={auto}
    >
      <i className="sync-meter__dot" aria-hidden="true" />
      <span className="sync-meter__label">{text}</span>
    </GlassButton>
  )
}
