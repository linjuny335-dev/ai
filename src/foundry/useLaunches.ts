/* ============================================================================
 *  useLaunches —— FOUNDRY 的「看哪一批真实发射任务」状态机
 * ----------------------------------------------------------------------------
 *  界面只跟这个 hook 打交道，不直接碰 launches.ts。它负责：
 *
 *    · 当前看的是哪一批：即将发射 / 已完成（LL2 的 upcoming / previous）
 *    · 左右浏览：在真实任务列表里前后挪一个（不取新数据，纯本地游标）
 *    · 取数（走 useResource，loading / ready / error 全自动）
 *
 *  两条刻意的约定：
 *
 *    ① 切「即将发射 / 已完成」时不保留上一批数据。
 *       两个列表的语义完全不同，如果留着旧的一批撑场面，用户会以为
 *       「已完成的队列里怎么全是还没发射的任务」。宁可老实显示骨架。
 *
 *    ② 游标越界不循环。时间轴是有方向的（时间只会往前走），
 *       到头就是到头，按钮置灰比绕回另一端更好理解。
 * ========================================================================== */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { JsonMeta } from '../lib/http'
import {
  fetchLaunches,
  launchFailureNote,
  peekLaunches,
  type LaunchItem,
  type LaunchKind,
} from '../lib/launches'
import { useResource, type ResourceStatus } from '../lib/useResource'

export interface LaunchView {
  status: ResourceStatus
  kind: LaunchKind
  /** 这一批真实任务（按发射时刻升序 / 从近到远） */
  items: LaunchItem[]
  /** 当前选中项在 items 里的下标；-1 = 空 */
  index: number
  active: LaunchItem | null
  error: string | null
  /** 这一轮是不是读的会话缓存（数据仍是接口原件，只是没再请求一次） */
  fromCache: boolean
  /** 最近一次成功取数的时间戳 */
  updatedAt: number
  /** 接口自报的总场次数 */
  total: number
  quota: JsonMeta | null

  canPrev: boolean
  canNext: boolean

  setKind: (k: LaunchKind) => void
  step: (delta: number) => void
  goto: (i: number) => void
  reload: () => void
}

interface Payload {
  items: LaunchItem[]
  total: number
  fromCache: boolean
}

export function useLaunches(): LaunchView {
  const [kind, setKindState] = useState<LaunchKind>('upcoming')
  const [index, setIndex] = useState(0)

  const res = useResource<Payload, JsonMeta | null>(
    kind,
    async (signal) => {
      // 会话缓存 5 分钟内直接复用（倒计时仍然实时算，见 LaunchCountdown）
      const cached = peekLaunches(kind)
      if (cached) {
        return { data: { items: cached.items, total: cached.items.length, fromCache: true }, meta: null }
      }
      const out = await fetchLaunches(kind, signal)
      return { data: { items: out.items, total: out.total, fromCache: false }, meta: out.meta }
    },
    {
      keepPrevious: false,
      isEmpty: (d) => !d?.items?.length,
    },
  )

  const items = useMemo(() => res.data?.items ?? [], [res.data])
  const count = items.length

  /**
   * 进场时把游标挪到「还没发射的那一场」。
   *
   * 为什么需要：LL2 的 upcoming 列表里，头部会留着几场刚刚到点、
   * 但官方还没把它挪进 previous 的任务。默认停在第一条，用户一进
   * 「即将发射」看到的会是「T+ 已过计划时刻」，很容易以为网站坏了。
   *
   * 注意这不是在改数据 —— 那几场仍然是列表里真实的一员，只是把初始
   * 视线放到「下一个真正要发射的」上面。每一批只自动定位一次，
   * 之后完全交给用户的左右浏览。
   */
  const autoPlaced = useRef<LaunchKind | null>(null)
  useEffect(() => {
    if (!items.length || autoPlaced.current === kind) return
    autoPlaced.current = kind
    if (kind !== 'upcoming') return
    const now = Date.now()
    const i = items.findIndex((it) => it.net && Date.parse(it.net) > now)
    if (i > 0) setIndex(i)
  }, [items, kind])

  /* 换批次就回到第一个 —— 两个列表没有可对应的位置 */
  const setKind = useCallback((k: LaunchKind) => {
    setKindState((prev) => {
      if (prev !== k) setIndex(0)
      return k
    })
  }, [])

  const goto = useCallback(
    (i: number) => {
      if (count === 0) return
      setIndex(Math.min(Math.max(i, 0), count - 1))
    },
    [count],
  )

  const step = useCallback(
    (delta: number) => {
      setIndex((prev) => Math.min(Math.max(prev + delta, 0), Math.max(count - 1, 0)))
    },
    [count],
  )

  const safeIndex = count === 0 ? -1 : Math.min(index, count - 1)

  return {
    status: res.status,
    kind,
    items,
    index: safeIndex,
    active: safeIndex >= 0 ? items[safeIndex] : null,
    error: res.error ? launchFailureNote(res.error) : null,
    fromCache: res.data?.fromCache ?? false,
    updatedAt: res.updatedAt,
    total: res.data?.total ?? 0,
    quota: res.meta,

    canPrev: safeIndex > 0,
    canNext: safeIndex >= 0 && safeIndex < count - 1,

    setKind,
    step,
    goto,
    reload: res.reload,
  }
}
