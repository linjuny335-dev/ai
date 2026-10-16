/* ============================================================================
 *  LiveTheme —— 3D 层的「银河实时状态」
 * ----------------------------------------------------------------------------
 *  问题：换区要做成连贯的过渡，但颜色不能走 React state（会 60fps 重渲染）。
 *  做法：颜色放在 ref 里，每帧按 world.mix 在「起点区域」和「目标区域」之间插值，
 *       几何体 / 粒子在各自的 useFrame 里读这个 ref 写进材质。
 *
 *  关键：mix 由 GSAP 时间轴驱动（不是自己按 dt 累加），
 *       所以「粒子变色」「底图换区」「几何体进出」严格同一条时间轴 —— 不会各跑各的。
 *
 *  颜色插值发生在银河空镜阶段（§7），新区域形成时颜色已经到位，
 *  新 UI 进入时不会再看到背景还在变色。
 * ========================================================================== */

import { createContext, useContext, useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { THEMES, geometryColors } from '../config/themes'
import { smoothstep, world } from '../galaxy/worldState'

export interface LiveTheme {
  core: THREE.Color
  mid: THREE.Color
  edge: THREE.Color
  glow: THREE.Color
  /** 「中心几何体」专用色。主题没写 palette.geometry 时与上面三个完全相同 */
  gMid: THREE.Color
  gEdge: THREE.Color
  gGlow: THREE.Color
  /** 正在淡出的银河区域（THEMES 下标） */
  texFrom: number
  /** 正在淡入的银河区域 */
  texTo: number
  /** 0 → 1 的转场进度 */
  mix: number
  /** 穿梭脉冲：0 → 1 → 0，给 Bloom 做一次呼吸 */
  pulse: number
}

type Ctx = { current: LiveTheme } | null

const ThemeCtx = createContext<Ctx>(null)

/** 主题色板是静态的，模块加载时一次性解析 */
const PAL = THEMES.map((t) => {
  const g = geometryColors(t)
  return {
    core: new THREE.Color(t.palette.core),
    mid: new THREE.Color(t.palette.mid),
    edge: new THREE.Color(t.palette.edge),
    glow: new THREE.Color(t.palette.glow),
    gMid: new THREE.Color(g.mid),
    gEdge: new THREE.Color(g.edge),
    gGlow: new THREE.Color(g.glow),
  }
})

const at = (i: number) => PAL[i] ?? PAL[0]

export function LiveThemeProvider({ children }: { children: ReactNode }) {
  const P0 = at(0)

  const ref = useRef<LiveTheme>({
    core: P0.core.clone(),
    mid: P0.mid.clone(),
    edge: P0.edge.clone(),
    glow: P0.glow.clone(),
    gMid: P0.gMid.clone(),
    gEdge: P0.gEdge.clone(),
    gGlow: P0.gGlow.clone(),
    texFrom: 0,
    texTo: 0,
    mix: 0,
    pulse: 0,
  })

  useFrame(() => {
    const cur = ref.current
    // world.from / world.to 由 SceneManager 在转场开始时写好
    const a = at(world.from)
    const b = at(world.to)

    cur.texFrom = world.from
    cur.texTo = world.to
    cur.mix = world.mix

    const t = smoothstep(world.mix) // 两头缓，中间快
    cur.core.copy(a.core).lerp(b.core, t)
    cur.mid.copy(a.mid).lerp(b.mid, t)
    cur.edge.copy(a.edge).lerp(b.edge, t)
    cur.glow.copy(a.glow).lerp(b.glow, t)
    cur.gMid.copy(a.gMid).lerp(b.gMid, t)
    cur.gEdge.copy(a.gEdge).lerp(b.gEdge, t)
    cur.gGlow.copy(a.gGlow).lerp(b.gGlow, t)

    // 穿梭最深处给一次脉冲（Bloom 提亮 / 粒子轻抖）
    cur.pulse = Math.sin(Math.PI * (world.mix < 0 ? 0 : world.mix > 1 ? 1 : world.mix))
  })

  return <ThemeCtx.Provider value={ref}>{children}</ThemeCtx.Provider>
}

/** 必须在 <LiveThemeProvider> 内部（也就是 Canvas 内部）调用 */
export function useLiveTheme(): { current: LiveTheme } {
  const ref = useContext(ThemeCtx)
  if (!ref) throw new Error('[LiveTheme] useLiveTheme 必须在 <LiveThemeProvider> 内部使用')
  return ref
}
