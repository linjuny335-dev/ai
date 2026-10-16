/* ============================================================================
 *  场景状态（Zustand）
 * ----------------------------------------------------------------------------
 *  这里只存「低频」信息：要去哪个区域、现在显示哪个区域、转场阶段、是否锁住。
 *  真正 60fps 的动画数值在 src/galaxy/worldState.ts（普通对象，GSAP 直接补间）。
 *
 *  index  = 用户请求的目标区域（点了导航立刻变，导航高亮马上响应）
 *  shown  = 画面上真正显示的区域（转场走到「新区域已形成」那一刻才变）
 *  两者分离，才有了「先退出 → 空镜 → 再进入」的时序。
 * ========================================================================== */

import { create } from 'zustand'
import { THEMES } from '../config/themes'
import type { Phase } from '../galaxy/worldState'

interface ThemeStore {
  /** 目标区域 */
  index: number
  /** 当前真正渲染的区域（转场中途才推进） */
  shown: number
  /** 转场阶段，给固定 UI 做状态提示用 */
  phase: Phase
  /** §14：转场期间锁死，忽略一切新的导航请求 */
  isTransitioning: boolean
  audio: boolean
  viewAll: boolean

  /** 请求切换区域。转场中被忽略，目标相同也被忽略 */
  go: (index: number) => void
  next: () => void
  prev: () => void
  /** 由 SceneManager 在「新区域形成」时调用 */
  setShown: (index: number) => void
  setPhase: (phase: Phase) => void
  /** 由 SceneManager 在进场动画结束时调用，解锁 */
  finish: () => void
  setAudio: (on: boolean) => void
  setViewAll: (open: boolean) => void
}

const wrap = (i: number) => {
  const n = THEMES.length
  return ((i % n) + n) % n
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
  index: 0,
  shown: 0,
  phase: 'idle',
  isTransitioning: false,
  audio: false,
  viewAll: false,

  go: (index) => {
    const s = get()
    const target = wrap(index)
    // §14 锁定：转场中直接丢弃新请求，避免场景错乱
    if (s.isTransitioning || target === s.index) return
    set({ index: target, isTransitioning: true })
  },

  next: () => get().go(get().index + 1),
  prev: () => get().go(get().index - 1),

  setShown: (index) => set({ shown: index }),
  setPhase: (phase) => set({ phase }),
  finish: () => set({ isTransitioning: false, phase: 'idle' }),

  setAudio: (audio) => set({ audio }),
  setViewAll: (viewAll) => set({ viewAll }),
}))

/** 当前显示的场景对象（DOM 层用；3D 层的颜色请走 useLiveTheme） */
export const useActiveScene = () => THEMES[useThemeStore((s) => s.shown)]
