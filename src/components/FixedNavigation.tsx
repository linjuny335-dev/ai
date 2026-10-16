/* ============================================================================
 *  FixedNavigation —— 观察宇宙的界面
 * ----------------------------------------------------------------------------
 *  §10 顶部 / 左侧 UI 永远 fixed，不跟着 Scene 一起移动。
 *      切场时它只改变：
 *        - active 状态（点谁亮谁，点击瞬间就响应，给即时反馈）
 *        - 强调色（随 data-theme 在空镜阶段切换）
 *        - 一个表示「正在穿梭」的小指示条
 *      导航栏本身绝不会飞出去 —— 会移动的只有中间的 Scene 内容。
 *
 *  §16 在首页（入口层）时整层进入「安静态」：左侧轨道导航 / All N / AUDIO /
 *      滚轮提示全部收起，只留顶部的 HOME·TECH·DISCOVER 作为出口。
 *      收起靠 .fixed-ui--home 这一个类，样式在 styles.css。
 * ========================================================================== */

import AudioButton from '../ui/AudioButton'
import BackHome from '../ui/BackHome'
import GestureControl from '../ui/gesture/GestureControl'
import Navigation from '../ui/Navigation'
import TopBar from '../ui/TopBar'
import GlassTopNav from '../ui/glass/GlassTopNav'
import { THEMES } from '../config/themes'
import { useThemeStore } from '../store/useThemeStore'

export default function FixedNavigation() {
  const phase = useThemeStore((s) => s.phase)
  const shown = useThemeStore((s) => s.shown)
  const travelling = phase !== 'idle'
  /** 首页：少信息、少前景元素（用户对首页的明确要求） */
  const atEntry = THEMES[shown]?.entry === true

  return (
    <div className={`fixed-ui${atEntry ? ' fixed-ui--home' : ''}`} data-phase={phase}>
      <GlassTopNav />
      <TopBar />
      <BackHome />
      <Navigation />
      <AudioButton />

      {/* 首屏的一行小提示：告诉用户滚轮也能穿梭，几秒后自己淡掉 */}
      <div className="wheel-hint" aria-hidden="true">
        <i />
        Scroll
      </div>

      {/* 转场期间底部出现的一条细线：告诉用户「镜头正在移动」 */}
      <div className={`travelbar${travelling ? ' is-on' : ''}`} aria-hidden="true">
        <i />
      </div>

      {/* 手势控制：右上角一个小开关 + 一层画光标的 Canvas。
          ⚠️ 必须排在最后 —— 它里面有铺满全屏的画布，要压在其它固定 UI 之上。 */}
      <GestureControl />
    </div>
  )
}
