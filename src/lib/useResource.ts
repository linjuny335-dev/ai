/* ============================================================================
 *  useResource —— 取数 → 界面状态的通用小状态机
 * ----------------------------------------------------------------------------
 *  和 useFeed 的分工：
 *      useFeed     面向「一个源 + 多个 feed + 列表」的 TECH 场景（缓存、自动刷新、
 *                  暂停开关一整套），调用方只给它 FeedDef。
 *      useResource 面向「单个资源」的场景 —— PHOTON 的某一天天文图、
 *                  FOUNDRY 的一批发射任务，返回类型是随便什么 T。
 *
 *  两者行为一致的部分（这是全站的约定，不要改）：
 *      · 首次取数      loading → 骨架屏（**绝不显示假数据**）
 *      · 已有数据再取   refreshing → 旧数据留在屏幕上，静默换新
 *      · 失败          error → 错误态 + 重新加载；有旧数据时不降级，只标记
 *      · 取消          切换资源 / 卸载时 abort 在途请求，慢的旧响应不会覆盖新数据
 *
 *  一个小设计：loader 放在 ref 里，effect 只依赖 `key` 与手动刷新计数。
 *  这样调用方可以直接写内联箭头函数而不会导致死循环，同时也不会读到旧闭包。
 * ========================================================================== */

import { useCallback, useEffect, useRef, useState } from 'react'
import { describeError } from './http'

export type ResourceStatus = 'loading' | 'refreshing' | 'ready' | 'empty' | 'error'

export interface ResourceOptions<T, M> {
  /** 判定「空」：默认认为 `data == null` 就是空。列表类资源可以传 (d) => d.length === 0 */
  isEmpty?: (data: T) => boolean
  /** 换 key 时是否保留上一份数据（PHOTON 翻日期要保留，避免画面闪空） */
  keepPrevious?: boolean
  /** 自动刷新周期（ms）。不传 = 不自动刷新 */
  autoMs?: number
  /** 取数时附带的元信息初值 */
  initialMeta?: M
}

export interface ResourceResult<T, M> {
  status: ResourceStatus
  data: T | null
  meta: M | null
  error: string | null
  busy: boolean
  /** 最近一次成功的时间戳（ms）；0 = 还没成功过 */
  updatedAt: number
  reload: () => void
}

export function useResource<T, M = null>(
  key: string,
  loader: (signal: AbortSignal) => Promise<{ data: T; meta?: M }>,
  options: ResourceOptions<T, M> = {},
): ResourceResult<T, M> {
  const { isEmpty, keepPrevious = true, autoMs = 0, initialMeta = null } = options

  const [status, setStatus] = useState<ResourceStatus>('loading')
  const [data, setData] = useState<T | null>(null)
  const [meta, setMeta] = useState<M | null>(initialMeta)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState(0)
  const [nonce, setNonce] = useState(0)

  /** 在途请求，同一时刻只允许一个 */
  const inflight = useRef<AbortController | null>(null)
  /** 当前是否已经有可展示的数据 */
  const hasData = useRef(false)
  /** 最近一次成功的墙钟时间，用于「回到前台要不要补刷」 */
  const lastAt = useRef(0)

  // loader 每次渲染都可能变（内联箭头函数），放进 ref，effect 不依赖它
  const loaderRef = useRef(loader)
  loaderRef.current = loader
  const isEmptyRef = useRef(isEmpty)
  isEmptyRef.current = isEmpty
  /** 换 key 时要判定「这次是不是真的换资源了」 */
  const prevKey = useRef<string | null>(null)

  const run = useCallback(
    async (resetForNewKey: boolean) => {
      inflight.current?.abort()
      const ctrl = new AbortController()
      inflight.current = ctrl

      if (resetForNewKey && !keepPrevious) {
        hasData.current = false
        setData(null)
      }
      setStatus(hasData.current ? 'refreshing' : 'loading')
      setError(null)

      try {
        const res = await loaderRef.current(ctrl.signal)
        if (ctrl.signal.aborted) return
        const empty = isEmptyRef.current ? isEmptyRef.current(res.data) : res.data == null
        hasData.current = !empty
        setData(res.data)
        if (res.meta !== undefined) setMeta(res.meta)
        lastAt.current = Date.now()
        setUpdatedAt(lastAt.current)
        setStatus(empty ? 'empty' : 'ready')
      } catch (e) {
        if (ctrl.signal.aborted) return
        setError(describeError(e))
        // 有旧数据就继续显示，只是标记一下；没数据才真的进错误态
        setStatus(hasData.current ? 'ready' : 'error')
      }
    },
    [keepPrevious],
  )

  /* 换 key / 手动刷新 */
  useEffect(() => {
    const isNewKey = prevKey.current !== key
    prevKey.current = key
    void run(isNewKey)
    return () => {
      inflight.current?.abort()
    }
    // run 只在 keepPrevious 变化时重建，换个 key 不该重跑整套
  }, [key, nonce, run])

  /* 自动刷新：定时 + 回到前台补刷（只在页面可见时发请求） */
  useEffect(() => {
    if (!autoMs) return
    const timer = window.setInterval(() => {
      if (document.hidden) return
      void run(false)
    }, autoMs)
    const revalidate = () => {
      if (document.hidden) return
      if (Date.now() - lastAt.current >= autoMs) void run(false)
    }
    document.addEventListener('visibilitychange', revalidate)
    window.addEventListener('focus', revalidate)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', revalidate)
      window.removeEventListener('focus', revalidate)
    }
  }, [autoMs, run])

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  return {
    status,
    data,
    meta,
    error,
    busy: status === 'loading' || status === 'refreshing',
    updatedAt,
    reload,
  }
}
