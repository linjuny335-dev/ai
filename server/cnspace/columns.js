/* ============================================================================
 *  cnspace/columns.js —— 四个官方来源 & 实际读取的栏目（唯一真源）
 * ----------------------------------------------------------------------------
 *  这张表就是「我们到底抓了哪些官方栏目」的答案。每个栏目都写了：
 *    · url        真实栏目页地址（2026-09-17 逐个人工核实过）
 *    · parser     用哪套解析规则（见 parsers.js）
 *    · categories 这个栏目的内容归到哪几个板块（photon/foundry/cortex/blueyard/tech）
 *    · tags       给 TECH 页筛选用的人工标签（关键词标签另外自动算）
 *    · needDetail 列表页缺摘要/配图 → 需要再抓一次详情页
 *
 *  ⚠️ 没有任何 mock / 示例数据。这里只声明「去哪个真实页面取」，
 *     取不到就整个来源报失败（见 store.js），绝不会拿编造内容顶上。
 * ========================================================================== */

export const SOURCES = {
  CNSA: {
    id: 'CNSA',
    name: '国家航天局',
    short: '国家航天局',
    site: 'https://www.cnsa.gov.cn/',
    note: '中国航天官方要闻与科普知识',
  },
  CMSE: {
    id: 'CMSE',
    name: '中国载人航天',
    short: '中国载人航天',
    site: 'https://www.cmse.gov.cn/',
    note: '载人航天工程官方新闻与空间科学',
  },
  NAOC: {
    id: 'NAOC',
    name: '中国科学院国家天文台',
    short: '国家天文台',
    site: 'https://nao.cas.cn/',
    note: '天文科研动态与科普',
  },
  CASC: {
    id: 'CASC',
    name: '中国航天科技集团',
    short: '中国航天科技集团',
    site: 'https://www.spacechina.com/n25/index.html',
    note: '集团要闻、火箭与航天器研制动态',
  },
}

/** 板块 id → 中文名（页面上的小标签用） */
export const CATEGORY_LABEL = {
  photon: 'PHOTON · 光',
  foundry: 'FOUNDRY · 器',
  cortex: 'CORTEX · 智',
  blueyard: 'BLUEYARD · 青年',
  tech: 'TECH · 实时',
}

export const COLUMNS = [
  /* ── 国家航天局 ───────────────────────────────────────────────── */
  {
    id: 'news',
    source: 'CNSA',
    label: '要闻动态',
    url: 'https://www.cnsa.gov.cn/n6758823/n6758838/index.html',
    parser: 'cnsa-list',
    categories: ['tech', 'foundry'],
    tags: ['航天动态'],
    needDetail: false, // 该模板列表页自带摘要与配图
  },
  {
    id: 'know',
    source: 'CNSA',
    label: '航天知识',
    url: 'https://www.cnsa.gov.cn/n6758968/n6758973/index.html',
    parser: 'cnsa-list',
    categories: ['tech', 'photon', 'blueyard'],
    tags: ['科普'],
    needDetail: false,
  },

  /* ── 中国载人航天工程 ─────────────────────────────────────────── */
  {
    id: 'zhxw',
    source: 'CMSE',
    label: '综合新闻',
    url: 'https://www.cmse.gov.cn/xwzx/zhxw/',
    parser: 'cmse-list',
    categories: ['tech', 'foundry'],
    tags: ['载人航天'],
    needDetail: true,
  },
  {
    id: 'yzjz',
    source: 'CMSE',
    label: '研制进展',
    url: 'https://www.cmse.gov.cn/xwzx/yzjz/',
    parser: 'cmse-list',
    categories: ['tech', 'foundry'],
    tags: ['工程研制'],
    needDetail: true,
  },
  {
    id: 'kjkx',
    source: 'CMSE',
    label: '空间科学研究与应用',
    url: 'https://www.cmse.gov.cn/kjkx/kjkxyjyyy/',
    parser: 'cmse-list',
    categories: ['tech', 'cortex'],
    tags: ['空间科学'],
    needDetail: true,
  },
  {
    id: 'kphd',
    source: 'CMSE',
    label: '科普教育 · 科普活动',
    url: 'https://www.cmse.gov.cn/kpjy/kphd/',
    parser: 'cmse-list',
    categories: ['tech', 'blueyard'],
    tags: ['青年科普'],
    needDetail: true,
  },
  {
    id: 'tgkt',
    source: 'CMSE',
    label: '科普教育 · 天宫课堂',
    // 栏目首页里第一块就是「要点新闻」图文卡片列表（这套模板列表页自带摘要+配图）
    url: 'https://www.cmse.gov.cn/kpjy/tgkt/',
    parser: 'cmse-card',
    categories: ['tech', 'blueyard'],
    tags: ['天宫课堂'],
    needDetail: false,
  },
  {
    id: 'tgtv',
    source: 'CMSE',
    label: '多媒体 · 天宫TV',
    // ⚠️ 这套模板列表页没有日期，日期从官方 URL 编码 tYYYYMMDD_ 里取
    url: 'https://www.cmse.gov.cn/dmt/tgtv/',
    parser: 'cmse-media',
    categories: ['tech', 'blueyard'],
    tags: ['多媒体', '青年科普'],
    needDetail: false,
  },

  /* ── 中国科学院国家天文台 ─────────────────────────────────────── */
  {
    id: 'ky',
    source: 'NAOC',
    label: '科研动态',
    url: 'https://nao.cas.cn/news/ky/',
    parser: 'naoc-list',
    categories: ['tech', 'photon', 'cortex'],
    tags: ['天文科研'],
    needDetail: true,
  },
  {
    id: 'gd',
    source: 'NAOC',
    label: '图片新闻',
    url: 'https://nao.cas.cn/news/gd/',
    parser: 'naoc-list',
    categories: ['tech', 'photon'],
    tags: ['天文观测'],
    needDetail: true,
  },
  {
    id: 'kpwz',
    source: 'NAOC',
    label: '科普文章',
    url: 'https://nao.cas.cn/ncb/kx/kpwz/',
    parser: 'naoc-list',
    categories: ['tech', 'photon', 'blueyard'],
    tags: ['天文科普'],
    // ⚠️ 该栏目的 href 多数指向 mp.weixin.qq.com（微信公众号原文），不是站内页。
    //    我们不抓公众号正文（那不属于本任务的公开网页范围），只用它的标题/日期/链接。
    needDetail: false,
  },

  /* ── 中国航天科技集团 ─────────────────────────────────────────── */
  {
    id: 'jtyw',
    source: 'CASC',
    label: '集团要闻',
    url: 'https://www.spacechina.com/n25/n2014789/n2014804/index.html',
    parser: 'casc-list',
    categories: ['tech', 'foundry'],
    tags: ['工程动态'],
    needDetail: true,
  },
  {
    id: 'yxxw',
    source: 'CASC',
    label: '一线新闻',
    url: 'https://www.spacechina.com/n25/n2014789/n2014809/index.html',
    parser: 'casc-list',
    categories: ['tech', 'foundry'],
    tags: ['工程动态'],
    needDetail: true,
  },
  {
    id: 'yzz',
    source: 'CASC',
    label: '航天科普 · 运载与发射',
    url: 'https://www.spacechina.com/n25/n148/n272/n4791/index.html',
    parser: 'casc-list',
    categories: ['tech', 'foundry'],
    tags: ['火箭科普'],
    needDetail: true,
  },
  {
    id: 'zrht',
    source: 'CASC',
    label: '航天科普 · 载人航天',
    url: 'https://www.spacechina.com/n25/n148/n272/n4793/index.html',
    parser: 'casc-list',
    categories: ['tech', 'photon', 'blueyard'],
    tags: ['航天科普'],
    needDetail: true,
  },
]

/* 每个来源最多留多少条（用户要求：第一版每个来源先取最近 5~10 条） */
export const PER_SOURCE_LIMIT = 10
/** 每个来源最多为多少条补抓详情页（列表页已有摘要的不算）
 *  ⚠️ 为什么要有上限：详情页 = 对官方站点多一次请求。一次刷新最多几十个请求，
 *     对官网友好；而且详情页有 7 天磁盘缓存，第二次刷新通常一条都不用抓。 */
export const PER_SOURCE_DETAIL_LIMIT = 8
/** 缓存 TTL：用户要求 30 分钟 ~ 2 小时更新一次 */
export const TTL_MS = 60 * 60 * 1000
/** 详情页缓存：文章基本不会变，long-lived */
export const DETAIL_TTL_MS = 7 * 24 * 60 * 60 * 1000
