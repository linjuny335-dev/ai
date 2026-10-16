/* ============================================================================
 *  粒子系统参数（⭐ 最常改的文件之一）
 * ----------------------------------------------------------------------------
 *  这里的字段全部直接映射到 GLSL uniform，改完刷新即可看到效果。
 *  单个主题可以只覆盖其中几项，未覆盖的用 PARTICLE_DEFAULTS。
 * ========================================================================== */

export interface ParticleSpec {
  /** 粒子总数量。5 万在集显上也能跑；想更省调到 20000，想更密调到 160000 */
  count: number
  /** 星系盘半径（世界单位）。相机在 z=6、fov=45，7 左右刚好铺满视野 */
  radius: number
  /** 盘面垂直厚度。0 = 纯平面薄盘，3 = 蓬松的球状星云 */
  thickness: number
  /** 旋臂数量。1 = 单条螺旋，3~5 = 经典星系，0.5 以下会变成环形 */
  arms: number
  /** 缠绕强度：越大旋臂卷得越紧 */
  swirl: number
  /** 自转速度（正数逆时针，负数顺时针，0 = 静止） */
  spin: number
  /** 云状扰动幅度：让旋臂边缘毛糙、有流体质感 */
  drift: number
  /** 垂直方向的缓慢起伏 */
  rise: number
  /** 基础点尺寸 */
  pointSize: number
  /** 整体亮度乘子 */
  brightness: number
  /** 照片取色占比：0 = 只用主题色，1 = 完全用底图照片的颜色 */
  photoMix: number
  /** 鼠标视差强度 */
  parallax: number
  /** 雾霭层粒子数（做大面积柔和星云用，代价很低） */
  hazeCount: number
  /** 雾霭层尺寸倍率 */
  hazeSize: number
  /** 大亮星的占比（0.03 ≈ 3% 的粒子会被放大 2~4 倍） */
  bigStarChance: number
  /** 盘面倾角（弧度）。0 = 正对着看，0.9 ≈ 侧面看 */
  tilt: number
}

export const PARTICLE_DEFAULTS: ParticleSpec = {
  count: 46000,
  // 相机在 z=6、fov=45，z=0 处的可见高度约 4.97、宽度约 7.95，
  // 所以半径 3.5~4.5 的星系刚好铺满画面并留出边缘。
  radius: 3.9,
  thickness: 0.6,
  arms: 4,
  swirl: 2.8,
  spin: 0.05,
  drift: 0.5,
  rise: 0.28,
  pointSize: 13,
  brightness: 0.78,
  photoMix: 0.34,
  parallax: 0.2,
  hazeCount: 300,
  hazeSize: 100,
  bigStarChance: 0.02,
  tilt: 0.62,
}

/** 主题里可只写需要改的字段 */
export type ParticleOverride = Partial<ParticleSpec>

export function resolveParticleSpec(override?: ParticleOverride): ParticleSpec {
  return { ...PARTICLE_DEFAULTS, ...(override ?? {}) }
}
