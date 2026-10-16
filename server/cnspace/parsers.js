/* ============================================================================
 *  cnspace/parsers.js —— 把四个官网的列表页 / 详情页解析成统一字段
 * ----------------------------------------------------------------------------
 *  四个站是四套不同的 CMS 模板，所以「一列一套解析规则」。规则全部来自
 *  2026-09-17 对真实页面的勘察（不是猜的），每个解析器上面都贴了对应的
 *  HTML 片段，将来页面改版时照着片段改即可。
 *
 *  统一输出（列表项）：
 *    { title, date, url, summary|null, image|null, summaryFrom }
 *  summary / image 列表页没有时留在详情页解析里补（见 parseDetail）。
 * ========================================================================== */

import { absUrl, clip, findDate, httpUrl, parseDate, stripTags } from './text.js'

/* ───────────────────────── 通用小工具 ───────────────────────── */

/** 去掉全角的空格/制表，用于比对标题 */
const norm = (s) => stripTags(s).replace(/\u3000/g, ' ').replace(/\s+/g, ' ').trim()

/** 去掉 <script> / <style> / <noscript> / 注释 / <select> / iframe
 *  ⚠️ 必须做：CMSE 详情页把一整段 jQuery 代码写在 <script> 里，里面有中文注释，
 *     不剥掉就会被当成「段落」抓成摘要（踩过：摘要变成 `"); htm=htm.replace(...`）。
 *     <select> 里是导航下拉框（一长串栏目名），也会污染标题/摘要。 */
export function stripNoise(html) {
  return String(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<select\b[^>]*>[\s\S]*?<\/select>/gi, ' ')
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
}

/** 这串文字像不像「导航/栏目名堆叠」而不是一条新闻标题？
 *  真标题不会同时出现 3 个以上栏目名，也不会长到 60 字以上。
 *  用来挡掉从页头/页脚 <a> 里误抓的整块导航（踩过：CMSE 研制进展页的页脚导航）。 */
const NAV_WORDS =
  /(?:邮箱|English|新闻中心|关于工程|工程简介|系统组成|组织管理|工程文化|知识产权|官方公告|飞行任务|空间科学|国际合作|环球视野|专题报道|新闻发布会|科普教育|天宫课堂|科普活动|太空课堂|航天知识|多媒体|天宫TV|出版物|版权说明|互动交流|在线留言|直播|联系我们|网站地图|返回顶部|当前位置)/g

export function looksLikeNav(text) {
  const t = String(text || '')
  if (t.length > 60) return true
  const hits = t.match(NAV_WORDS)
  return !!hits && hits.length >= 3
}

/** 在 html 里按标签名遍历，回调能拿到整段标签 */
function eachTag(html, name, cb) {
  const re = new RegExp(`<${name}\\b[^>]*>`, 'gi')
  let m
  while ((m = re.exec(html))) {
    const tag = m[0]
    const end = tag.length > 2 && !/\/>$/.test(tag) ? html.indexOf(`</${name}>`, m.index) : m.index
    cb({ tag, index: m.index, inner: end > 0 ? html.slice(m.index + tag.length, end) : '' })
  }
}

/** 从标签属性里取 href / src / title */
function attr(tag, name) {
  const m = new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i').exec(tag) || new RegExp(`${name}\\s*=\\s*'([^']*)'`, 'i').exec(tag)
  return m ? m[1] : null
}

/** 从一段 HTML 里找第一个「像正文配图」的图，返回绝对 URL */
const IMG_TEMPLATE_RE =
  /\/(?:template|dbsource|images|ndw)\//i
const IMG_JUNK_RE =
  /logo|icon|banner|qrcode|erweima|youjian|indexImg|blank|spacer|share|weixin|weibo|arrow|btn_|twt-/i

export function pickImage(html, pageUrl, { preferWidth = 240 } = {}) {
  const cands = []
  eachTag(html, 'img', ({ tag }) => {
    const src = attr(tag, 'src')
    if (!src) return
    const abs = httpUrl(absUrl(src, pageUrl))
    if (!abs) return
    if (IMG_TEMPLATE_RE.test(src) || IMG_JUNK_RE.test(src)) return
    const w = Number(attr(tag, 'width')) || 0
    cands.push({ abs, w })
  })
  if (!cands.length) return null
  // 有明确宽度的优先（正文大图一般会写 width），再看宽度够不够
  const big = cands.filter((c) => c.w >= preferWidth)
  return (big[0] || cands[0]).abs
}

/** 正文首段：跳过导航/版权/分享那类样板段 */
const BOILER_RE =
  /^(上一篇|下一篇|来源[:：]|分享到|打印|关闭|关于我们|版权所有|友情链接|返回顶部|责任编辑|扫一扫|网站地图|京ICP)/
const CN_RE = /[\u4e00-\u9fa5]/g

export function pickSummary(rawHtml, pageUrl, { min = 24, max = 130 } = {}) {
  const html = stripNoise(rawHtml) // ← 先剥 script/style/select，否则脚本里的中文会被当段落
  /* 先试「文章体」容器，再兜底整页。
     ⚠️ 容器关键词里**故意没有 content** —— 很多站的导航类名就叫 nav-content /
     content-nav，一匹配就把范围切到页头，导致整段摘要抓不到（踩过：
     NAOC 14 条全都没摘要）。所以只认足够具体的名字。 */
  const scopes = []
  const re =
    /<div[^>]+(?:class|id)\s*=\s*["'][^"']*(?:TRS_Editor|articleContent|article_content|article-content|content_box|zoom|detail_content|mainText|article)[^"']*["'][^>]*>/gi
  let m
  while ((m = re.exec(html)) && scopes.length < 4) scopes.push(html.slice(m.index, m.index + 300000))
  scopes.push(html) // 兜底：整页（正文段落依然会被下面的规则筛出来）

  for (const scope of scopes) {
    const s = bestParagraph(scope, min, max)
    if (s) return s
  }
  return null
}

/** 从一段 HTML 里挑「最像导语」的段落
 *  ⚠️ 优先取**第一段**：政务/科研稿的第一段就是标准导语（时间地点+做了什么+结果）。
 *     只有当第一段太短（一句话小标题那种）时，才退而取前三段里最长的。 */
function bestParagraph(html, min, max) {
  const paras = []
  eachTag(html, 'p', ({ inner }) => {
    const t = norm(inner)
    if (!t) return
    if ((t.match(CN_RE) || []).length < min) return
    if (BOILER_RE.test(t)) return
    if (looksLikeNav(t)) return
    if (paras.length < 40) paras.push(t)
  })
  if (!paras.length) return null
  let chosen = paras[0]
  if (chosen.length < 60) {
    const head = paras.slice(0, 3)
    const longest = head.reduce((a, b) => (b.length > a.length ? b : a), head[0])
    if (longest.length > chosen.length * 1.4) chosen = longest
  }
  return clip(chosen, max)
}

/** 详情页统一解析入口 */
export function parseDetail(html, pageUrl, fallbackDate) {
  const clean = stripNoise(html)
  return {
    summary: pickSummary(clean, pageUrl),
    image: pickImage(clean, pageUrl),
    date: findDate(stripTags(clean.slice(0, 3000))) || fallbackDate || null,
  }
}

/* ─────────────────── ②b CMSE 卡片式列表（天宫课堂 · 要点新闻） ───────────────────
 *  这是 CMSE 的**第二套模板**（带图文卡片，字段比 pc_none 那套更全）：
 *    <ul class="img-list">
 *      <li><a href="../../xwzx/202210/t20221030_51154.html" target="_blank" title="解码梦天（一）…">
 *            <div class="img-cont left"><img src="../../xwzx/202210/W0202…jpg" alt="" /></div>
 *            <div class="text-cont right">
 *              <h4>解码梦天（一）｜空间站舱段专属“座驾”有多强？</h4>
 *              <p>梦天实验舱发射在即…</p>
 *              <div class="time">2022-10-28</div>
 *            </div>
 *          </a></li>
 *  ★ 日期 / 摘要 / 配图都在列表页 → 不需要抓详情页。
 * ───────────────────────────────────────────────────────────────────────────── */
export function parseCmseCard(rawHtml, pageUrl) {
  const items = []
  const html = stripNoise(rawHtml)
  eachTag(html, 'a', ({ tag, index, inner }) => {
    const href = attr(tag, 'href')
    if (!href || !/\/t20\d{6}_\d+\.html/i.test(href)) return // 只认文章页
    const url = httpUrl(absUrl(href, pageUrl))
    if (!url) return

    const h4 = /<h4[^>]*>([\s\S]*?)<\/h4>/i.exec(inner)
    const title = norm(h4 ? h4[1] : attr(tag, 'title') || '')
    if (!title || title.length < 5 || looksLikeNav(title)) return

    const p = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(inner)
    const tm = /class\s*=\s*["'][^"']*time[^"']*["'][^>]*>([\s\S]*?)<\/div>/i.exec(inner)
    const img = /<img\b[^>]*src\s*=\s*["']([^"']+)["']/i.exec(inner)

    items.push({
      title,
      date: parseDate(tm ? tm[1] : ''),
      url,
      summary: p ? clip(norm(p[1]), 130) : null,
      image: img ? httpUrl(absUrl(img[1], pageUrl)) : null,
      summaryFrom: p ? 'list' : null,
    })
  })
  return items
}

/* ─────────────────── ②c CMSE 多媒体列表（天宫TV / 视频） ───────────────────
 *  这是 CMSE 的**第三套模板**（图 + 标题，列表页**不带日期**）：
 *    <ul id="list" page="1">
 *      <li><a href="../dhhsp/202608/t20260814_57739.html" target="_blank">
 *            <i></i>
 *            <img src="../dhhsp/202608/W020260814624731555795.png" />
 *            <div class="title">天宫TV丨天宫俯瞰，山河尽览 </div>
 *          </a></li>
 *
 *  ⚠️ 日期从**官方 URL**里取：`t20260814_57739` = 2026-08-14。
 *     这是官方自己给的日期编码，不是我们猜的，也不是编的。
 * ───────────────────────────────────────────────────────────────────────── */
export function parseCmseMedia(rawHtml, pageUrl) {
  const items = []
  const html = stripNoise(rawHtml)
  eachTag(html, 'a', ({ tag, inner }) => {
    const href = attr(tag, 'href')
    if (!href || !/\/t20\d{6}_\d+\.html/i.test(href)) return
    const url = httpUrl(absUrl(href, pageUrl))
    if (!url) return

    const t = /<div[^>]*class\s*=\s*["'][^"']*\btitle\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i.exec(inner)
    const title = norm(t ? t[1] : '')
    if (!title || title.length < 4 || looksLikeNav(title)) return

    const d = /t(20\d{2})(\d{2})(\d{2})_\d+\.html/i.exec(url)
    const img = /<img\b[^>]*src\s*=\s*["']([^"']+)["']/i.exec(inner)

    items.push({
      title,
      date: d ? `${d[1]}-${d[2]}-${d[3]}` : null,
      url,
      summary: null,
      image: img ? httpUrl(absUrl(img[1], pageUrl)) : null,
      summaryFrom: null,
    })
  })
  return items
}

/* ───────────────────────── 解析器注册表 ─────────────────────────
 *  columns.js 里用 parser 字段引用这里的键名。
 * ─────────────────────────────────────────────────────────────── */
export const LIST_PARSERS = {
  'cnsa-list': parseCnsaList,
  'cmse-list': parseCmseList,
  'cmse-card': parseCmseCard,
  'cmse-media': parseCmseMedia,
  'naoc-list': parseNaocList,
  'casc-list': parseCascList,
}

/* ───────────────────────── ① CNSA 国家航天局 ─────────────────────────
 *  列表页片段（要闻动态 / 航天知识 同一套模板）：
 *    <li class="cont_list_li clearfloat">
 *      <a href= "../../n6758823/n6758838/c10774260/content.html" target="_blank" title="一箭十星…">
 *        <img src="../../n6758823/n6758838/c10774260/pic_10774260.png">
 *        <div class="ejlist_contR">
 *          <div class="ejlist_cont_tit pc">一箭十星…<span class="ejlist_cont_tit_rq">2026-09-16</span></div>
 *          <div class="ejlist_cont_tit m">…</div>
 *          <div class="ejlist_cont_wz pc">9月15日14时26分…</div>
 *          <div class="ejlist_cont_wz m">…</div>
 *  ★ 这个模板列表页就带「日期 + 摘要 + 配图」，所以不需要再抓详情页。
 * ───────────────────────────────────────────────────────────────────── */
export function parseCnsaList(rawHtml, pageUrl) {
  const items = []
  const html = stripNoise(rawHtml)
  const blocks = html.split(/<li[^>]+class\s*=\s*["'][^"']*cont_list_li/i).slice(1)
  for (const raw of blocks) {
    const block = raw.slice(0, 4000)
    const aTag = /<a\b[^>]*>/i.exec(block)
    if (!aTag) continue
    const url = httpUrl(absUrl(attr(aTag[0], 'href'), pageUrl))
    if (!url) continue

    // 标题优先取 title 属性（完整），否则取 .pc 标题去掉日期 span
    let title = norm(attr(aTag[0], 'title'))
    if (!title) {
      const t = /class\s*=\s*["'][^"']*ejlist_cont_tit[^"']*pc[^"']*["'][^>]*>([\s\S]*?)<\/div>/i.exec(block)
      title = norm(t ? t[1] : block.slice(0, 300))
    }
    if (!title || title.length < 6) continue
    if (looksLikeNav(title)) continue

    const d = /class\s*=\s*["'][^"']*ejlist_cont_tit_rq[^"']*["'][^>]*>([\s\S]*?)<\/span>/i.exec(block)
    const date = parseDate(d ? d[1] : '')

    const w = /class\s*=\s*["'][^"']*ejlist_cont_wz[^"']*\bpc\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i.exec(block)
    const summary = w ? clip(norm(w[1]), 130) : null

    const img = /<img\b[^>]*src\s*=\s*["']([^"']+)["']/i.exec(block)
    const image = img ? httpUrl(absUrl(img[1], pageUrl)) : null

    items.push({ title, date, url, summary, image, summaryFrom: 'list' })
  }
  return items
}

/* ───────────────────────── ② CMSE 中国载人航天 ─────────────────────────
 *  列表页片段（综合新闻 / 研制进展 / 空间科学研究与应用 / 天宫课堂 同模板）：
 *    <li> <a href="../202608/t20260828_57758.html" target="_blank">神舟二十三号…</a>
 *         <span class="pc_none">2026-08-28</span> </li>
 *  ★ 只有标题 + 日期 + 链接 → 摘要与配图要抓详情页（当页 <p> + 正文图）。
 * ───────────────────────────────────────────────────────────────────── */
export function parseCmseList(html, pageUrl) {
  const items = []
  const clean = stripNoise(html) // 先剥 script/select，避免页脚导航被当成条目
  const re =
    /<li[^>]*>\s*<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>\s*<span[^>]*class\s*=\s*["'][^"']*pc_none[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi
  let m
  while ((m = re.exec(clean))) {
    // ⚠️ 只认文章页（tYYYYMMDD_N.html）。站内还有大量指向首页/栏目页/邮箱的 <a>，
    //    它们的标题是整块导航（踩过：一条 title 长达 200 字的“邮箱 English 新闻中心…”）。
    if (!/\/t20\d{6}_\d+\.html/i.test(m[1])) continue
    const url = httpUrl(absUrl(m[1], pageUrl))
    const title = norm(m[2])
    if (!url || !title || title.length < 6) continue
    if (looksLikeNav(title)) continue
    items.push({ title, date: parseDate(m[3]), url, summary: null, image: null, summaryFrom: null })
  }
  return items
}

/* ───────────────────────── ③ NAOC 国家天文台 ─────────────────────────
 *  列表页片段（科研动态 / 图片新闻 / 科普文章 同模板）：
 *    <li><div class="box-s h16 fix">
 *          <a href="./202609/t20260916_8283545.html" class="box-title" target="_blank">
 *            <span class="rich_media_title" id="activity-name">标题</span>   ← 科普文章才有内层 span
 *          </a>
 *          <span class="box-date">[2026-09-16]</span>
 *        </div></li>
 *  ⚠️ 科普文章那一栏的 href 大量指向 mp.weixin.qq.com（微信公众号原文），
 *     不是 nao.cas.cn 站内页 —— 这不是错误，官方栏目就是这么挂的。
 * ───────────────────────────────────────────────────────────────────── */
export function parseNaocList(rawHtml, pageUrl) {
  const items = []
  const html = stripNoise(rawHtml)
  eachTag(html, 'a', ({ tag, index, inner }) => {
    const cls = attr(tag, 'class') || ''
    if (!/\bbox-title\b/.test(cls)) return
    const href = attr(tag, 'href')
    const url = httpUrl(absUrl(href, pageUrl))
    const title = norm(inner)
    if (!url || !title || title.length < 5 || looksLikeNav(title)) return

    // 日期紧跟在这个 <a> 之后
    const after = html.slice(index + tag.length + inner.length, index + tag.length + inner.length + 900)
    const d = /class\s*=\s*["'][^"']*box-date[^"']*["'][^>]*>([\s\S]*?)<\/span>/i.exec(after)
    items.push({
      title,
      date: parseDate(d ? d[1] : ''),
      url,
      summary: null,
      image: null,
      summaryFrom: null,
    })
  })
  return items
}

/* ───────────────────────── ④ CASC 航天科技集团 ─────────────────────────
 *  列表页片段（集团要闻 / 一线新闻 / 航天科普子栏目 同模板）：
 *    <ul class="olist_list">
 *      <li><a href="../../n2014789/n2014804/c4707681/content.html" target="_blank">长征十二号…</a>
 *          <span>09-17</span></li>
 *  ⚠️ 日期只有「月-日」，没有年份 → parseDate 会按「不晚于今天」补年份。
 *  ★ 也缺摘要与配图 → 抓详情页。
 * ───────────────────────────────────────────────────────────────────── */
export function parseCascList(rawHtml, pageUrl) {
  const html = stripNoise(rawHtml)
  const lists = []
  eachTag(html, 'ul', ({ tag, index, inner }) => {
    if (!/class\s*=\s*["'][^"']*olist_list/i.test(tag)) return
    lists.push({ index, inner })
  })
  const scope = lists.length ? lists.map((l) => l.inner).join('\n') : html

  const items = []
  const re =
    /<li[^>]*>\s*<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>\s*<span[^>]*>([\s\S]*?)<\/span>/gi
  let m
  while ((m = re.exec(scope))) {
    const url = httpUrl(absUrl(m[1], pageUrl))
    const title = norm(m[2])
    if (!url || !title || title.length < 5 || looksLikeNav(title)) continue
    items.push({ title, date: parseDate(m[3]), url, summary: null, image: null, summaryFrom: null })
  }
  return items
}
