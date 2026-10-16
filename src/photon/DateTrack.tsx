/* ============================================================================
 *  DateTrack —— 日期游标：一条横向「时间轨道」
 * ----------------------------------------------------------------------------
 *  需求是「左右切换日期」，同时不能做得像个普通日历控件，所以：
 *
 *      ← 按钮  ┃ 轨道：当前日期前后各 3 天的 7 个日期点（有真实数据的更亮）
 *              ┃ 线上有缓慢流动的光点（和左侧导航同一种语言）
 *      → 按钮  ┃ 一个原生 date 输入框（想跳哪天跳哪天）
 *              ┃ 「今天」按钮
 *
 *  7 个日期点里，已经取到真实数据的点会亮起来；没取到的点也能点，
 *  点了才会去取（同一窗口内基本是命中缓存，零请求）。
 *
 *  日期范围严格夹在 NASA 的真实区间里：[1995-06-16, UTC 今天]。
 * ========================================================================== */

import type { CSSProperties } from 'react'
import { APOD_EPOCH, type ApodItem } from '../lib/apod'
import { addDays, formatDayCn } from '../lib/datetime'

interface Props {
  /** 屏幕上正在显示的那一天 */
  date: string
  /** 前后各 3 天里已经拿到真实数据的条目 */
  span: ApodItem[]
  today: string
  /** 「回到上界」那个按钮的文案。降级到离线存档时上界是存档最后一天，别说成「今天」 */
  todayLabel?: string
  canPrev: boolean
  canNext: boolean
  /** 正在飞过来的目标日期 */
  pending: string | null
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  onPick: (date: string) => void
}

/** 轨道上显示前后各几天 */
const RADIUS = 3

const shortOf = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`

export default function DateTrack({
  date,
  span,
  today,
  todayLabel = '今天',
  canPrev,
  canNext,
  pending,
  onPrev,
  onNext,
  onToday,
  onPick,
}: Props) {
  const loaded = new Map(span.map((it) => [it.date, it]))
  const days: string[] = []
  for (let d = -RADIUS; d <= RADIUS; d++) {
    const day = addDays(date, d)
    if (day < APOD_EPOCH || day > today) continue
    days.push(day)
  }

  return (
    <div className="apod-dates" style={{ '--cols': String(days.length) } as CSSProperties}>
      <button
        type="button"
        className="apod-dates__step"
        onClick={onPrev}
        disabled={!canPrev}
        aria-label="前一天"
        title="前一天"
      >
        ←
      </button>

      <div className="apod-dates__track">
        <span className="apod-dates__line" aria-hidden="true">
          <i className="apod-dates__flow" />
          <i className="apod-dates__flow apod-dates__flow--b" />
        </span>

        {days.map((day) => {
          const active = day === date
          const hit = loaded.has(day)
          const isPending = pending === day
          return (
            <button
              key={day}
              type="button"
              className={
                'apod-dates__node' +
                (active ? ' is-active' : '') +
                (hit ? ' is-loaded' : ' is-blank') +
                (isPending ? ' is-pending' : '')
              }
              onClick={() => onPick(day)}
              aria-current={active ? 'date' : undefined}
              title={`${formatDayCn(day)}${hit ? ' · 已取到真实数据' : ' · 点开才会取数'}`}
            >
              <i className="apod-dates__dot" aria-hidden="true" />
              <span className="apod-dates__lab">{shortOf(day)}</span>
            </button>
          )
        })}
      </div>

      <button
        type="button"
        className="apod-dates__step"
        onClick={onNext}
        disabled={!canNext}
        aria-label="后一天"
        title="后一天"
      >
        →
      </button>

      {/* 自由跳转：原生 date 输入，min/max 就是 APOD 的真实边界 */}
      <label className="apod-dates__pick glass">
        <span className="apod-dates__pick-lab">跳转</span>
        <input
          className="apod-dates__pick-input"
          type="date"
          value={date}
          min={APOD_EPOCH}
          max={today}
          onChange={(e) => e.target.value && onPick(e.target.value)}
          aria-label="选择日期"
        />
      </label>

      <button
        type="button"
        className="apod-dates__today glass"
        onClick={onToday}
        disabled={date === today}
        title="回到 NASA 最新的一天"
      >
        {todayLabel}
      </button>
    </div>
  )
}
