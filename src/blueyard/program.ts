/* ============================================================================
 *  program.ts —— BLUEYARD「青年任务中心」的整理内容
 * ----------------------------------------------------------------------------
 *  ⚠️ 这个文件里的东西**不是接口取回来的，也不是公式算出来的**：
 *     是本站自己编写的科普任务、知识题与星图坐标。所以界面上必须打
 *     「本站整理」的标签，不能和 PHOTON / FOUNDRY / TECH 的官方数据、
 *     也不能和 sky.ts 的公式推算混为一谈。
 *
 *  内容分三块：
 *    ① MISSIONS    七个观星任务 —— 每个对应北斗七星里的一颗
 *    ② STAR_MAP    北斗七星的真实赤经赤纬（投影成星图坐标）+ 连线
 *    ③ QUIZ        六道知识题 —— 答案都能在站内其它栏目里找到依据
 *
 *  星图坐标不是随手画的：见 STAR_MAP 里每颗星的 ra / dec，是公开星表的
 *  近似值，再由 project() 做等距圆柱投影（北在上、赤经向东在左，和
 *  常规星图一致）。所以画出来的形状就是天上那个「斗」。
 * ========================================================================== */

/* ─────────────────────────── ① 观星任务 ─────────────────────────── */

export interface Mission {
  id: string
  /** 任务名 */
  name: string
  /** 对应北斗七星的哪一颗 */
  star: string
  /** 一句话说清要做什么 */
  goal: string
  /** 具体怎么做 —— 给「今晚就能动手」的步骤 */
  how: string
  /** 难度 1~3 */
  level: 1 | 2 | 3
}

export const MISSIONS: Mission[] = [
  {
    id: 'dipper',
    name: '认出北斗七星',
    star: '天枢',
    goal: '在夜空中找出那个「勺子」。',
    how: '先找北方天空最亮的七颗成组星。斗口四颗、斗柄三颗 —— 记住它是倒扣的勺子，季节不同会转方向。',
    level: 1,
  },
  {
    id: 'polaris',
    name: '用斗口找到北极星',
    star: '天璇',
    goal: '把「指极星」用一次，找到正北。',
    how: '把斗口外侧的天璇与天枢连成一条线，朝斗口方向延长大约五倍，尽头那颗不太亮的星就是北极星。',
    level: 1,
  },
  {
    id: 'three',
    name: '肉眼认下三个星座',
    star: '天玑',
    goal: '不靠手机，自己认出三个星座。',
    how: '先拿最好认的开刀：夏夜的夏季大三角、冬夜的猎户座腰带三星。认下来之后画在纸上，比拍照管用。',
    level: 1,
  },
  {
    id: 'moon',
    name: '拍下一张月面',
    star: '天权',
    goal: '用手机拍出能看清环形山的月亮。',
    how: '挑上弦或下弦前后，明暗交界处阴影最长。手机贴着望远镜目镜拍，或者直接用长焦 + 手动降曝光，别用自动。',
    level: 2,
  },
  {
    id: 'satellite',
    name: '记录一次过境',
    star: '玉衡',
    goal: '看到一个会移动的「星」。',
    how: '找一个光污染少的位置，等天亮前或天黑后两三小时。人造卫星是匀速直线移动的亮点，几十秒穿过天空，不闪。',
    level: 2,
  },
  {
    id: 'milkyway',
    name: '看一次银河',
    star: '开阳',
    goal: '亲眼看到银河，而不是照片里的。',
    how: '离开城市至少三十公里，避开农历十五前后。肉眼先适应二十分钟暗环境再看，银河是「淡淡的一条雾」。',
    level: 3,
  },
  {
    id: 'deepsky',
    name: '看一次深空天体',
    star: '摇光',
    goal: '用双筒望远镜看到星团或木星的卫星。',
    how: '双筒望远镜就能看到昴星团、猎户座大星云，以及木星旁边排成一线的四颗伽利略卫星 —— 每晚位置都不同。',
    level: 3,
  },
]

/** 任务难度的中文说法 */
export const LEVEL_TEXT: Record<1 | 2 | 3, string> = {
  1: '入门 · 肉眼就行',
  2: '进阶 · 需要一点装备',
  3: '挑战 · 要跑到暗的地方',
}

/* ─────────────────────────── ② 北斗七星星图 ───────────────────────────
 *  ra  = 赤经（小时），dec = 赤纬（度），均取公开星表的近似值。
 *  投影：x 向右为西（赤经增大在左，与常规星图一致），y 向上为北。
 * ──────────────────────────────────────────────────────────────────── */

export interface DipperStar {
  /** 任务 id —— 做完那个任务，这颗星就亮 */
  id: string
  /** 中文星名 */
  cn: string
  /** 西名 */
  en: string
  /** 视星等（越小越亮） */
  mag: number
  ra: number
  dec: number
  /** 投影后的星图坐标（由 project() 算出，见文件末尾） */
  x: number
  y: number
}

const RAW: Omit<DipperStar, 'x' | 'y'>[] = [
  { id: 'dipper', cn: '天枢', en: 'Dubhe', mag: 1.79, ra: 11.062, dec: 61.75 },
  { id: 'polaris', cn: '天璇', en: 'Merak', mag: 2.37, ra: 11.03, dec: 56.38 },
  { id: 'three', cn: '天玑', en: 'Phecda', mag: 2.44, ra: 11.897, dec: 53.69 },
  { id: 'moon', cn: '天权', en: 'Megrez', mag: 3.31, ra: 12.257, dec: 57.03 },
  { id: 'satellite', cn: '玉衡', en: 'Alioth', mag: 1.77, ra: 12.9, dec: 55.96 },
  { id: 'milkyway', cn: '开阳', en: 'Mizar', mag: 2.23, ra: 13.398, dec: 54.93 },
  { id: 'deepsky', cn: '摇光', en: 'Alkaid', mag: 1.86, ra: 13.792, dec: 49.31 },
]

/** 等距圆柱投影：赤经向东在左、赤纬向北在上（常规星图的画法） */
function project(ra: number, dec: number): { x: number; y: number } {
  const X0 = 12 // 投影中心赤经（小时）
  const Y0 = 57 // 投影中心赤纬（度）
  const K = 15 * Math.cos((Y0 * Math.PI) / 180) // 赤经一小时折成多少度
  return { x: -(ra - X0) * K, y: -(dec - Y0) }
}

export const DIPPER_STARS: DipperStar[] = RAW.map((s) => ({ ...s, ...project(s.ra, s.dec) }))

/** 连线：斗口四边形 + 斗柄三段（索引对应 DIPPER_STARS） */
export const DIPPER_LINES: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 0],
  [3, 4],
  [4, 5],
  [5, 6],
]

/** 星图画布范围（含给指极星方向留出的上方空间） */
export const DIPPER_VIEW = { x: -18.5, y: -13, w: 29, h: 24 }

/**
 * 「指极星延长线」：从天璇(1) 过天枢(0) 往外指，尽头就是北极星的方向。
 * 只画到画布上边附近，不是真的把北极星画出来 —— 它离北斗还有约 28°。
 * 标签放在延长线**左侧**，免得压到这条近乎垂直的虚线。
 */
export const POLARIS_RAY = (() => {
  const a = DIPPER_STARS[1]
  const b = DIPPER_STARS[0]
  const dx = b.x - a.x
  const dy = b.y - a.y
  const t = (-11.6 - b.y) / dy
  const x2 = b.x + dx * t
  return { x1: b.x, y1: b.y, x2, y2: -11.6, lx: x2 - 1.1, ly: -10.5 }
})()

/* ─────────────────────────── ③ 知识挑战 ─────────────────────────── */

export interface QuizOption {
  /** 选项文字 */
  text: string
  /** 是不是正确答案 */
  ok?: boolean
}

export interface QuizItem {
  id: string
  question: string
  options: QuizOption[]
  /** 答完给出的解析 */
  why: string
  /** 站内可以在哪儿验证这件事 */
  where: string
}

export const QUIZ: QuizItem[] = [
  {
    id: 'q1',
    question: '恒星的颜色是由什么决定的？',
    options: [
      { text: '温度' , ok: true },
      { text: '年龄' },
      { text: '离我们的远近' },
      { text: '自转快慢' },
    ],
    why: '恒星发的是热辐射，温度越高，辐射峰值波长越短 —— 所以高温星偏蓝，低温星偏红。',
    where: '去 03 CORTEX 的恒星光谱台拖一下温度滑杆，颜色和峰值波长会跟着变。',
  },
  {
    id: 'q2',
    question: '太阳表面的温度大约是多少？',
    options: [
      { text: '约 3000 K' },
      { text: '约 5800 K', ok: true },
      { text: '约 15000 K' },
      { text: '约 100 万 K' },
    ],
    why: '太阳有效温度约 5772 K，峰值波长约 500 纳米，落在可见光的蓝绿到绿之间 —— 所以太阳看着是白的。',
    where: '03 CORTEX 的光谱台里，太阳预设就是 5772 K / 1 个太阳半径。',
  },
  {
    id: 'q3',
    question: '行星离太阳越远，绕一圈需要的时间会怎样？',
    options: [
      { text: '越长，而且长得比距离快得多', ok: true },
      { text: '越长，但和距离成正比' },
      { text: '基本不变' },
      { text: '越短' },
    ],
    why: '开普勒第三定律：周期平方正比于轨道半长轴的立方。海王星离太阳约 30 倍地球距离，一圈要走约 165 年。',
    where: '03 CORTEX 的行星轨道台会同时给出公转周期与轨道速度。',
  },
  {
    id: 'q4',
    question: '想看清月面的环形山，最好挑什么时候看？',
    options: [
      { text: '满月那晚' },
      { text: '上弦或下弦前后', ok: true },
      { text: '新月那晚' },
      { text: '随便哪天都一样' },
    ],
    why: '满月时阳光几乎直射月面，没有影子，地形反而是「平的」。上弦、下弦时明暗交界线横过月面，阴影最长，地形最立体。',
    where: '本页上面的「今晚值班台」会告诉你今晚月亮被照亮了多少。',
  },
  {
    id: 'q5',
    question: '流星雨是怎么形成的？',
    options: [
      { text: '彗星等天体留下的尘埃带，地球每年穿过一次', ok: true },
      { text: '大气层自己摩擦发光' },
      { text: '恒星爆炸抛出的碎片' },
      { text: '人造卫星坠落' },
    ],
    why: '流星体是彗星（个别是小行星）沿轨道撒下的碎屑。地球每年在同一时间经过同一片尘埃带，所以流星雨「每年按时来」。',
    where: '本页「天象日历」里的流星雨都标了母体天体。',
  },
  {
    id: 'q6',
    question: '北斗七星的斗柄朝向可以用来判断什么？',
    options: [
      { text: '季节', ok: true },
      { text: '当天天气' },
      { text: '经纬度' },
      { text: '潮汐时间' },
    ],
    why: '古人用「斗柄东指，天下皆春」描述季节：斗柄天黑后的朝向随季节转一圈，这是最古老的天然日历之一。',
    where: '看完这颗星图之后，隔几个月再来看看斗柄转到哪儿了。',
  },
]

/* ─────────────────── 存盘（任务进度）─────────────────── */

/** localStorage 键 —— 只存本地，不上传，也不代表任何机构认定 */
export const PROGRESS_KEY = 'blueyard.missions.v1'

export function loadDone(): string[] {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const ids = new Set(MISSIONS.map((m) => m.id))
    return parsed.filter((x): x is string => typeof x === 'string' && ids.has(x))
  } catch {
    // 隐私模式下 localStorage 会直接抛 —— 那就当没存过，不要因此白屏
    return []
  }
}

export function saveDone(ids: string[]): void {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(ids))
  } catch {
    /* 存不了就算了，界面上照样能用，只是关掉页面就忘 */
  }
}
