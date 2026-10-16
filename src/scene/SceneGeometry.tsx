/* ============================================================================
 *  SceneGeometry —— 随 Scene 一起进出的 3D 前景
 * ----------------------------------------------------------------------------
 *  它是「前景」，不是「世界」：
 *      - 切场时跟着前景 UI 一起被甩出视野（scene3d.x → ∓28vw，opacity → 0）
 *      - 银河空镜期间完全不可见（画面只剩 GalaxyWorld）
 *      - 新区域形成后才从另一侧进入
 *  位移幅度 ≈ 28vw，而银河只有 5vw，两者速度差就是视差景深（§9）。
 *
 *  几何体的不透明度通过 FadeContext 下发给各几何体组件（见 geometry/common.ts）。
 * ========================================================================== */

import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import CentralGeometry from '../components/CentralGeometry'
import { THEMES } from '../config/themes'
import { useThemeStore } from '../store/useThemeStore'
import { FadeContext, type FadeHandle } from './fade'
import { AMPLITUDE, scene3d } from '../galaxy/worldState'

export default function SceneGeometry() {
  const shown = useThemeStore((s) => s.shown)
  const theme = THEMES[shown]
  const group = useRef<THREE.Group>(null)
  const viewport = useThree((s) => s.viewport)

  const handle = useMemo<FadeHandle>(() => ({ get: () => scene3d.opacity }), [])

  useFrame(() => {
    const g = group.current
    if (!g) return
    g.position.x = scene3d.x * viewport.width * AMPLITUDE.geoVw
    g.scale.setScalar(scene3d.scale)
    g.rotation.y = scene3d.spin
    g.visible = scene3d.opacity > 0.002
  })

  return (
    <group ref={group}>
      <FadeContext.Provider value={handle}>
        <CentralGeometry id={theme.geometry} />
      </FadeContext.Provider>
    </group>
  )
}
