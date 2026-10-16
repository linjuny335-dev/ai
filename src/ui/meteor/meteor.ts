/* ============================================================================
 *  鼠标流星 · 天空飞行内核（纯函数 + 可脱离 DOM 推进的状态机）
 * ----------------------------------------------------------------------------
 *  ⚠️ 2026-09-30 语义重做：**指针不是流星，指针是操纵杆。**
 *
 *  旧版（已废弃）把流星头做成「指针的对数跟随」，最多滞后 70px —— 结果就是
 *  「鼠标箭头变成了流星」。用户要的不是这个：
 *
 *      鼠标是遥控器，流星是天上一个**独立**的物体。
 *      鼠标往右 → 流星往右飞；往左 → 往左飞；斜着 → 斜着飞。
 *      鼠标越快 → 流星越快、尾巴越长。
 *      鼠标停下 → 流星**顺着刚才的方向继续滑行一小段**，然后慢慢散掉。
 *      流星要离鼠标有一点距离，不能粘在箭头下面。
 *
 *  所以这里的模型是「速度控制 + 位置保持」：
 *
 *      目标速度 = 指针速度(跟手) + (标准站位 - 当前位置) × POS_K   ← 比例校正
 *      流星速度 → 指数逼近目标速度（时间常数 VEL_TAU，这就是惯性来源）
 *
 *  为什么这个式子对：
 *    · 指针匀速直线飞 → 流星也匀速飞、速度等于指针速度，站位差恒定 → 距离稳定在
 *      STANDOFF 附近（「与鼠标保持一点距离」）；
 *    · 指针突然转弯 → 流星的速度还指着旧方向，来不及立刻改 → 自然甩出**外弧**，
 *      再被比例项慢慢拉回来。转弯越急弧线越大，这就是「惯性 + 弧线」；
 *    · 指针停下 → 关掉上面整个式子，改成纯阻尼滑行（COAST_TAU），
 *      于是流星带着最后的速度继续往原方向飞出去一段，同时本体淡出（FADE_TAU）。
 *
 *  站位方向取「指针平滑速度方向的反方向」→ 流星在指针**后面**，
 *  于是屏幕上的顺序是：指针 → 流星 → 光尾，全在一条线上，读起来最清楚。
 *
 *  画的部分（Canvas / rAF / DPR）在 MeteorTrail.tsx；这个文件不碰 DOM，
 *  所以能在 Node 里按 60fps 逐帧推进、逐条断言（见 _analysis/verify-meteor.js）。
 * ========================================================================== */

/* ---- 指针 → 操纵杆 ------------------------------------------------------ */

/** 超过这个时长没有真实移动，就认为鼠标停了（ms） */
export const IDLE_MS = 90
/** 停了这么久之后再动，若流星已经散尽，就让它重新出现在指针附近（ms）。
 *  不这么做的话，流星会从屏幕另一头慢慢飞过来，像一颗迷路的流星。 */
export const RESET_MS = 420
/** 指针速度估计的平滑时间常数（秒）。太小会抖，太大会跟手迟钝 */
export const POINTER_TAU = 0.05

/* ---- 流星与指针的间距（「不能粘在箭头下面」） ---------------------------- */

/** 慢速时的站位距离（px） */
export const STANDOFF_MIN = 92
/** 快速时的站位距离（px）—— 越快拉得越开，接近真实流星的观感 */
export const STANDOFF_MAX = 215
/** 把速度归一化到 0..1 用的参考速度（px/s） */
export const STANDOFF_REF = 1750
/** 到指针的距离超过它就硬拉回来（px）—— 防止极端情况下流星跑丢 */
export const LEASH_HARD = 620
/** 指针离流星近于这个距离就开始施加「分离偏置」（px）。
 *  正常站位 92~215px 时完全不生效，只在指针迎面擦过时起作用 */
export const SEP_RADIUS = 58
/** 分离偏置的强度（px/s，在距离为 0 时最大） */
export const SEP_PUSH = 320

/* ---- 飞行手感 ---------------------------------------------------------- */

/** 速度跟随的时间常数（秒）。越大越「重」、转弯弧线越大 */
export const VEL_TAU = 0.14
/** 位置比例校正增益（1/s）。越大越黏着标准站位，越小越容易飘远 */
export const POS_K = 2.4
/** 停手后的阻尼时间常数（秒）。越大滑行越远 */
export const COAST_TAU = 0.44
/** 本体淡出的时间常数（秒）—— 约 4.6τ 后基本看不见，即 ~1.15s */
export const FADE_TAU = 0.25
/** 低于这个速度直接把速度归零（px/s）—— 指数衰减永远不会真正到 0，得有个收口 */
export const STOP_SPEED = 7
/** 低于这个速度就不铺新尾巴点了（px/s） */
export const TRAIL_MIN_SPEED = 12

/* ---- 尾巴 -------------------------------------------------------------- */

/** 尾巴单点的寿命区间（ms）：慢 → 快。决定「光尾多久散掉」 */
export const LIFE_MIN = 620
export const LIFE_MAX = 900
/** 到这个速度算「快」，用来归一化所有随速度变化的量（px/s） */
export const SPEED_REF = 1700
/**
 * 尾巴的**弧长**上限（px）。尾巴长度 ≈ 速度 × 寿命，猛甩时会算出两三千像素，
 * 等于把整屏划一条线。所以两个约束分开管：寿命管**淡出时间**，弧长管**视觉长度**。
 */
export const MAX_TAIL_PX = 1150
/** 尾巴折线点数上限（防止极快划动把点数撑爆） */
export const MAX_POINTS = 140
/** 尾巴按年龄分的桶数。分桶之后每帧只要 ~30 次 stroke，也不会有「圆珠串」接缝 */
export const BUCKETS = 10

/* ---- 星点（从尾巴里甩出来的细小星光） ---------------------------------- */

/** 低于这个速度不散星点（px/s）——「慢的时候不要一直喷很多粒子」 */
export const SPARK_SPEED = 900
/** 两次散星的间隔下限（ms）——「数量要克制」 */
export const SPARK_GAP_MS = 115
/** 屏幕上同时存在的星点上限 */
export const SPARK_MAX = 40

/* ---- 伴星：「偶尔在附近出现 1~2 颗更小、更远的流星」 -------------------- */

export const EXTRA_MAX = 2
/** 两批伴星的最小间隔（ms） */
export const EXTRA_GAP_MS = 1500
/** 主流星超过这个速度才可能带出伴星（px/s）—— 慢慢挪的时候天空是安静的 */
export const EXTRA_SPEED = 720
export const EXTRA_LIFE_MIN = 1100
export const EXTRA_LIFE_MAX = 1900
/** 伴星相对主流星的速度倍率下限 / 上限 —— 更慢才显得「更远」 */
export const EXTRA_SPEED_GAIN_MIN = 0.4
export const EXTRA_SPEED_GAIN_MAX = 0.72
/** 伴星出生点离主流星的距离区间（px） */
export const EXTRA_DIST_MIN = 200
export const EXTRA_DIST_MAX = 460
/** 伴星的阻尼（秒）—— 让它们慢慢滑、慢慢散 */
export const EXTRA_DRAG_TAU = 1.1

/** 冷白 → 浅蓝 → 淡紫。刻意写成 "r, g, b"，画的时候拼 rgba() 加透明度 */
export const COLOR = {
  core: '244, 248, 255',
  mid: '158, 201, 255',
  outer: '179, 163, 255',
  halo: '127, 134, 255',
  spark: '223, 232, 255',
} as const

/* ---- 类型 -------------------------------------------------------------- */

export interface TrailPoint {
  x: number
  y: number
  /** 生成时刻（ms） */
  t: number
  /** 生成时的寿命（ms）—— 按那一刻的速度算好，之后不再变 */
  life: number
}

export interface Spark {
  x: number
  y: number
  vx: number
  vy: number
  t: number
  life: number
  /** 半径（px） */
  size: number
}

export interface Meteor {
  id: number
  /** true = 主流星（受指针操纵）；false = 伴星（自己滑自己的） */
  driven: boolean
  x: number
  y: number
  vx: number
  vy: number
  /** 本体可见度 0..1 */
  a: number
  /** 整体缩放：头 / 尾的粗细与长度都乘它。伴星更小 */
  scale: number
  trail: TrailPoint[]
  sparks: Spark[]
  /** 最近几次「散星」各散了几颗（只保留最近 64 次）。
      为什么不数星点数组净增：同一帧里既有新生的也有到期的，净增会小于实际生成数
      （实测出现过「一批 1 颗」的假象）。要断言「每批 2~4 颗」就得记生成事件本身。 */
  spawnLog: number[]
  bornAt: number
  /** 自然寿命（ms）。主流星用 0 表示「不限，由操纵状态决定」 */
  life: number
  /** 平滑后的自身速度（px/s）—— 所有随速度变化的视觉量都用它 */
  speed: number
  /** 主流星是否处于「醒着」状态。散尽之后置 false，指针再动时会重新落位 */
  awake: boolean
}

/** 逐帧轨迹采样，给验收脚本用
 *  （量「左右跟随」「转弯平滑」「停止滑行距离」；px/py 是指针，方便直接比方向） */
export interface Trace {
  t: number
  x: number
  y: number
  /** 指针位置 */
  px: number
  py: number
  a: number
  /** 到指针的距离 */
  d: number
}

export interface SkyState {
  main: Meteor
  extras: Meteor[]
  /** 指针当前位置 */
  pointer: { x: number; y: number }
  /** 平滑后的指针速度（px/s） */
  pvx: number
  pvy: number
  /** 平滑后的运动方向（单位向量）。速度太小时保持不变 */
  dirx: number
  diry: number
  /** 指针最近有没有在动 */
  active: boolean
  primed: boolean
  lastMoveAt: number
  lastExtraAt: number
  lastSparkAt: number
  /** 本帧内指针累计位移（px），消费后清零 */
  movedDx: number
  movedDy: number
  nextId: number
  /** 主流星重生次数。连续移动时**必须恒为 1**（「不要每移动一下就重新生成一颗」） */
  spawnCount: number
  /** 每次带出几颗伴星 */
  extraLog: number[]
  trace: Trace[]
  viewW: number
  viewH: number
}

export function createSky(viewW = 1440, viewH = 900): SkyState {
  return {
    main: makeMeteor(1, true, 0),
    extras: [],
    pointer: { x: viewW / 2, y: viewH / 2 },
    pvx: 0,
    pvy: 0,
    dirx: 1,
    diry: 0,
    active: false,
    primed: false,
    lastMoveAt: -1e9,
    lastExtraAt: -1e9,
    lastSparkAt: -1e9,
    movedDx: 0,
    movedDy: 0,
    nextId: 2,
    spawnCount: 0,
    extraLog: [],
    trace: [],
    viewW,
    viewH,
  }
}

function makeMeteor(id: number, driven: boolean, now: number): Meteor {
  return {
    id,
    driven,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    a: 0,
    scale: 1,
    trail: [],
    sparks: [],
    spawnLog: [],
    bornAt: now,
    life: 0,
    speed: 0,
    awake: driven,
  }
}

/** 窗口尺寸变化时同步进来（站位要夹在视口内，不然流星会跑到屏幕外） */
export function setViewport(sky: SkyState, w: number, h: number) {
  sky.viewW = w
  sky.viewH = h
}

/* ---- 小工具 ------------------------------------------------------------ */

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)

/** 指数逼近，与帧率无关 */
export function approach(prev: number, next: number, dt: number, tau: number) {
  if (tau <= 0) return next
  return prev + (next - prev) * (1 - Math.exp(-dt / tau))
}

/** 速度归一化到 0..1 */
export function speedNorm(speed: number) {
  return clamp01(speed / SPEED_REF)
}

/** 站位距离：慢 → STANDOFF_MIN，快 → STANDOFF_MAX（线性） */
export function standoffFor(speed: number) {
  return STANDOFF_MIN + (STANDOFF_MAX - STANDOFF_MIN) * clamp01(speed / STANDOFF_REF)
}

/* ---- 随速度变化的视觉量（全部可在 Node 里断言） ------------------------- */

/** 尾巴寿命：620ms（慢）→ 900ms（快） */
export function trailLifeMs(speed: number) {
  return LIFE_MIN + (LIFE_MAX - LIFE_MIN) * speedNorm(speed)
}

/** 尾部起笔宽度（px）：2.4（慢）→ 5.0（快）。比上一版粗，用户要求「明显一点」 */
export function headWidth(speed: number) {
  return 2.4 + 2.6 * speedNorm(speed)
}

/** 头部光点半径（px）：1.7 → 3.0 */
export function headRadius(speed: number) {
  return 1.7 + 1.3 * speedNorm(speed)
}

/** 头部沿运动方向拖出的短光条长度（px），上限 46 */
export function streakLen(speed: number) {
  return Math.min(46, speed * 0.02)
}

/** 折线补点间距：4~24px。间距随速度放大，点数才有上限 */
export function pointSpacing(speed: number) {
  return Math.min(24, Math.max(4, speed * 0.022))
}

/** 一次散几颗星点：2~4；慢速（< SPARK_SPEED）恒为 0 */
export function sparkCount(speed: number) {
  if (speed < SPARK_SPEED) return 0
  if (speed >= 2200) return 4
  if (speed >= 1450) return 3
  return 2
}

/**
 * 折线补点：从 (x0,y0) 到 (x1,y1) 每隔 spacing 放一个点。
 * 高速飞行时一帧能跨几百像素，不补点尾巴就会断成一节一节。
 */
export function subdivide(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  spacing: number,
): Array<{ x: number; y: number }> {
  const dx = x1 - x0
  const dy = y1 - y0
  const d = Math.hypot(dx, dy)
  if (!(spacing > 0) || d < spacing) return []
  const n = Math.floor(d / spacing)
  const out: Array<{ x: number; y: number }> = []
  for (let i = 1; i <= n; i++) {
    const k = (i * spacing) / d
    out.push({ x: x0 + dx * k, y: y0 + dy * k })
  }
  return out
}

/* ---- 分桶：把尾巴切成若干段同龄折线 ------------------------------------ */

export interface TrailBucket {
  /** 该桶的透明度 0..1 */
  alpha: number
  /** 该桶的宽度相对头部的比例 0..1 */
  widthScale: number
  pts: Array<{ x: number; y: number }>
}

/**
 * 按年龄把尾巴点分成 BUCKETS 桶（**返回顺序：新 → 旧**），每桶一条折线。
 * 一次 stroke 画一整桶，而不是「每个点画一个圆」—— 既没有圆珠接缝，也只要十几次调用。
 *
 * ⚠️ points 是「旧 → 新」存放的（新点 push 在尾部），所以最新的一桶取数组末尾那一段。
 */
export function bucketize(points: TrailPoint[], now: number): TrailBucket[] {
  const alive = points.filter((p) => p.life > 0 && now - p.t < p.life)
  if (alive.length < 2) return []

  const out: TrailBucket[] = []
  const n = alive.length
  for (let b = 0; b < BUCKETS; b++) {
    const from = Math.min(n - 1, Math.floor((b * n) / BUCKETS))
    // ⚠️ 必须夹到 n-1：最后一桶原本算出来是 n，会让 lo 变成 -1，最老的那一段被整段丢掉
    const to = Math.min(n - 1, Math.floor(((b + 1) * n) / BUCKETS))
    if (to <= from) continue
    // 换回原数组下标：最新点在 n-1
    const lo = n - 1 - to
    const hi = n - 1 - from
    // 两头各留一个共享边界点，桶与桶之间才连得上、不断线
    const seg = alive.slice(lo, hi + 1)
    if (seg.length < 2) continue

    // 用桶内**最新**那个点算年龄，保证同一桶里透明度一致
    const u = clamp01((now - alive[hi].t) / alive[hi].life)
    out.push({
      alpha: Math.pow(1 - u, 2.2),
      widthScale: 0.3 + 0.7 * Math.pow(1 - u, 0.9),
      pts: seg.map((q) => ({ x: q.x, y: q.y })),
    })
  }
  return out
}

/**
 * 沿尾巴从头部往回累加弧长，超出 maxPx 的部分（更老的那一截）整段丢掉。
 * 用弧长而不是直线距离：急转弯时直线距离会明显小于实际长度，会把尾巴放长。
 */
export function trimByArc(trail: TrailPoint[], maxPx: number): TrailPoint[] {
  if (trail.length < 3) return trail
  let acc = 0
  let cut = -1
  for (let i = trail.length - 1; i > 0; i--) {
    acc += Math.hypot(trail[i].x - trail[i - 1].x, trail[i].y - trail[i - 1].y)
    if (acc > maxPx) {
      cut = i - 1
      break
    }
  }
  return cut > 0 ? trail.slice(cut) : trail
}

/** 尾巴从头到尾的弧长（px）—— 验收脚本用它量「尾巴到底多长」 */
export function arcLength(points: Array<{ x: number; y: number }>) {
  let acc = 0
  for (let i = 1; i < points.length; i++) {
    acc += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
  }
  return acc
}

/** 星点当前透明度：出现快、消失慢 */
export function sparkAlpha(k: Spark, now: number) {
  const u = clamp01((now - k.t) / k.life)
  return Math.pow(1 - u, 1.6)
}

/** 伴星当前透明度：快速淡入 → 长尾淡出 */
export function extraAlpha(m: Meteor, now: number) {
  const age = now - m.bornAt
  const u = clamp01(age / m.life)
  return clamp01(age / 200) * Math.pow(1 - u, 1.7)
}

/* ---- 尾巴铺设 ---------------------------------------------------------- */

function layTrail(m: Meteor, now: number, speed: number) {
  if (speed < TRAIL_MIN_SPEED) return
  const life = trailLifeMs(speed)
  const spacing = pointSpacing(speed)
  const last = m.trail[m.trail.length - 1]
  if (!last) {
    m.trail.push({ x: m.x, y: m.y, t: now, life })
  } else {
    for (const p of subdivide(last.x, last.y, m.x, m.y, spacing)) {
      m.trail.push({ x: p.x, y: p.y, t: now, life })
    }
  }
  const cap = Math.max(8, Math.round(MAX_POINTS * m.scale))
  while (m.trail.length > cap) m.trail.shift()
  m.trail = trimByArc(m.trail, MAX_TAIL_PX * m.scale)
}

/**
 * 主流星落位：出现在指针**后方** STANDOFF_MIN 处（不是箭头上）。
 * 只在「第一次动」和「散尽之后重新动」时调用 —— 连续移动时绝不能调，
 * 否则就是「每移动一下就重新生成一颗」。
 */
function placeMain(sky: SkyState, now: number) {
  const m = sky.main
  m.x = sky.pointer.x - sky.dirx * STANDOFF_MIN
  m.y = sky.pointer.y - sky.diry * STANDOFF_MIN
  m.vx = 0
  m.vy = 0
  m.a = 0
  m.speed = 0
  m.trail = []
  m.sparks = []
  m.spawnLog = []
  m.bornAt = now
  m.awake = true
  sky.spawnCount++
}

/* ---- 状态机 ------------------------------------------------------------ */

/** 指针移动：只记位置与位移，不做任何计算（高频事件里必须极轻） */
export function movePointer(sky: SkyState, x: number, y: number, now: number) {
  if (!sky.primed) {
    sky.primed = true
    sky.pointer.x = x
    sky.pointer.y = y
    sky.lastMoveAt = now
    placeMain(sky, now)
    return
  }
  sky.movedDx += x - sky.pointer.x
  sky.movedDy += y - sky.pointer.y
  sky.pointer.x = x
  sky.pointer.y = y
  sky.lastMoveAt = now
}

/** 推进一帧。dt 单位为秒。纯计算，不碰 DOM */
export function advance(sky: SkyState, now: number, dtRaw: number) {
  const dt = Math.min(Math.max(dtRaw, 0), 0.05) // 切标签页回来时别一步跳完
  const main = sky.main
  sky.active = sky.primed && now - sky.lastMoveAt <= IDLE_MS

  /* ---- 1) 指针速度估计（平滑）+ 稳定的运动方向 ---- */
  const instVx = dt > 0 ? sky.movedDx / dt : 0
  const instVy = dt > 0 ? sky.movedDy / dt : 0
  sky.movedDx = 0
  sky.movedDy = 0
  sky.pvx = approach(sky.pvx, sky.active ? instVx : 0, dt, POINTER_TAU)
  sky.pvy = approach(sky.pvy, sky.active ? instVy : 0, dt, POINTER_TAU)
  const pSpeed = Math.hypot(sky.pvx, sky.pvy)
  // 速度小到分不出方向时，保持上一次的方向 —— 否则站位会绕着指针乱转
  if (pSpeed > 30) {
    sky.dirx = sky.pvx / pSpeed
    sky.diry = sky.pvy / pSpeed
  }

  /* ---- 2) 已经散尽的主流星：指针一动就重新落到指针附近 ---- */
  if (!main.awake) {
    if (!sky.active) {
      updateExtras(sky, now, dt)
      pushTrace(sky, now)
      return
    }
    placeMain(sky, now)
  }

  /* ---- 3) 操纵 or 滑行 ---- */
  if (sky.active) {
    /* 目标站位：指针**后方** standoff 处（后方 = 平滑速度方向的反方向） */
    const standoff = standoffFor(pSpeed)
    const pad = 60
    const tx = clamp(sky.pointer.x - sky.dirx * standoff, pad, sky.viewW - pad)
    const ty = clamp(sky.pointer.y - sky.diry * standoff, pad, sky.viewH - pad)
    /* 目标速度 = 指针速度（跟手）+ 站位误差的比例校正 */
    const vtx = sky.pvx + (tx - main.x) * POS_K
    const vty = sky.pvy + (ty - main.y) * POS_K
    main.vx = approach(main.vx, vtx, dt, VEL_TAU)
    main.vy = approach(main.vy, vty, dt, VEL_TAU)
    main.a = approach(main.a, 1, dt, 0.1)

    /* 近距离分离：指针几乎压到流星时给一点向外的偏置速度。
       正常飞行时站位是 92~215px，这一项恒为 0；只有指针迎着流星冲过来的瞬间
       （空间上必然擦过）才生效，免得「箭头盖在流星上」看起来像箭头变成了流星。 */
    const sx = main.x - sky.pointer.x
    const sy = main.y - sky.pointer.y
    const sd = Math.hypot(sx, sy)
    if (sd < SEP_RADIUS && sd > 0.001) {
      const push = (1 - sd / SEP_RADIUS) * SEP_PUSH
      main.vx += (sx / sd) * push
      main.vy += (sy / sd) * push
    }
  } else {
    /* 停手了：没有操纵输入 → 带着现在的速度滑行，同时本体淡出。
       因为速度是指数衰减（永远不真正到 0），下面还有 STOP_SPEED 收口。 */
    const k = Math.exp(-dt / COAST_TAU)
    main.vx *= k
    main.vy *= k
    main.a = approach(main.a, 0, dt, FADE_TAU)
  }

  /* ---- 4) 积分 + 兜底约束 ---- */
  main.x += main.vx * dt
  main.y += main.vy * dt
  if (sky.active) {
    // 硬保护：极端操作下也别让它跑丢（正常飞行时 POS_K 会先把它拉回来，碰不到这条）
    const dx = sky.pointer.x - main.x
    const dy = sky.pointer.y - main.y
    const d = Math.hypot(dx, dy)
    if (d > LEASH_HARD) {
      const k = (d - LEASH_HARD) / d
      main.x += dx * k
      main.y += dy * k
    }
  }

  const mSpeed = Math.hypot(main.vx, main.vy)
  if (mSpeed < STOP_SPEED) {
    main.vx = 0
    main.vy = 0
  }
  main.speed = approach(main.speed, mSpeed, dt, 0.09)

  /* ---- 5) 铺尾巴：流星在动就铺（滑行时也铺 —— 那正是「惯性光尾」） ---- */
  layTrail(main, now, Math.hypot(main.vx, main.vy))

  /* ---- 6) 散星点：够快、隔够久、没超上限 ---- */
  {
    const want = main.awake ? sparkCount(Math.hypot(main.vx, main.vy)) : 0
    if (
      want > 0 &&
      main.a > 0.2 &&
      now - sky.lastSparkAt > SPARK_GAP_MS &&
      main.sparks.length < SPARK_MAX &&
      main.trail.length >= 4
    ) {
      sky.lastSparkAt = now
      main.spawnLog.push(want)
      if (main.spawnLog.length > 64) main.spawnLog.shift()
      // 从最新那 1/3 段里挑，看起来才像流星本体掉出来的
      const span = Math.max(1, Math.floor(main.trail.length / 3))
      for (let i = 0; i < want; i++) {
        const src = main.trail[Math.floor(Math.random() * span)]
        const ang = Math.random() * Math.PI * 2
        const sp = 18 + Math.random() * 46
        main.sparks.push({
          x: src.x + (Math.random() - 0.5) * 3,
          y: src.y + (Math.random() - 0.5) * 3,
          vx: Math.cos(ang) * sp,
          vy: Math.sin(ang) * sp,
          t: now,
          life: 320 + Math.random() * 300,
          size: 0.6 + Math.random() * 0.8,
        })
      }
    }
  }

  /* ---- 7) 伴星：主流星飞得快、隔够了、没超上限 → 带出 1 颗 ---- */
  if (
    sky.active &&
    pSpeed > EXTRA_SPEED &&
    now - sky.lastExtraAt > EXTRA_GAP_MS &&
    sky.extras.length < EXTRA_MAX
  ) {
    sky.lastExtraAt = now
    sky.extraLog.push(1)
    if (sky.extraLog.length > 64) sky.extraLog.shift()
    sky.extras.push(makeExtra(sky, now, pSpeed))
  }

  updateExtras(sky, now, dt)

  /* ---- 8) 过期清理 ---- */
  if (main.trail.length) main.trail = main.trail.filter((p) => now - p.t < p.life)
  if (main.sparks.length) main.sparks = main.sparks.filter((k) => now - k.t < k.life)
  for (const k of main.sparks) {
    k.x += k.vx * dt
    k.y += k.vy * dt
    k.vx *= Math.exp(-dt / 0.28)
    k.vy *= Math.exp(-dt / 0.28)
  }

  /* ---- 9) 收口 + 散尽后摘掉「醒」标记 ----
     approach(a, 0) 是指数衰减，永远不会精确等于 0，所以这里必须显式夹一刀。 */
  if (main.a < 0.004) main.a = 0
  if (
    main.awake &&
    !sky.active &&
    main.a === 0 &&
    main.trail.length === 0 &&
    main.sparks.length === 0
  ) {
    main.awake = false // 下次指针一动会重新落到指针附近
  }

  pushTrace(sky, now)
}

/** 伴星：出生在主流星附近，顺着主流星的方向飞、但更慢更小，自己慢慢散 */
function makeExtra(sky: SkyState, now: number, pSpeed: number): Meteor {
  const m = makeMeteor(sky.nextId++, false, now)
  const baseAng = Math.atan2(sky.diry, sky.dirx)
  const ang = baseAng + (Math.random() - 0.5) * 0.5 // ±14°：大致跟着走，但不完全一致
  const sp =
    pSpeed *
    (EXTRA_SPEED_GAIN_MIN + Math.random() * (EXTRA_SPEED_GAIN_MAX - EXTRA_SPEED_GAIN_MIN))
  const dist = EXTRA_DIST_MIN + Math.random() * (EXTRA_DIST_MAX - EXTRA_DIST_MIN)
  const off = Math.random() * Math.PI * 2
  const pad = 40
  m.x = clamp(sky.main.x + Math.cos(off) * dist, pad, sky.viewW - pad)
  m.y = clamp(sky.main.y + Math.sin(off) * dist, pad, sky.viewH - pad)
  m.vx = Math.cos(ang) * sp
  m.vy = Math.sin(ang) * sp
  m.scale = 0.42 + Math.random() * 0.22 // 更小
  m.life = EXTRA_LIFE_MIN + Math.random() * (EXTRA_LIFE_MAX - EXTRA_LIFE_MIN)
  m.speed = sp
  m.a = 0
  return m
}

function updateExtras(sky: SkyState, now: number, dt: number) {
  for (const e of sky.extras) {
    // 缓慢阻尼：更慢 → 读起来更「远」
    const k = Math.exp(-dt / EXTRA_DRAG_TAU)
    e.vx *= k
    e.vy *= k
    e.x += e.vx * dt
    e.y += e.vy * dt
    e.speed = Math.hypot(e.vx, e.vy)
    e.a = extraAlpha(e, now)
    /* ⚠️ 只在还看得见的时候铺尾巴。伴星的速度是指数衰减、永远不会真正到 0，
       不 gate 的话它过了寿命还会一直铺新点 → 尾巴永远非空 →
       isAlive() 永远为真 → rAF 永远停不下来（实测踩过：停 3 秒后还在转）。
       主流星没这个问题，因为它的速度在 STOP_SPEED 之下会被直接归零。 */
    if (e.a > 0.02) layTrail(e, now, e.speed)
    if (e.trail.length) e.trail = e.trail.filter((p) => now - p.t < p.life)
  }
  /* ⚠️ 别用 a / trail 判「该不该留」：伴星出生的那一帧 age=0 → a=0，
     而且此时还没来得及铺尾巴 → 会被当场过滤掉，「生下来就死」（实测踩过）。
     按年龄留，留到寿命 + 尾巴最长寿命的余量，尾巴自然就散干净了。 */
  sky.extras = sky.extras.filter((e) => now - e.bornAt < e.life + 1000)
}

function pushTrace(sky: SkyState, now: number) {
  const m = sky.main
  sky.trace.push({
    t: now,
    x: m.x,
    y: m.y,
    px: sky.pointer.x,
    py: sky.pointer.y,
    a: m.a,
    d: Math.hypot(m.x - sky.pointer.x, m.y - sky.pointer.y),
  })
  if (sky.trace.length > 1800) sky.trace.splice(0, sky.trace.length - 1800)
}

/** 还有没有东西要画？全没了就可以停掉 rAF（不白烧 CPU） */
export function isAlive(sky: SkyState) {
  const m = sky.main
  if (m.awake && m.a > 0.004) return true
  if (m.trail.length > 0 || m.sparks.length > 0) return true
  for (const e of sky.extras) {
    if (e.a > 0.004 || e.trail.length > 0) return true
  }
  return false
}
