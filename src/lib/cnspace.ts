/* ============================================================================
 *  cnspace.ts —— 「中国航天四源」统一数据层（前端）
 * ----------------------------------------------------------------------------
 *  四个官方来源（国家航天局 / 中国载人航天 / 国家天文台 / 航天科技集团）
 *  在**服务端**被聚合、归一化成同一种结构，前端只认这一种：
 *
 *      GET /cn-api/feed            聚合内容（服务端带 1 小时缓存）
 *      GET /cn-api/feed?refresh=1  强制刷新（界面的「重新加载」）
 *      GET /cn-api/health          诊断
 *
 *  为什么不让浏览器直接去抓那四个网站：
 *    · 四个站都没有公开 API / RSS，只能解析网页；
 *    · 直接抓会被浏览器 CORS 拦掉；
 *    · 把解析逻辑放在浏览器里，等于把「抓取行为」暴露给每一个访客，很不礼貌。
 *  所以统一走**同源** /cn-api（Vite 中间件，见 server/cnspace/plugin.js）：
 *  不跨域、不加端口、不改部署方式。
 *
 *  ⚠️ 这个文件里没有任何假数据。拿不到就是 error 态，
 *     由界面显示「该数据源暂时无法连接」+ 重新加载，绝不用示例内容顶上。
 *
 *  取数状态机与 useFeed.ts 保持同一套语义：
 *      loading → refreshing → ready / error
 * ========================================================================== */

import { useCallback, useRef, useSyncExternalStore } from 'react'
import { describeError } from './http'

/* ───────────────────────────── 类型 ───────────────────────────── */

/** 四个官方来源的 id（与 server/cnspace/columns.js 的 SOURCES 一一对应） */
export type CnSourceId = 'CNSA' | 'CMSE' | 'NAOC' | 'CASC'

/** 五个板块 id（与 config/themes.ts 一致） */
export type CnCategory = 'photon' | 'foundry' | 'cortex' | 'blueyard' | 'tech'

/** TECH 页筛选用的话题（由服务端按标题/摘要里的关键词算出来，不是人工瞎标） */
export type CnTopic = '载人航天' | '深空探测' | '天文发现' | '火箭' | '卫星' | '科学实验'

/**
 * 一条内容。字段与 server/cnspace/store.js 的 normalize() 完全一致 ——
 * 「界面上每个字都来自官方页面」这件事靠的就是这里的 sourceUrl / sourceName。
 */
export interface CnItem {
  id: string
  title: string
  /** 官方页面的导语摘要（≤130 字）。官方页面本来没有导语的就是 null，不编 */
  summary: string | null
  source: CnSourceId
  /** 官方来源全称，例如「国家航天局」 */
  sourceName: string
  sourceShort: string
  /** ★ 官方原文地址 —— 卡片上的「查看原文」直接跳这里 */
  sourceUrl: string
  /** YYYY-MM-DD；官方页面确实没有日期的就是 null */
  publishDate: string | null
  /** 主归属板块（categories 里第一个非 tech 的） */
  category: CnCategory
  /** 需要出现在哪几个板块 */
  categories: CnCategory[]
  tags: string[]
  /** 中文话题标签（TECH 筛选依据） */
  topicLabels: CnTopic[]
  /** 官方图片地址（只存 URL，不转存，版权归官方） */
  image: string | null
  contentType: 'article' | 'image' | 'video'
  /** 实际读取的官方栏目名，例如「要闻动态」 */
  column: string
  columnUrl: string
  /** 摘要来自列表页还是详情页（透明度用） */
  summaryFrom: 'list' | 'detail' | null
}

/** 单个来源这一轮的抓取结果 —— 失败原因如实带回，界面照实显示 */
export interface CnSourceStatus {
  id: CnSourceId
  name: string
  site: string
  note: string
  ok: boolean
  /** 成功的官方栏目名 */
  columns: string[]
  /** 失败的栏目 + 原因 */
  failedColumns: string[]
  count: number
  withSummary: number
  latest: string | null
}

export interface CnFeed {
  updatedAt: number
  expiresAt: number
  tookMs: number
  items: CnItem[]
  sources: CnSourceStatus[]
  counts: {
    total: number
    bySource: Partial<Record<CnSourceId, number>>
    byCategory: Partial<Record<CnCategory, number>>
  }
  /** true = 服务端实时抓取失败，当前用的是「上次真抓到的快照」（界面必须标注） */
  snapshot?: boolean
  stale?: boolean
  offline?: boolean
  offlineReason?: string
  /** true = 服务端此刻正在后台重新抓取，先给的是上一轮结果 */
  refreshing?: boolean
}

export type CnStatus = 'loading' | 'refreshing' | 'ready' | 'error'

export interface CnState {
  status: CnStatus
  feed: CnFeed | null
  error: string | null
  /** 最近一次成功拿到数据的时间 */
  syncAt: number
  /** 服务端正在后台刷新（先给旧的，稍后会变新） */
  refreshing: boolean
  /** 当前这份是快照（不是刚抓的） */
  snapshot: boolean
}

/* ───────────────────── 话题筛选（TECH 页） ───────────────────── */

export const CN_TOPICS: CnTopic[] = ['载人航天', '深空探测', '天文发现', '火箭']

export const CN_TOPIC_LABEL: Record<string, string> = {
  all: '全部',
  载人航天: '载人航天',
  深空探测: '深空探测',
  天文发现: '天文发现',
  火箭: '火箭',
  卫星: '卫星',
  科学实验: '科学实验',
}

/* ───────────────────────── 单次请求 ───────────────────────── */

const FEED_URL = '/cn-api/feed'
/** 一次聚合在服务端最长可能要抓几十个页面，超时给宽一点 */
const FETCH_TIMEOUT = 30_000

export async function fetchCnFeed(opts: { force?: boolean; signal?: AbortSignal } = {}) {
  const { force, signal } = opts
  const ctrl = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    ctrl.abort()
  }, FETCH_TIMEOUT)
  const forward = () => ctrl.abort()
  signal?.addEventListener('abort', forward)

  try {
    const res = await fetch(force ? `${FEED_URL}?refresh=1` : FEED_URL, {
      signal: ctrl.signal,
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = (await res.json()) as { ok: boolean; error?: string } & Partial<CnFeed>
    if (!json.ok) throw new Error(json.error || '聚合服务返回失败')
    return json as CnFeed
  } catch (e) {
    if (signal?.aborted && !timedOut) throw e
    if ((e as { name?: string })?.name === 'AbortError') {
      throw new Error(timedOut ? '聚合服务响应超时' : '请求被中断')
    }
    throw e
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', forward)
  }
}

/* ─────────────── 全站共享的一份状态（模块级 store） ───────────────
 *  为什么不是每个板块各拉一份：
 *    五个板块用的是同一份聚合结果，只是筛不同的 category。
 *    板块之间来回切换会卸载/重挂组件，如果状态在组件里，每切一次就重拉一次。
 *    放在模块级：一份数据、一个在途请求，切板块零请求、零闪烁。
 * ─────────────────────────────────────────────────────────────── */

const initial: CnState = {
  status: 'loading',
  feed: null,
  error: null,
  syncAt: 0,
  refreshing: false,
  snapshot: false,
}

let state: CnState = initial
const listeners = new Set<() => void>()
let inflight: AbortController | null = null
let followUp: number | null = null

function emit() {
  for (const l of listeners) l()
}

function setState(patch: Partial<CnState>) {
  state = { ...state, ...patch }
  emit()
}

const getSnapshot = () => state
function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** 服务端说「正在后台刷新」时，过几秒再问一次，把新数据拿回来 */
function scheduleFollowUp() {
  if (followUp != null) return
  followUp = window.setTimeout(() => {
    followUp = null
    void load(false)
  }, 6000)
}

async function load(force: boolean) {
  inflight?.abort()
  const ctrl = new AbortController()
  inflight = ctrl

  setState({
    status: state.feed ? 'refreshing' : 'loading',
    error: null,
  })

  try {
    const feed = await fetchCnFeed({ force, signal: ctrl.signal })
    if (ctrl.signal.aborted) return
    setState({
      status: feed.items.length ? 'ready' : 'error',
      feed,
      error: feed.items.length ? null : '四个来源这一轮都没有返回内容',
      syncAt: Date.now(),
      refreshing: Boolean(feed.refreshing),
      snapshot: Boolean(feed.snapshot),
    })
    if (feed.refreshing) scheduleFollowUp()
  } catch (e) {
    if (ctrl.signal.aborted) return
    setState({
      // 已经有数据就继续显示，只是标记这次没刷上；没数据才真的进错误态
      status: state.feed ? 'ready' : 'error',
      error: describeError(e),
      refreshing: false,
    })
  } finally {
    if (inflight === ctrl) inflight = null
  }
}

/** 全局只自动拉一次：第一个订阅者触发 */
let started = false
function ensureStarted() {
  if (started) return
  started = true
  void load(false)

  // 回到前台 / 重新聚焦且距上次同步超过 5 分钟 → 补一次
  const revalidate = () => {
    if (document.hidden) return
    if (Date.now() - state.syncAt >= 5 * 60_000) void load(false)
  }
  document.addEventListener('visibilitychange', revalidate)
  window.addEventListener('focus', revalidate)
  // 5 分钟问一次服务端（服务端自己有 1 小时缓存，这里只是取最新那份）
  window.setInterval(revalidate, 5 * 60_000)
}

/** 界面的「重新加载」：强制服务端重新抓一次 */
export function reloadCnFeed() {
  void load(true)
}

/* ───────────────────────────── Hook ───────────────────────────── */

export interface CnFeedResult extends CnState {
  /** 只取属于某个板块的条目 */
  items: CnItem[]
  /** 该板块对应的来源状态（失败的会显示「暂时无法连接」） */
  sources: CnSourceStatus[]
  /** 有来源失败吗 */
  anyFailed: boolean
  reload: () => void
}

/**
 * 读「某一板块」的中国航天数据。
 * @param category 板块 id；不传就是全量（TECH 用）
 */
export function useCnFeed(category?: CnCategory): CnFeedResult {
  const s = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const ensured = useRef(false)
  if (!ensured.current) {
    ensured.current = true
    ensureStarted()
  }

  const reload = useCallback(() => reloadCnFeed(), [])

  /* ⚠️ 这里**故意没有卸载清理**：状态是模块级、全站共享的，
     板块之间切换会卸载/重挂组件，如果在卸载时 abort，正在飞的那个请求
     就被自己掐掉了，下一个板块只能重来一次。 */

  const items = category
    ? (s.feed?.items ?? []).filter((i) => i.categories.includes(category))
    : (s.feed?.items ?? [])

  const sources = s.feed?.sources ?? []

  return {
    ...s,
    items,
    sources,
    anyFailed: sources.some((x) => !x.ok),
    reload,
  }
}

/** 状态副标题里用的「多久之前」 */
export function cnAgo(ts: number): string {
  if (!ts) return '—'
  const d = Math.floor((Date.now() - ts) / 1000)
  if (d < 60) return `${d} 秒前`
  if (d < 3600) return `${Math.floor(d / 60)} 分钟前`
  return `${Math.floor(d / 3600)} 小时前`
}
