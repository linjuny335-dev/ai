/* ============================================================================
 *  ApodStage —— 观测台：一块玻璃框，里面是 NASA 当天真实的画面
 * ----------------------------------------------------------------------------
 *  换天时**不允许突然跳变**，所以这里不是一个 <img> 直接换 src，而是：
 *
 *      1. 先把下一张图的地址拿去预加载 + decode（useImageReady）
 *      2. 图真的能画出来了，才把「新的一层」挂上去、把旧的一层标成 is-out
 *      3. 旧层淡出（微微左移、缩小一点），新层淡入（从右侧微移进来）
 *      4. 620ms 后把旧层卸载
 *
 *  于是观感是「旧的在退、新的在进」，而不是闪一下。
 *  图片还没就绪时，画面上仍然是上一张 —— 等待发生在背后，不空窗。
 *
 *  视频日：没有可预载的图片（官方有时给封面图，就用它），直接切换；
 *  视频本身在 <ApodMedia> 里用 iframe / <video> 正常播放，不报错。
 * ========================================================================== */

import { useEffect, useRef, useState } from 'react'
import type { ApodItem } from '../lib/apod'
import { formatDayCn } from '../lib/datetime'
import { useImageReady } from '../lib/useImageReady'
import GlassSurface from '../ui/glass/GlassSurface'
import ApodMedia from './ApodMedia'
import { pixelReadout } from './measure'

interface Props {
  item: ApodItem
  /** 正在飞过来的目标日期（非空时显示「正在连接宇宙数据……」） */
  pending: string | null
  onZoom: () => void
}

/** 淡出层的寿命，和 photon.css 里的动画时长保持一致 */
const LEAVE_MS = 620

export default function ApodStage({ item, pending, onZoom }: Props) {
  // 图片类要等解码；视频类把官方封面图当预载目标（没有封面就直接切）
  const preloadSrc = item.mediaType === 'image' ? item.url : item.displayUrl || undefined
  const ready = useImageReady(preloadSrc)

  const [current, setCurrent] = useState(item)
  const [leaving, setLeaving] = useState<ApodItem | null>(null)

  /* 观测读数：当前这张图**真的解码出来**的像素。
     用 key 锁住「这是哪一张图的读数」—— 换天的那一瞬间，画面上可能还是旧图、
     标签已经换新了，如果不按 key 比对，就会把上一张图的尺寸挂在新的一天上。
     （那就是「状态显示撒谎」，是这一栏明令禁止的。） */
  const imgKey = `${current.date}|${current.url}`
  const [nat, setNat] = useState<{ key: string; w: number; h: number } | null>(null)
  const px = nat && nat.key === imgKey ? pixelReadout(nat.w, nat.h) : null

  /* 定时器必须放在 ref 里，不能写成「effect 里 setTimeout + 返回 clearTimeout」：
     这个 effect 的依赖里有 current，而 setCurrent 本身就会让 effect 重跑，
     cleanup 会把刚设好的定时器立刻清掉 —— 旧层就永远留在 DOM 里了。
     （这是验收脚本用 layers 数量抓出来的真实泄漏，不是测试误报。） */
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    const same = item.date === current.date && item.url === current.url
    if (same) return
    if (!ready) return // 新图还没解码完 —— 先让上一张留在屏幕上

    setLeaving(current)
    setCurrent(item)

    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      setLeaving(null)
    }, LEAVE_MS)
  }, [item, ready, current])

  // 卸载时收尾（只清一次，和上面那个 effect 无关）
  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    },
    [],
  )

  const waiting = Boolean(pending)
  const isImage = current.mediaType === 'image'

  return (
    <figure className="apod-stage">
      {/* 缓慢旋转的轨道环 + 环上的观测点：让画面像「正在观测某个天体」而不是一张插图。
          两个元素必须分开：环用了 mask 只留 1px 亮边，会把子元素一起遮掉。 */}
      <span className="apod-stage__orbit" aria-hidden="true" />
      <span className="apod-stage__satwrap" aria-hidden="true">
        <i className="apod-stage__sat" />
      </span>

      <GlassSurface className="apod-stage__frame" tilt tiltMax={2.2}>
        {leaving ? (
          <div className="apod-layer apod-layer--out" key={`out-${leaving.date}-${leaving.url}`}>
            <ApodMedia item={leaving} />
          </div>
        ) : null}

        <div className="apod-layer apod-layer--in" key={`in-${current.date}-${current.url}`}>
          <ApodMedia
            item={current}
            onImageClick={isImage ? onZoom : undefined}
            onImageLoad={
              isImage ? (n) => setNat({ key: imgKey, w: n.w, h: n.h }) : undefined
            }
          />
        </div>

        {waiting ? (
          <div className="apod-stage__wait" role="status" aria-live="polite">
            <i className="apod-stage__spin" aria-hidden="true" />
            <span>正在连接宇宙数据……{pending ? ` ${pending}` : ''}</span>
          </div>
        ) : null}

        {isImage ? (
          <button type="button" className="apod-stage__zoom" onClick={onZoom}>
            <span aria-hidden="true">⤢</span> 放大查看
          </button>
        ) : null}
      </GlassSurface>

      <figcaption className="apod-stage__readout" data-stagger>
        <span className="apod-stage__date">{formatDayCn(current.date)}</span>
        <span className="apod-stage__sep" aria-hidden="true">
          ·
        </span>
        <span>{current.mediaType === 'video' ? 'NASA VIDEO' : isImage ? 'NASA IMAGE' : 'NASA MEDIA'}</span>
        {current.copyright ? (
          <>
            <span className="apod-stage__sep" aria-hidden="true">
              ·
            </span>
            <span className="apod-stage__credit">© {current.copyright}</span>
          </>
        ) : null}
      </figcaption>

      {/* 观测读数：页面自己量出来的真实数字。
          只有图像才量得到（视频 / 嵌入帧没有可读的像素），所以视频日这一行不渲染。
          没量到之前显示「测量中」，绝不先填一个数上去。 */}
      {isImage ? (
        <p className="apod-stage__measure" data-stagger>
          <span className="apod-stage__measure-k">画面像素</span>
          {px ? (
            <>
              <b>
                {px.w} × {px.h}
              </b>
              <span className="apod-stage__sep" aria-hidden="true">
                ·
              </span>
              <span className="apod-stage__measure-k">比例</span>
              <b>{px.ratio}</b>
              <span className="apod-stage__measure-o">{px.orient}</span>
            </>
          ) : (
            <span className="apod-stage__measure-k apod-stage__measure-k--wait">测量中……</span>
          )}
        </p>
      ) : null}
    </figure>
  )
}
