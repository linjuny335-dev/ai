/* ============================================================================
 *  手势控制 · 内核（纯函数 + 可脱离 DOM 逐帧推进的状态机）
 * ----------------------------------------------------------------------------
 *  输入：MediaPipe HandLandmarker 每帧给出的 21 个手部关键点（归一化 0..1）
 *  输出：这一帧「要干什么」——
 *        · 光标画在哪（像素，已平滑）
 *        · 这一帧要不要点击（捏合的那一个下降沿）
 *        · 这一帧要不要切板块（左挥 / 右挥）
 *        · 银河该散开到什么程度（张开手掌 / 握拳，0..1 连续）
 *
 *  这个文件**不碰 DOM、不碰摄像头、不碰 MediaPipe**，所以能在 Node 里按 60fps
 *  逐帧喂合成关键点、逐条断言（见 _analysis/verify-gesture.js）。
 *  真正的渲染在 GestureControl.tsx，摄像头与推理在 handTracker.ts。
 *
 *  ⚠️ **所有可调数字都在 `tuning.ts`**（唯一真源）。下面那些 `export const` 只是
 *     把 tuning 里的名字映射成内核用的短名字，**改手感请改 tuning.ts**。
 *
 *  ── 四个动作，和它们各自「不许出什么问题」 ──────────────────────────────
 *  1. 食指移动   → 光标。难点是**抖与黏的矛盾**：原始关键点每帧都在跳，直接画会像
 *                  醉汉；滤得太狠又会「跟手发黏」。用 One-Euro 滤波器（自适应截止
 *                  频率）——慢的时候猛滤波去抖、快的时候放松滤得少所以不拖手。
 *                  见 OneEuroFilter。
 *  2. 捏合       → 点击。难点是**连点**：手指靠近的过程中距离会在阈值附近反复穿越。
 *                  用迟滞（关 < PINCH_CLOSE、开 > PINCH_OPEN）+「必须松开过才能再点」
 *                  + 最小间隔。再加一道**握拳闸**（手闭了一半以上就完全不判点击）。
 *  3. 左右快挥   → 切板块。难点是**一次挥动切好几页**、以及**别把正常移动当挥手**：
 *                  用「时间窗内位移 + 净位移占比 + 横向占优 + 速度下限 + 冷却
 *                  + 必须重新静下来才允许下一次」六道闸。位置取**掌心中心**，
 *                  不是食指尖 —— 否则「把光标从屏幕这头移到那头」会被误判成挥手。
 *  4. 张开手掌    → 银河散开解体；握紧拳头 → 聚拢回原本完整的银河。输出是 0..1 的
 *                  **连续**量（用户要求「根据手掌张开的程度连续变化」）。
 *                  难点有两个，都不在「算张开程度」本身：
 *                  ① **别把「食指指着屏幕移光标」当成张手** —— 那种手只有一根手指
 *                     伸着，平均伸展 0.647，和「张开 4 成」的 0.721 几乎分不开。
 *                     所以判据是「四指**平均**伸展 × **伸直根数**的闸」，见
 *                     `spreadFromHand()`。
 *                  ② **防抖** —— 用户要求「手指稍微动一下银河不要突然跳变」。
 *                     死区 + 方向不对称的低通（散开慢、聚拢快）一起上，见下面第 6 段。
 *                  ⚠️ 这套判据和 `fistness`（取「最伸那根手指」）是**两套**：
 *                     fistness 只管「握拳时别误触点击 / 挥手」。
 * ========================================================================== */

import { GESTURE_TUNING as T } from './tuning'

/* ---- 关键点下标（MediaPipe 手部 21 点的固定编号） --------------------- */
export const WRIST = 0
export const THUMB_TIP = 4
export const INDEX_MCP = 5
export const INDEX_PIP = 6
export const INDEX_TIP = 8
export const MIDDLE_MCP = 9
export const MIDDLE_PIP = 10
export const MIDDLE_TIP = 12
export const RING_PIP = 14
export const RING_TIP = 16
export const PINKY_MCP = 17
export const PINKY_PIP = 18
export const PINKY_TIP = 20

/** 四指指尖 —— 判「握拳 / 张掌」只看这四根（拇指是捏合的主角，不参与） */
const FINGER_TIPS: ReadonlyArray<number> = [INDEX_TIP, MIDDLE_TIP, RING_TIP, PINKY_TIP]

/* ---- 参数：全部来自 tuning.ts（唯一真源） ------------------------------
 * 下面一行行都是「别名」，数字一律在 tuning.ts 里改。
 * 保留这些短名字是为了让内核代码和验收脚本读起来清楚。
 * ---------------------------------------------------------------------- */

/** 放大倍率：见 tuning.REACH_GAIN（⚠️ 必须排在平滑之前，让滤波器吃掉放大后的抖动） */
export const REACH_GAIN = T.REACH_GAIN

/** One-Euro 慢速截止频率（Hz）—— 越小越稳、越迟 */
export const OE_MIN_CUTOFF = T.POINTER_SMOOTHING.MIN_CUTOFF
/** One-Euro 速度增益 —— 越大越跟手、越少平滑 */
export const OE_BETA = T.POINTER_SMOOTHING.BETA
/** One-Euro 速度估计自身的截止频率（Hz） */
export const OE_D_CUTOFF = T.POINTER_SMOOTHING.D_CUTOFF

/** 手出现时光标淡入的时间常数（秒） */
export const CURSOR_FADE_IN_TAU = T.CURSOR_FADE_IN_TAU
/** 手离开后光标淡出的时间常数（秒） */
export const CURSOR_FADE_OUT_TAU = T.CURSOR_FADE_OUT_TAU
/** 光标完全不透明时的值 */
export const CURSOR_ALPHA_MAX = T.CURSOR_ALPHA_MAX

/* ---- 捏合 → 点击 ------------------------------------------------------ */

/**
 * 捏合判定比 = 拇指尖到食指尖的距离 ÷ 手掌尺寸（手腕→中指根）。
 *
 * 为什么用「比值」而不是绝对坐标距离：这样手大手小、离摄像头远近都不影响判定，
 * 否则「离近一点就狂点」。
 *
 * 夹具实测：张开 1.19 · 拇指收起的张开手 0.785 · 半握 0.675 ·
 *          轻捏（指尖还没碰上）0.467 · 捏死 0.155。
 * 所以把「捏住」定在 0.54 —— **两根手指明显靠近就能点，不用完全贴死**。
 */
export const PINCH_CLOSE = T.PINCH_THRESHOLD
/** 松开的判定比。必须**明显大于** PINCH_CLOSE，这段差值就是迟滞带（防抖） */
export const PINCH_OPEN = T.PINCH_RELEASE
/** 两次点击的最小间隔（ms）。即使手指真的快速捏两下，也不快于这个 */
export const CLICK_MIN_GAP_MS = T.CLICK_MIN_GAP_MS
/** 手指刚出现后的这段时间内不判捏合（ms）—— 手刚进画面时关键点还没稳 */
export const CLICK_WARMUP_MS = T.CLICK_WARMUP_MS
/** 握拳时的点击闸：手闭合到这个程度就完全不判点击（见 tuning 里的说明） */
export const FIST_GUARD_CLICK = T.FIST_GUARD_CLICK

/* ---- 挥手 → 切板块 ---------------------------------------------------- */

/** 时间窗（ms）：只看最近这段时间内的位移 */
export const SWIPE_WINDOW_MS = T.SWIPE_WINDOW_MS
/** 触发所需的横向位移（归一化，0..1 的画面宽度） */
export const SWIPE_MIN_DX = T.SWIPE_DISTANCE
/** 位移过程中纵向跨度上限 —— 超过就当成「斜着划」不触发 */
export const SWIPE_MAX_DY = T.SWIPE_MAX_VERTICAL
/** 横向位移必须是纵向的这么多倍（横向占优） */
export const SWIPE_DOMINANCE = T.SWIPE_DOMINANCE
/** 触发所需的最小速度（归一化/秒）—— 必须真的是「挥」而不是「挪」。
 * ⚠️ 这个速度是拿 **SWIPE_SPEED_WINDOW_MS 那一小段**算的，不是整个窗口的平均
 *    （见 advance 里的注释：用整窗平均会让「先停一下再挥」永远挥不出来）。
 */
export const SWIPE_MIN_SPEED = T.SWIPE_SPEED
/**
 * 单帧位移最多只能占整段位移的这么多 —— 超过就认为「不是挥出来的，是一帧瞬移」。
 * 真人挥手 9 帧走完全程时单帧只占 ~12%，0.65 留了足够余量。
 */
export const SWIPE_MAX_STEP_RATIO = T.SWIPE_MAX_STEP_RATIO
/**
 * **净位移**至少要占整段跨度的这么多。
 * 为什么要有这条：`dx` 量的是窗口内的**最大跨度**，原地左右来回蹭也能把 dx 蹭大，
 * 而净位移（末点 − 首点）却接近 0 —— 那种手势不是挥手。
 */
export const SWIPE_NET_RATIO = T.SWIPE_NET_RATIO
/**
 * 算速度时只看最近这段时间（ms）。
 * 为什么不能整窗平均：用户几乎总是「手先停在画面里 → 再一挥」，静止那段（可长达几百 ms）
 * 会把 `位移 ÷ 整窗时长` 拖到阈值以下，结果是**越标准地挥手越触发不了**。
 */
export const SWIPE_SPEED_WINDOW_MS = T.SWIPE_SPEED_WINDOW
/** 两次挥手之间的冷却（ms）—— 用户要求「一次挥动只切一个板块，停约 0.8 秒」 */
export const SWIPE_COOLDOWN_MS = T.SWIPE_COOLDOWN
/** 「手静下来」的速度上限（归一化/秒）：低于它才算用户把手收回来停住了 */
export const SWIPE_REARM_QUIET = T.SWIPE_REARM_QUIET
/** 手要静住这么久，才允许下一次挥手 —— 实现「手回到正常位置后才能再触发」 */
export const SWIPE_REARM_MS = T.SWIPE_REARM_MS
/** 挥手成功后屏幕边缘那道流光持续多久（ms） */
export const EDGE_FLASH_MS = T.EDGE_FLASH_MS
/** 握拳时的挥手闸（见 tuning 里的说明） */
export const FIST_GUARD_SWIPE = T.FIST_GUARD_SWIPE

/* ---- 手掌开合 → 银河散开 / 聚拢 --------------------------------------- */

/**
 * 闭合程度（`fistness`）的两个标定点。
 * ⚠️ **现在只用来给点击闸 / 挥手闸判「握拳」**，不再决定星空的散开量 ——
 *    散开量走下面的 `spreadFromHand()`，两套判据不能混用（原因见 tuning）。
 */
export const FIST_THRESHOLD = T.FIST_THRESHOLD
export const OPEN_HAND_THRESHOLD = T.OPEN_HAND_THRESHOLD
/** 散开量的低通：散开方向（甩出去，有惯性） */
export const SPREAD_OPEN_TAU = T.SPREAD_OPEN_TAU
/** 聚拢方向（被吸回来，更果断） */
export const SPREAD_CLOSE_TAU = T.SPREAD_CLOSE_TAU
/** 手离开后回到原样的时间常数（秒） */
export const SPREAD_RELEASE_TAU = T.SPREAD_RELEASE_TAU
/** 死区：目标低于它一律当 0（防「手指微动 → 银河跳变」） */
export const SPREAD_DEADBAND = T.SPREAD_DEADBAND
/** 四指平均伸展比 = 它 → 完全握拳（散开量 0） */
export const SPREAD_MEAN_FIST = T.SPREAD_MEAN_FIST
/** 四指平均伸展比 ≥ 它 → 完全张开（散开量 1） */
export const SPREAD_MEAN_OPEN = T.SPREAD_MEAN_OPEN
/** 单指「算不算伸直」的阈值（数伸直了几根） */
export const SPREAD_FINGER_OUT = T.SPREAD_FINGER_OUT
/** 伸直根数不足时保留的权重下限 */
export const SPREAD_GATE_FLOOR = T.SPREAD_GATE_FLOOR

/* ---- 手的有无 --------------------------------------------------------- */

/** 超过这么久没看到手就算「手走了」（ms） */
export const HAND_LOST_MS = T.HAND_LOST_MS

/* ---- 颜色（跟随站点冷色调，和前几层保持一致） ------------------------- */
export const COLOR = {
  core: '245, 249, 255', // 冷白亮芯
  mid: '168, 205, 255', // 浅蓝
  outer: '178, 160, 255', // 淡紫柔光
  wave: '150, 205, 255', // 捏合光波
}

/* ==========================================================================
 *  类型
 * ======================================================================== */

export interface Landmark {
  x: number
  y: number
  z?: number
}

export interface ViewSize {
  w: number
  h: number
}

export interface GestureState {
  /** 内部时钟（ms），由 dtMs 累加 —— 测试里完全确定 */
  t: number
  view: ViewSize

  /** 归一化坐标（放大 + 镜像之前）上的一欧元滤波 */
  fx: OneEuroFilter
  fy: OneEuroFilter

  /** 光标当前像素位置与不透明度 */
  x: number
  y: number
  alpha: number

  /** 手在不在 */
  handSeen: boolean
  lastSeenAt: number
  /** 手重新出现后的安静计时（从「重新看到手」开始算） */
  quietSince: number

  /** 捏合 */
  pinchDown: boolean
  /** 是否已经「松开过」——只有 true 时才允许下一次点击 */
  pinchArmed: boolean
  pinchRatio: number
  lastClickAt: number

  /** 挥手窗口 */
  hist: Array<{ t: number; x: number; y: number }>
  lastSwipeAt: number
  /**
   * 挥手是否已「重新上膛」。
   * 触发一次挥手后置 false，**必须先让手静下来**（SWIPE_REARM_QUIET 持续 SWIPE_REARM_MS）
   * 才重新置 true —— 这样「挥完手继续横着甩」不会接着再切一个板块。
   * 用户的原话：「用户手回到正常位置以后，才能再次触发」。
   */
  swipeArmed: boolean
  /** 手开始「静下来」的时刻；`-1e9` = 现在还在动 */
  swipeQuietSince: number

  /** 握拳 / 张掌：手的闭合程度（这一帧的原始值，0 = 张开，1 = 握拳） */
  fistness: number
  /** 最伸着那根手指的伸展比（诊断用，也是 fistness 的原料） */
  handExt: number
  /** **平滑后**的银河散开量 0..1 —— 这一帧要交给粒子桥的值 */
  spread: number

  /** 诊断用：最近一帧的原始（未平滑）光标位置 */
  rawX: number
  rawY: number
}

export interface Intent {
  /** 手在画面里、且光标可见 */
  active: boolean
  /** 光标（像素） */
  x: number
  y: number
  alpha: number
  /** 这一帧发生了一次点击（已经是「只触发一次」的那一个上升沿） */
  click: boolean
  /** -1 = 上一板块，1 = 下一板块，0 = 不切 */
  swipe: -1 | 0 | 1
  /** 这一帧的银河散开量 0..1（0 = 原本完整，1 = 解体扩散）。交给粒子桥 */
  spread: number
  /** 手的闭合程度 0..1（诊断 / 让用户看到自己握到什么程度） */
  fistness: number
  /** 捏合比例（诊断 / 让用户能看到自己的手感对不对） */
  pinchRatio: number
  /** 当前是不是捏住状态（不只是这一帧的边沿） */
  pinchDown: boolean
  /** 手在不在画面里 */
  handSeen: boolean
}

/* ==========================================================================
 *  One-Euro 滤波器
 * --------------------------------------------------------------------------
 *  为什么不用「固定 alpha 的指数平滑」：那个要么太钝（快速移动时拖泥带水、
 *  手感发黏），要么太灵（慢速时抖）。One-Euro 的核心是**截止频率随速度自适应**：
 *      截止 = minCutoff + beta × |速度|
 *  慢 → 截止低 → 重滤波（去抖）；快 → 截止高 → 轻滤波（不拖手）。
 *  这是鼠标/触控/XR 里公认的「又稳又跟手」做法。
 * ======================================================================== */

/** 一阶低通的 alpha：给定截止频率(Hz)与帧间隔(s) */
export function alphaFor(cutoff: number, dt: number): number {
  const tau = 1 / (2 * Math.PI * cutoff)
  return 1 / (1 + tau / dt)
}

export class OneEuroFilter {
  private xPrev: number | null = null
  private dxPrev = 0

  constructor(
    public minCutoff: number,
    public beta: number,
    public dCutoff: number = OE_D_CUTOFF,
  ) {}

  reset(v?: number): void {
    this.xPrev = v ?? null
    this.dxPrev = 0
  }

  get value(): number {
    return this.xPrev ?? 0
  }

  filter(x: number, dt: number): number {
    if (this.xPrev === null) {
      this.xPrev = x
      return x
    }
    if (!(dt > 0)) return this.xPrev

    const dx = (x - this.xPrev) / dt
    const aD = alphaFor(this.dCutoff, dt)
    this.dxPrev += aD * (dx - this.dxPrev)

    const cutoff = this.minCutoff + this.beta * Math.abs(this.dxPrev)
    const a = alphaFor(cutoff, dt)
    this.xPrev += a * (x - this.xPrev)
    return this.xPrev
  }
}

/* ==========================================================================
 *  工具
 * ======================================================================== */

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

/** 两点距离（只用 x/y） */
export function dist(a: Landmark, b: Landmark): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.hypot(dx, dy)
}

/**
 * 手掌尺寸（归一化）：手腕 → 中指根。
 * 用它把所有「长度」都除一下，手势就**与手的大小 / 离摄像头远近无关**了。
 * 这是「离摄像头近一点也不能触发点击」的关键。
 */
export function handScale(lm: Landmark[]): number {
  const s = dist(lm[WRIST], lm[MIDDLE_MCP])
  return s > 1e-4 ? s : 1e-4
}

/** 捏合比：拇指尖—食指尖 的距离 ÷ 手掌尺寸 */
export function pinchRatioOf(lm: Landmark[]): number {
  return dist(lm[THUMB_TIP], lm[INDEX_TIP]) / handScale(lm)
}

/* ---- 握拳 / 张掌：判据是「最伸着的那根手指」 ------------------------- */

/**
 * 四指各自「指尖离掌心中心有多远」（÷ 掌长）。
 * 掌心中心用手腕 + 三个掌指关节的平均（握拳时这四个点几乎不动，
 * 所以「指尖靠过来多少」能被干净地量出来）。
 */
export function fingerExtensions(lm: Landmark[]): number[] {
  const w = lm[WRIST]
  const cx = (w.x + lm[INDEX_MCP].x + lm[MIDDLE_MCP].x + lm[PINKY_MCP].x) / 4
  const cy = (w.y + lm[INDEX_MCP].y + lm[MIDDLE_MCP].y + lm[PINKY_MCP].y) / 4
  const s = handScale(lm)
  const out: number[] = []
  for (const i of FINGER_TIPS) {
    out.push(Math.hypot(lm[i].x - cx, lm[i].y - cy) / s)
  }
  return out
}

/**
 * 「最伸着的那根手指」有多伸。
 * ⚠️ 取**最大值**是刻意的：只要还有一根手指伸着，手就不算握起来。
 *    这样「食指指着屏幕移光标」这种常态姿势永远不会被当成握拳去收粒子。
 *    夹具实测：张开手掌 1.224 · 半握 0.764 · 握拳 0.527（与手大手小、旋转无关）。
 */
export function maxFingerExt(lm: Landmark[]): number {
  const e = fingerExtensions(lm)
  let m = e[0]
  for (let i = 1; i < e.length; i++) if (e[i] > m) m = e[i]
  return m
}

/**
 * 从「最伸着那根手指的伸展比」算手的**闭合程度** 0..1：
 *   0 = 完全张开（≥ OPEN_HAND_THRESHOLD）→ 粒子全散开
 *   1 = 完全握拳（≤ FIST_THRESHOLD）    → 粒子全收拢
 * 中间线性过渡，所以是用户要的「根据手掌张开的程度连续变化」。
 */
export function fistnessFromExt(ext: number): number {
  const t = (ext - FIST_THRESHOLD) / (OPEN_HAND_THRESHOLD - FIST_THRESHOLD)
  return clamp(1 - t, 0, 1)
}

/** 便捷版：直接从关键点算闭合程度 */
export function fistnessOf(lm: Landmark[]): number {
  return fistnessFromExt(maxFingerExt(lm))
}

/* ---- 张开手掌 → 银河散开解体 / 握拳 → 聚拢回原样 ---------------------- */

/** 一只手当前的开合特征（验收脚本要读，所以导出） */
export interface HandOpenness {
  /** 四指各自的伸展比（÷ 掌长），顺序 = 食指/中指/无名指/小指 */
  exts: number[]
  /** 四指平均伸展比 —— 散开量的**主判据**（连续，所以张得越开散得越多） */
  mean: number
  /** 四指里伸直了几根 —— 用来把「在指」和「张手」分开（见 spreadFromHand） */
  outCount: number
}

export function opennessOf(lm: Landmark[]): HandOpenness {
  const exts = fingerExtensions(lm)
  let sum = 0
  let outCount = 0
  for (const e of exts) {
    sum += e
    if (e >= SPREAD_FINGER_OUT) outCount++
  }
  return { exts, mean: sum / exts.length, outCount }
}

/**
 * 银河的**散开量** 0..1：
 *   0 = 原本完整的银河（握拳）· 1 = 整片解体向外扩散（张开手掌）
 *
 * 判据是「四指平均伸展」×「伸直根数的闸」两道一起：
 *
 *  · **平均值**给连续性 —— 用户要的「手掌张得越开，银河散开的程度越大」。
 *  · **根数闸**排除「食指指着屏幕移光标」：那种手只有食指伸着（1 根），
 *    平均伸展 0.647，和「张开 4 成」的 0.721 几乎分不开 —— 光看平均值，
 *    用户一边移光标就会一边把银河炸开。夹具实测（`_analysis/_probe-spread.js`）：
 *      握拳 0 根/0.486 · **指向 1 根/0.647** · 两指 2 根/0.842 · 张开 4 成 4 根/0.721
 *      · 张开手掌 4 根/1.105
 *
 * ⚠️ **与 fistness 是两套判据，不能混用**：fistness 取「最伸那根手指」，
 *    spread 取「平均值 + 根数」。语义反了以后（张开=散开），
 *    用 fistness 那套会把「指向」当成张手。
 */
export function spreadFromHand(lm: Landmark[]): number {
  const { mean, outCount } = opennessOf(lm)
  const level = clamp((mean - SPREAD_MEAN_FIST) / (SPREAD_MEAN_OPEN - SPREAD_MEAN_FIST), 0, 1)
  // 1 根 → 只剩 SPREAD_GATE_FLOOR（再被死区切到 0）；3 根及以上 → 满权重
  const gate =
    SPREAD_GATE_FLOOR + (1 - SPREAD_GATE_FLOOR) * clamp((outCount - 1) / 2, 0, 1)
  const v = level * gate
  return v < SPREAD_DEADBAND ? 0 : v
}

/**
 * 把归一化关键点映射到屏幕像素。
 * ⚠️ **要镜像 x**：摄像头拍的是「别人看你」的画面，你把手往右移，画面里手是往左走的。
 *    用户期待的是照镜子（手右 → 光标右），所以 x 取 1-x。
 * 然后再按 REACH_GAIN 以画面中心为轴放大，让够不到屏幕边缘的手指也能走遍全屏。
 */
export function mapToScreen(lm: Landmark[], view: ViewSize): { x: number; y: number } {
  const nx = clamp(((1 - lm[INDEX_TIP].x) - 0.5) * REACH_GAIN + 0.5, 0, 1)
  const ny = clamp((lm[INDEX_TIP].y - 0.5) * REACH_GAIN + 0.5, 0, 1)
  return { x: nx * view.w, y: ny * view.h }
}

/**
 * 掌心中心（手腕 + 四指根部）—— 挥手用它，比指尖稳得多。
 * 用户点名要求：「左右挥手不要用食指位置判断，尽量根据整只手或者手掌中心的位置判断。」
 */
export function palmCenter(lm: Landmark[]): { x: number; y: number } {
  const ids = [WRIST, INDEX_MCP, MIDDLE_MCP, PINKY_MCP]
  let x = 0
  let y = 0
  for (const i of ids) {
    x += lm[i].x
    y += lm[i].y
  }
  return { x: x / ids.length, y: y / ids.length }
}

/* ==========================================================================
 *  状态机
 * ======================================================================== */

export function createGesture(view: ViewSize = { w: 1280, h: 720 }): GestureState {
  return {
    t: 0,
    view: { ...view },
    fx: new OneEuroFilter(OE_MIN_CUTOFF, OE_BETA),
    fy: new OneEuroFilter(OE_MIN_CUTOFF, OE_BETA),
    x: view.w / 2,
    y: view.h / 2,
    alpha: 0,
    handSeen: false,
    lastSeenAt: -1e9,
    quietSince: -1e9,
    pinchDown: false,
    pinchArmed: true,
    pinchRatio: 1,
    lastClickAt: -1e9,
    hist: [],
    lastSwipeAt: -1e9,
    swipeArmed: true,
    swipeQuietSince: -1e9,
    fistness: 0,
    handExt: 1,
    spread: 0,
    rawX: view.w / 2,
    rawY: view.h / 2,
  }
}

export function setViewport(s: GestureState, view: ViewSize): void {
  s.view = { ...view }
  // 视口变了，滤波器里存的是像素，重置一下免得瞬移
  s.fx.reset(s.x)
  s.fy.reset(s.y)
}

/** 强制重新开始（比如重新开启手势时），把内部状态清干净 */
export function resetGesture(s: GestureState): void {
  const view = s.view
  const fresh = createGesture(view)
  Object.assign(s, fresh)
}

/** 指数淡入/淡出一步（时间常数 tau，秒） */
function fadeStep(cur: number, target: number, tau: number, dt: number): number {
  if (!(dt > 0)) return cur
  const a = 1 - Math.exp(-dt / tau)
  return cur + (target - cur) * a
}

/**
 * 推进一帧。
 *
 * @param s     状态（原地修改）
 * @param lm    这一帧的 21 个关键点；`null` 表示这一帧没看到手
 * @param dtMs  距上一帧的毫秒数（测试里固定 16.67）
 * @returns     这一帧的动作意图
 */
export function advance(
  s: GestureState,
  lm: Landmark[] | null,
  dtMs: number,
  view?: ViewSize,
): Intent {
  if (view) s.view = { ...view }
  const dt = dtMs / 1000
  s.t += dtMs
  const now = s.t

  let click = false
  let swipe: -1 | 0 | 1 = 0

  /* ---- 1. 手在不在 ---------------------------------------------------- */
  const visible = !!lm && lm.length >= 21
  if (visible) {
    if (!s.handSeen) {
      // 手刚回来：清掉挥手窗口与捏合状态，避免「回来那一瞬间」被判成动作
      s.hist.length = 0
      s.pinchDown = false
      s.pinchArmed = true
      s.quietSince = now
    }
    s.handSeen = true
    s.lastSeenAt = now
  } else if (now - s.lastSeenAt > HAND_LOST_MS) {
    s.handSeen = false
  }

  /* ---- 2. 没有手：只做淡出，什么都不触发 ------------------------------ */
  if (!visible) {
    s.alpha = fadeStep(s.alpha, 0, CURSOR_FADE_OUT_TAU, dt)
    if (s.alpha < 0.004) s.alpha = 0
    s.pinchDown = false
    s.pinchArmed = true
    s.pinchRatio = 1
    s.fistness = 0
    s.handExt = 1
    // 银河：先保持住 —— 识别偶尔丢一帧是常事，不能让散开的星尘「啪」地一下收回去。
    // 只有确认手真的走了（超过 HAND_LOST_MS）才开始慢慢聚拢回原样。
    if (!s.handSeen) s.spread = fadeStep(s.spread, 0, SPREAD_RELEASE_TAU, dt)
    return {
      active: false,
      x: s.x,
      y: s.y,
      alpha: s.alpha,
      click: false,
      swipe: 0,
      spread: s.spread,
      fistness: 0,
      pinchRatio: s.pinchRatio,
      pinchDown: false,
      handSeen: false,
    }
  }

  /* ---- 3. 光标：映射 → 平滑 → 淡入 ------------------------------------ */
  const target = mapToScreen(lm!, s.view)
  s.rawX = target.x
  s.rawY = target.y
  s.x = s.fx.filter(target.x, dt)
  s.y = s.fy.filter(target.y, dt)

  s.alpha = fadeStep(s.alpha, CURSOR_ALPHA_MAX, CURSOR_FADE_IN_TAU, dt)

  /* ---- 3b. 手的闭合程度（握拳 / 张掌）--------------------------------- */
  // 一次算好，给三处用：捏合的握拳闸、挥手的握拳闸、以及星空粒子收拢量。
  const ext = maxFingerExt(lm!)
  s.handExt = ext
  const fisty = fistnessFromExt(ext) // 0 = 张开，1 = 握拳
  s.fistness = fisty

  /* ---- 4. 捏合 → 点击 -------------------------------------------------- */
  s.pinchRatio = pinchRatioOf(lm!)
  const wasDown = s.pinchDown

  // ⚠️ 三道闸，缺一不可：
  //   ① 迟滞（关 <0.54、开 >0.76），防手指在阈值附近抖出连点；
  //   ② **握拳闸**：真握拳时拇指尖会横搭在食指上（捏合比 0.13，比捏死还近），
  //      不拦的话「握拳收粒子」会顺手点到页面；
  //   ③ 「必须松开过」—— 见 pinchArmed。
  const fistGuard = fisty >= FIST_GUARD_CLICK
  if (s.pinchRatio > PINCH_OPEN) {
    // 手指张开了 → 松开，并重新上膛
    s.pinchDown = false
    s.pinchArmed = true
  } else if (fistGuard) {
    // 握拳：不算捏合，而且**取消上膛**。之后必须先真的把手指张开
    // （捏合比 > PINCH_OPEN）才允许再点 —— 免得「握完拳松手」补一次点击。
    s.pinchDown = false
    s.pinchArmed = false
  } else if (!s.pinchDown && s.pinchRatio < PINCH_CLOSE) {
    s.pinchDown = true
  }

  // 只有 开→合 的那一个下降沿、且已经松开过、且过了最小间隔，才算一次点击
  const cooled = now - s.lastClickAt >= CLICK_MIN_GAP_MS
  const warmed = now - s.quietSince >= CLICK_WARMUP_MS
  if (s.pinchDown && !wasDown && s.pinchArmed && cooled && warmed) {
    click = true
    s.lastClickAt = now
    s.pinchArmed = false // 必须松开才会重新置 true
  }

  /* ---- 5. 挥手 → 切板块 ------------------------------------------------ */
  const pc = palmCenter(lm!)
  // ⚠️ 存**镜像后**的 x（和光标同一套语义）：这样 hist 里「x 变大」就等于
  //    「用户看到自己的手往右走」，判断方向时不必再在脑子里转一次。
  s.hist.push({ t: now, x: 1 - pc.x, y: pc.y })
  while (s.hist.length && now - s.hist[0].t > SWIPE_WINDOW_MS) s.hist.shift()

  // ── 最近 SWIPE_SPEED_WINDOW_MS 这一小段的运动量 ─────────────────────
  // 只用于挥手的速度判据（⚠️ 不能拿整窗平均 —— 用户习惯「手先停住再挥」，
  // 静止那段会把整窗平均速度拖到阈值以下，越标准地挥手越触发不了）。
  let rFirst = s.hist.length - 1
  for (let i = s.hist.length - 1; i >= 0; i--) {
    if (now - s.hist[i].t > SWIPE_SPEED_WINDOW_MS) break
    rFirst = i
  }
  const rSpanT = Math.max((now - s.hist[rFirst].t) / 1000, 1e-3)
  const rDx = Math.abs(s.hist[s.hist.length - 1].x - s.hist[rFirst].x)
  const motionSpeed = rDx / rSpanT

  /* ---- 5b. 「重新上膛」：手必须先静下来，才允许下一次挥手 -------------- */
  // 用户要求「一次挥手只切一个板块，手回到正常位置以后才能再触发」。
  // 冷却时间只能挡住「同一次挥动的余波」；这一道挡的是「挥完接着又横甩一下」。
  // 复用 motionSpeed：低于 SWIPE_REARM_QUIET 就认为用户把手收回/停住了，
  // 静住 SWIPE_REARM_MS 之后才重新上膛。
  if (motionSpeed < SWIPE_REARM_QUIET) {
    if (s.swipeQuietSince < -1e8) s.swipeQuietSince = now
  } else {
    s.swipeQuietSince = -1e9
  }
  if (!s.swipeArmed && now - s.swipeQuietSince >= SWIPE_REARM_MS) s.swipeArmed = true

  // ⚠️ 挥手的两道「别串味」闸：
  //   · 正在捏着（点击）时不算挥手 —— 用户明确要求「捏一下的时候不能同时判断成挥手」；
  //   · 几乎是完整握拳时不算挥手 —— 那只手在控制星空粒子。
  const swipeAllowed = !s.pinchDown && fisty < FIST_GUARD_SWIPE

  if (swipeAllowed && s.swipeArmed && s.hist.length >= 3 && now - s.lastSwipeAt >= SWIPE_COOLDOWN_MS) {
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (const p of s.hist) {
      if (p.x < minX) minX = p.x
      if (p.x > maxX) maxX = p.x
      if (p.y < minY) minY = p.y
      if (p.y > maxY) maxY = p.y
    }
    const dx = maxX - minX
    const dy = maxY - minY
    const shift = s.hist[s.hist.length - 1].x - s.hist[0].x // >0 = 屏幕上往右
    // 幅度看整窗（dx），速度看当下（motionSpeed）
    const fast = motionSpeed >= SWIPE_MIN_SPEED
    // 净位移占比：挡「原地左右来回蹭」——那种手势跨度够大、净位移却接近 0
    const straight = Math.abs(shift) >= dx * SWIPE_NET_RATIO

    // 必须是一帧一帧**挥**出来的：单帧最多只占整段位移的一半多。
    // 防的是识别抖动/换手那种「一帧瞬移」，那不是挥手。
    let maxStep = 0
    for (let i = 1; i < s.hist.length; i++) {
      const st = Math.abs(s.hist[i].x - s.hist[i - 1].x)
      if (st > maxStep) maxStep = st
    }
    const smooth = dx > 0 && maxStep <= dx * SWIPE_MAX_STEP_RATIO

    if (
      dx >= SWIPE_MIN_DX &&
      dy <= SWIPE_MAX_DY &&
      dx >= dy * SWIPE_DOMINANCE &&
      fast &&
      straight &&
      smooth
    ) {
      // 用户要求：往**左**挥 → 下一个板块；往**右**挥 → 上一个板块
      swipe = shift > 0 ? -1 : 1
      s.lastSwipeAt = now
      // 必须先静下来才允许下一次（见上面 5b）
      s.swipeArmed = false
      s.swipeQuietSince = -1e9
      // ⚠️ 触发后把窗口**只留最新一个点**当新基线（不能整个清空）：
      //    清空会让下一帧的 motionSpeed 读成 0，同一次挥动还可能被重新累计成第二次。
      s.hist.splice(0, s.hist.length - 1)
    }
  }

  /* ---- 6. 张开手掌 → 银河散开解体 / 握拳 → 聚拢回原样 ----------------- */
  // 目标 = 手掌的张开程度（连续 0..1，见 spreadFromHand）。
  // 过一道**方向不对称**的低通 —— 用户要的是「有速度、有惯性，不要突然炸开」：
  //   散开用 SPREAD_OPEN_TAU（甩出去，慢一点才有加速感）
  //   聚拢用 SPREAD_CLOSE_TAU（被吸回来，快一点更果断）
  // 第二道惯性在 NebulaField 里（读 uSpread 时再平滑一次），两道叠起来就是这个手感。
  // ⚠️ 捏着的时候不动星空 —— 两个手势分清楚：捏合只负责点击。
  if (!s.pinchDown) {
    const target = spreadFromHand(lm!)
    const tau = target > s.spread ? SPREAD_OPEN_TAU : SPREAD_CLOSE_TAU
    s.spread = fadeStep(s.spread, target, tau, dt)
  }

  return {
    active: s.alpha > 0.02,
    x: s.x,
    y: s.y,
    alpha: s.alpha,
    click,
    swipe,
    spread: s.spread,
    fistness: s.fistness,
    pinchRatio: s.pinchRatio,
    pinchDown: s.pinchDown,
    handSeen: true,
  }
}
