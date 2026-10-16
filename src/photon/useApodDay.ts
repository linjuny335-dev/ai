/* ============================================================================
 *  useApodDay —— PHOTON 的「当前正在看哪一天」状态机
 * ----------------------------------------------------------------------------
 *  界面只跟这个 hook 打交道，不直接碰 apod.ts。它负责：
 *
 *    · 当前日期（默认 NASA 的今天）
 *    · 取数（走 useResource，loading / refreshing / ready / error 全自动）
 *    · 日期游标：上一天 / 下一天 / 回到今天 / 指定日期 / 随机探索
 *    · 日期条：当前日期前后 ±3 天里**已经取到过**的真实数据
 *    · 网络失败时降级到「真实数据离线存档」（见下面「三层取数」）
 *
 *  ── 三层取数，按代价从低到高 ────────────────────────────────────────
 *      ① 本地缓存      APOD 某一天发布后不再变，所以命中了就零请求
 *      ② NASA 官方接口 区间请求只算 1 次额度，一次取 30 天
 *      ③ 离线存档      ①②都失败时的最后兜底，界面会**明确标注**这是存档
 *
 *  为什么翻日期几乎不花额度：
 *      apod.ts 里按 30 天一块预取（区间请求只算 1 次），块内任意跳转全部命中
 *      本地缓存；一旦命中，loader 直接返回缓存、连请求都不发。
 *
 *  为什么显示用 item.date 而不是 state 里的目标日期：
 *      换天时旧图会留在屏幕上直到新图就绪（避免闪白）。如果日期标签用目标日期，
 *      就会出现「标签已是新的一天、图还是昨天」的错配。所以界面上一切以
 *      data.item 为准，目标日期只在「正在连接」提示里出现。
 *
 *  存档模式下的两条纪律：
 *      · 一旦降级到存档，继续翻日期**就地读存档**，绝不为翻页再打网络 ——
 *        否则接口正挂着的时候每翻一天都白烧一次额度。
 *      · 日期游标夹在存档区间内，界面上绝不出现区间外的东西。
 *        想恢复实时数据只有两个出口：点「重新加载」（真去取一次），
 *        或者在界面上填入自己的 NASA Key。
 * ========================================================================== */

import { useCallback, useMemo, useRef, useState } from 'react'
import {
  APOD_EPOCH,
  apodToday,
  bucketEndOf,
  cachedSpan,
  fetchApodDay,
  fetchApodWindow,
  lastApodQuota,
  peekApod,
  randomApodDate,
  spanFromItems,
  WINDOW_DAYS,
  type ApodItem,
} from '../lib/apod'
import {
  loadApodArchive,
  loadedApodArchive,
  type ApodArchive,
  type ArchiveMeta,
} from '../lib/apodArchive'
import { addDays, clampDay } from '../lib/datetime'
import { usingDemoKey } from '../lib/env'
import { describeError, HttpError, isAbortError, type JsonMeta } from '../lib/http'
import { useResource, type ResourceStatus } from '../lib/useResource'

/** 已经降级到离线存档时的状态 —— 界面靠它决定要不要打「存档」标注 */
export interface ApodArchiveState {
  meta: ArchiveMeta
  /** 为什么降级（网络失败原因），如实显示给用户 */
  reason: string
}

export interface ApodView {
  status: ResourceStatus
  /** 正在屏幕上的那一条（可能比目标日期旧一点，见文件头说明） */
  item: ApodItem | null
  /** 日期条：前后 ±3 天的真实条目 */
  span: ApodItem[]
  error: string | null
  /** 正在飞过来的目标日期；null = 已经落定 */
  pending: string | null
  quota: JsonMeta | null
  /** 本次会话里这条数据是真从 NASA 取回来的（而不是缓存） */
  fromNetwork: boolean
  /** 非 null = 网络不可用，正在展示离线存档 */
  archive: ApodArchiveState | null
  /** 当前用的是公共演示 Key（界面据此提示「申请自己的 Key」） */
  demoKey: boolean
  /** 当前模式下的日期上界（存档模式时是存档最后一天） */
  rangeMax: string

  today: string
  canPrev: boolean
  canNext: boolean

  goPrev: () => void
  goNext: () => void
  goToday: () => void
  goDate: (date: string) => void
  random: () => void
  reload: () => void
}

interface Payload {
  item: ApodItem
  span: ApodItem[]
}

/** 从存档里取 target（不在存档里就取最近的一天）。取不到才抛错。 */
function archivePayload(arch: ApodArchive, target: string): Payload {
  const item = arch.nearest(target)
  if (!item) throw new HttpError('离线存档里没有可用条目', 0, 'apod-archive')
  return { item, span: arch.span(item.date, 3) }
}

export function useApodDay(): ApodView {
  const today = useMemo(() => apodToday(), [])
  const [target, setTarget] = useState<string>(today)
  /** 目标日期是不是「用户主动跳的」（用来决定要不要显示连接中的提示） */
  const [jumped, setJumped] = useState(false)
  /** 这一轮取数是否真的打了网络（loader 自己标记） */
  const [fromNetwork, setFromNetwork] = useState(false)
  /** 是否已降级到离线存档 */
  const [archive, setArchive] = useState<ApodArchiveState | null>(null)

  /**
   * 「重新加载」的语义是**绕过缓存真去取一次**。
   * 用 ref 传，是因为 useResource 用 nonce 触发重跑、却没法给 loader 带参数。
   * 由 loader 自己消费掉，避免下一次自动刷新又被当成手动刷新。
   */
  const forceRef = useRef(false)

  const res = useResource<Payload, JsonMeta | null>(
    target,
    async (signal) => {
      const force = forceRef.current

      /* 已降级到存档 → 翻页就地读存档，不再打网络 */
      if (!force && archive) {
        const arch = loadedApodArchive()
        if (arch) return { data: archivePayload(arch, target), meta: lastApodQuota() }
      }

      /* ① 本地已经有这天的真实数据 —— 直接用，零请求 */
      if (!force) {
        const cached = peekApod(target)
        if (cached) {
          setFromNetwork(false)
          return { data: { item: cached, span: cachedSpan(target, 3) }, meta: lastApodQuota() }
        }
      }

      try {
        /* ② 取 target 所在的那个 30 天窗口（区间请求，1 次额度） */
        const win = await fetchApodWindow(bucketEndOf(target, WINDOW_DAYS), WINDOW_DAYS, signal, force)
        // 照实上报：整窗命中缓存时它不是刚取回来的
        setFromNetwork(win.fromNetwork)
        // 网络通了 —— 退出存档模式，界面上的标注随之消失
        setArchive(null)

        const hit = win.items.find((it) => it.date === target)
        if (hit) {
          return { data: { item: hit, span: spanFromItems(win.items, target, 3) }, meta: win.meta }
        }

        /* ③ 窗口里正好没有这天（比如今天还没发布）—— 单独补一次 */
        const one = await fetchApodDay(target, signal, force)
        return {
          data: { item: one.items[0], span: spanFromItems(win.items, target, 3) },
          meta: one.meta,
        }
      } catch (e) {
        // 主动取消（切换日期/卸载）不是故障，原样抛给 useResource 忽略
        if (isAbortError(e)) throw e

        /* ④ 网络彻底不通 —— 降级到真实数据离线存档 */
        const arch = await loadApodArchive()
        if (!arch) throw e // 连存档都没有，只能如实报错（界面给「填入 Key」出口）

        const reason = describeError(e)
        setFromNetwork(false)
        setArchive({ meta: arch.meta, reason })
        return { data: archivePayload(arch, target), meta: lastApodQuota() }
      } finally {
        if (force) forceRef.current = false
      }
    },
    {
      keepPrevious: true, // 旧图留在屏幕上，等新图就绪再交叉淡入
      isEmpty: (d) => !d?.item,
    },
  )

  /** 当前模式下的日期边界：存档模式夹在存档区间内 */
  const rangeMin = archive ? archive.meta.start : APOD_EPOCH
  const rangeMax = archive ? archive.meta.end : today

  const displayDate = res.data?.item.date ?? rangeMax
  const pending = jumped && res.busy ? target : null
  // useResource 返回的 reload 本身是稳定引用，这里解构出来避免每次渲染新建函数
  const reloadRef = res.reload

  const goDate = useCallback(
    (date: string) => {
      const safe = clampDay(date, rangeMin, rangeMax)
      if (safe === displayDate) return
      setJumped(true)
      setTarget(safe)
    },
    [displayDate, rangeMin, rangeMax],
  )

  const goPrev = useCallback(() => goDate(addDays(displayDate, -1)), [displayDate, goDate])
  const goNext = useCallback(() => goDate(addDays(displayDate, 1)), [displayDate, goDate])
  const goToday = useCallback(() => goDate(rangeMax), [goDate, rangeMax])

  const random = useCallback(() => {
    // 存档模式下只在存档区间里挑，绝不跳到没有内容的地方去
    const arch = loadedApodArchive()
    if (archive && arch) {
      const pick = arch.random(displayDate)
      if (pick) {
        setJumped(true)
        setTarget(pick.date)
        return
      }
    }
    // 跨过整个 APOD 历史（1995-06-16 至今）随机挑一天，都是真实存在的条目
    goDate(randomApodDate(displayDate))
  }, [archive, displayDate, goDate])

  const reload = useCallback(() => {
    forceRef.current = true
    setJumped(true)
    reloadRef()
  }, [reloadRef])

  return {
    status: res.status,
    item: res.data?.item ?? null,
    span: res.data?.span ?? [],
    error: res.error,
    pending,
    quota: res.meta ?? lastApodQuota(),
    fromNetwork,
    archive,
    demoKey: usingDemoKey(),
    rangeMax,

    today: rangeMax,
    canPrev: displayDate > rangeMin,
    canNext: displayDate < rangeMax,

    goPrev,
    goNext,
    goToday,
    goDate,
    random,
    reload,
  }
}
