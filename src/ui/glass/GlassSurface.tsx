/* ============================================================================
 *  GlassSurface —— 液态玻璃基底
 * ----------------------------------------------------------------------------
 *  所有玻璃件（卡片 / 导航 / 分段控件 / 弹窗）都从这一层长出来，保证质感统一。
 *
 *  它不是「透明 + blur」那么简单，一共五层（全部用伪元素，不额外堆 DOM）：
 *      1. 底色          半透明渐变 + 紫蓝环境色，让银河能隐约透上来
 *      2. backdrop      blur + saturate，吃到底下的银河
 *      3. 边缘高光      inset 上边缘 1px + 一圈细边框
 *      4. 折射光带      一条极淡的斜向光，hover 时缓慢流动
 *      5. 指针高光      跟随鼠标的 radial-gradient
 *
 *  性能约定（第七条）：
 *      - 指针位置只写 CSS 变量（--gx/--gy/--tx/--ty），不进 React state、不重渲染
 *      - 变量写入用 rAF 合并，一帧最多一次
 *      - 只有 transform / opacity 参与动画，动画属性不触发 layout
 *      - 指针在元素内时用短 transition（跟手），离开后换长 transition（自然回位）
 * ========================================================================== */

import {
  useCallback,
  useEffect,
  useRef,
  type AnchorHTMLAttributes,
  type ComponentType,
  type CSSProperties,
  type ElementType,
  type HTMLAttributes,
  type ReactNode,
} from 'react'

/**
 * 同时兼容 div 与 a（卡片整块是链接）。
 * 不用索引签名 —— 那会让 TS 把所有 JSX 属性推成 never。
 */
export type GlassSurfaceProps = HTMLAttributes<HTMLElement> &
  AnchorHTMLAttributes<HTMLAnchorElement> & {
    as?: ElementType
    className?: string
    children?: ReactNode
    /** 是否开启「朝鼠标方向倾斜」 */
    tilt?: boolean
    /** 倾斜最大角度（度）。卡片 4~5 就够，再大就廉价了 */
    tiltMax?: number
    /** 是否响应指针高光（默认开；纯装饰件可关掉省算力） */
    light?: boolean
    style?: CSSProperties
  }

export default function GlassSurface({
  as: Tag = 'div',
  className = '',
  children,
  tilt = false,
  tiltMax = 4.5,
  light = true,
  style,
  ...rest
}: GlassSurfaceProps) {
  const ref = useRef<HTMLElement | null>(null)
  const raf = useRef(0)
  const pending = useRef({ x: 50, y: 50 })

  const flush = useCallback(() => {
    raf.current = 0
    const el = ref.current
    if (!el) return
    const { x, y } = pending.current
    el.style.setProperty('--gx', `${x.toFixed(2)}%`)
    el.style.setProperty('--gy', `${y.toFixed(2)}%`)
    if (tilt) {
      // 鼠标在右上 → 右半边往后倒、上半边往后倒，像被指尖顶起来
      const dx = (x - 50) / 50
      const dy = (y - 50) / 50
      el.style.setProperty('--tx', `${(-dy * tiltMax).toFixed(2)}deg`)
      el.style.setProperty('--ty', `${(dx * tiltMax).toFixed(2)}deg`)
    }
  }, [tilt, tiltMax])

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!light && !tilt) return
      const el = ref.current
      if (!el) return
      const r = el.getBoundingClientRect()
      pending.current = {
        x: ((e.clientX - r.left) / r.width) * 100,
        y: ((e.clientY - r.top) / r.height) * 100,
      }
      if (!raf.current) raf.current = requestAnimationFrame(flush)
    },
    [flush, light, tilt],
  )

  const onPointerEnter = useCallback(() => {
    // is-live：跟手时用短过渡；移除后回落到长过渡，鼠标离开才不会「弹」回去
    ref.current?.classList.add('is-live')
  }, [])

  const onPointerLeave = useCallback(() => {
    const el = ref.current
    if (!el) return
    el.classList.remove('is-live')
    el.style.setProperty('--tx', '0deg')
    el.style.setProperty('--ty', '0deg')
  }, [])

  // 卸载时清掉未执行的 rAF
  useEffect(() => () => {
    if (raf.current) cancelAnimationFrame(raf.current)
  }, [])

  // ElementType 作为 JSX 标签时，TS 会把 props 推成「所有组件属性的交集」= never。
  // 断言一次即可，运行时行为不变。
  const Comp = (Tag ?? 'div') as ComponentType<Record<string, unknown>>

  return (
    <Comp
      ref={ref as never}
      className={`glass${tilt ? ' glass--tilt' : ''}${className ? ' ' + className : ''}`}
      onPointerMove={onPointerMove}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      style={style}
      {...rest}
    >
      {/* 折射光带 + 指针高光都由 CSS 伪元素画，这里只放内容 */}
      {children}
    </Comp>
  )
}
