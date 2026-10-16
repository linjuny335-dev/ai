/* ============================================================================
 *  背景层的统一契约
 * ----------------------------------------------------------------------------
 *  任何背景实现只要满足这个 props 形状，就能被 ParticleBackground 挂上去。
 *  想换成「代码雨」「流体噪声」「视频贴图」……都只需要实现这个接口。
 * ========================================================================== */

import type { ParticleSpec } from '../config/particleDefaults'

export interface BackgroundComponentProps {
  /** 已合并默认值的粒子参数 */
  spec: ParticleSpec
}

export type BackgroundComponent = (props: BackgroundComponentProps) => React.JSX.Element

/** 每个背景实现的内部预算：一次分配到位，靠 uniform 控制实际显示数量，
 *  这样切换主题时不会重建缓冲区、粒子也不会瞬移。 */
export const MAX_STARS = 120000
export const MAX_HAZE = 1600
