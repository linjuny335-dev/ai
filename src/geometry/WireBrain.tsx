/* ============================================================================
 *  主题 03 — 线框大脑
 * ----------------------------------------------------------------------------
 *  做法：拿一个球细分体（Icosahedron），用几段不同频率的正弦把它揉成有沟回的
 *  形状，中央减掉一道纵向深沟把左右半球分开，底部收窄，
 *  然后取 WireframeGeometry 得到线框，再撒一层发光「突触」点。
 *  完全程序化，无任何外部模型。
 * ========================================================================== */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useFade } from '../scene/fade'
import { useLiveTheme } from '../scene/LiveTheme'
import { clampDt } from '../scene/timing'
import { hints, paint } from './common'

/** 细分级别：2 ≈ 320 面，线框疏密刚好能看出脑形；数值越大线越密越糊 */
const DETAIL = 2

/** 把球揉成脑形 */
function deform(base: THREE.BufferGeometry) {
  const pos = base.attributes.position as THREE.BufferAttribute
  const v = new THREE.Vector3()

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const ox = v.x
    const oy = v.y
    const oz = v.z

    // 三段不同频率的起伏 → 沟回
    let k = 1
    k += 0.085 * Math.sin(ox * 3.1 + 1.2) * Math.cos(oy * 2.6 - 0.4)
    k += 0.055 * Math.sin(oz * 4.2 + 0.7)
    k += 0.04 * Math.cos(oy * 5.5 + oz * 2.1)

    // 中央纵裂：把左右半球分开
    k -= 0.34 * Math.exp(-Math.pow(ox / 0.34, 2))
    // 底部收窄（脑干方向）
    k -= 0.14 * Math.exp(-Math.pow((oy + 1.55) / 0.75, 2))

    pos.setXYZ(i, ox * k, oy * k * 1.02, oz * k * 1.12)
  }

  base.computeVertexNormals()
  return base
}

export default function WireBrain() {
  const live = useLiveTheme()
  const fade = useFade()
  const group = useRef<THREE.Group>(null)

  const built = useMemo(() => {
    const shell = deform(new THREE.IcosahedronGeometry(1.95, DETAIL))

    // 线框：拿全部三角形边
    const wire = new THREE.WireframeGeometry(shell)

    // 突触点：从变形后的顶点里等间隔取样
    const src = shell.attributes.position as THREE.BufferAttribute
    const step = 24
    const count = Math.floor(src.count / step)
    const nodePos = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const s = i * step
      nodePos[i * 3 + 0] = src.getX(s)
      nodePos[i * 3 + 1] = src.getY(s)
      nodePos[i * 3 + 2] = src.getZ(s)
    }
    const nodes = new THREE.BufferGeometry()
    nodes.setAttribute('position', new THREE.BufferAttribute(nodePos, 3))

    return { shell, wire, nodes }
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

  const nodeMat = useMemo(
    () =>
      new THREE.PointsMaterial({
        size: 0.055,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        sizeAttenuation: true,
      }),
    [],
  )

  /** 内层实心壳：极低不透明度，给线框一点体积感 */
  const shellMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        side: THREE.DoubleSide,
      }),
    [],
  )

  useEffect(
    () => () => {
      built.shell.dispose()
      built.wire.dispose()
      built.nodes.dispose()
      wireMat.dispose()
      nodeMat.dispose()
      shellMat.dispose()
    },
    [built, wireMat, nodeMat, shellMat],
  )

  useFrame((state, delta) => {
    const g = group.current
    if (!g) return
    const dt = clampDt(delta)
    const t = state.clock.elapsedTime
    const f = fade.get()

    g.rotation.y += dt * 0.1
    g.rotation.x = Math.sin(t * 0.11) * 0.08 - 0.05
    g.scale.setScalar(1 + Math.sin(t * 0.55) * 0.017)

    wireMat.color.copy(live.current.gMid)
    // 线框整体做一次缓慢的明暗呼吸
    wireMat.opacity = f * (0.62 + Math.sin(t * 0.9) * 0.14)

    nodeMat.color.copy(live.current.gGlow)
    nodeMat.opacity = f * (0.55 + Math.sin(t * 1.7) * 0.3)

    shellMat.color.copy(live.current.gEdge)
    shellMat.opacity = f * 0.07

    const core = g.getObjectByName('brainCore') as THREE.Mesh | undefined
    if (core) {
      paint(core.material as THREE.Material, live, 'core', f, 1)
      core.scale.setScalar(1 + Math.sin(t * 1.4) * 0.24)
    }
  })

  return (
    <group ref={group}>
      <mesh geometry={built.shell} material={shellMat} />
      <lineSegments geometry={built.wire} material={wireMat} />
      <points geometry={built.nodes} material={nodeMat} />
      <mesh name="brainCore" userData={hints({ slot: 'core', opacity: 1 })}>
        <sphereGeometry args={[0.17, 24, 18]} />
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
