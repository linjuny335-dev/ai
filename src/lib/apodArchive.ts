/* ============================================================================
 *  apodArchive.ts —— PHOTON 的「真实数据离线存档」
 * ----------------------------------------------------------------------------
 *  这里**不是**假数据，也不是 mock。
 *
 *  文件 public/apod-archive.json 里装的是某次真连 NASA 抓下来的**原始响应行**，
 *  由 _analysis/make-apod-archive.js 从真实响应生成。加载时走 apod.ts 里
 *  那个完全相同的 normalize()，所以存档条目和实时条目的字段结构一模一样。
 *
 *  它存在的唯一理由：
 *      NASA 的 DEMO_KEY 是全世界共用的 10 次/小时演示 Key，随时会被刷空；
 *      没配自己的 Key 时，官方接口一挂，页面就只剩一张失败卡 —— 那样栏目
 *      等于不可用。有了存档，接口挂了至少还能看到**最近的**真实天文图。
 *
 *  三条不可越界的规矩：
 *      ① 只在网络路径失败之后才加载它，而且 **失败时不写进实时缓存** ——
 *         存档和实时数据在存储上完全分开，不会互相污染。
 *      ② 界面上必须**明确标注**「正在展示 X 月 X 日抓取的存档」，绝不冒充实时，
 *         并且同时给出「重新加载」和「填入自己的 Key」两个出口。
 *      ③ 存档模式下日期游标与随机探索都**夹在存档区间内** ——
 *         宁可告诉用户「这一天存档里没有」，也不显示区间外的任何编造内容。
 * ========================================================================== */

import { ASSET_BASE } from './env'
import { assertUsable, normalize, type ApodItem } from './apod'
import { addDays, daysBetween } from './datetime'

const ARCHIVE_URL = `${ASSET_BASE}apod-archive.json`

/** 原始响应里我们用到的那几个字段（和 apod.ts 的 ApodRaw 一致） */
interface RawRow {
  date?: string
  title?: string
  explanation?: string
  media_type?: string
  url?: string
  hdurl?: string
  thumbnail_url?: string
  copyright?: string
}

interface ArchiveFile {
  capturedAt?: string
  source?: string
  note?: string
  windows?: { start?: string; end?: string; capturedAt?: string; items?: RawRow[] }[]
}

/** 给界面用的存档元信息 —— 标注文案全靠它 */
export interface ArchiveMeta {
  /** 抓取时刻（ISO），界面上要说「什么时候抓的」 */
  capturedAt: string
  source: string
  /** 存档覆盖的日期区间 */
  start: string
  end: string
  total: number
}

export interface ApodArchive {
  meta: ArchiveMeta
  /** 按日期升序，全部是真实条目 */
  items: ApodItem[]
  has: (date: string) => boolean
  get: (date: string) => ApodItem | null
  /** date 前后 ±radius 天（只返回存档里真有的） */
  span: (date: string, radius?: number) => ApodItem[]
  /** 存档里离 date 最近的一天（用于「你要的那天不在存档里」） */
  nearest: (date: string) => ApodItem | null
  /** 在存档里随机挑一天，保证不越界 */
  random: (exclude?: string) => ApodItem | null
  /** 把日期夹进存档区间 */
  clamp: (date: string) => string
  /** 最近的一天（默认落地页） */
  newest: ApodItem | null
}

/* ------------------------------------------------------------- 加载 */

let cache: ApodArchive | null = null
let inflight: Promise<ApodArchive | null> | null = null

function build(file: ArchiveFile): ApodArchive | null {
  const rows = (file.windows ?? []).flatMap((w) => w.items ?? [])
  if (!rows.length) return null

  // 逐行转换 + 校验：单行脏数据不该毁掉整份存档
  const byDate = new Map<string, ApodItem>()
  for (const raw of rows) {
    try {
      const item = assertUsable(normalize(raw))
      byDate.set(item.date, item)
    } catch {
      /* 跳过这一行 */
    }
  }
  if (!byDate.size) return null

  const items = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  const start = items[0].date
  const end = items[items.length - 1].date

  const meta: ArchiveMeta = {
    capturedAt: file.capturedAt ?? '',
    source: file.source ?? 'https://api.nasa.gov/planetary/apod',
    start,
    end,
    total: items.length,
  }

  const clamp = (date: string) => (date < start ? start : date > end ? end : date)

  const get = (date: string) => byDate.get(date) ?? null

  const nearest = (date: string) => {
    const clamped = clamp(date)
    const exact = byDate.get(clamped)
    if (exact) return exact
    // 存档里有空洞（理论上不会有，但抓取不完整时可能）→ 往两边找最近的一条
    for (let d = 1; d <= 400; d++) {
      const back = byDate.get(addDays(clamped, -d))
      if (back) return back
      const fwd = byDate.get(addDays(clamped, d))
      if (fwd) return fwd
    }
    return items[items.length - 1] ?? null
  }

  return {
    meta,
    items,
    has: (date) => byDate.has(date),
    get,
    span: (date, radius = 3) =>
      items.filter((it) => Math.abs(daysBetween(date, it.date)) <= radius),
    nearest,
    random: (exclude) => {
      if (items.length <= 1) return items[0] ?? null
      for (let i = 0; i < 12; i++) {
        const pick = items[Math.floor(Math.random() * items.length)]
        if (pick.date !== exclude) return pick
      }
      return items.find((it) => it.date !== exclude) ?? items[0]
    },
    clamp,
    newest: items[items.length - 1] ?? null,
  }
}

/**
 * 加载存档。永远不抛错 —— 拿不到就返回 null，交由调用方决定怎么显示失败。
 * 同一时刻只发一次请求，结果（包括「失败」）会被记住。
 */
export function loadApodArchive(): Promise<ApodArchive | null> {
  if (cache) return Promise.resolve(cache)
  if (inflight) return inflight

  inflight = (async () => {
    try {
      const res = await fetch(ARCHIVE_URL, { cache: 'no-cache' })
      if (!res.ok) return null
      const file = (await res.json()) as ArchiveFile
      cache = build(file)
      return cache
    } catch {
      return null
    } finally {
      inflight = null
    }
  })()

  return inflight
}

/** 已经加载好的存档（同步读，没加载过就是 null） */
export function loadedApodArchive(): ApodArchive | null {
  return cache
}
