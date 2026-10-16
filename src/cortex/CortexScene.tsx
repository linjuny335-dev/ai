/* ============================================================================
 *  CortexScene —— CORTEX 栏目「智 · 读懂宇宙」
 * ----------------------------------------------------------------------------
 *  这一栏现在分两层，**实验室在上、官方数据台在下**：
 *
 *    ① 天文实验室（CortexLab）
 *       三张可以自己动手的台子：恒星光谱台 / 行星轨道台 / 黑洞视界台。
 *       拖滑杆 → 数值实时重算 → 颜色、谱线、轨道跟着变。
 *       ⚠️ 这里的数字是**算出来的，不是取回来的**，所以每张台子都必须
 *       把公式、常数、以及「这是计算值不是官方数据」一起摆在界面上。
 *       公式对不对由 _analysis/verify-lab.js 拿公认天体数值反查。
 *
 *    ② 中国航天真实数据台（CnPanel）—— 原来就有，内容一个字没改
 *       国家天文台科研动态 + 载人航天空间科学，来自官方公开栏目，
 *       服务端解析后经同源 /cn-api/feed 下发，界面上没有写死的字。
 *
 *  这一栏承担的角色和其它四栏刻意区分开：
 *      PHOTON  看 —— 今天宇宙长什么样
 *      FOUNDRY 找 —— 要造什么才能去
 *      CORTEX  算 —— 看不见的东西怎么从能测到的量反推
 *      BLUEYARD 参与 —— 今晚就能做的事
 *      TECH    知道 —— 现在正在发生什么
 *
 *  和全站一致：挂在 SceneManager 的转场时间轴上，旧场景退出 → 银河空镜 →
 *  本场景进入（头部 / 实验台 / 数据台 错峰上浮）。
 * ========================================================================== */

import type { Theme } from '../config/themes'
import CnPanel from '../cnspace/CnPanel'
import CortexLab from './CortexLab'
import './cortex.css'

export default function CortexScene({ theme }: { theme: Theme }) {
  return (
    <section className="cortex scene-scroll" data-wheel-scroll>
      <div className="cortex__inner">
        {/* ------------------------------------------------------------ 头部 */}
        <header className="cortex__head">
          <div className="cortex__titles">
            <p className="kicker" data-stagger>
              {theme.kicker}
            </p>
            <h1 className="cortex__title">
              <span className="headline__line" data-stagger>
                {theme.headline[0]}
              </span>
              <span className="headline__line headline__line--accent" data-stagger>
                {theme.headline[1]}
              </span>
            </h1>
            {theme.blurbCn ? (
              <p className="cortex__sub" data-stagger>
                {theme.blurbCn}
              </p>
            ) : null}
          </div>
        </header>

        {/* ---------------------------------------------------- 天文实验室 */}
        <CortexLab />

        {/* ---------------------- 中国航天真实数据台（科研动态 / 空间科学）
            国家天文台 · 中国载人航天 官方公开栏目，服务端解析后经同源
            /cn-api/feed 下发。这一段内容和改造前完全一样，一个字没动。 */}
        <CnPanel
          category="cortex"
          label="中国航天 · 科学与探索"
          note="国家天文台科研动态 · 载人航天空间科学"
          limit={9}
          gridMax="248px"
        />

        {/* ------------------------------------------------------------ 页脚 */}
        <footer className="cortex__foot" data-stagger>
          <span className="cortex__foot-main">
            Source · 上方实验台为<b>物理公式实时计算</b>（公式与常数已列出）· 下方数据台为
            <b> 国家天文台 / 中国载人航天</b> 官方公开栏目原文
          </span>
          <span className="cortex__foot-meta">
            实验室依据 <code>src/cortex/lab.ts</code> · 公式经{' '}
            <code>_analysis/verify-lab.js</code> 以公认天体数值反查
          </span>
        </footer>
      </div>
    </section>
  )
}
