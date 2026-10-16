/* ============================================================================
 *  CnCard —— 一条「官方来源内容」的液态玻璃卡片
 * ----------------------------------------------------------------------------
 *  卡片上出现的每一个字，都来自服务端从官方网站抓到的那条数据：
 *      来源小标签   ← item.sourceName（服务端从 SOURCES 表写进去的官方全称）
 *      栏目         ← item.column（实际读取的官方栏目，例如「要闻动态」）
 *      日期         ← item.publishDate（官方页面上的日期；没有就是 null）
 *      标题 / 摘要  ← 官方页面原文
 *      「查看原文」 ← item.sourceUrl（官方原文地址，直接跳官网）
 *
 *  交互（用户只要求两个，不做多余的花样）：
 *    · 点卡片任意位置 → 展开 / 收起简介（展开状态由父级控制，同一排不铺开）
 *    · 点「查看原文」 → 新标签打开官方原文
 *
 *  实现要点：
 *    · 展开热区是一个真 <button> 铺满整卡（.cn-card__hit），
 *      这样 .scene-wrap button { pointer-events:auto } 的白名单能接住点击；
 *      裸 <div onClick> 会被下方 WebGL 画布把事件接走（这个坑踩过）。
 *    · 「查看原文」是真 <a>，且 pointer-events:auto + 更高的 z-index，
 *      点它只跳转、不会顺手把卡片展开。
 *    · 缩略图直接用官方图床地址，**不转存**、不设 crossOrigin（约定第八条）。
 *      加载失败就整块不渲染，绝不用占位图冒充官方配图。
 * ========================================================================== */

import { useState, type CSSProperties } from 'react'
import GlassSurface from '../ui/glass/GlassSurface'
import type { CnItem } from '../lib/cnspace'
import { cnSourceMeta } from './sources'

interface Props {
  item: CnItem
  index: number
  /** 错峰入场延迟（ms） */
  delay: number
  open: boolean
  onToggle: () => void
}

const CONTENT_LABEL: Record<CnItem['contentType'], string> = {
  video: '视频',
  image: '图片',
  article: '文章',
}

/** 官方原文有时不在本站域名下 —— 国家天文台「科普文章」栏目就是把条目
 *  直接挂到它自己的微信公众号文章上。这不是我们转的，是官方栏目本来这么挂的。
 *  这种情况必须在卡面上说清楚，别让用户以为点出去还是 nao.cas.cn。 */
const WEIXIN_RE = /^https?:\/\/mp\.weixin\.qq\.com\//i

export default function CnCard({ item, index, delay, open, onToggle }: Props) {
  const meta = cnSourceMeta(item.source)
  const [imgFailed, setImgFailed] = useState(false)

  const hasThumb = Boolean(item.image) && !imgFailed
  const summary = item.summary?.trim() || ''
  const topicTags = item.topicLabels ?? []
  const isWeixin = WEIXIN_RE.test(item.sourceUrl)

  return (
    <div className="cn-slot glass-enter" style={{ animationDelay: `${delay}ms` }}>
      <GlassSurface
        className={`cn-card${open ? ' is-open' : ''}`}
        tilt
        tiltMax={4}
        style={{ '--sc': meta.accent } as CSSProperties}
        data-cn-card={item.id}
      >
        {/* 展开热区：铺满整卡的真按钮 */}
        <button
          type="button"
          className="cn-card__hit"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={`${open ? '收起' : '展开'}简介：${item.title}`}
        />

        {hasThumb ? (
          <div className="cn-card__thumb">
            <img
              src={item.image as string}
              alt=""
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              onError={() => setImgFailed(true)}
            />
            {item.contentType !== 'article' ? (
              <span className="cn-card__badge">{CONTENT_LABEL[item.contentType]}</span>
            ) : null}
          </div>
        ) : null}

        <div className="cn-card__body">
          <div className="cn-card__top">
            <span className="cn-card__src" title={item.sourceName}>
              <i aria-hidden="true" />
              {meta.chip}
            </span>
            <span className="cn-card__col" title={`官方栏目：${item.column}`}>
              {item.column}
            </span>
            {isWeixin ? (
              <span className="cn-card__via" title="官方栏目直接挂到自家微信公众号文章，非本站域名">
                微信原文
              </span>
            ) : null}
            <span className="cn-card__date">{item.publishDate || '官方未标日期'}</span>
          </div>

          <h3 className="cn-card__title">{item.title}</h3>

          {summary ? (
            <p className="cn-card__summary">{summary}</p>
          ) : (
            <p className="cn-card__summary cn-card__summary--none">
              官方页面未提供导语，点「查看原文」看全文。
            </p>
          )}

          {topicTags.length > 0 ? (
            <div className="cn-card__tags">
              {topicTags.map((t) => (
                <span key={t} className="cn-card__tag">
                  {t}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="cn-card__foot">
          <span className="cn-card__hint">
            {String(index + 1).padStart(2, '0')} · {open ? '点击收起' : '点击展开简介'}
          </span>
          <a
            className="cn-card__orig"
            href={item.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={item.sourceUrl}
          >
            查看原文 ↗
          </a>
        </div>
      </GlassSurface>
    </div>
  )
}
