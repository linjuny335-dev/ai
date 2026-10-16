/* ============================================================================
 *  BrushTitle —— 首页「逐光而行」书法艺术字
 * ----------------------------------------------------------------------------
 *  **素材来自用户上传的狂草原图**（`_analysis/make-brush-png.py` 处理），
 *  不是矢量重绘、也不是 AI 另写的字 —— 用户明确要求「尽可能保持原图造型」。
 *
 *  素材：`public/brush/zhu-guang-er-xing.png`（+ .webp）
 *    · 真透明，无白边、无矩形光影（脚本里用「alpha = 1 − 亮度」而不是
 *      「删掉白像素」，再用 ALPHA_FLOOR 清掉背景残留噪点，见脚本顶部说明）
 *    · 1671×585，宽幅构图，包含原图的底部延伸长弧笔画 + 墨点 + 星轨感
 *    · 颜色按用户指定的四个色号分层（脚本 v2）：主体 #A8B5C8 雾蓝灰、
 *      局部 #C0C7D2 柔和银灰、暗部 #7F91AB 深灰蓝、星轨 #777B9B 灰紫蓝
 *      且星轨只保留 42% 不透明度 —— 网页里不再叠任何颜色
 *
 *  为什么改成 <img> 而不是原来的 SVG 笔画：
 *    原图是狂草连笔，笔画像素里带飞白擦除与不规则笔锋，
 *    矢量化会把这些细节抹平，而用户要的正是这份「原图质感」。
 *
 *  动态效果（克制，主体不动）：
 *    1. 进场缓慢淡入（blur 4px，不用 v1 的 7px）
 *    2. 一个 240px 的小柔光斑**非常缓慢**跟随鼠标漂移（k=0.045）
 *    3. 鼠标靠近时局部星芒微微亮起（峰值 0.40）
 *    ⚠️ 明确**不做**：整体缩放 / 旋转 / 抖动 —— 用户点名不要。
 *    ⚠️ 也不做**整张图的 opacity 下压** —— 用户明令禁止，会丢笔画质感。
 *
 *  ⚠️ 指针只写 CSS 变量 + rAF，不进 React state（全站硬约定）。
 *  ⚠️ pointer-events:none —— 艺术字不能挡住下面的「开始探索」按钮；
 *     而且**pointer-events:none 的元素 CSS :hover 永远不成立**（§14 教训），
 *     所以星芒亮起用 rAF 里的矩形命中判定 + 自己加class。
 * ========================================================================== */

import { useEffect, useRef } from 'react'
import './brushTitle.css'

/** 星芒位置：取自原图里墨点/笔锋较亮的几处，比例坐标（0~1） */
const SPARKS = [
  { x: 0.055, y: 0.3, s: 1.0 }, // 左侧墨点
  { x: 0.115, y: 0.62, s: 0.8 }, // 下方长弧起点
  { x: 0.315, y: 0.16, s: 0.9 }, // 「光」字上锋
  { x: 0.5, y: 0.78, s: 0.75 }, // 长弧末端
  { x: 0.63, y: 0.34, s: 0.85 }, // 「而」字右上
  { x: 0.795, y: 0.2, s: 1.0 }, // 「行」字上锋
  { x: 0.905, y: 0.44, s: 0.8 }, // 右侧墨点
  { x: 0.72, y: 0.68, s: 0.7 },
]

export default function BrushTitle() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    // 光斑中心的极慢漂移 + 鼠标靠近时星芒微亮。
    // k 取得很小（0.045）：光是「被星光轻轻照亮」，不是追着鼠标跑。
    let raf = 0
    let tx = 0.42
    let ty = 0.3
    let cx = 0.42
    let cy = 0.3

    const step = () => {
      cx += (tx - cx) * 0.045
      cy += (ty - cy) * 0.045
      el.style.setProperty('--mx', cx.toFixed(4))
      el.style.setProperty('--my', cy.toFixed(4))
      raf = Math.abs(tx - cx) > 1e-4 || Math.abs(ty - cy) > 1e-4 ? requestAnimationFrame(step) : 0
    }
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height) return
      const px = (e.clientX - r.left) / r.width
      const py = (e.clientY - r.top) / r.height

      // 只有真的「靠近」（外扩 12%）才接管
      if (px < -0.12 || px > 1.12 || py < -0.12 || py > 1.12) {
        if (el.classList.contains('is-near')) {
          el.classList.remove('is-near')
          tx = 0.42
          ty = 0.3
        }
      } else {
        tx = px
        ty = py
        if (!el.classList.contains('is-near')) el.classList.add('is-near')
      }

      // 星芒亮度：越近越亮，范围 0~1（CSS 里再乘一个很低的系数）
      const dx = px - 0.5
      const dy = py - 0.5
      const near = 1 - Math.min(1, Math.sqrt(dx * dx + dy * dy) / 0.58)
      el.style.setProperty('--near', near.toFixed(3))
      if (!raf) raf = requestAnimationFrame(step)
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div className="brush2" ref={ref} role="img" aria-label="逐光而行">
      {/* 主体素材。webp 优先、png 回退；width/height 已给定 → 不拉伸不变形 */}
      <picture>
        <source srcSet="/brush/zhu-guang-er-xing.webp" type="image/webp" />
        <img
          className="brush2__img"
          src="/brush/zhu-guang-er-xing.png"
          alt=""
          width={1671}
          height={585}
          decoding="async"
          fetchPriority="high"
        />
      </picture>

      {/* 跟随鼠标的柔光斑。单独一层、pointer-events:none，
          不影响图片本身的任何动画。
          ⚠️ v1 这里是一层 inset:0 的大半径渐变（.brush2__sheen），
          它在 394px 高的容器里被上下边缘硬切 → 一块灰白矩形。已换成
          固定 240px 的小圆斑，见 brushTitle.css 文件头。 */}
      <div className="brush2__glow" aria-hidden="true" />

      {/* 星芒：鼠标靠近时微微亮起（亮度受 --near 控制，峰值 0.40） */}
      <div className="brush2__sparks" aria-hidden="true">
        {SPARKS.map((s, i) => (
          <i
            key={i}
            className="brush2__spark"
            style={
              {
                '--sx': `${(s.x * 100).toFixed(2)}%`,
                '--sy': `${(s.y * 100).toFixed(2)}%`,
                '--ss': `${(s.s * 7).toFixed(1)}px`,
                '--sd': `${(0.6 + i * 0.17).toFixed(2)}s`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>
    </div>
  )
}
