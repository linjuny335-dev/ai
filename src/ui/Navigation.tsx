/* ============================================================================
 *  Navigation —— 左侧「银河轨道」主题导航
 * ----------------------------------------------------------------------------
 *  不再是底部横排的导航坞，而是左侧一条竖直的轨道：
 *      五个栏目 = 轨道上的五个圆形节点，节点之间用一条极细的发光线串起来，
 *      线上有光点缓慢流动，选中的那个节点更亮并带紫蓝色光晕。
 *
 *  高亮怎么「沿轨道滑过去」：
 *      光晕只有**一个**元素，钉在第一个节点的位置，然后用
 *          transform: translateY(calc(var(--i) * var(--node-h)))
 *      把它平移到当前节点。切换时 React 只改 --i 这个自定义属性，
 *      位移交给 CSS transition 补间。
 *
 *      为什么不用 JS 逐帧补间（framer 的 layoutId 也可以，但这里不选它）：
 *      这条轨道下面压着 WebGL 银河，转场时主线程被 3D 占满。
 *      纯 transform 的 CSS transition 跑在合成器线程上，主线程再卡也不掉帧；
 *      而 JS 补间每帧都要主线程算，正好会被转场挤掉。
 *      顺带好处：位移量从 CSS 变量算，不用在 JS 里重复写节点间距。
 *
 *  主题数量自动跟随 THEMES：几个章节就有几个节点，不需要改这里。
 *  节点间距、圆点直径、光晕颜色都是 .orbnav 上的 CSS 变量，改样式即可。
 *
 *  ⚠️ 轨道上**只有章节**：带 `entry: true` 的首页入口层不上轨道（首页要更简洁，
 *  而且它不是一个「章节」，编号 01~05 必须留给 PHOTON..TECH）。
 *  所以这里过滤掉入场层，但 `go()` 仍然要传 THEMES 里的真实下标 ——
 *  过滤时把原下标一起带着走（CHAPTER_THEMES 就是干这个的）。
 * ========================================================================== */

import type { CSSProperties } from 'react'
import { CHAPTER_THEMES, type Theme } from '../config/themes'
import { useThemeStore } from '../store/useThemeStore'

/** 抽象图标，全部手写路径，不依赖图标库 */
function NodeIcon({ name }: { name: Theme['icon'] }) {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.3,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    width: '100%',
    height: '100%',
    'aria-hidden': true,
  }

  if (name === 'spiral') {
    return (
      <svg {...common}>
        <path d="M12 12a1.3 1.3 0 1 1 1.3 1.3 2.6 2.6 0 1 1-2.6-2.6 3.9 3.9 0 1 1 3.9 3.9 5.2 5.2 0 1 1-5.2-5.2 6.5 6.5 0 1 1 6.5 6.5" />
      </svg>
    )
  }
  if (name === 'cube') {
    return (
      <svg {...common}>
        <path d="M12 2.8 20 7.4v9.2L12 21.2 4 16.6V7.4z" />
        <path d="M4 7.4 12 12l8-4.6M12 12v9.2" />
      </svg>
    )
  }
  if (name === 'brain') {
    return (
      <svg {...common}>
        <path d="M12 4.2c3.2 0 5.7 2.1 5.7 4.8 0 1.1-.4 2.1-1 2.9.3.6.4 1.3.4 2 0 2.1-1.8 3.9-3.9 3.9h-2.4c-2.1 0-3.9-1.8-3.9-3.9 0-.7.1-1.4.4-2-.6-.8-1-1.8-1-2.9 0-2.7 2.5-4.8 5.7-4.8z" />
        <path d="M12 4.2v12.7M9.4 8.6h5.2M9.8 13h4.4" />
      </svg>
    )
  }
  if (name === 'eye') {
    // 一只眼睛：外轮廓 + 瞳孔。「青年 · 参与宇宙」= 仰望与观测
    return (
      <svg {...common}>
        <path d="M2.4 12S5.9 6.1 12 6.1 21.6 12 21.6 12s-3.5 5.9-9.6 5.9S2.4 12 2.4 12z" />
        <path d="M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z" />
      </svg>
    )
  }
  if (name === 'tech') {
    // 一块「终端面板」：外框 + 标题行 + 两行内容
    return (
      <svg {...common}>
        <path d="M3.6 5.2h16.8v13.6H3.6z" />
        <path d="M3.6 9.2h16.8" />
        <path d="M6.6 12.6h7M6.6 15.8h4.6" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <path d="M12 3.6a8.4 8.4 0 1 0 0 16.8 8.4 8.4 0 0 0 0-16.8z" />
      <path d="M12 9.4a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2z" />
    </svg>
  )
}

export default function Navigation() {
  const index = useThemeStore((s) => s.index)
  const go = useThemeStore((s) => s.go)

  // 光晕要平移几格：当前章节在**轨道上**的位置。
  // 首页不在轨道上（-1）→ 落在第 0 格即可，反正首页时整条轨道是收起的。
  const slot = Math.max(
    0,
    CHAPTER_THEMES.findIndex((x) => x.index === index),
  )

  return (
    <nav
      className="orbnav"
      aria-label="Theme navigation"
      /* --nodes 给 CSS 算轨道长度和垂直居中偏移；
         --i 是当前选中节点的序号，光晕靠它平移过去。两个都是纯数字。 */
      style={{ '--nodes': String(CHAPTER_THEMES.length), '--i': String(slot) } as CSSProperties}
    >
      {/* 轨道：一条细发光线，上面有几个缓慢流动的光点 */}
      <span className="orbnav__track" aria-hidden="true">
        <i className="orbnav__flow" />
        <i className="orbnav__flow orbnav__flow--b" />
        <i className="orbnav__flow orbnav__flow--c" />
      </span>

      {/* 选中光晕：全场只有一个，靠 --i 平移。改 --i 时 CSS transition 负责滑动 */}
      <span className="orbnav__halo" aria-hidden="true" />

      {CHAPTER_THEMES.map(({ theme: t, index: i }) => {
        const active = i === index
        return (
          <button
            key={t.id}
            type="button"
            className={`orbnav__node${active ? ' is-active' : ''}`}
            aria-label={t.navCn ? `${t.nav} · ${t.navCn}` : t.nav}
            aria-current={active ? 'true' : undefined}
            title={t.navCn ? `${t.nav} · ${t.navCn}` : `${t.nav} · ${i + 1}`}
            onClick={() => go(i)}
          >
            <span className="orbnav__disc">
              <span className="orbnav__icon">
                <NodeIcon name={t.icon} />
              </span>
            </span>

            {/* 英文主名 + 中文副名（两行，中文更小更淡）。
                中文留空时只渲染英文，DOM 与旧版一致。 */}
            <span className="orbnav__label">
              <span className="orbnav__label-en">{t.nav}</span>
              {t.navCn ? <span className="orbnav__label-cn">{t.navCn}</span> : null}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
