/* ============================================================================
 *  主题配置（⭐ 最常改的文件）
 * ----------------------------------------------------------------------------
 *  一个主题 = 一套配色 + 一段文案 + 一组 Logo + 一个中心几何体 + 一个背景。
 *  新增主题：往 THEMES 数组里 push 一项即可，左侧导航会自动多出一个节点。
 *  删除主题：从数组里删掉对应项即可，其余代码无需改动。
 *
 *  ── 内容结构（天文科普线）────────────────────────────────────────────────
 *  五个栏目是一条递进的叙事线，顺序不要随意调换：
 *
 *      01 PHOTON   光 · 看见宇宙    —— 先看见（光是我们唯一的信使）
 *      02 FOUNDRY  器 · 探索宇宙    —— 再探索（火箭与卫星，把人送出去）
 *      03 CORTEX   智 · 读懂宇宙    —— 再理解（黑洞、引力波、暗物质）
 *      04 BLUEYARD 青年 · 参与宇宙  —— 再参与（本月天象、观测入门）
 *      05 TECH     实时 · 航天动态  —— 最后看最新动态（真实数据，每 3 分钟刷新）
 *
 *  命名约定：`nav` 保留英文（左边导航的主名），`navCn` 是中文副名
 *  （导航第二行、VIEW ALL 面板里都会用到）。正文一律英文主标题 + 中文副文案。
 *
 *  ── 首页入口层（ENTRY）───────────────────────────────────────────────────
 *  数组里**第一个**主题带 `entry: true`，它是首页，不是章节：
 *    · 不进左侧轨道导航、不进 VIEW ALL 面板（所以章节编号仍是 01~05）
 *    · **背景与 PHOTON 完全共用**（同一张素材、同一 tint/gain、同一套色板），
 *      这样首页 → PHOTON 的两层纹理在数学上完全相同，转场里不可能「换图」
 *    · 粒子只做「更安静」的一档（同旋臂数 / 同半径 / 同倾角，只是更慢更暗），
 *      所以看起来仍是同一个银河，不是另一个宇宙
 *    · 点「开始探索」走 push 转场（镜头向前推进），不是左右平移
 * ========================================================================== */

import type { ParticleOverride } from './particleDefaults'

/** 中心几何体注册表里的 id，见 src/geometry/index.ts */
export type GeometryId = 'spiralOrbits' | 'cubeNetwork' | 'wireBrain' | 'holoCore'

/** 背景注册表里的 id，见 src/backgrounds/index.ts */
export type BackgroundId = 'nebula'

export interface ThemePalette {
  /** 星系核心颜色（盘心最亮处） */
  core: string
  /** 中段主色 */
  mid: string
  /** 外缘颜色（最暗） */
  edge: string
  /** 中心几何体的高光 / 描边 */
  glow: string
  /** DOM 层强调色：导航高亮、Logo 悬停发光等 */
  accent: string
  /** 底图（对应 public/textures 下的照片） */
  backdrop: {
    src: string
    /** 给照片叠加的色调乘子，用来让同一张照片服务不同主题；`#ffffff` = 不染色 */
    tint: string
    /** 照片亮度增益（照片本身偏暗） */
    gain: number
  }
  /**
   * 可选：只覆盖「中心几何体」的配色，不影响粒子、底图与 DOM 文字。
   * 用途：底图换了色系之后，让几何体单独跟着换，而粒子保持原样。
   * 不填则几何体直接复用上面的 mid / edge / glow。
   */
  geometry?: {
    mid?: string
    edge?: string
    glow?: string
  }
}

export interface Theme {
  /** 会写到 <html data-theme> 上，与 styles.css 里的强调色变量对应 */
  id: string
  /** 导航里的短标签（英文主名，保留） */
  nav: string
  /** 导航里的中文副名，例如「光 · 看见宇宙」。写空字符串则只显示英文 */
  navCn: string
  /** 导航图标 */
  icon: 'spiral' | 'cube' | 'brain' | 'eye' | 'tech' | 'brand'
  /** 顶部小字标签 */
  kicker: string
  /** 主标题，两行 */
  headline: [string, string]
  /** 副文案（英文，与主标题同语言） */
  blurb: string
  /** 副文案（中文，小号弱化显示；留空字符串即可隐藏） */
  blurbCn: string
  /** 漂浮的关键名字（望远镜 / 火箭 / 探测器）。想加就加，想减就减 */
  logos: string[]
  /** VIEW ALL 面板里的描述 */
  summary: string
  geometry: GeometryId
  background: BackgroundId
  palette: ThemePalette
  /** 只覆盖需要改的粒子参数，其余用 PARTICLE_DEFAULTS */
  particle?: ParticleOverride
  /** 品牌介绍态：不显示标题与 Logo，改显示字标 + 链接 */
  brand?: { links: { label: string; href: string }[] }
  /**
   * 入口主页标记。带这个标记的主题：
   *   · 不进左侧轨道导航、不进 VIEW ALL 面板（章节编号不受影响）
   *   · 进出它时 SceneManager 走 push 推进转场
   * 全站只应该有**一个**（THEMES[0]）。
   */
  entry?: boolean
}

export const THEMES: Theme[] = [
  /* ══════════════════════════════════ ENTRY · 首页 —— 同一个银河世界的入口 ══ */
  {
    id: 'home',
    nav: 'Home',
    navCn: '入口 · 从这里出发',
    icon: 'brand',
    kicker: '逐光计划 · A FIVE-CHAPTER JOURNEY',
    /* ⚠️ 首页标题只有一行英文（读theme.headline[0]），第二行不是英文副标题，
       而是 BrushTitle 的「逐光而行」书法艺术字 —— 视觉中心让给中文。
       所以 headline[1] 这里保留一个语义副标题，只给「返回主页 / VIEW ALL」等
       读 headline[1] 的场合用（见 ui/TopBar.tsx）。 */
    headline: ['CHASING PHOTONS', '逐光而行'],
    blurb:
      'Light, machines, computation, young observers and live launches — five chapters inside a single galaxy.',
    blurbCn: '光 · 器 · 智 · 青年 · 实时 —— 同一个银河世界里的五段路。',
    /* 首页刻意不放漂浮的关键名字：减少前景元素，只留一句入口 */
    logos: [],
    summary: '入口 —— 从这个银河世界出发，依次走进光、器、智、青年与实时五个章节。',
    /* 与 PHOTON 同款几何体：推进时中心结构是连续的，不会「换一个东西再进来」 */
    geometry: 'spiralOrbits',
    background: 'nebula',
    /* ⚠️ 逐字段与 PHOTON 完全一致。
       这是「首页不换图」的技术保证：转场时两层 GalaxyLayer 拿到的是同一个
       THREE.Texture 实例、同一个 tint、同一个 gain，色板插值也插不出变化。
       改 PHOTON 的色板时这里必须一起改（见 _analysis/by-home.js 的断言）。 */
    palette: {
      core: '#fff3ff',
      mid: '#9b8cff',
      edge: '#3b2f96',
      glow: '#cbb8ff',
      accent: '#a091ff',
      backdrop: { src: '/textures/galaxy-violet.jpg', tint: '#c3b4ff', gain: 1.02 },
    },
    /* 同一个银河，更安静的一档：旋臂数 / 半径 / 厚度 / 倾角**不动**（保持同一个形状），
       只把转速、云扰动、亮度、视差压下来 —— 首页像「宇宙在你脚下慢慢转」。 */
    particle: {
      count: 30000,
      spin: 0.03,
      drift: 0.4,
      brightness: 0.72,
      parallax: 0.12,
      bigStarChance: 0.014,
    },
    entry: true,
  },

  /* ══════════════════════════════════════════════ 01 · 光 — 看见宇宙 ══════ */
  {
    id: 'photon',
    nav: 'Photon',
    navCn: '光 · 看见宇宙',
    icon: 'spiral',
    kicker: '第一章 · 光 — 看见宇宙',
    headline: ['THE UNIVERSE', 'IS WRITTEN IN LIGHT'],
    blurb:
      'A photon can travel for thirteen billion years and still carry the story of where it came from. A telescope is simply how we learn to read it.',
    blurbCn:
      '我们知道的宇宙，几乎全部来自光。一个光子可以走上一百三十亿年，仍然带着出发地的信息 —— 望远镜，就是我们学会阅读它的方式。',
    logos: ['HUBBLE', 'JAMES WEBB', 'VERA RUBIN', 'GAIA', 'CHANDRA', 'KECK'],
    summary:
      '看见宇宙 —— 光是我们唯一的信使。从哈勃到韦布，人类把走了亿万年的星光读成证据。',
    geometry: 'spiralOrbits',
    background: 'nebula',
    palette: {
      core: '#fff3ff',
      mid: '#9b8cff',
      edge: '#3b2f96',
      glow: '#cbb8ff',
      accent: '#a091ff',
      backdrop: { src: '/textures/galaxy-violet.jpg', tint: '#c3b4ff', gain: 1.02 },
    },
  },

  /* ══════════════════════════════════════════════ 02 · 器 — 探索宇宙 ══════ */
  {
    id: 'foundry',
    nav: 'Foundry',
    navCn: '器 · 探索宇宙',
    icon: 'cube',
    kicker: '第二章 · 器 — 探索宇宙',
    headline: ['TO GO THERE', 'WE HAVE TO BUILD IT'],
    blurb:
      'Nothing in space happens without a machine that survives the launch. Rockets and satellites are how a destination becomes an itinerary.',
    blurbCn:
      '太空里没有一件事不依赖一台能扛过发射的机器。火箭、卫星，以及把「一个目的地」变成「一段行程」的那套工程能力。',
    logos: ['SATURN V', 'FALCON 9', 'STARSHIP', 'SLS', 'ARIANE 6', 'LONG MARCH'],
    summary:
      '探索宇宙 —— 火箭与卫星。运载能力决定了人类能走多远，也决定了卫星能把什么送回地面。',
    geometry: 'cubeNetwork',
    background: 'nebula',
    palette: {
      /* 冷紫色板：色相统一在 252-268°（蓝紫 → 紫罗兰）。
         每个槽位的亮度是按「老金色系同槽位的相对亮度」反解出来的，
         所以只换了色相，明暗关系没动。求解脚本见 _analysis/palette5.py */
      core: '#f5f3fb',
      mid: '#a889fa',
      edge: '#782fe5',
      glow: '#cbbffb',
      accent: '#ae93f9',
      /* 底图：冷紫星系。tint 用 #ffffff = 不做任何染色，照片以原色呈现 */
      backdrop: { src: '/textures/galaxy-cold-violet.jpg', tint: '#ffffff', gain: 0.98 },
      /* 中心几何体（立方体网络）：比粒子再亮一点、再饱和一点，保证线框看得清 */
      geometry: { mid: '#bf90fc', edge: '#8024e9', glow: '#d5c6f9' },
    },
    particle: {
      count: 40000,
      radius: 3.55,
      arms: 3,
      swirl: 2.1,
      spin: 0.038,
      thickness: 0.72,
      drift: 0.6,
      photoMix: 0.45,
      brightness: 0.86,
      tilt: 0.74,
    },
  },

  /* ══════════════════════════════════════════════ 03 · 智 — 读懂宇宙 ══════ */
  {
    id: 'cortex',
    nav: 'Cortex',
    navCn: '智 · 读懂宇宙',
    icon: 'brain',
    kicker: '第三章 · 智 — 读懂宇宙',
    headline: ['TO UNDERSTAND IT', 'WE HAVE TO COMPUTE IT'],
    blurb:
      'Black holes, gravitational waves, dark matter — most of the universe is invisible. We only know it exists by decoding signals we can measure.',
    blurbCn:
      '黑洞、引力波、暗物质：宇宙里绝大部分东西看不见。我们只能从能测到的信号里，一点一点反推出它们的样子。',
    logos: ['LIGO', 'VIRGO', 'KAGRA', 'LISA', 'EVENT HORIZON', 'PULSAR TIMING'],
    summary:
      '读懂宇宙 —— 黑洞、引力波与暗物质。宇宙的主要成分看不见，只能靠信号反推。',
    geometry: 'wireBrain',
    background: 'nebula',
    palette: {
      core: '#eef7ff',
      mid: '#5fa8ff',
      edge: '#123a72',
      glow: '#a9d4ff',
      accent: '#5fa8ff',
      backdrop: { src: '/textures/galaxy-indigo.jpg', tint: '#a9c9ff', gain: 1.02 },
    },
    particle: {
      count: 42000,
      radius: 4.6,
      arms: 2,
      swirl: 2.9,
      spin: 0.028,
      thickness: 1.0,
      drift: 0.85,
      rise: 0.45,
      pointSize: 11.5,
      photoMix: 0.3,
      parallax: 0.16,
      tilt: 0.48,
    },
  },

  /* ══════════════════════════════════════════════ 04 · 青年 — 参与宇宙 ════ */
  {
    id: 'blueyard',
    nav: 'Blueyard',
    navCn: '青年 · 参与宇宙',
    icon: 'eye',
    kicker: '第四章 · 青年 — 参与宇宙',
    headline: ['THE SKY IS YOURS', 'START TONIGHT'],
    blurb:
      'Astronomy is the one science you can do with your own eyes. A dark night, a clear sky and a little patience are the whole entry fee.',
    blurbCn:
      '仰望星空是唯一不需要科研经费的科学。本月有哪些天象值得等、第一次观星要带什么、怎样用手机拍下银河 —— 从这里开始。',
    /* 五个一组：这一组都是多词短语，凑六个会在 1440 下把最后一个挤到第二行 */
    logos: ['STAR PARTY', 'METEOR WATCH', 'ASTROPHOTO', 'CITIZEN SCIENCE', 'DARK SKY'],
    summary:
      '参与宇宙 —— 给青年天文爱好者：本月天象怎么看、观测入门，以及拍星星的方法。',
    geometry: 'holoCore',
    background: 'nebula',
    palette: {
      core: '#f6f9ff',
      mid: '#7d8cff',
      edge: '#1b2350',
      glow: '#c8d2ff',
      accent: '#8f9dff',
      backdrop: { src: '/textures/galaxy-violet.jpg', tint: '#8f98dc', gain: 0.78 },
    },
    particle: {
      count: 28000,
      radius: 5.6,
      arms: 5,
      swirl: 1.0,
      spin: 0.018,
      thickness: 0.5,
      photoMix: 0.3,
      parallax: 0.14,
      bigStarChance: 0.03,
      tilt: 0.66,
      brightness: 0.6,
    },
  },

  /* ══════════════════════════════════════════════ 05 · 实时 — 航天动态 ════ */
  {
    id: 'tech',
    nav: 'Tech',
    navCn: '实时 · 航天动态',
    icon: 'tech',
    kicker: '第五章 · 实时 — 航天动态',
    /* 标题由 TechScene 渲染（那里还有搜索框和 feed 切换），
       它直接读这里的 headline，改文案只改这一处 */
    headline: ['SPACE WIRE', 'LIVE UPDATES'],
    blurb:
      'Launches, missions and the open-source stack behind them — pulled live from public APIs, refreshed every three minutes.',
    blurbCn: '发射、任务与背后的开源技术栈，取自公开接口，每 3 分钟自动刷新。',
    logos: [],
    summary:
      '实时航天动态 —— 全球航天新闻、开源航天项目与卫星遥感 AI 模型，全部真实数据、每 3 分钟自动刷新。',
    geometry: 'holoCore',
    background: 'nebula',
    palette: {
      core: '#eafffb',
      mid: '#54d6e8',
      edge: '#0b4a58',
      glow: '#b8f2ff',
      accent: '#5fd8e8',
      backdrop: { src: '/textures/galaxy-indigo.jpg', tint: '#8fe8f5', gain: 0.95 },
      geometry: { mid: '#7ce6f2', edge: '#0e5f70', glow: '#d6f8ff' },
    },
    particle: {
      count: 24000,
      radius: 4.2,
      arms: 2,
      swirl: 2.4,
      spin: 0.03,
      thickness: 0.9,
      drift: 0.5,
      pointSize: 10,
      brightness: 0.7,
      photoMix: 0.4,
      parallax: 0.18,
      tilt: 0.55,
    },
  },
]

/** 便捷读取：拿到某个主题对应的强调色（给 DOM 用） */
export const themeById = (id: string): Theme =>
  THEMES.find((t) => t.id === id) ?? THEMES[0]

/* ---------------------------------------------------------------- 入口 / 章节 */

/** 首页入口层在 THEMES 里的下标（带 entry 标记的那个） */
export const ENTRY_INDEX = Math.max(
  0,
  THEMES.findIndex((t) => t.entry === true),
)

/** 首页之后的第一章（「开始探索」要去的那个） */
export const FIRST_CHAPTER_INDEX = Math.min(THEMES.length - 1, ENTRY_INDEX + 1)

/** 真正的章节列表（左边轨道导航 / VIEW ALL 面板只认这个），并保留原下标 */
export const CHAPTER_THEMES = THEMES.map((theme, index) => ({ theme, index })).filter(
  (x) => x.theme.entry !== true,
)

/** 这个下标是不是首页入口层 */
export const isEntryIndex = (index: number) => THEMES[index]?.entry === true

/** 解析某个主题「中心几何体」实际使用的三色，缺省回落到主题自身的 mid/edge/glow */
export function geometryColors(theme: Theme): { mid: string; edge: string; glow: string } {
  const o = theme.palette.geometry
  return {
    mid: o?.mid ?? theme.palette.mid,
    edge: o?.edge ?? theme.palette.edge,
    glow: o?.glow ?? theme.palette.glow,
  }
}
