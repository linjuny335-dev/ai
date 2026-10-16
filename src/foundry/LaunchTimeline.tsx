/* ============================================================================
 *  LaunchTimeline —— 真实发射任务的时间轴
 * ----------------------------------------------------------------------------
 *  不是一排卡片，而是一条「飞行路径」：
 *
 *      ←   ●──────●──────◆──────●──────●   →
 *          09-14  09-15  今天   09-17  09-19
 *
 *  中轴是一条细发光线，光点缓慢向前流动（和左侧导航、PHOTON 日期轨道同一种
 *  视觉语言）；当前选中的那一节鼓起来变成「正在执行的任务」，其余是沿途站点。
 *
 *  两条真实数据带来的约束：
 *    · 节点上的刻度和日期都来自接口的 net，未定的显示「待定」，不猜时间。
 *    · 每次只展示 5 个节点（用户要的 3~5 个），整个列表靠左右按钮浏览；
 *      窗口跟随选中项平移，两端到边就停住，不会跑出列表。
 *
 *  点节点 = 选中 + 打开详情面板（回调交给 FoundryScene 决定）。
 * ========================================================================== */

import { useEffect, useMemo, useState } from 'react'
import { formatMomentLocal } from '../lib/datetime'
import type { LaunchItem } from '../lib/launches'
import LaunchCountdown from './LaunchCountdown'

interface Props {
  items: LaunchItem[]
  index: number
  onStep: (delta: number) => void
  onPick: (i: number) => void
  /** 在跑倒计时的那一项是不是「即将发射」批次 */
  upcoming: boolean
}

/**
 * 一次显示多少个节点（用户要求 3~5 个）。
 * 宽度不够时收到 3 站 —— 让 DOM 里的节点数 == 看得见的节点数，
 * 而不是用 CSS 藏掉两站（那样计数会骗人）。
 */
function useColumns(): number {
  const query = '(max-width: 1080px)'
  const [cols, setCols] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia(query).matches ? 3 : 5,
  )
  useEffect(() => {
    const mq = window.matchMedia(query)
    const sync = () => setCols(mq.matches ? 3 : 5)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])
  return cols
}

/** "Falcon 9 Block 5 | Starlink Group 17-3" → 任务部分 */
export function missionOf(name: string): string {
  const parts = name.split('|')
  return (parts.length > 1 ? parts.slice(1).join('|') : parts[0]).trim()
}

/** 状态 → 一个语义色标（Go/TBD 是进行中，Success/Failure 是结果） */
export function statusTone(abbrev: string): 'go' | 'hold' | 'ok' | 'bad' {
  const a = abbrev.toLowerCase()
  if (a.includes('success')) return 'ok'
  if (a.includes('fail') || a.includes('partial')) return 'bad'
  if (a.includes('go') || a.includes('flight')) return 'go'
  return 'hold'
}

export default function LaunchTimeline({ items, index, onStep, onPick, upcoming }: Props) {
  const cols = useColumns()

  /* 5（或 3）个节点的窗口：尽量让选中项落在中间，两端不越界 */
  const start = useMemo(() => {
    if (items.length <= cols) return 0
    const half = Math.floor(cols / 2)
    return Math.min(Math.max(index - half, 0), items.length - cols)
  }, [index, items.length, cols])

  const slice = items.slice(start, start + cols)
  const canPrev = index > 0
  const canNext = index < items.length - 1

  return (
    <div className="ftl">
      <div className="ftl__head">
        <span className="ftl__axis">
          {upcoming ? '发射顺序 · 由近及远' : '最近完成 · 由近及远'}
        </span>
        <span className="ftl__pos">
          {index + 1} / {items.length}
        </span>
      </div>

      <div className="ftl__rail">
        <button
          type="button"
          className="ftl__step"
          onClick={() => onStep(-1)}
          disabled={!canPrev}
          aria-label="上一个任务"
          title="上一个任务"
        >
          ←
        </button>

        <div
          className="ftl__track"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          <span className="ftl__line" aria-hidden="true">
            <i className="ftl__flow" />
            <i className="ftl__flow ftl__flow--b" />
          </span>

          {slice.map((it, k) => {
            const i = start + k
            const active = i === index
            return (
              <button
                key={it.id}
                type="button"
                className={
                  'ftl__node' + (active ? ' is-active' : '') + ` is-${statusTone(it.status.abbrev)}`
                }
                onClick={() => onPick(i)}
                aria-current={active ? 'true' : undefined}
                title={`${it.name}\n${it.rocket ?? '火箭待定'} · ${it.provider ?? '机构待定'}\n${
                  it.net ? formatMomentLocal(it.net) : '时刻待定'
                }`}
              >
                <i className="ftl__dot" aria-hidden="true" />
                <span className="ftl__no">{String(i + 1).padStart(2, '0')}</span>
                <span className="ftl__name">{missionOf(it.name)}</span>
                <span className="ftl__when">
                  {it.net ? (
                    <LaunchCountdown net={it.net} precision={it.netPrecision} compact />
                  ) : (
                    <span className="ftl__tbd">时刻待定</span>
                  )}
                </span>
                <span className="ftl__date">{it.net ? formatMomentLocal(it.net).slice(0, 10) : '—'}</span>
              </button>
            )
          })}
        </div>

        <button
          type="button"
          className="ftl__step"
          onClick={() => onStep(1)}
          disabled={!canNext}
          aria-label="下一个任务"
          title="下一个任务"
        >
          →
        </button>
      </div>

      <p className="ftl__hint">
        左右浏览 {items.length} 场真实任务 · 点任意一站打开任务详情
      </p>
    </div>
  )
}
