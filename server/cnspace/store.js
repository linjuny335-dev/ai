/* ============================================================================
 *  cnspace/store.js —— 聚合 + 缓存 + 降级（服务端）
 * ----------------------------------------------------------------------------
 *  三件事：
 *    ① 聚合：13 个官方栏目 → 统一模型 → 按日期倒序
 *    ② 缓存：TTL 1 小时，stale-while-revalidate（先给旧的，后台刷新）
 *    ③ 降级：单个来源失败**不影响**其它来源；界面按来源显示失败原因
 *
 *  降级的三层（与 PHOTON 那套一致，但不引入任何假数据）：
 *    内存缓存 → 实时抓取 → **真实数据快照**（snapshot.json，落盘，带抓取时间）
 *  快照是自己真抓到的官方内容，不是编的；界面必须标注「快照 · 抓取于 X」。
 *
 *  ⚠️ 明确不做的事：
 *    · 不伪造成日期、不补全缺失字段、不在失败时用示例内容顶上；
 *    · 不下载/转存官方图片（只保存原图 URL，前端直接引用官方地址）；
 *    · 不复制整篇正文（只留 ≤130 字摘要 + 原文链接）。
 * ========================================================================== */

import fs from 'node:fs'
import path from 'node:path'
import { SOURCES, COLUMNS, PER_SOURCE_LIMIT, PER_SOURCE_DETAIL_LIMIT, TTL_MS, DETAIL_TTL_MS } from './columns.js'
import { fetchPage, pool } from './net.js'
import { LIST_PARSERS, parseDetail } from './parsers.js'
import { makeId, topicTags, TOPIC_LABEL, findDate, stripTags } from './text.js'

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const SNAPSHOT_FILE = path.join(HERE, 'snapshot.json')
const DETAIL_CACHE_FILE = path.join(HERE, 'detail-cache.json')

/* ───────────────────────────── 缓存 ───────────────────────────── */

const state = {
  feed: null, // 最近一次成功聚合的结果
  updatedAt: 0,
  refreshing: null, // Promise，避免并发重复刷新
  detailCache: new Map(), // url → { summary, image, date, at }
  sourceState: new Map(), // sourceId → { ok, error, lastOkAt }
  detailDirty: false,
}

/* 详情页缓存落盘 —— 这一步是「刷新只要几秒」的关键：
   文章内容基本不变，第二次刷新只抓真正的新文章。 */
function loadDetailCache() {
  try {
    if (!fs.existsSync(DETAIL_CACHE_FILE)) return
    const raw = JSON.parse(fs.readFileSync(DETAIL_CACHE_FILE, 'utf8'))
    for (const [k, v] of Object.entries(raw || {})) {
      if (v && typeof v.at === 'number') state.detailCache.set(k, v)
    }
  } catch {
    /* 缓存坏了就忽略，重新抓即可 */
  }
}

let saveTimer = null
function scheduleSaveDetailCache() {
  state.detailDirty = true
  if (saveTimer) return
  saveTimer = setTimeout(() => {
    saveTimer = null
    if (!state.detailDirty) return
    state.detailDirty = false
    try {
      // 只留最近 1000 条，避免文件无限增长
      const entries = [...state.detailCache.entries()].sort((a, b) => b[1].at - a[1].at).slice(0, 1000)
      fs.writeFileSync(DETAIL_CACHE_FILE, JSON.stringify(Object.fromEntries(entries)), 'utf8')
    } catch {
      /* 落盘失败不影响在线服务 */
    }
  }, 2000)
  if (saveTimer.unref) saveTimer.unref()
}

loadDetailCache()

function loadSnapshot() {
  try {
    if (!fs.existsSync(SNAPSHOT_FILE)) return null
    const raw = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf8'))
    if (!raw?.items?.length) return null
    return raw
  } catch {
    return null
  }
}

function saveSnapshot(feed) {
  try {
    fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(feed), 'utf8')
  } catch {
    /* 落盘失败不影响在线服务 */
  }
}

/* ─────────────────────── 单列：列表页 ─────────────────────── */

async function fetchColumn(col) {
  const res = await fetchPage(col.url, { tries: 3 })
  if (!res.ok) return { col, ok: false, error: res.error, items: [] }

  const parse = LIST_PARSERS[col.parser]
  if (!parse) return { col, ok: false, error: `未知解析器 ${col.parser}`, items: [] }

  let items = []
  try {
    items = parse(res.html, res.url || col.url)
  } catch (e) {
    return { col, ok: false, error: `解析失败：${e.message}`, items: [] }
  }

  // 栏目页是 JS 跳转桩 / 改版 → 解析不出东西，如实报失败
  if (!items.length) {
    return { col, ok: false, error: `栏目页没有解析到条目（页面可能改版或为跳转页）`, items: [] }
  }
  return { col, ok: true, items, bytes: res.bytes, ms: res.ms, tries: res.tries }
}

/* ─────────────────────── 详情页：补摘要与配图 ─────────────────────── */

async function enrich(item, col) {
  const key = item.url
  const cached = state.detailCache.get(key)
  if (cached && Date.now() - cached.at < DETAIL_TTL_MS) {
    return {
      ...item,
      summary: item.summary || cached.summary,
      image: item.image || cached.image,
      date: item.date || cached.date,
      summaryFrom: item.summary ? item.summaryFrom : cached.summary ? 'detail' : null,
    }
  }
  // 微信公众号等站外链接不抓正文（超出「读取官方公开页面」的范围）
  if (!/^https?:\/\/(?:[a-z0-9-]+\.)*(?:cnsa\.gov\.cn|cmse\.gov\.cn|cas\.cn|spacechina\.com)/i.test(item.url)) {
    state.detailCache.set(key, { summary: null, image: null, date: null, at: Date.now() })
    scheduleSaveDetailCache()
    return item
  }

  const res = await fetchPage(item.url, { tries: 2 })
  if (!res.ok) return item

  const d = parseDetail(res.html, res.url || item.url, item.date)
  state.detailCache.set(key, { summary: d.summary, image: d.image, date: d.date, at: Date.now() })
  scheduleSaveDetailCache()
  return {
    ...item,
    summary: item.summary || d.summary,
    image: item.image || d.image,
    date: item.date || d.date,
    summaryFrom: item.summary ? item.summaryFrom : d.summary ? 'detail' : null,
  }
}

/* ─────────────────────── 归一化 ─────────────────────── */

function contentTypeOf(col, item) {
  if (/图片新闻/.test(col.label)) return 'image'
  if (/视频|TV/i.test(col.label)) return 'video'
  if (/图片/.test(col.label) || /\.(?:jpe?g|png)$/i.test(item.image || '')) return 'image'
  return 'article'
}

function normalize(raw, col) {
  const src = SOURCES[col.source]
  const cats = col.categories.slice()
  const tags = topicTags(raw.title, raw.summary).concat(col.tags)
  return {
    id: makeId(col.source, col.id, raw.url),
    title: raw.title,
    summary: raw.summary || null,
    source: col.source,
    sourceName: src.name,
    sourceShort: src.short,
    sourceUrl: raw.url, // ← 官方原文地址（"查看原文"直接跳这里）
    publishDate: raw.date || null,
    category: cats.find((c) => c !== 'tech') || 'tech', // 主归属板块
    categories: cats, // 需要展示到哪几个板块（很小的额外字段，见 README）
    tags: [...new Set(tags)],
    topicLabels: [...new Set(tags.filter((t) => TOPIC_LABEL[t]).map((t) => TOPIC_LABEL[t]))],
    image: raw.image || null, // 只保存官方原图 URL，不转存
    contentType: contentTypeOf(col, raw),
    column: col.label, // 实际读取的官方栏目名
    columnUrl: col.url,
    summaryFrom: raw.summaryFrom || null,
  }
}

const canon = (u) => String(u || '').split('#')[0].replace(/[?&](?:utm_[^=&]+=[^&]*)/g, '')

/* ─────────────────────── 主刷新流程 ─────────────────────── */

async function doRefresh() {
  const t0 = Date.now()

  // ① 并发抓 13 个栏目页（pool 只跨域名并行；同域名在 net.js 里已被串行化）
  const results = await pool(COLUMNS, 4, (col) => fetchColumn(col))

  // ② 按来源汇总状态
  const bySource = new Map(Object.keys(SOURCES).map((id) => [id, { okCols: [], badCols: [], items: [] }]))
  for (const r of results) {
    const bucket = bySource.get(r.col.source)
    if (r.ok) {
      bucket.okCols.push(r.col.label)
      bucket.items.push(...r.items.map((it) => ({ raw: it, col: r.col })))
    } else {
      bucket.badCols.push(`${r.col.label}（${r.error}）`)
    }
  }

  // ③ 每个来源：按日期倒序取前 N 条
  const plans = []
  for (const [sourceId, bucket] of bySource) {
    const kept = bucket.items
      .map(({ raw, col }) => ({ ...raw, date: raw.date || null, __col: col }))
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
      .slice(0, PER_SOURCE_LIMIT)
    plans.push({ sourceId, bucket, kept })
  }

  /* ④ 详情页补全 —— **跨来源一起并发**。
     以前是「一个来源一个来源地 await」，等于把 4 个来源的详情抓取串起来，
     冷启动要 50 多秒。改成一整池并发后，动手的还是各自域名（net.js 里同域名仍然
     串行 + ≥400ms 间隔，对官网友好度不变），但四个站是同时在跑的。 */
  const pending = []
  for (const p of plans) {
    const need = p.kept.filter((x) => !x.summary || !x.image).slice(0, PER_SOURCE_DETAIL_LIMIT)
    p.needCount = need.length
    for (const x of need) pending.push(x)
  }
  const enriched = new Map()
  if (pending.length) {
    await pool(pending, 4, async (x) => {
      const out = await enrich(x, x.__col)
      enriched.set(x.url, out)
    })
  }

  // ⑤ 归一化 + 汇总来源状态
  const items = []
  const sources = []
  for (const { sourceId, bucket, kept } of plans) {
    const src = SOURCES[sourceId]
    const normalized = kept.map((x) => normalize(enriched.get(x.url) || x, x.__col))
    items.push(...normalized)

    sources.push({
      id: sourceId,
      name: src.name,
      site: src.site,
      note: src.note,
      ok: bucket.okCols.length > 0,
      columns: bucket.okCols,
      failedColumns: bucket.badCols,
      count: normalized.length,
      withSummary: normalized.filter((i) => i.summary).length,
      // 该来源实际命中的最新日期（给界面显示「最新到 X」）
      latest: normalized.map((i) => i.publishDate).filter(Boolean).sort().pop() || null,
    })

    state.sourceState.set(sourceId, {
      ok: bucket.okCols.length > 0,
      error: bucket.okCols.length ? null : bucket.badCols.join(' / '),
      count: normalized.length,
      latest: sources[sources.length - 1].latest,
      lastOkAt: bucket.okCols.length ? Date.now() : state.sourceState.get(sourceId)?.lastOkAt || null,
    })
  }

  // ⑥ 去重（同一篇文可能同时出现在同站的多个栏目里）
  const merged = new Map()
  for (const it of items) {
    const k = canon(it.sourceUrl)
    const prev = merged.get(k)
    if (!prev) {
      merged.set(k, it)
      continue
    }
    prev.categories = [...new Set([...prev.categories, ...it.categories])]
    prev.tags = [...new Set([...prev.tags, ...it.tags])]
    prev.topicLabels = [...new Set([...prev.topicLabels, ...it.topicLabels])]
    prev.summary = prev.summary || it.summary
    prev.image = prev.image || it.image
  }

  // ⑦ 按发布时间从新到旧（没日期的排最后），TECH 直接就是最终顺序
  const all = [...merged.values()].sort((a, b) => {
    const da = a.publishDate || ''
    const db = b.publishDate || ''
    if (da === db) return a.source.localeCompare(b.source)
    if (!da) return 1
    if (!db) return -1
    return db.localeCompare(da)
  })

  const feed = {
    updatedAt: Date.now(),
    expiresAt: Date.now() + TTL_MS,
    tookMs: Date.now() - t0,
    items: all,
    sources: sources.sort((a, b) => Object.keys(SOURCES).indexOf(a.id) - Object.keys(SOURCES).indexOf(b.id)),
    counts: {
      total: all.length,
      bySource: Object.fromEntries(sources.map((s) => [s.id, s.count])),
      byCategory: Object.fromEntries(
        ['photon', 'foundry', 'cortex', 'blueyard', 'tech'].map((c) => [
          c,
          all.filter((i) => i.categories.includes(c)).length,
        ]),
      ),
    },
  }
  return feed
}

/* ─────────────────────── 对外接口 ─────────────────────── */

/** 起一个后台刷新（同一时刻只允许一个） */
function startRefresh() {
  if (state.refreshing) return state.refreshing
  state.refreshing = doRefresh()
    .then((feed) => {
      state.feed = feed
      state.updatedAt = feed.updatedAt
      saveSnapshot(feed)
      return feed
    })
    .finally(() => {
      state.refreshing = null
    })
  return state.refreshing
}

/**
 * 取聚合结果。
 * @param {{force?:boolean}} opts force=true 时强制刷新（界面的「重新加载」）
 * @returns {Promise<{feed:object, fromCache:boolean, snapshot:boolean, refreshing:boolean}>}
 */
export async function getFeed(opts = {}) {
  const fresh = state.feed && state.feed.expiresAt > Date.now()

  if (fresh && !opts.force) {
    return { feed: state.feed, fromCache: true, snapshot: false, refreshing: false }
  }

  if (state.refreshing && !opts.force) {
    // 别人已经在刷新 → 先把旧的给出去，不排队等
    if (state.feed) return { feed: state.feed, fromCache: true, snapshot: false, refreshing: true }
    const feed = await state.refreshing
    return { feed, fromCache: false, snapshot: false, refreshing: false }
  }

  if (!opts.force && state.feed) {
    // stale-while-revalidate：立刻返回旧数据，后台换新的
    startRefresh()
    return { feed: state.feed, fromCache: true, snapshot: false, refreshing: true }
  }

  /* 冷启动（服务刚起来 / 内存里还没数据）但磁盘上有「上一轮真抓到的快照」：
     立刻把快照给前端 —— 它同样是官方真实内容，只是抓取时间早一点，
     界面会明确标注「快照 · 抓取于 X」。同时后台开始真实刷新。
     ⚠️ 绝不伪造：快照里每一条都带官方 sourceUrl，点「查看原文」能对回官网。 */
  if (!opts.force && !state.feed) {
    const snap = loadSnapshot()
    if (snap?.items?.length) {
      startRefresh()
      return {
        feed: { ...snap, snapshot: true, stale: true },
        fromCache: true,
        snapshot: true,
        refreshing: true,
      }
    }
  }

  // 首次且没有快照 / 强制刷新：阻塞等待真实抓取
  try {
    const feed = await startRefresh()
    return { feed, fromCache: false, snapshot: false, refreshing: false }
  } catch (e) {
    // 实时抓取彻底失败（比如部署沙箱没有出网）→ 退回「真实数据快照」
    const snap = loadSnapshot()
    if (snap) {
      return {
        feed: { ...snap, offline: true, offlineReason: e.message || '实时抓取失败' },
        fromCache: true,
        snapshot: true,
        refreshing: false,
      }
    }
    throw e
  }
}

/** 供诊断接口用：每个来源最后一次的状态 */
export function getDiagnostics() {
  return {
    updatedAt: state.updatedAt || null,
    snapshotExists: fs.existsSync(SNAPSHOT_FILE),
    detailCached: state.detailCache.size,
    columns: COLUMNS.map((c) => ({ source: c.source, label: c.label, url: c.url, parser: c.parser })),
    sources: Object.values(SOURCES).map((s) => ({
      ...s,
      state: state.sourceState.get(s.id) || null,
    })),
  }
}
