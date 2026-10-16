/* ============================================================================
 *  Hugging Face 数据源 —— 卫星遥感 / 对地观测 AI 模型
 * ----------------------------------------------------------------------------
 *  官方公开 API（匿名可读，无需 Key）：
 *      GET /api/models?sort=trendingScore|likes|downloads&direction=-1&limit=N[&search=关键词]
 *      GET /api/spaces?sort=trendingScore&direction=-1&limit=N[&search=关键词]
 *
 *  ⚠️ 国内网络注意：huggingface.co 在大陆常常直连不通，所以这里做了端点探测，
 *     可用端点见 src/lib/env.ts 的 HF_ENDPOINTS。默认两个：
 *
 *        1. https://huggingface.co/api   官方站，直连
 *        2. /hf-api                      同源反代 → hf-mirror.com/api
 *
 *     为什么第二个不直接写 hf-mirror.com：**镜像站不给浏览器返回 CORS 头**
 *     （curl 带 Origin 能拿到 Access-Control-Allow-Origin，Chrome 里却是
 *      "No 'Access-Control-Allow-Origin' header is present"，已实测确认），
 *     纯前端直连必然失败，只能走同源代理。
 *     dev / preview 的代理已在 vite.config.ts 配好；生产静态托管需要在网关加规则。
 *
 *  首次取数时**并发探测**两个端点，谁先成功用谁，落败的立刻 abort ——
 *  这样既不会在不通的端点上干等几秒，也不会一直用慢的那个。
 *  探测结果写进 sessionStorage，后续请求直接命中，不再重复探测。
 *
 *  可选 VITE_HF_TOKEN：提高限流、访问受限（gated）模型时需要。
 * ========================================================================== */

import { HF_ENDPOINTS, HF_PROXY_HINT, HF_TOKEN, type HfEndpoint } from './env'
import { compact, timeOf } from './format'
import { getJSON, HttpError } from './http'
import type { FeedDef, SourceDef, TechItem } from './techTypes'

/** 端点探测阶段的超时：够慢网络的首包，又不至于让用户干等 */
const PROBE_TIMEOUT = 9000
/** 已经确定端点后的正常超时 */
const NORMAL_TIMEOUT = 14000

const STICKY_KEY = 'blueyard.hf.endpoint'

/** 已经跑通的端点（模块级缓存，避免每次请求都重新探测） */
let resolved: HfEndpoint | null = null

function readSticky(): string | null {
  try {
    return sessionStorage.getItem(STICKY_KEY)
  } catch {
    // 隐私模式下 sessionStorage 可能不可用，静默降级
    return null
  }
}

function writeSticky(api: string) {
  try {
    sessionStorage.setItem(STICKY_KEY, api)
  } catch {
    /* 写不进去也无所谓，只是下次要重新探测 */
  }
}

/** 模型详情页链接用的基址：跟接口端点保持一致，这样镜像用户点链接也打得开 */
function hfWebBase(): string {
  return (resolved ?? HF_ENDPOINTS[0]).web
}

/** 当前实际使用的端点短名（footer 上显示，方便排查走的是官方站还是镜像） */
export function hfEndpoint(): string {
  return (resolved ?? HF_ENDPOINTS[0]).label
}

if (HF_ENDPOINTS.length === 1) {
  // 只有一个端点（用户显式指定或没有备用），不需要探测
  resolved = HF_ENDPOINTS[0]
} else {
  const sticky = readSticky()
  // 记住的端点必须在允许列表里（配置改过之后旧值可能失效）
  resolved = HF_ENDPOINTS.find((e) => e.api === sticky) ?? null
}

function authHeaders(): Record<string, string> {
  return HF_TOKEN ? { Authorization: `Bearer ${HF_TOKEN}` } : {}
}

/**
 * 取一个接口。
 *
 *  · 已经确定过端点 → 直接用它，一次请求搞定
 *  · 还没确定     → **并发**打所有端点，谁先返回用谁，其余立刻 abort
 *
 * 并发而不是串行的原因：串行时如果第一个端点是黑洞（GFW 丢包），
 * 用户要白等一整个超时才能拿到数据。并发后最坏等于「最快的那个端点」的耗时。
 * 代价是每次会话多一个请求，可以接受。
 */
async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  // 快路径：端点已经确定了
  if (resolved) {
    return getJSON<T>(`${resolved.api}${path}`, {
      signal,
      timeoutMs: NORMAL_TIMEOUT,
      headers: authHeaders(),
    })
  }

  const ctrls = HF_ENDPOINTS.map(() => new AbortController())
  const forwardAbort = () => ctrls.forEach((c) => c.abort())
  signal?.addEventListener('abort', forwardAbort)

  const attempts = HF_ENDPOINTS.map((ep, i) =>
    getJSON<T>(`${ep.api}${path}`, {
      signal: ctrls[i].signal,
      timeoutMs: PROBE_TIMEOUT,
      headers: authHeaders(),
    }).then((json) => ({ json, ep })),
  )

  try {
    const winner = await Promise.any(attempts)
    resolved = winner.ep
    writeSticky(winner.ep.api)
    // 落败的请求没必要跑完，掐掉
    ctrls.forEach((c, i) => {
      if (HF_ENDPOINTS[i] !== winner.ep) c.abort()
    })
    return winner.json
  } catch {
    if (signal?.aborted) throw new HttpError('请求被中断', 0, path)
    const tried = HF_ENDPOINTS.map((e) => `${e.label}(${e.api})`).join(' / ')
    throw new Error(
      `Hugging Face 所有端点均不可达：${tried}。` +
        `若部署环境访问不了官方站，请在网关上加一条反代规则：${HF_PROXY_HINT}`,
    )
  } finally {
    signal?.removeEventListener('abort', forwardAbort)
  }
}

/* ------------------------------------------------------------ 规范化 */

interface HfModel {
  id: string
  likes?: number
  downloads?: number
  pipeline_tag?: string
  library_name?: string
  tags?: string[]
  createdAt?: string
  lastModified?: string
  private?: boolean
  gated?: boolean | string
}

interface HfSpace {
  id: string
  likes?: number
  sdk?: string
  tags?: string[]
  createdAt?: string
  lastModified?: string
}

/** 从 tags 里挑出 license:xxx（HF 把许可证也塞在 tags 里） */
function pickLicense(tags: string[] | undefined): string | undefined {
  const hit = (tags ?? []).find((t) => t.startsWith('license:'))
  return hit ? hit.slice('license:'.length) : undefined
}

function toModel(m: HfModel): TechItem {
  const [maybeOwner, ...rest] = m.id.split('/')
  const hasOwner = rest.length > 0
  const owner = hasOwner ? maybeOwner : 'huggingface'
  const name = hasOwner ? rest.join('/') : maybeOwner

  const task = m.pipeline_tag
  const lib = m.library_name
  const license = pickLicense(m.tags)

  const tags: string[] = []
  for (const t of [task, lib, license]) {
    if (t && !tags.includes(t)) tags.push(t)
  }

  const description = [task, lib].filter(Boolean).join(' · ') || undefined

  const secondary: TechItem['secondary'] = [
    { kind: 'downloads', value: compact(m.downloads ?? 0), label: 'downloads' },
  ]

  return {
    key: `hf:${m.id}`,
    source: 'hf',
    title: name,
    description,
    owner,
    primary: { kind: 'likes', value: compact(m.likes ?? 0) },
    secondary,
    url: `${hfWebBase()}/${m.id}`,
    footLabel: m.id,
    createdAt: timeOf(m.createdAt) ?? timeOf(m.lastModified),
    tags: tags.slice(0, 3),
  }
}

function toSpace(s: HfSpace): TechItem {
  const [maybeOwner, ...rest] = s.id.split('/')
  const hasOwner = rest.length > 0
  const owner = hasOwner ? maybeOwner : 'huggingface'
  const name = hasOwner ? rest.join('/') : maybeOwner

  const secondary: TechItem['secondary'] = []
  if (s.sdk) secondary.push({ kind: 'text', value: s.sdk })

  return {
    key: `hf-space:${s.id}`,
    source: 'hf',
    title: name,
    description: s.sdk ? `Space · ${s.sdk}` : 'Space',
    owner,
    primary: { kind: 'likes', value: compact(s.likes ?? 0) },
    secondary,
    url: `${hfWebBase()}/spaces/${s.id}`,
    footLabel: s.id,
    createdAt: timeOf(s.createdAt) ?? timeOf(s.lastModified),
    tags: (s.tags ?? []).filter((t) => !t.startsWith('region:')).slice(0, 3),
  }
}

/* --------------------------------------------------------------- feeds */

/**
 * 取模型列表。
 * `search` 用的是接口原生的全文检索参数 —— 直接拼在查询串里，不需要额外代码。
 * 注意它是「仓库 id / 标签」的文本匹配，不是语义检索：
 * 搜 `space` 会撞上叫 `spacepxl` 的用户和 `state-spaces` 组织，
 * 所以这里的检索词都选了**不容易被用户名借用的**专有名词（satellite / remote sensing）。
 */
async function loadModels(
  sort: 'trendingScore' | 'likes' | 'downloads',
  limit: number,
  signal?: AbortSignal,
  search?: string,
): Promise<TechItem[]> {
  const q = search ? `&search=${encodeURIComponent(search)}` : ''
  const list = await request<HfModel[]>(
    `/models?sort=${sort}&direction=-1&limit=${limit}${q}`,
    signal,
  )
  if (!Array.isArray(list)) throw new Error('Hugging Face 返回格式异常')
  return list.filter((m) => !m.private).map(toModel)
}

async function loadSpaces(
  limit: number,
  signal?: AbortSignal,
  search?: string,
): Promise<TechItem[]> {
  const q = search ? `&search=${encodeURIComponent(search)}` : ''
  const list = await request<HfSpace[]>(
    `/spaces?sort=trendingScore&direction=-1&limit=${limit}${q}`,
    signal,
  )
  if (!Array.isArray(list)) throw new Error('Hugging Face 返回格式异常')
  return list.map(toSpace)
}

export const HF_SOURCE: SourceDef = {
  id: 'hf',
  label: 'Hugging Face',
  short: 'Models',
  icon: '✦',
  accent: '#ffd21e',
  home: 'https://huggingface.co/models',
  feeds: [
    {
      id: 'models-satellite',
      label: 'Satellite',
      hint: '卫星遥感模型：影像分割、目标检测、变化监测（search=satellite，按点赞排序）',
      load: (limit, signal) => loadModels('likes', limit, signal, 'satellite'),
    },
    {
      id: 'models-earth',
      label: 'Earth Obs',
      hint: '对地观测模型：遥感影像理解与描述（search=remote sensing，按下载量排序）',
      load: (limit, signal) => loadModels('downloads', limit, signal, 'remote sensing'),
    },
    {
      id: 'spaces-satellite',
      label: 'Spaces',
      hint: '可以直接在浏览器里跑的卫星影像 AI 小应用（spaces 站内搜索）',
      load: (limit, signal) => loadSpaces(limit, signal, 'satellite'),
    },
  ],
}
