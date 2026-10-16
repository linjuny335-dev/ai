/* ============================================================================
 *  GlassTopNav —— 顶部悬浮的液态玻璃导航（HOME / TECH / DISCOVER）
 * ----------------------------------------------------------------------------
 *  §10 导航是「观察宇宙的界面」，所以它挂在 fixed-ui 里，永远不跟着 Scene 飞。
 *  切换时只有那块液态玻璃高亮块在滑动（GlassSegmented 负责测量与过渡）。
 *
 *  状态映射：
 *      面板打开            → DISCOVER
 *      当前在 TECH 区域     → TECH
 *      其它所有区域         → HOME
 * ========================================================================== */

import { CHAPTER_THEMES, ENTRY_INDEX, THEMES } from '../../config/themes'
import { useThemeStore } from '../../store/useThemeStore'
import GlassSegmented from './GlassSegmented'

type NavKey = 'home' | 'tech' | 'discover'

const TECH_INDEX = Math.max(
  0,
  THEMES.findIndex((t) => t.id === 'tech'),
)

export default function GlassTopNav() {
  const index = useThemeStore((s) => s.index)
  const viewAll = useThemeStore((s) => s.viewAll)
  const go = useThemeStore((s) => s.go)
  const setViewAll = useThemeStore((s) => s.setViewAll)

  const value: NavKey = viewAll ? 'discover' : index === TECH_INDEX ? 'tech' : 'home'

  const onChange = (v: NavKey) => {
    if (v === 'discover') {
      setViewAll(true)
      return
    }
    setViewAll(false)
    go(v === 'tech' ? TECH_INDEX : ENTRY_INDEX)
  }

  return (
    <div className="topnav">
      {/* glass-enter 放在外层：animation 终态会锁 transform，不能直接加在玻璃上 */}
      <div className="glass-enter">
        <GlassSegmented<NavKey>
          variant="nav"
          ariaLabel="Primary navigation"
          value={value}
          onChange={onChange}
          options={[
            { value: 'home', label: 'Home' },
            { value: 'tech', label: 'Tech' },
            { value: 'discover', label: 'Discover', badge: String(CHAPTER_THEMES.length) },
          ]}
        />
      </div>
    </div>
  )
}
