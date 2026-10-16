/* ============================================================================
 *  useImageReady —— 图片「真的能画出来了吗」
 * ----------------------------------------------------------------------------
 *  用途：PHOTON 换天、FOUNDRY 换任务时，要等新图解码完成再切换，
 *  否则会先闪一下空白（甚至显示破图），变成「突然跳变」。
 *
 *  实现要点：
 *      · 用 `new Image()` 预加载 + `decode()`（支持的话），成功才返回 true
 *      · 已加载过的 URL 记在模块级 Set 里，来回切换不会重新加载
 *      · src 为空 / undefined 时直接返回 true（比如视频日没有封面图）
 *      · **不要设 crossOrigin**（重要，见下）
 *
 *  ⚠️ 关于 crossOrigin —— 这是实测踩出来的坑：
 *      apod.nasa.gov 不返回 Access-Control-Allow-Origin，所以只要给预加载的
 *      Image 设 `crossOrigin='anonymous'`，这个「跨域预检」请求就会：
 *        ① 在控制台留下 blocked by CORS policy 的报错；
 *        ② 卡大约 4.5 秒才走 onerror —— 换天时画面因此看起来「半天不动」，
 *           连当前正显示的那张图都会被一起拖成 naturalWidth=0。
 *      而我们只是要「等它解码好」，从不读取像素（不画 canvas、不取
 *      getImageData），根本不需要 CORS。去掉之后：命中同一个缓存条目、
 *      零延迟、零报错。
 *      如果哪天真的需要读像素，正确做法是给图片加一个同源的代理，
 *      而不是在这里打开 crossOrigin。
 * ========================================================================== */

import { useEffect, useState } from 'react'

/** 已经解码过的图片地址，跨组件共享 */
const loaded = new Set<string>()

export function useImageReady(src: string | undefined | null): boolean {
  const [ready, setReady] = useState(() => !src || loaded.has(src))

  useEffect(() => {
    if (!src) {
      setReady(true)
      return
    }
    if (loaded.has(src)) {
      setReady(true)
      return
    }

    let alive = true
    setReady(false)

    const img = new Image()
    const done = () => {
      if (!alive) return
      loaded.add(src)
      setReady(true)
    }
    const fail = () => {
      // 图挂了也要放行：让用户看到 iframe/video 的兜底或破图提示，
      // 而不是永远卡在「正在连接」上
      if (alive) setReady(true)
    }

    img.onload = () => {
      // decode() 返回的是「可以立刻无闪烁绘制」的时机，比 onload 更准
      if (typeof img.decode === 'function') {
        img.decode().then(done).catch(done)
      } else {
        done()
      }
    }
    img.onerror = fail
    img.src = src

    return () => {
      alive = false
      img.onload = null
      img.onerror = null
    }
  }, [src])

  return ready
}
