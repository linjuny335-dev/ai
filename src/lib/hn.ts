/* ============================================================================
 *  Hacker News 数据源 —— 航天新闻
 * ----------------------------------------------------------------------------
 *  为什么不用官方 Firebase 接口：
 *      /v0/topstories · newstories · askstories 只有三个固定榜单，
 *      **没有关键词检索**，拿不到「航天」这个主题。
 *
 *  所以这里改用 HN 官方文档推荐的 Algolia 检索接口（公开、免 Key、带 CORS）：
 *      GET https://hn.algolia.com/api/v1/search
 *          ?query=<关键词>
 *          &tags=story                     只要帖子，不要评论
 *          &numericFilters=created_at_i>N  时间窗口（每次请求时算，不能写成常量）
 *          &hitsPerPage=N
 *
 *  Algolia 的默认排序对 HN 来说是「热度 + 时间」的混合，正好适合做「最新动态」。
 *
 *  ⚠️ Algolia 是**跨字段**全文检索，会把两类无关帖子带进来，所以取回后做两步清洗：
 *      ① 标题必须真的包含关键词（否则会漏进「正文提到 NASA、标题讲别的」那种帖子）
 *      ② 标题命中同形异义词黑名单就直接丢（color space / Rocket League / namespace…）
 *    这两步都不是相关性打分，只是「明显不相干就丢」—— 见 TITLE_NOISE。
 *
 *  取数、清洗、规范化到 TechItem 都在这里，页面组件不认识这些端点。
 * ========================================================================== */

import { compact, hostOf, secondsToMs } from './format'
import { getJSON, HttpError } from './http'
import type { FeedDef, SourceDef, TechItem } from './techTypes'

export type FeedKind = 'launch' | 'mission' | 'satellite'

export interface HnFeedDef extends FeedDef {
  id: FeedKind
}

const ALGOLIA = 'https://hn.algolia.com/api/v1'
const TIMEOUT = 9000

/** 检索时间窗口：只看最近 90 天，保证是「动态」而不是「史料」 */
const WINDOW_DAYS = 90
/** 最低热度：把 ▲0 ▲1 的灌水帖滤掉（Algolia 的 points 字段） */
const MIN_POINTS = 5

/**
 * 三个 feed 的检索词。
 * 选词原则：**尽量选不会被别的领域借用的词**。
 *   · rocket    大部分命中的是运载火箭；"Rocket League" / "Rocket.Chat" 由 TITLE_NOISE 兜掉
 *   · NASA      官方机构名，指向明确
 *   · satellite 卫星，指向明确
 */
const FEED_QUERY: Record<FeedKind, string> = {
  launch: 'rocket',
  mission: 'NASA',
  satellite: 'satellite',
}

/**
 * 同形异义词黑名单（小写子串匹配）。
 * Algolia 是全文检索，标题里带这些词的帖子跟航天无关，直接丢。
 * 只列实测真的会撞上的几个，不要无限追加 —— 这个列表不是相关性模型。
 */
const TITLE_NOISE = [
  'color space',
  'colour space',
  'address space',
  'design space',
  'namespace',
  'workspace',
  'rocket league',
  'rocket.chat',
  'rocketchat',
]

function isNoise(title: string): boolean {
  const t = title.toLowerCase()
  return TITLE_NOISE.some((n) => t.includes(n))
}

/** 接口原始字段（Algolia 的 hit 结构，只列用到的） */
interface AlgoliaHit {
  objectID: string
  title?: string | null
  story_title?: string | null
  url?: string | null
  points?: number | null
  author?: string | null
  num_comments?: number | null
  created_at_i?: number | null
}

interface AlgoliaResult {
  hits?: AlgoliaHit[]
  nbHits?: number
}

/**
 * 关键词必须作为**一个词**出现在标题里（允许复数 s / es）。
 *
 * 不能只用 `includes()`：实测「nasal spray」里含子串 `nasa`，
 * 于是「Scientists reverse brain aging, with a nasal spray」
 * 被当成 NASA 新闻混进了列表。加 `\b` 词边界就不会。
 *
 * 也不能用严格的 `\brocket\b`：那样「Rockets, Calculators…」这种复数会被误杀，
 * 所以放宽成 `\brocket(?:s|es)?\b`。
 * 仍然会排除「Rocketlab」这类连写词 —— 这个损失可以接受，
 * 因为可选项的数量远远多于列表需要的条数。
 */
function titleMatchesKeyword(title: string, keyword: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\b${escaped}(?:s|es)?\\b`, 'i').test(title)
}

function toItem(hit: AlgoliaHit, keyword: string): TechItem | null {
  const title = hit.title ?? hit.story_title ?? null
  if (!title || !hit.objectID) return null
  if (isNoise(title)) return null
  if (!titleMatchesKeyword(title, keyword)) return null

  const hnUrl = `https://news.ycombinator.com/item?id=${hit.objectID}`
  const external = hit.url && /^https?:/i.test(hit.url)
  const domain = hostOf(hit.url ?? undefined)

  return {
    key: `hn:${hit.objectID}`,
    source: 'hn',
    title,
    owner: hit.author ?? 'unknown',
    primary: { kind: 'score', value: compact(hit.points ?? 0) },
    secondary: [{ kind: 'comments', value: String(hit.num_comments ?? 0), label: 'comments' }],
    url: external ? (hit.url as string) : hnUrl,
    discussUrl: hnUrl,
    footLabel: domain ?? 'news.ycombinator.com',
    createdAt: secondsToMs(hit.created_at_i ?? undefined),
    tags: [],
  }
}

/** 时间窗口在「每次请求时」才算 —— 写成模块常量的话，页面开着不刷新窗口就不会滑动 */
function sinceTs(): number {
  return Math.floor((Date.now() - WINDOW_DAYS * 86_400_000) / 1000)
}

/**
 * 取一个关键词 feed 的前 N 条。
 * 多要一些再截断：清洗会丢掉一部分，正好要 N 条的话会不够。
 */
export async function fetchFeed(
  kind: FeedKind,
  limit: number,
  signal?: AbortSignal,
): Promise<TechItem[]> {
  const keyword = FEED_QUERY[kind]
  const want = Math.min(Math.max(limit * 3, limit + 20), 80)
  const url =
    `${ALGOLIA}/search?query=${encodeURIComponent(keyword)}` +
    `&tags=story&numericFilters=${encodeURIComponent(`created_at_i>${sinceTs()},points>${MIN_POINTS}`)}` +
    `&hitsPerPage=${want}`

  const json = await getJSON<AlgoliaResult>(url, { signal, timeoutMs: TIMEOUT })
  if (!Array.isArray(json.hits)) throw new Error('HN(Algolia) 返回格式异常')

  const items: TechItem[] = []
  for (const hit of json.hits) {
    const it = toItem(hit, keyword)
    if (!it) continue
    items.push(it)
    if (items.length >= limit) break
  }

  // 清洗后可能一条不剩：这时候报错比显示空白更有用（错误态带 Retry）
  if (items.length === 0) {
    throw new HttpError(
      `HN 上「${keyword}」最近 ${WINDOW_DAYS} 天没有标题相关、且热度足够的帖子`,
      0,
      ALGOLIA,
    )
  }
  return items
}

const feed = (id: FeedKind, label: string, hint: string): HnFeedDef => ({
  id,
  label,
  hint,
  load: (limit, signal) => fetchFeed(id, limit, signal),
})

export const HN_SOURCE: SourceDef = {
  id: 'hn',
  label: 'Hacker News',
  short: 'News',
  icon: '◆',
  accent: '#ff8a3d',
  home: 'https://news.ycombinator.com',
  feeds: [
    feed('launch', 'Launch', '火箭与发射：运载火箭、入轨、商业化发射相关讨论'),
    feed('mission', 'Mission', '探测器与任务：NASA / 深空探测 / 载人航天的最新进展'),
    feed('satellite', 'Satellite', '卫星：星座部署、遥感、通信与在轨服务'),
  ],
}
