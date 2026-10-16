/* ============================================================================
 *  Scene —— 主画布（GalaxyWorld 的载体）
 * ----------------------------------------------------------------------------
 *  渲染顺序（由 renderOrder 决定）：
 *     -1002  银河层 A —— 当前区域
 *     -1001  银河层 B —— 目标区域（交叉溶解在上面）
 *        -6  雾霭层
 *        -5  星点层
 *         0  当前 Scene 的 3D 前景（随 Scene 进出）
 *  最后统一走 Bloom 后期。
 *
 *  注意：GalaxyWorld / ParticleBackground 在这里只挂载一次，
 *  切换 Scene 时它们都原地不动 —— 动的只有 SceneGeometry 与 DOM 前景。
 * ========================================================================== */

import { Suspense, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { THEMES } from '../config/themes'
import { resolveParticleSpec } from '../config/particleDefaults'
import { useThemeStore } from '../store/useThemeStore'
import ParticleBackground from '../components/ParticleBackground'
import GalaxyWorld from '../galaxy/GalaxyWorld'
import Effects from '../scene/Effects'
import { LiveThemeProvider } from '../scene/LiveTheme'
import PointerRig from '../scene/PointerRig'
import SceneGeometry from '../scene/SceneGeometry'

export default function Scene() {
  const shown = useThemeStore((s) => s.shown)
  const theme = THEMES[shown]

  // 场景自带的部分覆盖项 + 全局默认值
  const spec = useMemo(() => resolveParticleSpec(theme.particle), [theme])

  return (
    <Canvas
      flat
      dpr={[1, 1.75]}
      gl={{ antialias: false, alpha: false, powerPreference: 'high-performance' }}
      camera={{ position: [0, 0, 6], fov: 45, near: 0.1, far: 80 }}
    >
      <color attach="background" args={['#04050b']} />

      {/* 银河实时状态（颜色插值 / 换区进度）都挂在这一层下面 */}
      <LiveThemeProvider>
        <PointerRig />

        <Suspense fallback={null}>
          {/* 同一个宇宙：底图 + 星点 + 粒子，常驻不动 */}
          <GalaxyWorld>
            <ParticleBackground backgroundId={theme.background} spec={spec} />
          </GalaxyWorld>

          {/* 会随 Scene 进出的 3D 前景 */}
          <SceneGeometry />
          <Effects />
        </Suspense>
      </LiveThemeProvider>
    </Canvas>
  )
}
