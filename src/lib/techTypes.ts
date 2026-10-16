/* ============================================================================
 *  techTypes.ts —— 三个数据源共用的领域模型
 * ----------------------------------------------------------------------------
 *  设计要点：界面只认识 TechItem，不认识 HN / GitHub / HF 的原始字段。
 *  每个数据源在自己文件里把响应「翻译」成 TechItem[]，翻译完就与来源无关了。
 *  这样加第四个源（比如 arXiv / Product Hunt）只需要再写一个 adapter，
 *  卡片、列表、搜索、自动刷新一行都不用改。
 * ========================================================================== */

export type SourceId = 'hn' | 'github' | 'hf'

/** 指标语义 —— 界面靠它选图标，而不是靠猜字段名 */
export type MetricKind =
  | 'score' // HN 热度
  | 'comments' // HN 评论数
  | 'stars' // GitHub star
  | 'forks' // GitHub fork
  | 'likes' // HF 点赞
  | 'downloads' // HF 下载量
  | 'text' // 纯文本（语言 / 任务类型）

export interface TechMetric {
  kind: MetricKind
  /** 已经格式化好的展示值，比如 '1.3k' / 'Python' */
  value: string
  /**
   * 值的语义后缀，比如 'comments' / 'forks' / 'downloads'。
   * 不填就只显示数字 —— 纯文本类指标（语言 / 任务）不需要后缀。
   */
  label?: string
}

/**
 * 一条内容。三个源的差异被压到「指标 + 副信息」两处，
 * 其余字段语义完全一致，所以卡片只需要一套布局。
 */
export interface TechItem {
  /** 全局唯一，用作 React key（形如 'github:owner/repo'） */
  key: string
  source: SourceId
  title: string
  /** 一句话简介。HN 没有，GitHub / HF 有 */
  description?: string
  /** 归属者：HN 作者 / GitHub owner / HF 组织 */
  owner: string
  /** 右上角的主指标（HN=score，GitHub=stars，HF=likes） */
  primary: TechMetric
  /** meta 行上的次要指标（评论数 / fork / 下载量 …） */
  secondary: TechMetric[]
  /** 点卡片跳去哪儿 */
  url: string
  /** 另有讨论页时给它（HN 专用），footer 上会多一个可以点的「Discuss」 */
  discussUrl?: string
  /** footer 左侧的副信息：域名 / 仓库全名 / 模型全名 */
  footLabel?: string
  /** 时间戳 ms。缺失就不显示时间 */
  createdAt?: number
  /** 标签：语言 / task / topics / license */
  tags: string[]
  /** 语言色点（GitHub 用），没有就不画 */
  dot?: string
}

/** 一个 feed = 一个接口查询 + 一个选项卡 */
export interface FeedDef {
  id: string
  /** 选项卡文字（英文大写，与现有界面一致） */
  label: string
  /** 鼠标悬停时的中文说明 */
  hint: string
  /** 取数实现。必须尊重 signal：切换数据源时旧请求要立刻作废 */
  load(limit: number, signal?: AbortSignal): Promise<TechItem[]>
}

/** 一个数据源 = 若干 feed + 展示信息 */
export interface SourceDef {
  id: SourceId
  /** 全名，用于 footer 署名 */
  label: string
  /** 选项卡上的短名 */
  short: string
  /** 选项卡图标（单字符，monospace 友好） */
  icon: string
  /** 该源的强调色，只用在来源徽标与色点上，不抢主题色 */
  accent: string
  /** 官网，footer 里可点 */
  home: string
  feeds: FeedDef[]
}
