/* ============================================================================
 *  cnspace/text.js —— 纯文本工具（不依赖任何库）
 * ----------------------------------------------------------------------------
 *  这四个官网都是「老式静态页」：没有 API、没有 RSS、没有 JSON。
 *  所以只能取 HTML 再自己解析。这些函数就是解析的地基：
 *    · decodeHtml  按 <meta charset> 猜编码（gov.cn 有 GBK 页面）
 *    · stripTags   去标签 + 解实体 + 折空白
 *    · absUrl      相对路径 → 绝对 URL（这些站的 href 全是 ../../ 开头）
 *    · parseDate   统一成 YYYY-MM-DD；支持「09-17」这种只有月日的（CASC）
 *    · tagItem     给条目打中文主题标签（TECH 页的筛选就靠它）
 * ========================================================================== */

/** 从 Content-Type 或 HTML 头部猜编码 */
export function detectCharset(buf, contentType) {
  const head = buf.slice(0, 4096).toString('latin1')
  const m =
    /charset\s*=\s*["']?([\w-]+)/i.exec(contentType || '') ||
    /charset\s*=\s*["']?([\w-]+)/i.exec(head)
  let cs = (m ? m[1] : 'utf-8').toLowerCase()
  if (cs === 'gb2312' || cs === 'gbk' || cs === 'gb18030') cs = 'gb18030'
  if (cs === 'big5') cs = 'big5'
  return cs
}

/** 用正确编码把 Buffer 解成字符串；解码器不可用时退回 utf-8 */
export function decodeHtml(buf, contentType) {
  const cs = detectCharset(buf, contentType)
  try {
    return new TextDecoder(cs).decode(buf)
  } catch {
    return buf.toString('utf8')
  }
}

const ENTITIES = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  ldquo: '“',
  rdquo: '”',
  lsquo: '‘',
  rsquo: '’',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  middot: '·',
  times: '×',
  laquo: '«',
  raquo: '»',
}

export function decodeEntities(s) {
  return String(s || '')
    .replace(/&([a-z]+);/gi, (all, name) => {
      const k = name.toLowerCase()
      return k in ENTITIES ? ENTITIES[k] : all
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
}

/** 去标签、解实体、把连续空白折成一个空格 */
export function stripTags(s) {
  return decodeEntities(
    String(s || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]*>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim()
}

/** 相对路径 → 绝对 URL。这些站大量使用 ../../n123/c456/content.html */
export function absUrl(href, base) {
  if (!href) return null
  const h = decodeEntities(href).trim()
  if (/^(?:javascript:|#|mailto:)/i.test(h)) return null
  try {
    return new URL(h.replace(/^\/\//, 'https://'), base).href
  } catch {
    return null
  }
}

/** 只保留 http/https 且非空的 URL */
export function httpUrl(u) {
  return u && /^https?:\/\//i.test(u) ? u : null
}

const pad = (n) => String(n).padStart(2, '0')

/**
 * 解析日期。支持：
 *   2026-09-16 / 2026/9/16 / 2026年9月16日 / [2026-09-16] / 09-17（只有月日）
 * 只有月日时按「不晚于今天」补年份：若补完比今天晚 1 天以上，就退一年。
 */
export function parseDate(raw, today = new Date()) {
  const s = String(raw || '').replace(/[[\]（）()]/g, ' ').trim()
  if (!s) return null

  const full = /(\d{4})\s*[-/年.]\s*(\d{1,2})\s*[-/月.]\s*(\d{1,2})/.exec(s)
  if (full) {
    const [y, m, d] = [+full[1], +full[2], +full[3]]
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return `${y}-${pad(m)}-${pad(d)}`
    return null
  }

  const short = /(?:^|[^\d])(\d{1,2})\s*[-/月.]\s*(\d{1,2})(?:[^\d]|$)/.exec(s)
  if (short) {
    const m = +short[1]
    const d = +short[2]
    if (m < 1 || m > 12 || d < 1 || d > 31) return null
    let y = today.getFullYear()
    const candidate = new Date(y, m - 1, d)
    // 用 UTC 差一天容错（时区）
    if (candidate.getTime() - today.getTime() > 36 * 3600 * 1000) y -= 1
    return `${y}-${pad(m)}-${pad(d)}`
  }
  return null
}

/** 从文本里找一个可用的日期（详情页兜底） */
export function findDate(text, today = new Date()) {
  const m = /(\d{4})\s*[-/年.]\s*(\d{1,2})\s*[-/月.]\s*(\d{1,2})/.exec(String(text || ''))
  return m ? parseDate(m[0], today) : null
}

/* ─────────────────────────── 主题标签（TECH 筛选用） ───────────────────────────
 * 这不是「分类」，是给用户在 TECH 页筛选用的中文标签。
 * 一个条目可以同时命中多个标签（比如「长征十二号发射卫星」既是火箭也是卫星）。
 * 关键词表写宽一点没关系 —— 判错只会让筛选多一条，不会造成假数据。            */

const TOPICS = [
  {
    id: 'manned',
    label: '载人航天',
    re: /神舟|天舟|航天员|空间站|天宫|载人|出舱|交会对接|航天员乘组|梦天|问天|核心舱|微重力|舱外|飞船.*返回|返回舱/,
  },
  {
    id: 'deepspace',
    label: '深空探测',
    re: /嫦娥|探月|月壤|月球|天问|火星|祝融|深空|小行星|彗星|木星|金星|太阳系边界|星际|月背|鹊桥|玉兔|着陆器|巡视器/,
  },
  {
    id: 'astronomy',
    label: '天文发现',
    // ⚠️ 别写裸「太阳」—— 「太阳同步轨道」是火箭术语，会把发射新闻误判成天文发现。
    re: /天眼|FAST|射电|脉冲星|黑洞|星系|恒星|系外行星|宇宙|光谱|引力波|中微子|超新星|暗物质|星云|天文|观测|望远镜|太阳活动|太阳耀斑|太阳磁场|太阳风|太阳系|中子星|类星体|银道面|国际期刊|研究团队|科研/,
  },
  {
    id: 'rocket',
    label: '火箭',
    re: /火箭|长征|运载|发射|点火|起飞|整流罩|发动机|上面级|推力|一箭|复飞|入轨|发射场|转运|垂直/,
  },
  {
    id: 'satellite',
    label: '卫星',
    re: /卫星|遥感|北斗|导航|通信|组网|星座|极轨|低轨|载荷|对地观测|风云|高分/,
  },
  {
    id: 'science',
    label: '科学实验',
    re: /科学实验|实验|研究|载荷|生命科学|生物|材料|流体|物理|医学|育种|机理|探测|样品|团队|发现/,
  },
]

/** 返回命中的主题 id 列表（按 TOPICS 顺序） */
export function topicTags(...texts) {
  const hay = texts.filter(Boolean).join(' ')
  const hit = []
  for (const t of TOPICS) if (t.re.test(hay)) hit.push(t.id)
  return hit
}

export const TOPIC_LABEL = Object.fromEntries(TOPICS.map((t) => [t.id, t.label]))

/** 摘要裁剪：按字符数截断，尽量在标点处收尾 */
export function clip(text, max = 110) {
  const s = stripTags(text)
  if (s.length <= max) return s
  const cut = s.slice(0, max)
  const m = /^(.*)[，。；、,;！？!?]/s.exec(cut)
  const body = m && m[1].length >= max * 0.5 ? m[1] : cut
  return body + '…'
}

/** 稳定 id：来源 + 栏目 + 原文 URL 的短哈希（不用 crypto，保证跨环境一致） */
export function makeId(source, columnId, url) {
  let h = 2166136261
  for (let i = 0; i < url.length; i++) {
    h ^= url.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return `${source.toLowerCase()}-${columnId}-${(h >>> 0).toString(36)}`
}
