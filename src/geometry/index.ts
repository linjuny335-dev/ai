/* ============================================================================
 *  ⭐ 几何体注册表 —— 加新几何体主要动这里
 * ----------------------------------------------------------------------------
 *  1. 新建 src/geometry/MyShape.tsx，导出一个无 props 的组件：
 *         export default function MyShape() { ... }
 *     在组件内部：
 *         const live = useLiveTheme()   // 当前主题色 ref
 *         const fade = useFade()        // 本层转场不透明度 getter
 *         useFrame(...)                 // 自转 / 呼吸 / 同步颜色与透明度
 *     颜色的同步方式参考 SpiralOrbits 的 userData 约定：
 *         <mesh userData={{ slot: 'mid', opacity: 0.9, spin: 0.2 }}>
 *
 *     槽位（slot）有两套，粒子与底图只用前一套：
 *         core / mid / edge / glow  —— 主题主色，粒子与几何体共用
 *         gMid / gEdge / gGlow      —— **只给中心几何体**的三色
 *     主题里写了 palette.geometry 时，后三个会变成那套覆盖色，否则与前三个完全一致。
 *     所以几何体统一用 gMid / gEdge / gGlow，就能被「单独特换背景色系」的主题影响到。
 *
 *  2. 在这里 import 并起个 id 挂上去。
 *  3. themes.ts 里把某个主题的 geometry 改成这个 id。
 * ========================================================================== */

import CubeNetwork from './CubeNetwork'
import HoloCore from './HoloCore'
import SpiralOrbits from './SpiralOrbits'
import WireBrain from './WireBrain'

export const GEOMETRIES: Record<string, () => React.JSX.Element> = {
  spiralOrbits: SpiralOrbits,
  cubeNetwork: CubeNetwork,
  wireBrain: WireBrain,
  holoCore: HoloCore,

  // ← 在这里加新几何体，例如：
  // torusKnot: TorusKnot,
  // lattice: Lattice,
}

export const DEFAULT_GEOMETRY = 'spiralOrbits'
