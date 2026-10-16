/* ============================================================================
 *  ApodMedia —— 把一条 APOD 数据画成画面（图片 / 视频 / 其它）
 * ----------------------------------------------------------------------------
 *  NASA 的当天内容有三种可能，这里全部要能「正常显示、不报错」：
 *
 *    ① media_type = image   → <img>，显示标准尺寸图（hdurl 留给放大视图）
 *    ② media_type = video   → 官方给的多半是可直接嵌入的播放地址
 *                             （YouTube / Vimeo → <iframe>；.mp4 → <video>）
 *    ③ 其它 / 缺字段        → 不假装能播，给一张「去 NASA 看」的玻璃卡片
 *
 *  这里不做任何动画，交叉淡入在 ApodStage 里做；也不自己取数。
 * ========================================================================== */

import type { ApodItem } from '../lib/apod'

interface Props {
  item: ApodItem
  /** stage = 场景里的小窗；zoom = 放大视图（用高清图、给原生控制） */
  variant?: 'stage' | 'zoom'
  /** 图片点击（仅 stage 用；zoom 视图里点了没意义） */
  onImageClick?: () => void
  /** 图片真的解码出像素后回调。
   *  观测台的「原始像素」读数就是这么来的 —— 量的是 **NASA 这一天真实的图像资产**，
   *  不是我们编的数，也不是从别处查来的。 */
  onImageLoad?: (nat: { w: number; h: number }) => void
}

export default function ApodMedia({ item, variant = 'stage', onImageClick, onImageLoad }: Props) {
  const zoom = variant === 'zoom'

  /* -------------------------------------------------------------- 图片 */
  if (item.mediaType === 'image') {
    // 放大视图优先高清图；场景里用标准图，省流量也省解码时间
    const src = zoom ? (item.hdurl ?? item.url) : item.url
    const img = (
      <img
        className="apod-media__img"
        src={src}
        alt={item.title}
        draggable={false}
        /* 第一张图参与 LCP，别 lazy；切换时由 ApodStage 控制预加载 */
        decoding="async"
        onLoad={
          onImageLoad
            ? (ev) => {
                const el = ev.currentTarget
                if (el.naturalWidth > 0) onImageLoad({ w: el.naturalWidth, h: el.naturalHeight })
              }
            : undefined
        }
      />
    )

    /* 场景里的图要能点开放大。两层原因：
       ① 键盘可达性 —— <img onClick> 是拿不到焦点的；
       ② .scene-wrap 默认是 pointer-events:none，只放行 button / a / .logo
          （见 styles.css），裸 <img> 的点击会被下方的银河画布接走。 */
    if (onImageClick) {
      return (
        <button
          type="button"
          className="apod-media__hit"
          onClick={onImageClick}
          aria-label={`放大查看：${item.title}`}
          title="放大查看"
        >
          {img}
        </button>
      )
    }

    return img
  }

  /* -------------------------------------------------------------- 视频 */
  if (item.mediaType === 'video') {
    if (item.videoFile) {
      return (
        <video
          className="apod-media__video"
          src={item.videoFile}
          poster={item.displayUrl || undefined}
          controls
          playsInline
          preload="metadata"
        />
      )
    }
    if (item.embedUrl) {
      return (
        <iframe
          className="apod-media__frame"
          src={item.embedUrl}
          title={item.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          loading="lazy"
        />
      )
    }
  }

  /* ------------------------------------------------- 兜底：不假装能播 */
  return (
    <a
      className="apod-media__fallback"
      href={item.pageUrl}
      target="_blank"
      rel="noreferrer"
    >
      {item.displayUrl ? (
        <img className="apod-media__img apod-media__img--dim" src={item.displayUrl} alt="" />
      ) : null}
      <span className="apod-media__fallback-text">
        NASA 这一天的内容不是可直接嵌入的图片或视频
        <em>去 APOD 官方页面查看 ↗</em>
      </span>
    </a>
  )
}
