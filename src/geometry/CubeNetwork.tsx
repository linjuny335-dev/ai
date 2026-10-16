/* ============================================================================
 *  主题 02 — 立方体网络
 * ----------------------------------------------------------------------------
 *  170 个线框立方体分布在一层带抖动的球壳上，邻近的用细线连起来，
 *  每个立方体有自己的相位，缓慢缩放呼吸 —— 整体像一团在思考的点阵。
 *  用 InstancedMesh 一次 draw call 画完。
 * ========================================================================== */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useFade } from '../scene/fade'
import { useLiveTheme } from '../scene/LiveTheme'
import { clampDt } from '../scene/timing'
import { hints, paint } from './common'

const NODE_COUNT = 168
const LINK_DIST = 1.45
const MAX_LINKS = 900

export default function CubeNetwork() {
  const live = useLiveTheme()
  const fade = useFade()
  const group = useRef<THREE.Group>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])

  const built = useMemo(() => {
    const positions: THREE.Vector3[] = []
    const rotations: THREE.Euler[] = []
    const phases: number[] = []
    const sizes: number[] = []

    for (let i = 0; i < NODE_COUNT; i++) {
      // 均匀球面采样（避免极点堆积）
      const u = Math.random() * 2 - 1
      const phi = Math.random() * Math.PI * 2
      const s = Math.sqrt(1 - u * u)
      const radius = 1.7 + Math.random() * 0.8
      positions.push(
        new THREE.Vector3(s * Math.cos(phi), u, s * Math.sin(phi)).multiplyScalar(radius),
      )
      rotations.push(
        new THREE.Euler(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28),
      )
      phases.push(Math.random() * 6.28)
      sizes.push(0.07 + Math.random() * 0.095)
    }

    const mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({
        wireframe: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
      NODE_COUNT,
    )
    mesh.frustumCulled = false
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)

    // 邻近节点连线
    const segs: number[] = []
    let links = 0
    for (let i = 0; i < NODE_COUNT && links < MAX_LINKS; i++) {
      for (let j = i + 1; j < NODE_COUNT && links < MAX_LINKS; j++) {
        if (positions[i].distanceToSquared(positions[j]) < LINK_DIST * LINK_DIST) {
          segs.push(
            positions[i].x, positions[i].y, positions[i].z,
            positions[j].x, positions[j].y, positions[j].z,
          )
          links++
        }
      }
    }
    const wireGeo = new THREE.BufferGeometry()
    wireGeo.setAttribute('position', new THREE.Float32BufferAttribute(segs, 3))

    return { mesh, wireGeo, positions, rotations, phases, sizes }
  }, [])

  const wireMat = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    [],
  )

  const coreGeo = useMemo(() => new THREE.IcosahedronGeometry(0.42, 1), [])

  useEffect(
    () => () => {
      built.mesh.geometry.dispose()
      ;(built.mesh.material as THREE.Material).dispose()
      built.wireGeo.dispose()
      wireMat.dispose()
      coreGeo.dispose()
    },
    [built, wireMat, coreGeo],
  )

  useFrame((state, delta) => {
    const g = group.current
    if (!g) return
    const dt = clampDt(delta)
    const t = state.clock.elapsedTime
    const f = fade.get()

    g.rotation.y += dt * 0.085
    g.rotation.x = Math.sin(t * 0.13) * 0.09
    g.scale.setScalar(1 + Math.sin(t * 0.6) * 0.016)

    const { mesh, positions, rotations, phases, sizes } = built
    for (let i = 0; i < positions.length; i++) {
      const s = sizes[i] * (1 + 0.32 * Math.sin(t * 1.15 + phases[i]))
      dummy.position.copy(positions[i])
      dummy.rotation.set(rotations[i].x + t * 0.14, rotations[i].y + t * 0.19, rotations[i].z)
      dummy.scale.setScalar(s)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true

    const meshMat = mesh.material as THREE.MeshBasicMaterial
    meshMat.color.copy(live.current.gMid)
    meshMat.opacity = f * 0.8

    wireMat.color.copy(live.current.gEdge)
    wireMat.opacity = f * 0.6

    const coreMesh = g.getObjectByName('netCore') as THREE.Mesh | undefined
    if (coreMesh) {
      paint(coreMesh.material as THREE.Material, live, 'gGlow', f, 0.35)
      coreMesh.rotation.y -= dt * 0.3
      coreMesh.rotation.x += dt * 0.17
    }
  })

  return (
    <group ref={group}>
      <primitive object={built.mesh} />
      <lineSegments geometry={built.wireGeo} material={wireMat} frustumCulled={false} />
      <mesh
        name="netCore"
        geometry={coreGeo}
        userData={hints({ slot: 'gGlow', opacity: 0.35 })}
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
