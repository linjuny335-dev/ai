/* ============================================================================
 *  useFeed —— 任意数据源的「取数 → 界面状态」通用状态机
 * ----------------------------------------------------------------------------
 *  三个源（HN / GitHub / Hugging Face）共用这一个 hook，行为完全一致：
 *
 *    首次进入         loading    → 骨架屏
 *    命中缓存再刷新    refreshing → 先显示旧数据，后台悄悄更新，不闪白
 *    拿到数据          ready / empty
 *    彻底失败          error      → 错误态 + Retry（有缓存时不降级，只标记）
 *
 *  自动更新（用户明确要求「数据不要我自己手动写，要自动更新」）：
 *    · 默认每 3 分钟静默重取一次（只在页面可见时，切到后台不浪费请求）
 *    · 从后台切回来 / 窗口重新获得焦点时，若距上次同步超过一个周期，立即补一次
 *    · 可以在界面上暂停（AUTO 开关），暂停后不再自动请求
 *
 *  取消：切换数据源 / 换 feed / 卸载时用 AbortController 掐掉在途请求，
 *        避免慢的旧请求回来把新数据覆盖掉。
 * ========================================================================== */

import { useCallback, useEffect, useRef, useState } from 'react'
import { describeError } from './http'
import type { FeedDef, SourceId, TechItem } from './techTypes'

export type FeedStatus = 'loading' | 'refreshing' | 'ready' | 'empty' | 'error'

export interface FeedResult {
  status: FeedStatus
  data: TechItem[]
  error: string | null
  /** 最近一次同步成功的时间戳（ms）；0 = 还没成功过 */
  syncAt: number
  /** 自动刷新周期（ms） */
  autoMs: number
  /** 自动刷新是否开启 */
  auto: boolean
  /** 正在请求中（含后台静默刷新） */
  busy: boolean
  toggleAuto: () => void
  reload: () => void
}

/** 默认自动刷新周期：3 分钟。GitHub 匿名搜索限流是 10 次/分钟，够用 */
export const DEFAULT_AUTO_MS = 180_000

/** 缓存有效期。与自动刷新周期对齐：该刷新的时候就别拿缓存了 */
const CACHE_TTL = 180_000
/** 最多留几份缓存，防止翻来翻去把内存撑大 */
const MAX_CACHE_ENTRIES = 12

const cache = new Map<string, { at: number; data: TechItem[] }>()

function peek(key: string): TechItem[] | undefined {
  const hit = cache.get(key)
  if (!hit) return undefined
  if (Date.now() - hit.at > CACHE_TTL) {
    cache.delete(key)
    return undefined
  }
  return hit.data
}

function put(key: string, data: TechItem[]) {
  cache.set(key, { at: Date.now(), data })
  if (cache.size <= MAX_CACHE_ENTRIES) return
  // 超了就把最旧的挤掉
  let oldestKey: string | undefined
  let oldestAt = Infinity
  for (const [k, v] of cache) {
    if (v.at < oldestAt) {
      oldestAt = v.at
      oldestKey = k
    }
  }
  if (oldestKey) cache.delete(oldestKey)
}

/** 手动清缓存（调试用） */
export function clearFeedCache() {
  cache.clear()
}

export function useFeed(
  sourceId: SourceId,
  feed: FeedDef,
  limit = 12,
  autoMs = DEFAULT_AUTO_MS,
): FeedResult {
  const cacheKey = `${sourceId}:${feed.id}:${limit}`

  const [status, setStatus] = useState<FeedStatus>('loading')
  const [data, setData] = useState<TechItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [syncAt, setSyncAt] = useState(0)
  const [auto, setAuto] = useState(true)
  const [nonce, setNonce] = useState(0)

  /** 在途请求。同一时刻只允许一个，新的会把旧的掐掉 */
  const inflight = useRef<AbortController | null>(null)
  /** 一次性标记：下一次 load 要忽略缓存 */
  const forceOnce = useRef(false)
  /** 上一次成功同步的时间，用于「回到前台要不要补一次」的判断 */
  const lastAt = useRef(0)
  /** 当前是否已经有可展示的数据 —— 决定失败时降级到 error 还是保持 ready */
  const hasData = useRef(false)

  const run = useCallback(
    async (force: boolean, reset: boolean) => {
      inflight.current?.abort()
      const ctrl = new AbortController()
      inflight.current = ctrl

      const cached = force ? undefined : peek(cacheKey)

      if (reset) {
        // 换源 / 换 feed：清掉上一个源的内容，避免串台
        hasData.current = Boolean(cached && cached.length)
        setData(cached ?? [])
        setStatus(cached && cached.length ? 'refreshing' : 'loading')
      } else {
        // 后台静默刷新：内容原地保留，只把状态标成 refreshing
        setStatus(hasData.current ? 'refreshing' : 'loading')
      }
      setError(null)

      try {
        const items = await feed.load(limit, ctrl.signal)
        if (ctrl.signal.aborted) return
        put(cacheKey, items)
        const now = Date.now()
        lastAt.current = now
        hasData.current = items.length > 0
        setData(items)
        setSyncAt(now)
        setStatus(items.length ? 'ready' : 'empty')
      } catch (e) {
        if (ctrl.signal.aborted) return
        setError(describeError(e))
        // 有旧数据就继续显示，只是不再自动重试；没数据才真的进错误态
        setStatus(hasData.current ? 'ready' : 'error')
      }
    },
    [cacheKey, feed, limit],
  )

  /* 加载 / 换源 / 手动刷新 */
  useEffect(() => {
    const force = forceOnce.current
    forceOnce.current = false
    void run(force, true)
    return () => {
      inflight.current?.abort()
    }
  }, [run, nonce])

  /* 自动更新：定时 + 回到前台补刷 */
  useEffect(() => {
    if (!auto) return

    const timer = window.setInterval(() => {
      if (document.hidden) return
      void run(true, false)
    }, autoMs)

    const revalidate = () => {
      if (document.hidden) return
      if (Date.now() - lastAt.current >= autoMs) void run(true, false)
    }

    document.addEventListener('visibilitychange', revalidate)
    window.addEventListener('focus', revalidate)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', revalidate)
      window.removeEventListener('focus', revalidate)
    }
  }, [auto, autoMs, run])

  const reload = useCallback(() => {
    forceOnce.current = true
    setNonce((n) => n + 1)
  }, [])

  const toggleAuto = useCallback(() => setAuto((a) => !a), [])

  return {
    status,
    data,
    error,
    syncAt,
    autoMs,
    auto,
    busy: status === 'loading' || status === 'refreshing',
    toggleAuto,
    reload,
  }
}
