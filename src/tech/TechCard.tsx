/* ============================================================================
 *  TechCard —— 三个数据源共用的液态玻璃卡片
 * ----------------------------------------------------------------------------
 *  HN / GitHub / Hugging Face 的区别已经被 src/lib/techTypes.ts 抹平，
 *  这里只负责把 TechItem 画出来，不需要知道数据是从哪来的。
 *
 *  整卡是一个 <a>（点哪都是打开）：主链接进内容页，
 *  HN 那种「有原文 + 有讨论」的，footer 上再挂一个 Discuss 入口。
 *
 *  入场动画放在外层 .news-slot 上（不是 .glass 自己）——
 *  animation 的终态会锁住 transform，直接加在玻璃上会把 hover 倾斜吃掉。
 * ========================================================================== */

import type { CSSProperties } from 'react'
import GlassSurface from '../ui/glass/GlassSurface'
import { timeAgo } from '../lib/format'
import type { MetricKind, SourceDef, TechItem } from '../lib/techTypes'

interface Props {
  item: TechItem
  index: number
  /** 错峰入场延迟（ms） */
  delay: number
  /** 当前数据源（提供强调色，让三个源在视觉上有点区分） */
  source: SourceDef
}

/** 主指标的小图标。没有对应图标的就不画，只用文字的语义标签 */
const PRIMARY_GLYPH: Partial<Record<MetricKind, string>> = {
  score: '▲',
  stars: '★',
  likes: '♥',
}

function openInNewTab(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer')
}

export default function TechCard({ item, index, delay, source }: Props) {
  const glyph = PRIMARY_GLYPH[item.primary.kind]
  const hasDiscuss = Boolean(item.discussUrl && item.discussUrl !== item.url)
  const external = !hasDiscuss || item.url !== item.discussUrl

  return (
    <div className="news-slot glass-enter" style={{ animationDelay: `${delay}ms` }}>
      <GlassSurface
        as="a"
        className="news-card"
        tilt
        tiltMax={4}
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        title={item.title}
        style={{ '--src': source.accent } as CSSProperties}
      >
        <div className="news-card__top">
          <span className="news-card__idx">{String(index + 1).padStart(2, '0')}</span>
          <span className="news-card__primary">
            {glyph ? <i className="news-card__glyph">{glyph}</i> : null}
            {item.primary.value}
          </span>
        </div>

        <h3 className="news-card__title">{item.title}</h3>

        {item.description ? <p className="news-card__desc">{item.description}</p> : null}

        <div className="news-card__meta">
          <span className="news-card__owner">{item.owner}</span>
          {item.createdAt ? (
            <>
              <i>·</i>
              <span>{timeAgo(item.createdAt)}</span>
            </>
          ) : null}
          {item.secondary.map((m, i) => (
            <span key={`${m.kind}-${i}`} className="news-card__metric">
              <i>·</i>
              {m.value}
              {m.label ? <em>{m.label}</em> : null}
            </span>
          ))}
        </div>

        {item.tags.length > 0 ? (
          <div className="news-card__tags">
            {item.tags.map((t) => (
              <span key={t} className="news-card__tag">
                {t}
              </span>
            ))}
          </div>
        ) : null}

        <div className="news-card__foot">
          <span className="news-card__foot-label">
            {item.dot ? (
              <i className="news-card__dot" style={{ background: item.dot }} aria-hidden="true" />
            ) : null}
            {item.footLabel ?? ''}
          </span>

          <span className="news-card__actions">
            {hasDiscuss ? (
              <span
                className="news-card__act"
                role="link"
                tabIndex={0}
                onClick={(e) => {
                  // 卡片本身是 <a>，这里必须拦下冒泡，否则会同时打开两个页面
                  e.preventDefault()
                  e.stopPropagation()
                  openInNewTab(item.discussUrl as string)
                }}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' && e.key !== ' ') return
                  e.preventDefault()
                  e.stopPropagation()
                  openInNewTab(item.discussUrl as string)
                }}
              >
                Discuss
              </span>
            ) : null}
            <span className="news-card__go">{external ? 'Open' : 'Discuss'} ↗</span>
          </span>
        </div>
      </GlassSurface>
    </div>
  )
}
