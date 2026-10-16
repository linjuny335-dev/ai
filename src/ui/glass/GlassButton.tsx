/* ============================================================================
 *  GlassButton —— 带「压下 + 折射波纹」的玻璃按钮
 * ----------------------------------------------------------------------------
 *  点击：scale 1 → 0.98 → 1，同时从按下的位置扩散一圈很淡的光。
 *  波纹用一次性的 CSS animation，播完自己移除 class，不留常驻动画。
 * ========================================================================== */

import { useRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  className?: string
}

export default function GlassButton({ children, className = '', onClick, ...rest }: Props) {
  const ref = useRef<HTMLButtonElement>(null)

  const handle = (e: React.MouseEvent<HTMLButtonElement>) => {
    const el = ref.current
    if (el) {
      const r = el.getBoundingClientRect()
      el.style.setProperty('--rx', `${e.clientX - r.left}px`)
      el.style.setProperty('--ry', `${e.clientY - r.top}px`)
      // 移除 → 强制回流 → 再加上，才能重新播放同一次动画
      el.classList.remove('is-ripple')
      void el.offsetWidth
      el.classList.add('is-ripple')
    }
    onClick?.(e)
  }

  return (
    <button
      ref={ref}
      type="button"
      className={`glass glass--btn${className ? ' ' + className : ''}`}
      onClick={handle}
      {...rest}
    >
      <span className="glass__label">{children}</span>
      <i className="glass-btn__ripple" aria-hidden="true" />
    </button>
  )
}
