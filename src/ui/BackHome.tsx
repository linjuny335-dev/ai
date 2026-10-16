/* ============================================================================
 *  BackHome —— 「返回主页」按钮
 * ----------------------------------------------------------------------------
 *  首页入口层做完之后，用户提「再给我一个再返回主页的按钮」。
 *  它是**章节里才出现**的出口：在首页时不渲染（已经在主页了，按钮没有意义）。
 *
 *  ── 为什么放在右上角，而不是跟着左上角的 All N ──────────────────────────
 *  量过：宽屏下 PHOTON / TECH 的正文左右各让出 200px
 *  （`html .photon { padding-left/right: 200px }`，见 photon.css），
 *  也就是正文的**左边**从 x=200 开始。而 1280×720 这种矮视口下，
 *  `.photon__head` 会被垂直居中顶到 y=7 —— 正好落在顶部这条 0~64px 的横带里。
 *
 *  左上角在「All N」之后只剩 ~90px 可用，装不下一个带完整文案的按钮；
 *  如果硬塞，按钮会横向压到 PHOTON 的标题上（试过，确实压住了）。
 *  而**右边距带（vw-200 ~ vw）在顶部是完全空的**，所以放右上角：
 *    · 与左侧「All N」互不影响（不用改它，风险为零）
 *    · 与右下的 AUDIO 构成同一条「全局操作」纵列
 *    · 任何场景、任何视口都不会压到正文（正文右边界永远在 vw-200）
 *
 *  状态只读 store.index：`go(ENTRY_INDEX)` 走的是全站唯一那条转场时间轴，
 *  而且因为两端共用同一张底图，会自动走 pull（后退）模式 —— 见 travelMode()。
 * ========================================================================== */

import { ENTRY_INDEX } from '../config/themes'
import { useThemeStore } from '../store/useThemeStore'
import GlassButton from './glass/GlassButton'

export default function BackHome() {
  const index = useThemeStore((s) => s.index)
  const go = useThemeStore((s) => s.go)

  // 已经在入口层：直接不渲染，避免「渲染后藏起来」的那一次闪现
  if (index === ENTRY_INDEX) return null

  return (
    <div className="homeback">
      {/* glass-enter 放在外层：animation 终态会锁 transform，不能直接加在玻璃上 */}
      <div className="glass-enter">
        <GlassButton
          className="homeback__btn"
          aria-label="返回主页 · Back to entry"
          title="返回主页 · Back to entry"
          onClick={() => go(ENTRY_INDEX)}
        >
          <span className="homeback__arw" aria-hidden="true">
            ←
          </span>
          <span className="homeback__en">Entry</span>
          <span className="homeback__cn">返回主页</span>
        </GlassButton>
      </div>
    </div>
  )
}
