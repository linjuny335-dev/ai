/* ============================================================================
 *  ApodInfo —— 图片信息 / NASA 原始科普说明面板
 * ----------------------------------------------------------------------------
 *  版面顺序就是用户读它的顺序：
 *      标题 → 日期 · 来源 → 操作按钮 →（展开后的）NASA 原文说明
 *
 *  关于「了解它」：说明文字一律显示 **NASA 的英文原文**，不翻译、不缩写、
 *  不加自己的解说 —— 这一栏的定位是「通向真实科普的入口」，不是二手转述。
 *  展开/收起用 max-height 过渡；文字长的时候面板自身可滚（细滚动条）。
 * ========================================================================== */

import { useEffect, useState } from 'react'
import type { ApodItem } from '../lib/apod'
import { formatDayCn } from '../lib/datetime'
import GlassButton from '../ui/glass/GlassButton'
import GlassSurface from '../ui/glass/GlassSurface'

interface Props {
  item: ApodItem
  onRandom: () => void
}

export default function ApodInfo({ item, onRandom }: Props) {
  const [open, setOpen] = useState(false)

  // 换了一天就收回去，免得用户以为新的一天也是那句说明
  useEffect(() => {
    setOpen(false)
  }, [item.date])

  return (
    <GlassSurface className="apod-info" tilt={false}>
      <div className="apod-info__top">
        <span className="apod-info__badge">NASA · APOD</span>
        <span className="apod-info__date">{formatDayCn(item.date)}</span>
      </div>

      <h2 className="apod-info__title">{item.title}</h2>

      <div className="apod-info__acts">
        <GlassButton onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? '收起说明' : '了解它'}
        </GlassButton>

        <GlassButton onClick={onRandom} title="从 1995 年至今随机挑一天">
          随机探索
        </GlassButton>

        <a className="apod-info__link" href={item.pageUrl} target="_blank" rel="noreferrer">
          在 NASA 打开原始页面 ↗
        </a>
      </div>

      <div className={'apod-info__explain' + (open ? ' is-open' : '')}>
        <div className="apod-info__explain-inner" data-wheel-scroll>
          <p className="apod-info__text">{item.explanation || 'NASA 这一天没有提供文字说明。'}</p>
          <p className="apod-info__src">
            以上为 NASA APOD 的英文原文
            {item.copyright ? ` · 图像版权 © ${item.copyright}` : ' · 图像版权归 NASA'}
            {item.mediaType === 'video' ? ' · 当日内容为视频' : ''}
          </p>
        </div>
      </div>
    </GlassSurface>
  )
}
