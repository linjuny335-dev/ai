/* ============================================================================
 *  主题 04 — 全息球（品牌介绍态）
 * ----------------------------------------------------------------------------
 *  线框球 + 三条纬线 + 一圈倾斜轨道 + 沿轨道运行的节点。
 *  品牌态的焦点是文字，所以这个几何体刻意做得克制。
 * ========================================================================== */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useFade } from '../scene/fade'
import { useLiveTheme } from '../scene/LiveTheme'
import { clampDt } from '../scene/timing'
import { hints, paint, type PaletteSlot } from './common'

const RADIUS = 1.95
const ORBIT_RADIUS = 3.05
const NODES = 7

export default function HoloCore() {
  const live = useLiveTheme()
  const fade = useFade()
  const group = useRef<THREE.Group>(null)
  const orbitGroup = useRef<THREE.Group>(null)

  /** 三条纬线：半径随高度收缩，才贴在球面上 */
  const latitudes = useMemo(() => {
    return [-1.15, 0, 1.15].map((y) => {
      const r = Math.sqrt(Math.max(0.04, RADIUS * RADIUS - y * y))
      return { geo: new THREE.TorusGeometry(r, 0.0075, 5, 180), y }
    })
  }, [])

  const globeGeo = useMemo(() => new THREE.SphereGeometry(RADIUS, 36, 24), [])
  const orbitGeo = useMemo(() => new THREE.TorusGeometry(ORBIT_RADIUS, 0.009, 5, 240), [])
  const nodeGeo = useMemo(() => new THREE.SphereGeometry(0.045, 12, 10), [])
  const coreGeo = useMemo(() => new THREE.IcosahedronGeometry(0.19, 2), [])

  /** 轨道上均匀分布的节点位置 */
  const nodePositions = useMemo(
    () =>
      Array.from({ length: NODES }, (_, i) => {
        const a = (i / NODES) * Math.PI * 2
        return [Math.cos(a) * ORBIT_RADIUS, 0, Math.sin(a) * ORBIT_RADIUS] as [
          number,
          number,
          number,
        ]
      }),
    [],
  )

  useEffect(
    () => () => {
      latitudes.forEach((l) => l.geo.dispose())
      globeGeo.dispose()
      orbitGeo.dispose()
      nodeGeo.dispose()
      coreGeo.dispose()
    },
    [latitudes, globeGeo, orbitGeo, nodeGeo, coreGeo],
  )

  useFrame((state, delta) => {
    const g = group.current
    if (!g) return
    const dt = clampDt(delta)
    const t = state.clock.elapsedTime
    const f = fade.get()

    g.rotation.y += dt * 0.055
    g.rotation.x = Math.sin(t * 0.1) * 0.06
    g.scale.setScalar(1 + Math.sin(t * 0.5) * 0.015)

    for (const child of g.children) {
      const mesh = child as THREE.Mesh
      const slot = (mesh.userData.slot ?? 'gMid') as PaletteSlot
      const opacity = (mesh.userData.opacity as number) ?? 0.9
      paint(mesh.material as THREE.Material, live, slot, f, opacity)
    }

    if (orbitGroup.current) {
      orbitGroup.current.rotation.y -= dt * 0.22
      orbitGroup.current.rotation.z = 0.34
    }

    const core = g.getObjectByName('holoCoreDot') as THREE.Mesh | undefined
    if (core) core.scale.setScalar(1 + Math.sin(t * 1.5) * 0.22)
  })

  return (
    <group ref={group}>
      {/* 球面网格 */}
      <mesh geometry={globeGeo} userData={hints({ slot: 'gMid', opacity: 0.16 })}>
        <meshBasicMaterial
          wireframe
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>

      {/* 纬线 */}
      {latitudes.map((l, i) => (
        <mesh
          key={`lat${i}`}
          geometry={l.geo}
          position={[0, l.y, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          userData={hints({ slot: 'gGlow', opacity: 0.5 })}
        >
          <meshBasicMaterial
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
      ))}

      {/* 倾斜轨道 + 沿轨道运行的节点 */}
      <group ref={orbitGroup}>
        <mesh geometry={orbitGeo} userData={hints({ slot: 'gGlow', opacity: 0.62 })}>
          <meshBasicMaterial
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
        {nodePositions.map((p, i) => (
          <mesh
            key={`node${i}`}
            geometry={nodeGeo}
            position={p}
            userData={hints({ slot: 'core', opacity: 0.9 })}
          >
            <meshBasicMaterial
              transparent
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
            />
          </mesh>
        ))}
      </group>

      <mesh
        name="holoCoreDot"
        geometry={coreGeo}
        userData={hints({ slot: 'core', opacity: 0.85 })}
      >
        <meshBasicMaterial
          wireframe
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}
