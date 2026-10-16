/* ============================================================================
 *  几何体的公共工具
 * ========================================================================== */

import * as THREE from 'three'
import type { LiveTheme } from '../scene/LiveTheme'

/**
 * 可选的配色槽位。
 * core/mid/edge/glow —— 主题 palette 的四个主色（粒子与几何体共用）
 * gMid/gEdge/gGlow —— 「只给中心几何体用」的三色，主题没配 palette.geometry 时与上面完全相同
 */
export type PaletteSlot = 'core' | 'mid' | 'edge' | 'glow' | 'gMid' | 'gEdge' | 'gGlow'

/**
 * 把一个材质刷成「当前主题色 × 当前转场不透明度」。
 * 几何体在 useFrame 里遍历自己的子物件调用它即可，
 * 这样「粒子与几何体颜色同步变化」是自动成立的。
 */
export function paint(
  mat: THREE.Material | null | undefined,
  live: { current: LiveTheme },
  slot: PaletteSlot,
  fade: number,
  opacity = 1,
) {
  if (!mat) return
  const m = mat as THREE.Material & { color?: THREE.Color; opacity: number }
  if (m.color) m.color.copy(live.current[slot])
  m.opacity = THREE.MathUtils.clamp(fade * opacity, 0, 1)
}

/** 每个几何体的子物件都用同一套 userData 约定 */
export interface PartHint {
  slot?: PaletteSlot
  opacity?: number
  /** 每秒自转（绕自身 z 轴） */
  spin?: number
}

export function hints(h: PartHint) {
  return h as unknown as Record<string, unknown>
}
