/* ============================================================================
 *  主题 01 — 发光螺旋 / 轨道线
 * ----------------------------------------------------------------------------
 *  四条对数螺旋沿曲线扫成细管，外面套三层不同倾角的轨道环，
 *  中心一颗脉动的核。全部程序化，没有任何外部模型。
 * ========================================================================== */

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useFade } from '../scene/fade'
import { useLiveTheme } from '../scene/LiveTheme'
import { clampDt } from '../scene/timing'
import { hints, paint, type PaletteSlot } from './common'

const ARM_COUNT = 4

interface RingSpec {
  geo: THREE.BufferGeometry
  rotation: [number, number, number]
  spin: number
}

export default function SpiralOrbits() {
  const live = useLiveTheme()
  const fade = useFade()
  const group = useRef<THREE.Group>(null)

  /** 四条主螺旋：半径线性外扩 + 角度线性缠绕，形成对数螺旋的近似 */
  const arms = useMemo(() => {
    const out: THREE.BufferGeometry[] = []
    for (let a = 0; a < ARM_COUNT; a++) {
      const pts: THREE.Vector3[] = []
      const N = 180
      for (let i = 0; i <= N; i++) {
        const u = i / N
        const theta = u * 3.9 + (a / ARM_COUNT) * Math.PI * 2
        const r = 0.22 + u * 1.85
        const y = Math.sin(u * Math.PI) * 0.26 - 0.1
        pts.push(new THREE.Vector3(Math.cos(theta) * r, y, Math.sin(theta) * r))
      }
      const curve = new THREE.CatmullRomCurve3(pts)
      out.push(new THREE.TubeGeometry(curve, 200, 0.0095, 6, false))
    }
    return out
  }, [])

  /** 三层轨道环，倾角各不相同，各自缓慢进动 */
  const rings = useMemo<RingSpec[]>(() => {
    const specs: Array<{ r: number; t: number; rot: [number, number, number]; spin: number }> = [
      { r: 2.28, t: 0.009, rot: [Math.PI / 2.35, 0, 0.15], spin: 0.16 },
      { r: 2.55, t: 0.0065, rot: [Math.PI / 2.05, 0.45, 0], spin: -0.11 },
      { r: 2.02, t: 0.008, rot: [Math.PI / 1.85, -0.4, 0.3], spin: 0.22 },
    ]
    return specs.map((s) => ({
      geo: new THREE.TorusGeometry(s.r, s.t, 5, 220),
      rotation: s.rot,
      spin: s.spin,
    }))
  }, [])

  /** 中心核：刻意做小 —— 它正好落在标题正后方，大了会把字压没 */
  const core = useMemo(() => new THREE.SphereGeometry(0.085, 24, 18), [])

  useFrame((state, delta) => {
    const g = group.current
    if (!g) return
    const dt = clampDt(delta)
    const t = state.clock.elapsedTime
    const f = fade.get()

    g.rotation.y += dt * 0.09
    g.rotation.x = Math.sin(t * 0.16) * 0.07
    // 呼吸
    g.scale.setScalar(1 + Math.sin(t * 0.75) * 0.013)

    for (const child of g.children) {
      const mesh = child as THREE.Mesh
      const slot = (mesh.userData.slot ?? 'gMid') as PaletteSlot
      const opacity = (mesh.userData.opacity as number) ?? 0.9
      // 转场时整体收缩 6%，不做硬切
      paint(mesh.material as THREE.Material, live, slot, f, opacity)

      const spin = mesh.userData.spin as number | undefined
      if (spin) mesh.rotation.z += dt * spin
    }

    // 核单独做一次更强的脉动
    const coreMesh = g.getObjectByName('core')
    if (coreMesh) {
      const s = 1 + Math.sin(t * 1.6) * 0.22
      coreMesh.scale.setScalar(s)
    }
  })

  return (
    <group ref={group}>
      {arms.map((geo, i) => (
        <mesh key={`arm${i}`} geometry={geo} userData={hints({ slot: 'gMid', opacity: 0.95 })}>
          <meshBasicMaterial
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
      ))}

      {rings.map((r, i) => (
        <mesh
          key={`ring${i}`}
          geometry={r.geo}
          rotation={r.rotation}
          userData={hints({ slot: 'gGlow', opacity: 0.55, spin: r.spin })}
        >
          <meshBasicMaterial
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
      ))}

      <mesh
        name="core"
        geometry={core}
        userData={hints({ slot: 'core', opacity: 0.6 })}
      >
        <meshBasicMaterial
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}
