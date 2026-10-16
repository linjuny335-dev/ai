/* ============================================================================
 *  键盘导航：← → 切换主题，数字键直选，Esc 关面板
 * ========================================================================== */

import { useEffect } from 'react'
import { useThemeStore } from '../store/useThemeStore'

export function useKeyboardNav() {
  const go = useThemeStore((s) => s.go)
  const next = useThemeStore((s) => s.next)
  const prev = useThemeStore((s) => s.prev)
  const setViewAll = useThemeStore((s) => s.setViewAll)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && el.closest('input, textarea')) return

      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          next()
          break
        case 'ArrowLeft':
        case 'ArrowUp':
          prev()
          break
        case 'Escape':
          setViewAll(false)
          break
        default:
          if (/^[1-9]$/.test(e.key)) go(Number(e.key) - 1)
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, next, prev, setViewAll])
}
