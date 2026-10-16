/* ============================================================================
 *  ApodLog —— 观测日志：本次会话里「观测过」的每一个夜晚
 * ----------------------------------------------------------------------------
 *  观测台该有的东西：你看过哪几夜，记一笔，随时能翻回去再看。
 *  这也是 PHOTON 和别的栏目最不一样的地方 —— 别的栏目是「读」，这里是「看」，
 *  而「看过什么」本身就该被记下来。
 *
 *  ── 三条纪律（和 PHOTON 的取数铁律是一套）────────────────────────────
 *    ① 只记**界面真的显示过**的条目。每一条的日期与标题都来自 NASA 的原始返回，
 *       所以日志里没有一个是编的（标题就是那一刻屏幕上的那个标题）。
 *    ② 只活在**本次会话**的内存里，**不写 localStorage**。理由是失败态那条断言：
 *       「失败时不出现任何替代内容」—— 如果日志落了盘，刷新之后即使接口全挂，
 *       页面上也会冒出一串旧标题，看起来就像拿历史数据顶上了。
 *    ③ 最多留 MAX_LOG 条，最新的在最上面；同一天只留一条。
 * ========================================================================== */

import type { ApodItem } from '../lib/apod'
import { formatDayCn } from '../lib/datetime'
import GlassSurface from '../ui/glass/GlassSurface'

/** 日志里的一夜 */
export interface ApodLogEntry {
  date: string
  title: string
  mediaType: string
}

/** 最多保留几夜 —— 刚好是日期轨道 ±3 天的一周 */
export const MAX_LOG = 6

interface Props {
  entries: ApodLogEntry[]
  /** 屏幕上正在观测的那一天 */
  currentDate: string
  /** 点某一行 → 翻到那一天（复用 useApodDay 的 goDate，受同一个区间约束） */
  onPick: (date: string) => void
}

const shortOf = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`

const tagOf = (mediaType: string) =>
  mediaType === 'image' ? null : mediaType === 'video' ? 'VIDEO' : 'MEDIA'

export default function ApodLog({ entries, currentDate, onPick }: Props) {
  if (!entries.length) return null

  return (
    <GlassSurface className="apod-log" tilt={false}>
      <div className="apod-log__head">
        <span className="apod-log__kicker">观测日志</span>
        <span className="apod-log__count">本次会话 · {entries.length} 夜</span>
      </div>

      <ol className="apod-log__list">
        {entries.map((e) => {
          const active = e.date === currentDate
          const tag = tagOf(e.mediaType)
          return (
            <li key={e.date}>
              <button
                type="button"
                className={'apod-log__row' + (active ? ' is-current' : '')}
                onClick={() => onPick(e.date)}
                aria-current={active ? 'true' : undefined}
                title={`观测 ${formatDayCn(e.date)} · ${e.title}`}
              >
                <i className="apod-log__dot" aria-hidden="true" />
                <span className="apod-log__day">{shortOf(e.date)}</span>
                <span className="apod-log__title">{e.title}</span>
                {tag ? <span className="apod-log__tag">{tag}</span> : null}
              </button>
            </li>
          )
        })}
      </ol>

      <p className="apod-log__note">标题与日期都是当时屏幕上那一条，来自 NASA 原始返回</p>
    </GlassSurface>
  )
}

/** 从一条 APOD 条目抽出日志需要的那几个字段 */
export function logEntryOf(item: ApodItem): ApodLogEntry {
  return { date: item.date, title: item.title, mediaType: item.mediaType }
}
