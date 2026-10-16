/* ============================================================================
 *  ApodLightbox —— 放大查看（点图片打开）
 * ----------------------------------------------------------------------------
 *  两个细节值得说明：
 *
 *  ① 用 createPortal 挂到 document.body。
 *     场景层 .scene-wrap 的 z-index 是 10（固定 UI 是 20），它自己是一个层叠
 *     上下文；放大视图必须盖住左侧轨道导航和顶部玻璃条，所以不能再待在场景里，
 *     必须挂到 body 上（z-index 60）。
 *
 *  ② 用高清图（hdurl）。
 *     场景里画的是标准尺寸图，放大视图才去取 hdurl —— 动辄几 MB 的图不应该
 *     在用户没点之前就下载。这里配一个「正在展开高清图…」的过渡态。
 * ========================================================================== */

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ApodItem } from '../lib/apod'
import { formatDayCn } from '../lib/datetime'
import ApodMedia from './ApodMedia'

interface Props {
  item: ApodItem
  onClose: () => void
}

export default function ApodLightbox({ item, onClose }: Props) {
  /** 高清图要现取，给它一个过渡态，避免打开瞬间是空白 */
  const [loading, setLoading] = useState(item.mediaType === 'image')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // 高清图就绪 / 失败都关掉过渡态（失败也放行，让用户看到标准图那一版）
  useEffect(() => {
    if (item.mediaType !== 'image') return
    const src = item.hdurl ?? item.url
    let alive = true
    setLoading(true)
    const img = new Image()
    const done = () => alive && setLoading(false)
    img.onload = done
    img.onerror = done
    img.src = src
    return () => {
      alive = false
      img.onload = null
      img.onerror = null
    }
  }, [item])

  const node = (
    <div className="apod-zoom" role="dialog" aria-modal="true" aria-label={`${item.title} 放大视图`}>
      {/* 点击背景关闭 */}
      <button
        type="button"
        className="apod-zoom__backdrop"
        onClick={onClose}
        aria-label="关闭放大视图"
      />

      <div className="apod-zoom__panel">
        <header className="apod-zoom__head">
          <div className="apod-zoom__titles">
            <h2 className="apod-zoom__title">{item.title}</h2>
            <p className="apod-zoom__sub">
              {formatDayCn(item.date)}
              {item.copyright ? ` · © ${item.copyright}` : ' · NASA'}
              {item.hdurl && item.mediaType === 'image' ? ' · HD' : ''}
            </p>
          </div>
          <div className="apod-zoom__tools">
            <a
              className="apod-zoom__link"
              href={item.pageUrl}
              target="_blank"
              rel="noreferrer"
            >
              NASA 原始页面 ↗
            </a>
            <button type="button" className="apod-zoom__close glass" onClick={onClose}>
              关闭 ✕
            </button>
          </div>
        </header>

        <div className="apod-zoom__body">
          {loading ? (
            <div className="apod-zoom__loading" role="status">
              <i className="apod-stage__spin" aria-hidden="true" />
              <span>正在展开高清图……</span>
            </div>
          ) : null}
          <ApodMedia item={item} variant="zoom" />
        </div>
      </div>
    </div>
  )

  return createPortal(node, document.body)
}
