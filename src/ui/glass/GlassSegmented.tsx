/* ============================================================================
 *  GlassSegmented —— 液态玻璃分段控件（也是顶部导航的实现基础）
 * ----------------------------------------------------------------------------
 *  当前项不是「文字变色」，而是一小块液态玻璃在容器里滑过去：
 *      HOME → TECH → DISCOVER 时，高亮块平滑移动，不会消失再出现。
 *
 *  实现：测量目标按钮的 offsetLeft / offsetWidth，写进 indicator 的
 *  transform: translateX() 与 width，用 CSS transition 过渡这两个值。
 *  只动 transform / width，不动 left（避免 layout）。
 * ========================================================================== */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

export interface SegOption<T extends string> {
  value: T
  label: string
  /** 右上角的小计数，比如 DISCOVER 上显示区域总数 */
  badge?: string
  /** 标签前的小图标（单个字符，比如 ◆ ⬡ ✦）。不给就不占位 */
  icon?: string
  /** 悬停提示（中文说明用），会落到 title 属性 */
  title?: string
}

interface Props<T extends string> {
  options: SegOption<T>[]
  value: T
  onChange: (value: T) => void
  /** seg = 卡片里的 HOT/NEW/DISCUSS；nav = 顶部细长导航条 */
  variant?: 'seg' | 'nav'
  className?: string
  ariaLabel?: string
}

export default function GlassSegmented<T extends string>({
  options,
  value,
  onChange,
  variant = 'seg',
  className = '',
  ariaLabel,
}: Props<T>) {
  const wrap = useRef<HTMLDivElement>(null)
  const btns = useRef(new Map<T, HTMLButtonElement>())
  const [box, setBox] = useState<{ x: number; w: number } | null>(null)

  const measure = useCallback(() => {
    const el = btns.current.get(value)
    const parent = wrap.current
    if (!el || !parent) return
    setBox({ x: el.offsetLeft, w: el.offsetWidth })
  }, [value])

  useLayoutEffect(measure, [measure, options])

  // 字体加载完 / 窗口变化后尺寸会变，重测一次，避免高亮块错位
  useEffect(() => {
    const parent = wrap.current
    if (!parent || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => measure())
    ro.observe(parent)
    return () => ro.disconnect()
  }, [measure])

  return (
    <div
      ref={wrap}
      className={`glass glass-seg glass-seg--${variant} ${className}`}
      role="tablist"
      aria-label={ariaLabel}
    >
      {/* 滑动的液态玻璃高亮块 */}
      <span
        className="glass-seg__ind"
        aria-hidden="true"
        style={{
          transform: `translateX(${box?.x ?? 0}px)`,
          width: `${box?.w ?? 0}px`,
          opacity: box ? 1 : 0,
        }}
      />

      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          title={o.title}
          className={`glass-seg__btn${o.value === value ? ' is-active' : ''}`}
          ref={(el) => {
            if (el) btns.current.set(o.value, el)
            else btns.current.delete(o.value)
          }}
          onClick={() => onChange(o.value)}
        >
          {o.icon ? (
            <i className="glass-seg__icon" aria-hidden="true">
              {o.icon}
            </i>
          ) : null}
          {o.label}
          {o.badge ? <i className="glass-seg__badge">{o.badge}</i> : null}
        </button>
      ))}
    </div>
  )
}
