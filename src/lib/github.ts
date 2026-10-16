/* ============================================================================
 *  GitHub 数据源 —— 航天开源项目
 * ----------------------------------------------------------------------------
 *  用的是官方 REST 搜索接口（公开，匿名可调）：
 *      GET https://api.github.com/search/repositories?q=<qualifiers>&sort=stars
 *
 *  分类靠 **topic 限定词**，而不是关键词 —— 关键词会撞同形异义词。
 *  实测教训：`rocket` 作为关键词会返回 vaultwarden 和 Rocket.Chat；
 *  `topic:satellite` / `topic:remote-sensing` 这种限定则干净得多。
 *
 *      topic:space            → 轨道计算、飞控、地面站、火箭仿真
 *      topic:satellite        → 卫星地面站、信号解码、星历
 *      topic:remote-sensing   → 卫星影像、变化检测、GIS
 *
 *  每个限定后再叠一个 stars 门槛，把个人练手仓库筛掉。
 *  结果按 star 倒序，所以列表天然是「这个主题下最受关注的项目」。
 *
 *  ⚠️ 限流（这是唯一需要 Key 的地方，也不是必须）：
 *      匿名  搜索接口 10 次/分钟
 *      带 token      30 次/分钟
 *  填法：项目根目录 .env.local 里写一行 VITE_GITHUB_TOKEN=xxx（见 .env.example）。
 *  Token 只读 public repo 即可，不需要任何权限勾选。
 * ========================================================================== */

import { GITHUB_TOKEN, HAS_GITHUB_TOKEN } from './env'
import { compact, timeOf } from './format'
import { getJSON, HttpError } from './http'
import type { FeedDef, SourceDef, TechItem } from './techTypes'

const SEARCH_URL = 'https://api.github.com/search/repositories'
/**
 * 超时给到 20 秒。理由：实测搜索接口**冷启动要 7~8 秒**
 * （TLS 握手 + 搜索后端冷查询；热连接只要 0.4 秒）。
 * 之前的 12 秒在这台机器上已经贴边，弱网下会直接判超时 ——
 * 而超时表现为「Signal lost」错误态，比多等几秒糟糕得多。
 * 界面上这段时间显示的是骨架屏，不是白屏。
 */
const TIMEOUT = 20000

interface GhRepo {
  id: number
  full_name: string
  name: string
  description: string | null
  html_url: string
  fork: boolean
  archived: boolean
  stargazers_count: number
  forks_count: number
  open_issues_count: number
  language: string | null
  topics?: string[]
  created_at?: string
  pushed_at?: string
  owner?: { login?: string } | null
  license?: { spdx_id?: string | null } | null
}

/** 语言色点。只列常见的，取不到就不画点，不影响布局 */
const LANG_COLOR: Record<string, string> = {
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Python: '#3572A5',
  Rust: '#dea584',
  Go: '#00ADD8',
  Java: '#b07219',
  Kotlin: '#A97BFF',
  Swift: '#F05138',
  'C++': '#f34b7d',
  C: '#555555',
  'C#': '#178600',
  Ruby: '#701516',
  PHP: '#4F5D95',
  Shell: '#89e051',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Vue: '#41b883',
  Svelte: '#ff3e00',
  Dart: '#00B4AB',
  Zig: '#ec915c',
  Lua: '#000080',
  Scala: '#c22d40',
  Elixir: '#6e4a7e',
  Haskell: '#5e5086',
  Jupyter: '#DA5B0B',
  'Jupyter Notebook': '#DA5B0B',
  MDX: '#fcb32c',
  Astro: '#ff5a03',
  Solidity: '#AA6746',
  Objective_C: '#438eff',
  'Objective-C': '#438eff',
  Nix: '#7e7eff',
  Mojo: '#ff4c1f',
}

function toItem(r: GhRepo): TechItem {
  const language = r.language ?? undefined
  const license = r.license?.spdx_id && r.license.spdx_id !== 'NOASSERTION' ? r.license.spdx_id : undefined
  const topics = (r.topics ?? []).slice(0, 2)

  const secondary: TechItem['secondary'] = [
    { kind: 'forks', value: compact(r.forks_count), label: 'forks' },
  ]
  if (language) secondary.push({ kind: 'text', value: language })

  return {
    key: `github:${r.full_name}`,
    source: 'github',
    title: r.full_name,
    description: r.description ?? undefined,
    owner: r.owner?.login ?? r.full_name.split('/')[0],
    primary: { kind: 'stars', value: compact(r.stargazers_count) },
    secondary,
    url: r.html_url,
    footLabel: language ? `${language}${license ? ` · ${license}` : ''}` : (license ?? 'github.com'),
    createdAt: timeOf(r.created_at),
    tags: topics,
    dot: language ? LANG_COLOR[language] : undefined,
  }
}

async function search(
  qualifiers: string,
  limit: number,
  signal?: AbortSignal,
): Promise<TechItem[]> {
  // fork 项目会混进结果里，多要一些，过滤掉再截断
  const perPage = Math.min(Math.max(limit * 2, 20), 80)
  const url =
    `${SEARCH_URL}?q=${encodeURIComponent(qualifiers)}` +
    `&sort=stars&order=desc&per_page=${perPage}`

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  // 有 token 就带上，把限流从 10 次/分钟提到 30 次/分钟
  if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`

  let json: { items?: GhRepo[] }
  try {
    json = await getJSON<{ items?: GhRepo[] }>(url, { signal, timeoutMs: TIMEOUT, headers })
  } catch (e) {
    // 限流是最常见的失败，直接把「怎么解决」写进错误信息里
    if (e instanceof HttpError && (e.status === 403 || e.status === 429)) {
      throw new Error(
        HAS_GITHUB_TOKEN
          ? 'GitHub 限流（Token 已配置，稍后会自动重试）'
          : 'GitHub 限流：匿名 10 次/分钟。填 VITE_GITHUB_TOKEN 可提到 30 次/分钟',
      )
    }
    throw e
  }

  const items: TechItem[] = []
  for (const r of json.items ?? []) {
    if (r.fork || r.archived) continue
    items.push(toItem(r))
    if (items.length >= limit) break
  }
  return items
}

/**
 * qualifiers 做成函数而不是字符串：如果以后要带时间限定（created:>YYYY-MM-DD），
 * 必须在「每次请求时」才算 —— 写成模块常量的话，页面开着不刷新日期就会过期。
 */
const feed = (
  id: string,
  label: string,
  hint: string,
  qualifiers: () => string,
): FeedDef => ({
  id,
  label,
  hint,
  load: (limit, signal) => search(qualifiers(), limit, signal),
})

export const GITHUB_SOURCE: SourceDef = {
  id: 'github',
  label: 'GitHub',
  short: 'Repos',
  icon: '⬡',
  accent: '#7ee787',
  home: 'https://github.com/topics/space',
  feeds: [
    feed(
      'space',
      'Space',
      '航天开源项目：轨道计算、飞控、地面站、火箭仿真（topic:space）',
      () => 'topic:space stars:>20',
    ),
    feed(
      'satellite',
      'Satellite',
      '卫星相关：地面站、信号解码、星历与在轨数据（topic:satellite）',
      () => 'topic:satellite stars:>10',
    ),
    feed(
      'remote-sensing',
      'Earth Obs',
      '卫星遥感与地理空间处理：影像识别、变化检测、GIS（topic:remote-sensing）',
      () => 'topic:remote-sensing stars:>30',
    ),
  ],
}
