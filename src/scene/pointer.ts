/* ============================================================================
 *  指针状态（鼠标位置 / 视差 / 拖拽）
 * ----------------------------------------------------------------------------
 *  刻意用普通对象而不是 React state：这些值每帧都在变，
 *  走 state 会让整棵树 60fps 重渲染。3D 组件在 useFrame 里直接读。
 * ========================================================================== */

export const pointer = {
  /** 归一化位置，-1 .. 1（左下为 -1,-1） */
  x: 0,
  y: 0,
  /** 本帧累计位移（像素），被消费后由读取方清零 */
  dx: 0,
  dy: 0,
  /** 内部：上一帧的屏幕坐标 */
  px: 0,
  py: 0,
  dragging: false,
  active: false,
}

let primed = false

export function resetPointerDelta() {
  pointer.dx = 0
  pointer.dy = 0
}

/** 在 App 里调用一次即可，全局生效 */
export function attachPointerTracking(): () => void {
  const onMove = (e: PointerEvent) => {
    pointer.active = true
    if (!primed) {
      pointer.px = e.clientX
      pointer.py = e.clientY
      primed = true
    }
    pointer.dx += e.clientX - pointer.px
    pointer.dy += e.clientY - pointer.py
    pointer.px = e.clientX
    pointer.py = e.clientY
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1
    pointer.y = -((e.clientY / window.innerHeight) * 2 - 1)
  }

  const onDown = (e: PointerEvent) => {
    const el = e.target as HTMLElement | null
    // 点在按钮 / 链接上不算拖拽，避免和 UI 抢事件
    if (el && el.closest('button, a, input, [data-no-drag]')) return
    pointer.dragging = true
    pointer.px = e.clientX
    pointer.py = e.clientY
    primed = true
  }

  const onUp = () => {
    pointer.dragging = false
  }

  const onLeave = () => {
    pointer.active = false
    pointer.dragging = false
  }

  window.addEventListener('pointermove', onMove, { passive: true })
  window.addEventListener('pointerdown', onDown, { passive: true })
  window.addEventListener('pointerup', onUp, { passive: true })
  window.addEventListener('pointercancel', onUp, { passive: true })
  window.addEventListener('pointerleave', onLeave, { passive: true })

  return () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerdown', onDown)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onUp)
    window.removeEventListener('pointerleave', onLeave)
  }
}
