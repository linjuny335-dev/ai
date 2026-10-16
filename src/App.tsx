/* ============================================================================
 *  App —— 组合整个页面
 * ----------------------------------------------------------------------------
 *  层级（从下往上）：
 *      .galaxy-world   同一个宇宙：WebGL 画布（银河层 + 星点 + 前景几何体）
 *      .galaxy-veil    统一暗色 Overlay（§15：银河不能压过信息层级）
 *      .pocket         中央暗袋，固定不动，保证文字可读
 *      .scrim          上下压暗
 *      MeteorTrail     鼠标流星拖尾（Canvas，z=8：在暗化层之上、内容层之下）
 *      SceneManager    会随转场移动的 Scene 内容（唯一会动的一层）
 *      FixedNavigation 顶部 / 底部固定 UI（永不动）
 *      Loader          首屏遮罩
 *
 *  GalaxyWorld 从进入网站到离开只挂载一次；切换 Scene 时它原地不动。
 * ========================================================================== */

import { useEffect } from 'react'
import Scene from './components/Scene'
import FixedNavigation from './components/FixedNavigation'
import SceneManager from './scene/SceneManager'
import { useThemeStore } from './store/useThemeStore'
import { THEMES } from './config/themes'
import { attachPointerTracking } from './scene/pointer'
import Loader from './ui/Loader'
import MeteorTrail from './ui/meteor/MeteorTrail'
import { useKeyboardNav } from './ui/useKeyboardNav'
import { useWheelNav } from './ui/useWheelNav'

export default function App() {
  // 强调色跟「当前显示的场景」走：换色发生在空镜阶段，不会在退出中的文字上闪一下
  const shown = useThemeStore((s) => s.shown)

  useEffect(() => {
    document.documentElement.dataset.theme = THEMES[shown].id
  }, [shown])

  // 全局指针追踪（鼠标位置 / 拖拽），只装一次
  useEffect(() => attachPointerTracking(), [])

  useKeyboardNav()
  // 滚轮切换：向下 → 下一区域，向上 → 上一区域
  useWheelNav()

  return (
    <div className="app">
      <div className="galaxy-world">
        <Scene />
      </div>

      <div className="galaxy-veil" />
      <div className="pocket" />
      <div className="scrim" />

      <MeteorTrail />

      <SceneManager />
      <FixedNavigation />

      <Loader />
    </div>
  )
}
