/* ============================================================================
 *  转场淡入淡出上下文
 * ----------------------------------------------------------------------------
 *  ThemeStage 会给每个「主题层」包一层 FadeLayer，
 *  层内的 3D 组件通过 useFade() 拿到当前不透明度，写进自己的材质。
 *  默认值 1，所以任何几何体单独拿出来用也能正常显示。
 * ========================================================================== */

import { createContext, useContext } from 'react'

export interface FadeHandle {
  /** 返回当前层的整体不透明度 0..1 */
  get: () => number
}

export const FadeContext = createContext<FadeHandle>({ get: () => 1 })

export const useFade = () => useContext(FadeContext)
