/* ============================================================================
 *  worldState —— 整个转场系统的「唯一真源」
 * ----------------------------------------------------------------------------
 *  设计原则：
 *    GSAP 只负责补间这里面的**普通对象字段**（不碰 React state，不碰 THREE 对象），
 *    R3F 的各个 useFrame 每帧来读这些字段写进自己的材质 / 变换。
 *
 *  这样做的好处：
 *    - 60fps 的动画完全不触发 React 重渲染；
 *    - 时间轴只有一条（gsap.timeline），所有层天然同步；
 *    - 想调时序 / 幅度，只改这个文件。
 *
 *  数据流：
 *    SceneManager(GSAP)  ──写──▶  world / scene3d / galaxyA / galaxyB
 *                                        │
 *    LiveTheme · GalaxyWorld · SceneGeometry ──读──┘
 * ========================================================================== */

/** 转场阶段：idle 静止 / exit 前景退出 / travel 银河空镜穿梭 / enter 新场景进入 */
export type Phase = 'idle' | 'exit' | 'travel' | 'enter'

/**
 * 转场模式（只是**幅度**不同，时序仍然共用下面那一条 timeline）：
 *
 *   slide —— 章节之间平级移动：前景被甩向左右、银河 5vw 侧移 + 换区换色。
 *   push  —— 从首页**向前推进**进入第一章：前景朝观众方向放大淡出（被推过身）、
 *            银河与粒子沿推进弧线强烈前冲、不做侧移。
 *   pull  —— 从章节**退回首页入口**：push 的反向。前景缩小淡出（往远处退）、
 *            银河与粒子沿同一条弧线**后退**（scale 1 → 0.8 → 1）、同样不侧移。
 *
 * push / pull 都不做两层交叉溶解：因为首页与 PHOTON 共用同一张底图，
 * 两张一模一样的图叠着只会出现重影。这也是「不换图」的根因所在。
 *
 * 为什么退回要用 pull 而不是直接复用 push：push 是「向前冲」，用同一个动作
 * 回到首页，观感上等于又前进了一次，与「返回」的心理预期相反。
 * 退回时画面**后退**才读得出「离开这里、回到入口」。
 */
export type TravelMode = 'slide' | 'push' | 'pull'

/* ----------------------------------------------------------------- 时间轴 */

/**
 * 完整时序（秒）：
 *   0.00  exit    当前 Scene 前景开始退出
 *   0.55  (exit 结束，画面只剩银河)
 *   0.35 ─ 1.25  travel  银河空镜穿梭 + 两个 GalaxyLayer 交叉溶解 + 换区换色
 *   1.25  settle  新银河区域形成，此刻才交换 React 内容
 *   1.25 ─ 1.93  enter   新 Scene 从另一侧进入
 *   1.93  idle    解锁，可以接受下一次点击
 *
 * 空镜时长 = 1.25 - 0.55 = 0.70s，落在需求的 500~900ms 区间内。
 */
export const TIMING = {
  /** 前景退出时长 */
  exit: 0.55,
  exitEase: 'power3.in',
  /** 银河穿梭开始时间（相对转场起点） */
  travelAt: 0.35,
  /** 银河穿梭时长：两张 GalaxyLayer 交叉溶解 */
  travel: 0.9,
  travelEase: 'power2.inOut',
  /** 新场景进入时长 */
  enter: 0.68,
  enterEase: 'power3.out',
  /** 3D 几何体进入时长（略长一点，让它比文字晚一点点落位） */
  enter3d: 0.78,
} as const

/** 位移幅度。UI 用 vw 计量（百分比），银河用「视口宽度的比例」计量 */
export const AMPLITUDE = {
  /** 前景 UI 退出：向左/右甩出多少 vw */
  uiExitVw: 30,
  /** 前景 UI 进入：从另一侧多远处进来 */
  uiEnterVw: 32,
  /** 3D 几何体退出/进入：视口宽度的比例（30vw ≈ 0.28） */
  geoVw: 0.28,
  /** 银河层位移：视口宽度的比例（5vw ≈ 0.05）—— 只有 UI 的约 1/6，形成景深 */
  galaxyVw: 0.05,
  galaxyVh: 0.018,
  /** 银河推进弧线的最大幅度：scale 1 → 1.09 */
  pushScale: 0.09,
  /** 退出时前景放大到（被镜头甩到身后） */
  uiExitScale: 1.12,
  /** 进入时前景从多大长到 1 */
  uiEnterScale: 0.94,
  geoExitScale: 1.14,
  geoEnterScale: 0.92,
  /** 模糊峰值（px） */
  blurPx: 4,
} as const

/**
 * 「推进」（push）模式的幅度。用途：首页入口层 ⇄ 第一章。
 *
 * 观感目标：点下「开始探索」后画面**继续用同一片银河向前冲**，
 * 前景（文字 / 按钮 / 中心几何体）朝观众方向放大、糊掉、被推过身，
 * 然后第一章从更近处落定 —— 全程没有黑屏 / 白屏 / 换图。
 *
 * 峰值总缩放 = (1 + PUSH.arcScale) × (1 + PUSH.layerZoom) ≈ 1.34×，
 * 且 arc 两端为 0，所以转场前后画面完全静止（不会漂）。
 */
export const PUSH = {
  /** 银河组（含粒子）的前冲幅度 */
  arcScale: 0.24,
  /** 底图额外前冲，与 arcScale 叠乘 */
  layerZoom: 0.08,
  /** 前景 UI 退出：放大到多少（朝镜头推过去） */
  uiExitScale: 1.26,
  /** 前景 UI 进入：从多大落回 1（比 1 大 = 从镜头前方落定） */
  uiEnterScale: 1.12,
  /** 3D 前景（中心几何体）退出 / 进入 */
  geoExitScale: 1.34,
  geoEnterScale: 1.16,
  /** 前景模糊峰值（px），推进要更快一点才像有速度 */
  blurPx: 7,
  /** 银河空镜期间的轻微模糊（推进感，别喧宾夺主） */
  galaxyBlurPx: 3.5,
} as const

/**
 * 「退回」（pull）模式的幅度。用途：从任意章节退回首页入口。
 *
 * 观感目标：点下「返回主页」后画面**原路退回去** —— 前景（文字 / 按钮 / 中心
 * 几何体）缩小、糊掉、退向远处，同一片银河沿弧线后退，然后首页从远处落定。
 * 全程仍然没有黑屏 / 白屏 / 换图。
 *
 * ⚠️ 银河能缩到多小有硬下限：底图平面是视口的 OVERSCAN = 1.4 倍
 * （见 GalaxyLayer），所以整组 scale 最小只能到 1 / 1.4 ≈ 0.714，
 * 再小就会看到平面边缘。
 * → 这里取 0.2（最小 0.8 倍）留了足够余量：0.8 × 1.4 = 1.12 倍视口，不漏边。
 * 改这个值时请一并回看 GalaxyLayer 的 OVERSCAN。
 */
export const PULL = {
  /** 银河组后退幅度（越小越远）。0.2 → 中途缩到 0.8 倍 */
  arcScale: 0.2,
  /** 底图不额外缩放：退行的位移感全部交给上面的 arc，避免叠加后逼近下限 */
  layerZoom: 0,
  /** 前景 UI 退出：缩小 + 淡出（往远处退，与 push 的放大方向相反） */
  uiExitScale: 0.9,
  /** 前景 UI 进入：从稍远处长回 1（首页是「重新聚拢」，不是从侧面滑入） */
  uiEnterScale: 0.94,
  /** 3D 前景（中心几何体）退出 / 进入 */
  geoExitScale: 0.86,
  geoEnterScale: 0.9,
  /** 前景模糊峰值（px）。后退比前冲慢，模糊也收一点 */
  blurPx: 5,
  /** 银河空镜期间的轻微模糊 */
  galaxyBlurPx: 3,
} as const

/* --------------------------------------------------------------- 世界状态 */

export interface WorldState {
  /** 当前所在的银河区域（场景下标） */
  from: number
  /** 正在前往的银河区域 */
  to: number
  /** 0 → 1：银河交叉溶解 / 颜色插值 / 层位移 的统一进度 */
  mix: number
  /** +1 前进（新内容从右进），-1 后退（新内容从左进） */
  dir: number
  /** 本次转场用哪种幅度模型。由 SceneManager 在转场开始时写入 */
  mode: TravelMode
}

export const world: WorldState = {
  from: 0,
  to: 0,
  mix: 0,
  dir: 1,
  mode: 'slide',
}

/** 转场结束：把「已到达的区域」固化成新的起点，mix 归零（视觉上无跳变） */
export function settleWorld() {
  world.from = world.to
  world.mix = 0
}

/* ------------------------------------------------------- 3D 前景（几何体） */

export interface Scene3DState {
  /** 归一化位移 -1..1，运行时乘以 viewport.width * AMPLITUDE.geoVw */
  x: number
  scale: number
  /** 整体不透明度，几何体通过 FadeContext 读它 */
  opacity: number
  /** 退出/进入时的轻微转体（弧度） */
  spin: number
}

export const scene3d: Scene3DState = { x: 0, scale: 1, opacity: 1, spin: 0 }

/* ------------------------------------------------------------ 银河层通道 */

/**
 * 一个 GalaxyLayer = 一层银河底图。
 * 常驻两层：A 是当前区域，B 是即将进入的区域，两层重叠做交叉溶解，
 * 各自带独立的 scale / x / y，所以看起来像「穿过云层」而不是换图。
 */
export interface GalaxyChannel {
  /** 该层当前显示的银河区域（THEMES 下标） */
  tex: number
  opacity: number
  scale: number
  /** 归一化位移，运行时乘以 viewport.width */
  x: number
  y: number
}

export const galaxyA: GalaxyChannel = { tex: 0, opacity: 1, scale: 1, x: 0, y: 0 }
export const galaxyB: GalaxyChannel = { tex: 0, opacity: 0, scale: 1, x: 0, y: 0 }

/* ------------------------------------------------------------------ 工具 */

export const smoothstep = (t: number) => {
  const x = t < 0 ? 0 : t > 1 ? 1 : t
  return x * x * (3 - 2 * x)
}

/**
 * 穿梭弧线：mix 0 → 1 的过程中，0 → 1 → 0。
 * 用来做「镜头推进再减速停下」，两端都是 0，所以转场前后画面静止。
 */
export const travelArc = (mix: number) => Math.sin(Math.PI * smoothstep(mix))

/** 系统级「减少动效」开关：开了就把所有时长压到极短，但保留完整顺序 */
export const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
