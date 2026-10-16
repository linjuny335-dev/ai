/* ============================================================================
 *  ⭐⭐ 背景注册表 —— 换背景主要动这里
 * ----------------------------------------------------------------------------
 *  用法：把新背景的组件 import 进来，起个 id 挂到 BACKGROUNDS 上，
 *       然后在 src/config/themes.ts 里把某个主题的 `background` 改成这个 id。
 *
 *  一个背景组件只需要满足：
 *      ({ spec }: { spec: ParticleSpec }) => JSX
 *  spec 里是全套可调参数（数量 / 半径 / 旋臂 / 速度 / 厚度 / 亮度 / 视差 …），
 *  见 src/config/particleDefaults.ts。
 *
 *  在组件内部你可以读到：
 *      useLiveTheme()   → 当前配色 ref（每帧插值，切主题自动过渡）
 *      useBackdropTextures() → 当前主题的银河照片纹理
 *      pointer          → 鼠标位置 / 拖拽位移
 *      useFade()        → 本层的转场不透明度（背景一般不需要）
 *
 *  示例：想换成「流体噪声」背景
 *      1. 新建 src/backgrounds/FlowNoise.tsx，导出同签名的组件
 *      2. 这里 import 并写成  flowNoise: FlowNoise
 *      3. themes.ts 里 background: 'flowNoise'
 *  原来的 NebulaField 一行都不需要改，随时可以切回来。
 * ========================================================================== */

import NebulaField from './NebulaField'
import type { BackgroundComponent } from './types'

export const BACKGROUNDS: Record<string, BackgroundComponent> = {
  nebula: NebulaField,

  // ← 在这里加新背景，例如：
  // flowNoise: FlowNoise,
  // starfield: Starfield,
}

/** themes.ts 里写了不存在的 id 时回退到这个 */
export const DEFAULT_BACKGROUND = 'nebula'

export type { BackgroundComponent, BackgroundComponentProps } from './types'
