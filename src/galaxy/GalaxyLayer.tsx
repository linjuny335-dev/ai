/* ============================================================================
 *  GalaxyLayer —— 一层银河底图
 * ----------------------------------------------------------------------------
 *  同一个宇宙里的一个「区域」就是一层。
 *  GalaxyWorld 常驻两层：当前区域 + 目标区域，两层重叠做交叉溶解，
 *  每层各自带 scale / x / y，所以看起来像镜头穿过云层进入下一个区域，
 *  而不是「背景图突然换掉」。
 *
 *  本组件从不去读 React state：所有参数都从 channel 这个普通对象里取，
 *  由 GalaxyWorld 的 useFrame 每帧写入。
 * ========================================================================== */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { THEMES } from '../config/themes'
import { BACKDROP_FRAG, BACKDROP_VERT } from '../backgrounds/shaders'
import { pointer } from '../scene/pointer'
import { gestureParticle } from '../scene/gestureParticle'
import { useBackdropTextures } from '../scene/useBackdropTextures'
import type { GalaxyChannel } from './worldState'

/** 主题色板是静态的，预先解析成 Color，避免每帧 parse 字符串 */
const TINTS = THEMES.map((t) => new THREE.Color(t.palette.backdrop.tint))

/** 比视口大一圈：层要做 scale / 平移，留出余量，避免边缘露黑 */
const OVERSCAN = 1.4

export interface GalaxyLayerProps {
  channel: GalaxyChannel
  /** 渲染顺序，数值小的先画（被后画的盖住） */
  order: number
}

export default function GalaxyLayer({ channel, order }: GalaxyLayerProps) {
  const mesh = useRef<THREE.Mesh>(null)
  const viewport = useThree((s) => s.viewport)
  const size = useThree((s) => s.size)
  const { textures, indexOfTheme } = useBackdropTextures()

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: BACKDROP_VERT,
        fragmentShader: BACKDROP_FRAG,
        uniforms: {
          uTexA: { value: null },
          uTexB: { value: null },
          uMix: { value: 0 },
          uOpacity: { value: 1 },
          uGain: { value: 1 },
          uTime: { value: 0 },
          uAspect: { value: 1.6 },
          uMouse: { value: new THREE.Vector2(0, 0) },
          uTint: { value: new THREE.Color('#ffffff') },
          uSpread: { value: 0 },
        },
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    [],
  )

  useEffect(() => () => material.dispose(), [material])

  useFrame((state) => {
    const m = mesh.current
    if (!m) return
    const u = material.uniforms
    const theme = THEMES[channel.tex] ?? THEMES[0]

    m.visible = channel.opacity > 0.002
    m.scale.setScalar(channel.scale)
    m.position.set(channel.x * viewport.width, channel.y * viewport.height, 0)

    const tex = textures[indexOfTheme[channel.tex]] ?? null
    u.uTexA.value = tex
    u.uTexB.value = tex
    u.uMix.value = 0
    u.uOpacity.value = channel.opacity
    u.uTint.value.copy(TINTS[channel.tex] ?? TINTS[0])
    u.uGain.value = theme.palette.backdrop.gain
    // 手势「解体」：底图照片必须和粒子层一起散，否则它一直是画面主角，
    // 眼睛读到的是「一张完整的银河 + 几个点在动」，而不是「银河正在解体」。
    // 这里直接读桥上的意图（NebulaField 那边的显示惯性是为了粒子，
    // 照片这层不需要再叠一道 —— 着色器里还有 smoothstep 塑形兜着手感）。
    u.uSpread.value = gestureParticle.spread
    u.uTime.value = state.clock.elapsedTime
    u.uAspect.value = size.width / Math.max(1, size.height)
    u.uMouse.value.set(pointer.x, pointer.y)
  })

  return (
    <mesh ref={mesh} material={material} renderOrder={order} frustumCulled={false}>
      <planeGeometry args={[viewport.width * OVERSCAN, viewport.height * OVERSCAN]} />
    </mesh>
  )
}
