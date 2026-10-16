/* ============================================================================
 *  PointerRig —— 鼠标视差 + 拖拽探索视角
 * ----------------------------------------------------------------------------
 *  不引入 OrbitControls：那套会带来滚轮缩放和右键菜单，和「全屏沉浸站」不搭。
 *  这里直接把相机做小幅平移，松手后缓慢回中，既有探索感又不会迷路。
 * ========================================================================== */

import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { pointer, resetPointerDelta } from './pointer'

const PARALLAX_X = 0.44
const PARALLAX_Y = 0.3
const DRAG_SENS = 0.0026
const DRAG_LIMIT_X = 2.1
const DRAG_LIMIT_Y = 1.15
const CAM_Z = 6

export default function PointerRig() {
  const camera = useThree((s) => s.camera)

  const px = useRef(0)
  const py = useRef(0)
  const dragX = useRef(0)
  const dragY = useRef(0)
  const target = useRef(new THREE.Vector3(0, 0, 0))

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 30)

    // 视差：跟随鼠标做小幅平移
    const k = 1 - Math.exp(-3.2 * dt)
    px.current += (pointer.x * PARALLAX_X - px.current) * k
    py.current += (pointer.y * PARALLAX_Y - py.current) * k

    // 拖拽：累加位移；松手后指数回中
    if (pointer.dragging) {
      dragX.current = THREE.MathUtils.clamp(
        dragX.current + pointer.dx * DRAG_SENS,
        -DRAG_LIMIT_X,
        DRAG_LIMIT_X,
      )
      dragY.current = THREE.MathUtils.clamp(
        dragY.current + pointer.dy * DRAG_SENS,
        -DRAG_LIMIT_Y,
        DRAG_LIMIT_Y,
      )
    } else {
      const back = 1 - Math.exp(-0.5 * dt)
      dragX.current *= 1 - back
      dragY.current *= 1 - back
    }
    resetPointerDelta()

    camera.position.set(px.current + dragX.current, py.current + dragY.current, CAM_Z)
    camera.lookAt(target.current)
  })

  return null
}
