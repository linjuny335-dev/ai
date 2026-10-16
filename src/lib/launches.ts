/* ============================================================================
 *  launches.ts —— 真实航天发射数据适配器（Launch Library 2 / The Space Devs）
 * ----------------------------------------------------------------------------
 *  FOUNDRY 栏目「器 · 探」的唯一数据来源。页面上出现的每一个任务名、火箭、
 *  发射机构、发射时刻、发射场、任务简介、任务状态，都是 LL2 官方接口返回的
 *  真实字段 —— **没有 mock、没有示例数据、没有本地写死的任务**。
 *  取不到就往上抛错，由界面显示「数据暂时获取失败 + 重新加载」。
 *
 *  接口（官方公开，匿名可用，**不需要 API Key**）：
 *      GET https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=20&mode=detailed
 *      GET https://ll.thespacedevs.com/2.2.0/launch/previous/?limit=20&mode=detailed
 *
 *  为什么用 2.2.0 而不是 2.3.0（实测对比过）：
 *      2.2.0 的 `mode=detailed` 会把 rocket.configuration.full_name、
 *      launch_service_provider.name、pad.location.name、mission.description
 *      这些**嵌套的真实字段**完整给出来，一次请求就够渲染整页；
 *      2.3.0 的分支结构变了，同样的信息要多请求一两次。CORS 两边都放行（*）。
 *
 *  两个真实数据的坑，实现里都处理了：
 *
 *   ① `net` 是绝对时刻（2026-09-15T01:21:07Z），显示必须转本地时区，
 *      否则中国用户看到的发射时间会差 8 小时。倒计时也用这个字段算。
 *   ② `net` 可能是 null（TBD，未定），`net_precision` 说明精度（Day / Hour /
 *      Minute / Second）。所以倒计时不能想当然地显示到秒 —— 精度只到「天」
 *      的窗口，显示成 T-02D 05H 12M 08S 是在假装精确。界面按精度分级显示，
 *      这一点在数据层就把 netPrecision 如实带出去。
 *
 *  缓存：sessionStorage，5 分钟 TTL。原因是 LL2 匿名额度有限（按小时计），
 *  而且发射场次不会以秒为单位变化 —— 但超过 5 分钟一定重新取，
 *  保证「倒计时基于真实时间、任务状态不是隔夜数据」。
 * ========================================================================== */

import { getJSONWithMeta, type JsonMeta } from './http'

const BASE = 'https://ll.thespacedevs.com/2.2.0'

/** 超时给宽一点：LL2 在海外，偶尔要几秒 */
const TIMEOUT = 18000

/** 一次取多少条。时间轴只用最近 3~5 条，其余留给「左右浏览」 */
export const PAGE_SIZE = 20

/** 缓存有效期（ms） */
export const CACHE_TTL = 5 * 60_000

export type LaunchKind = 'upcoming' | 'previous'

export interface LaunchStatus {
  /** 官方缩写：Go / TBD / Success / Failure / In Flight … */
  abbrev: string
  name: string
  description: string | null
}

export interface LaunchItem {
  /** LL2 的稳定 id —— 同时用作 React key 与去重 */
  id: string
  /** 任务全名（官方写法，如 "Falcon 9 Block 5 | Starlink Group 17-3"） */
  name: string
  /** 火箭型号（rocket.configuration.full_name） */
  rocket: string | null
  /** 发射机构 / 公司（launch_service_provider.name） */
  provider: string | null
  /** 机构类型：Government / Commercial / Multinational … */
  providerType: string | null
  /** 发射时刻 NET（绝对时刻，ISO 8601，可能为 null = 未定） */
  net: string | null
  /** 时刻精度：Second / Minute / Hour / Day / Month / Quarter / Year / TBD */
  netPrecision: string | null
  /** 发射场（pad.location.name，如 "Cape Canaveral SFS, FL, USA"） */
  location: string | null
  /** 具体工位（pad.name） */
  pad: string | null
  /** 任务简介（mission.description，官方原文） */
  mission: string | null
  /** 任务类型：Communications / Test Flight … */
  missionType: string | null
  /** 目标轨道：LEO / SSO / GTO … */
  orbit: string | null
  status: LaunchStatus
  /** 官方给出的任务配图（经常为 null） */
  image: string | null
  /** 是否有直播 */
  webcastLive: boolean
  /** The Space Devs 上的任务页 —— 「来源」就是它 */
  pageUrl: string
}

/* ------------------------------------------------------------ 原始返回 */

interface RawLaunch {
  id?: string
  name?: string
  net?: string | null
  net_precision?: { name?: string; abbrev?: string } | null
  status?: { abbrev?: string; name?: string; description?: string | null } | null
  image?: string | null
  webcast_live?: boolean
  slug?: string | null
  url?: string | null
  rocket?: { configuration?: { full_name?: string; name?: string } | null } | null
  launch_service_provider?: { name?: string; type?: string | null } | null
  pad?: {
    name?: string
    location?: { name?: string } | null
  } | null
  mission?: {
    name?: string
    description?: string | null
    type?: string | null
    orbit?: { name?: string; abbrev?: string } | null
  } | null
}

interface RawPage {
  count?: number
  next?: string | null
  results?: RawLaunch[]
}

/* ---------------------------------------------------------------- 归一化 */

function normalize(raw: RawLaunch): LaunchItem | null {
  // 没有 id 或没有任务名 —— 这种脏数据直接丢掉，而不是拿默认值糊上去
  if (!raw.id || !raw.name) return null

  const slug = raw.slug ?? null
  const pageUrl = slug
    ? `https://spacelaunchnow.me/launch/${slug}/`
    : 'https://thespacedevs.com/llapi'

  return {
    id: raw.id,
    name: raw.name,
    rocket: raw.rocket?.configuration?.full_name ?? raw.rocket?.configuration?.name ?? null,
    provider: raw.launch_service_provider?.name ?? null,
    providerType: raw.launch_service_provider?.type ?? null,
    // 空字符串一律当「没有」，界面据此显示「待定」而不是空白
    net: raw.net ? raw.net : null,
    netPrecision: raw.net_precision?.name ?? raw.net_precision?.abbrev ?? null,
    location: raw.pad?.location?.name ?? null,
    pad: raw.pad?.name ?? null,
    mission: raw.mission?.description?.trim() || null,
    missionType: raw.mission?.type ?? null,
    orbit: raw.mission?.orbit?.name ?? raw.mission?.orbit?.abbrev ?? null,
    status: {
      abbrev: raw.status?.abbrev ?? 'Unknown',
      name: raw.status?.name ?? '未知状态',
      description: raw.status?.description?.trim() || null,
    },
    image: raw.image ?? null,
    webcastLive: Boolean(raw.webcast_live),
    pageUrl,
  }
}

/**
 * 统一成「离现在最近的那一场排最前面」：
 *      upcoming —— 按 NET 升序（最快要发射的排第一）
 *      previous —— 按 NET 降序（刚刚发射完的排第一）
 * 两种批次的时间轴方向就一致了，用户左右浏览的直觉不会被打断。
 * 未定时刻（net = null）一律排到最后。
 */
function sortByNet(items: LaunchItem[], kind: LaunchKind): LaunchItem[] {
  const dir = kind === 'upcoming' ? 1 : -1
  return [...items].sort((a, b) => {
    if (!a.net && !b.net) return 0
    if (!a.net) return 1
    if (!b.net) return -1
    return (Date.parse(a.net) - Date.parse(b.net)) * dir
  })
}

/* ---------------------------------------------------------------- 缓存 */

const CACHE_KEY: Record<LaunchKind, string> = {
  upcoming: 'blueyard.launches.v1.upcoming',
  previous: 'blueyard.launches.v1.previous',
}

interface CacheRow {
  at: number
  items: LaunchItem[]
}

function ss(): Storage | null {
  try {
    return window.sessionStorage
  } catch {
    return null // 隐私模式：降级成不缓存，每次真取
  }
}

/** 只读缓存（不触发请求）。用于「秒开 + 后台换新」 */
export function peekLaunches(kind: LaunchKind): { items: LaunchItem[]; at: number } | null {
  const store = ss()
  if (!store) return null
  try {
    const row = JSON.parse(store.getItem(CACHE_KEY[kind]) ?? '') as CacheRow
    if (!row?.items?.length) return null
    if (Date.now() - row.at > CACHE_TTL) return null
    return { items: row.items, at: row.at }
  } catch {
    return null
  }
}

function writeCache(kind: LaunchKind, items: LaunchItem[]) {
  const store = ss()
  if (!store) return
  try {
    store.setItem(CACHE_KEY[kind], JSON.stringify({ at: Date.now(), items } satisfies CacheRow))
  } catch {
    /* 写满就算了，下次直接请求 */
  }
}

/* ------------------------------------------------------------ 请求 */

export interface LaunchResult {
  items: LaunchItem[]
  /** 接口侧元信息（LL2 一般不给限流头，拿不到就是 null） */
  meta: JsonMeta | null
  /** 官方自报的总场次数（page.count），界面可以说明「这只是最近 N 场」 */
  total: number
}

/**
 * 取一批真实发射任务。
 *
 * kind = 'upcoming' → 即将发射（按 NET 升序）
 * kind = 'previous' → 最近已完成（LL2 的 previous 是从近到远）
 *
 * force = true 时忽略缓存（界面上的「刷新」按钮走这条路）。
 */
export async function fetchLaunches(
  kind: LaunchKind,
  signal?: AbortSignal,
  force = false,
): Promise<LaunchResult> {
  if (!force) {
    const hit = peekLaunches(kind)
    if (hit) return { items: hit.items, meta: null, total: hit.items.length }
  }

  const url = `${BASE}/launch/${kind}/?limit=${PAGE_SIZE}&mode=detailed`
  const { json, meta } = await getJSONWithMeta<RawPage>(url, { signal, timeoutMs: TIMEOUT })

  const items = sortByNet(
    (json.results ?? []).map(normalize).filter((x): x is LaunchItem => x !== null),
    kind,
  )

  // 一条都没有 = 接口异常或者真的空，两种都不该假装有数据
  if (!items.length) {
    throw new Error(`LL2 的 ${kind} 没有返回任何可用任务`)
  }

  writeCache(kind, items)
  return { items, meta, total: json.count ?? items.length }
}

/** 不读接口、只看缓存有没有 —— 用于首屏判断要不要显示骨架 */
export function hasCachedLaunches(kind: LaunchKind): boolean {
  return peekLaunches(kind) !== null
}

/** 界面上标注数据来源用（真实来源，不是装饰） */
export const LAUNCH_SOURCE = {
  name: 'Launch Library 2',
  org: 'The Space Devs',
  home: 'https://thespacedevs.com/llapi',
  endpoint: `${BASE}/launch`,
  note: '公开接口 · 无需 Key',
} as const

/** 把取数失败翻译成一句人话（带「为什么」而不只是「失败了」） */
export function launchFailureNote(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (/429/i.test(msg)) return 'LL2 匿名额度暂时用满了（按小时计），稍后重试即可。'
  return msg
}
