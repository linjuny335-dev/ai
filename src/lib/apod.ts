/* ============================================================================
 *  apod.ts —— NASA APOD（Astronomy Picture of the Day）真实数据适配器
 * ----------------------------------------------------------------------------
 *  PHOTON 栏目「光 · 看见宇宙」的唯一数据来源。所有内容都是 NASA 官方当天
 *  真正发布的图片 / 视频与说明文字，**没有、也不允许有**任何本地假数据：
 *  取不到就往上抛错，由界面显示「数据暂时获取失败 + 重新加载」。
 *
 *  接口（官方公开，必须带 api_key）：
 *      GET https://api.nasa.gov/planetary/apod?api_key=KEY&date=YYYY-MM-DD
 *      GET https://api.nasa.gov/planetary/apod?api_key=KEY&start_date=A&end_date=B
 *
 *  两个关键事实（实测确认，决定了这套实现的样子）：
 *
 *   ① 区间请求只算 1 次额度。
 *      带 start_date + end_date 一次拿回 N 天（实测 5 天数据 -> 额度只减 1）。
 *      而 DEMO_KEY 的额度是 10 次/小时（按 IP）。所以「翻日期」不能一天一个
 *      请求，要按窗口预取：一次取 30 天，之后左右翻页全部命中缓存、零请求。
 *
 *   ② APOD 的自然日按 UTC 划分，不是本地日期。
 *      北京时间的凌晨那几小时，本地日期已经比 UTC 早一天，直接查会拿到
 *      「未来日期」被接口拒绝。所以「今天」一律用 UTC 今天（见 datetime.ts）。
 *
 *  缓存策略（localStorage，key = 日期）：
 *      · 过去的日期 —— APOD 发布后永不改动，永久缓存，不再请求
 *      · 今天的日期 —— 30 分钟内复用（当天可能被 NASA 修订）
 *      · 超过 MAX_ENTRIES 时按写入时间淘汰最旧的，避免撑爆 localStorage
 * ========================================================================== */

import { nasaApiKey } from './env'
import { addDays, clampDay, daysBetween, utcToday } from './datetime'
import { getJSONWithMeta, HttpError, type JsonMeta } from './http'

/** APOD 有数据的最早日期（NASA 官方声明） */
export const APOD_EPOCH = '1995-06-16'

const ENDPOINT = 'https://api.nasa.gov/planetary/apod'

/** 单次请求的超时。NASA 在海外，冷启动偶尔要几秒 */
const TIMEOUT = 15000

/** 预取窗口：一次拿多少天的数据。30 天 = 1 次额度，翻页完全离线 */
export const WINDOW_DAYS = 30

export type ApodMedia = 'image' | 'video' | 'other'

export interface ApodItem {
  /** NASA 的自然日 YYYY-MM-DD，也是这条数据的唯一标识 */
  date: string
  title: string
  /** NASA 的原始科普说明（英文原文，不翻译、不改写） */
  explanation: string
  mediaType: ApodMedia
  /** 原始媒体地址：图片是图片 URL，视频是可播放 / 可嵌入的地址 */
  url: string
  /** 高清原图（不是每天都有） */
  hdurl?: string
  /** 图片：直接 <img src> 用它；视频：官方的封面图 */
  displayUrl: string
  /** 能 iframe 嵌入的视频地址（YouTube / Vimeo） */
  embedUrl?: string
  /** 直接是视频文件（.mp4 / .webm / .mov），用 <video> 播 */
  videoFile?: string
  /** 版权方。NASA 自己的作品没有这一项 */
  copyright?: string
  /** APOD 官方页面 —— 「NASA 原始来源」就是它 */
  pageUrl: string
}

/** 接口原始返回（只列用到的字段） */
interface ApodRaw {
  date?: string
  title?: string
  explanation?: string
  media_type?: string
  url?: string
  hdurl?: string
  thumbnail_url?: string
  copyright?: string
}

/* ------------------------------------------------------------------ 工具 */

/** APOD 官方页面地址：https://apod.nasa.gov/apod/apYYMMDD.html */
export function apodPageUrl(date: string): string {
  const [y, m, d] = date.split('-')
  return `https://apod.nasa.gov/apod/ap${y.slice(2)}${m}${d}.html`
}

function toEmbeddable(raw: string): string | undefined {
  // YouTube：watch?v=ID / youtu.be/ID / 已经是 embed 形式
  const yt = raw.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{6,})/)
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`
  // Vimeo
  const vm = raw.match(/vimeo\.com\/(?:video\/)?(\d+)/)
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`
  return undefined
}

/**
 * 把 NASA 的原始行转成本项目统一的 ApodItem。
 *
 * 导出给 apodArchive.ts 用 —— 存档里存的是**原始 NASA 响应**，
 * 加载时走这同一个函数，这样「实时数据」和「离线存档」的字段结构
 * 不可能跑偏（两边共用一份转换逻辑，不是各写一套）。
 */
export function normalize(raw: ApodRaw): ApodItem {
  const date = raw.date ?? ''
  const url = raw.url ?? ''
  const mediaType: ApodMedia =
    raw.media_type === 'image' ? 'image' : raw.media_type === 'video' ? 'video' : 'other'

  const isFile = /\.(mp4|webm|ogv|mov)(\?|$)/i.test(url)
  const embedUrl = mediaType === 'video' && !isFile ? toEmbeddable(url) : undefined
  const videoFile = mediaType === 'video' && isFile ? url : undefined

  // displayUrl 的语义：图片用标准尺寸图（url，通常 1MB 内）、视频用官方封面图。
  // 高清图（hdurl，动辄 5~10MB）只留给「放大查看」用，别在日常渲染里下载它。
  const displayUrl = mediaType === 'image' ? url : (raw.thumbnail_url ?? '')

  return {
    date,
    title: raw.title?.trim() || date,
    explanation: raw.explanation?.trim() || '',
    mediaType,
    url,
    hdurl: raw.hdurl,
    displayUrl,
    embedUrl,
    videoFile,
    copyright: raw.copyright?.trim() || undefined,
    pageUrl: apodPageUrl(date),
  }
}

/**
 * 兜底：正常不该走到这里，走到说明接口返回了缺日期/缺媒体地址的脏数据。
 * 导出给 apodArchive.ts 用，让存档也走同一套可用性判定。
 */
export function assertUsable(item: ApodItem): ApodItem {
  if (!item.date) throw new HttpError('NASA 返回的条目缺少日期字段', 0, ENDPOINT)
  if (!item.url && !item.embedUrl && !item.videoFile) {
    throw new HttpError(`NASA 返回的 ${item.date} 缺少媒体地址`, 0, ENDPOINT)
  }
  return item
}

/* ---------------------------------------------------------------- 缓存 */

const CACHE_PREFIX = 'blueyard.apod.v1.'
/** 最多留多少条，防止随机探索把 localStorage 塞满 */
const MAX_ENTRIES = 240

interface CacheRow {
  at: number
  item: ApodItem
}

function ls(): Storage | null {
  try {
    return window.localStorage
  } catch {
    // 隐私模式 / 禁用存储：静默降级成「不缓存」
    return null
  }
}

/**
 * 读缓存。
 *
 * ⚠️ 这里**故意不做时间过期**（曾经是「今天的内容 30 分钟内复用」）。
 * 理由：APOD 一天只发布一次，某一天发布之后内容就不会再变了。
 * 原来那个 30 分钟 TTL 的代价是 —— 同一天里每半小时就要重新请求一次整窗，
 * 而 DEMO_KEY 只有 10 次/小时、还是全世界共用的，于是页面会被自己的
 * 「刷新」刷成限流失败卡。改成永久有效后：
 *
 *      同一个 UTC 日内重复访问 = **0 次请求**（第一次成功取到之后）
 *      跨天后只缺「今天」这一天 = 1 次区间请求 / 访客 / 天
 *
 * 为什么敢永久缓存「今天」也不会把坏数据固化：
 *      失败路径（超时 / 429 / 400）**从不写缓存**，所以「今天还没发布」这种情况
 *      下次访问会重新请求，不会停在空结果上。
 * 代价：NASA 事后修订某一天的图文（很少见）不会自动跟到。
 *      想要拿最新版就点「重新加载」—— 那个按钮会绕过缓存真去取一次。
 */
function readCached(date: string): ApodItem | null {
  const store = ls()
  if (!store) return null
  try {
    const raw = store.getItem(CACHE_PREFIX + date)
    if (!raw) return null
    const row = JSON.parse(raw) as CacheRow
    if (!row?.item?.date || !row.item.url) return null
    return row.item
  } catch {
    return null
  }
}

function writeCached(item: ApodItem) {
  const store = ls()
  if (!store) return
  try {
    store.setItem(CACHE_PREFIX + item.date, JSON.stringify({ at: Date.now(), item }))
    pruneCache(store)
  } catch {
    /* 写满 / 被禁用：无所谓，下次直接请求 */
  }
}

function pruneCache(store: Storage) {
  const rows: { key: string; at: number }[] = []
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i)
    if (!key?.startsWith(CACHE_PREFIX)) continue
    try {
      const row = JSON.parse(store.getItem(key) ?? '') as CacheRow
      rows.push({ key, at: row?.at ?? 0 })
    } catch {
      rows.push({ key, at: 0 })
    }
  }
  if (rows.length <= MAX_ENTRIES) return
  rows.sort((a, b) => a.at - b.at)
  for (const r of rows.slice(0, rows.length - MAX_ENTRIES)) store.removeItem(r.key)
}

/** 某个日期「记忆里」有没有真实数据（不触发请求） */
export function peekApod(date: string): ApodItem | null {
  return readCached(date)
}

/* ------------------------------------------------------------ 请求封装 */

export interface ApodResult {
  items: ApodItem[]
  /** 接口自报的额度信息，用来在界面上解释「为什么取不到了」 */
  meta: JsonMeta | null
  /**
   * 这一批条目是不是**真的刚从 NASA 取回来的**。
   *
   * 为什么必须如实上报：fetchApodWindow 在请求失败但本地有部分缓存时，
   * 会静默用缓存顶上（这是有意的，用户翻的还是以前取过的真实数据）。
   * 如果调用方不去看这个字段、一律标成「实时取数」，界面上就会撒谎。
   */
  fromNetwork: boolean
}

/** 最近一次实际生效的额度信息（DEMO_KEY 时界面上会显示） */
let lastMeta: JsonMeta | null = null
export function lastApodQuota(): JsonMeta | null {
  return lastMeta
}

function asArray(json: ApodRaw | ApodRaw[]): ApodRaw[] {
  return Array.isArray(json) ? json : [json]
}

/**
 * 取「一天」。
 * 已经缓存过就直接返回，不发请求（APOD 发布后不变，见 readCached 的说明）。
 *
 * @param force 绕过缓存，真的去 NASA 取一次（界面上「重新加载」用）
 */
export async function fetchApodDay(
  date: string,
  signal?: AbortSignal,
  force = false,
): Promise<ApodResult> {
  const cached = force ? null : readCached(date)
  if (cached) return { items: [cached], meta: lastMeta, fromNetwork: false }

  const url = `${ENDPOINT}?api_key=${encodeURIComponent(nasaApiKey())}&date=${date}`
  const { json, meta } = await getJSONWithMeta<ApodRaw | ApodRaw[]>(url, {
    signal,
    timeoutMs: TIMEOUT,
  })
  lastMeta = meta

  const items = asArray(json).map(normalize).map(assertUsable)
  items.forEach(writeCached)
  if (!items.length) throw new HttpError(`NASA 没有返回 ${date} 的数据`, 0, url)
  return { items, meta, fromNetwork: true }
}

/**
 * 取一个「窗口」：从 endDate 往前 days 天（含两端）。
 * 区间请求只消耗 1 次额度，是翻日期的主路径。
 *
 * 窗口里已经缓存的日期不会再请求；如果整窗都命中缓存，就完全不发请求。
 *
 * @param force 绕过缓存，真的去 NASA 取一次（界面上「重新加载」用）
 */
export async function fetchApodWindow(
  endDate: string,
  days = WINDOW_DAYS,
  signal?: AbortSignal,
  force = false,
): Promise<ApodResult> {
  const end = clampDay(endDate, APOD_EPOCH, utcToday())
  const start = clampDay(addDays(end, -(days - 1)), APOD_EPOCH, end)

  const cached = new Map<string, ApodItem>()
  if (!force) {
    for (let d = start; d <= end; d = addDays(d, 1)) {
      const hit = readCached(d)
      if (hit) cached.set(d, hit)
    }
    // 整窗命中 —— 不打扰 NASA
    if (daysBetween(start, end) + 1 === cached.size) {
      return { items: [...cached.values()], meta: lastMeta, fromNetwork: false }
    }
  }

  const url =
    `${ENDPOINT}?api_key=${encodeURIComponent(nasaApiKey())}` +
    `&start_date=${start}&end_date=${end}`

  let json: ApodRaw | ApodRaw[]
  let meta: JsonMeta
  /* 这里**故意不做**「失败就拿缓存顶上」的兜底。
     原因：调用方只在 peekApod(target) 落空时才会走到这个窗口请求，
     也就是说请求失败时缓存里**不可能**有 target —— 顶上来的那批数据
     仍然答不出用户要的那一天，只会白白多打一次请求、把失败反馈延迟一倍
     （超时场景下 15s 变 30s）。失败就如实抛出去，
     由 useApodDay 决定是降级到离线存档还是显示错误态。 */
  {
    const res = await getJSONWithMeta<ApodRaw | ApodRaw[]>(url, { signal, timeoutMs: TIMEOUT })
    json = res.json
    meta = res.meta
  }
  lastMeta = meta

  const fresh = asArray(json).map(normalize).map(assertUsable)
  fresh.forEach(writeCached)
  if (!fresh.length) throw new HttpError('NASA 返回了空的区间数据', 0, url)

  const merged = new Map(cached)
  fresh.forEach((it) => merged.set(it.date, it))
  // 按日期升序，调用方可以直接当时间轴用
  const items = [...merged.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  return { items, meta, fromNetwork: true }
}

/**
 * 随机探索用的窗口：在 APOD 的整个历史里取一天，然后抓它附近几天。
 * 为什么抓一小段：随机出来的那天有可能正好是视频日或者标题很短，
 * 多取几天让调用方能挑一个「更像一张图」的（但仍然全部是真实数据）。
 */
export async function fetchApodAround(date: string, signal?: AbortSignal): Promise<ApodResult> {
  const end = clampDay(date, APOD_EPOCH, utcToday())
  const start = clampDay(addDays(end, -3), APOD_EPOCH, end)
  return fetchApodWindow(end, daysBetween(start, end) + 1, signal)
}

/** 在 [1995-06-16, 今天] 里随机取一个自然日 */
export function randomApodDate(exclude?: string): string {
  const today = utcToday()
  const span = daysBetween(APOD_EPOCH, today)
  for (let i = 0; i < 12; i++) {
    const d = addDays(APOD_EPOCH, Math.floor(Math.random() * (span + 1)))
    if (d !== exclude) return d
  }
  return today
}

/**
 * 「含 date 的那个预取窗口」的结束日。
 *
 * 窗口一律从今天往回，按 WINDOW_DAYS 天一块切：
 *      第 0 块 = [今天-29, 今天]      最近 30 天
 *      第 1 块 = [今天-59, 今天-30]   再往前 30 天
 *      …
 * 这样「今天 ± 30 天」范围内的所有点击都落在同一块里，只花 1 次额度；
 * 越往前翻，块是整块往后跳的，每 30 天 1 次，而且已经取过的块永久缓存。
 */
export function bucketEndOf(date: string, days = WINDOW_DAYS): string {
  const today = utcToday()
  const back = Math.max(0, daysBetween(date, today))
  const idx = Math.floor(back / days)
  return clampDay(addDays(today, -idx * days), APOD_EPOCH, today)
}

/** 从一批条目里取 date 前后 radius 天（日期条用） */
export function spanFromItems(items: ApodItem[], date: string, radius = 3): ApodItem[] {
  return items
    .filter((it) => Math.abs(daysBetween(date, it.date)) <= radius)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
}

/**
 * 只查本地缓存，取 date 前后 radius 天。
 * 随机探索那次请求的结果会落进缓存，所以紧接着的日期条能立刻显示出来 —— 零额外请求。
 */
export function cachedSpan(date: string, radius = 3): ApodItem[] {
  const out: ApodItem[] = []
  for (let d = -radius; d <= radius; d++) {
    const hit = readCached(addDays(date, d))
    if (hit) out.push(hit)
  }
  return out
}

/* 「现在用的是哪把 Key」那句说明在 env.ts 的 nasaKeyNote() —— 它必须每次渲染现算，
   不能像以前那样在模块加载时算成一个常量（用户页面上填了 Key 之后要立刻变）。 */

/** 今天的日期（UTC），界面锚点用 */
export function apodToday(): string {
  return utcToday()
}
