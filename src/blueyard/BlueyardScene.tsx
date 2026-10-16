/* ============================================================================
 *  BlueyardScene —— BLUEYARD 栏目「青年 · 参与宇宙」
 * ----------------------------------------------------------------------------
 *  这一栏分两层，**任务中心在上、官方数据台在下**：
 *
 *    ① 青年任务中心（MissionCenter）
 *       今晚值班台（月相 / 节气）+ 天象日历 + 观星任务与星图 + 知识挑战。
 *       这一栏和其它四栏的关系是刻意错开的：
 *            PHOTON   看   —— 今天宇宙长什么样
 *            FOUNDRY  找   —— 要造什么才能去
 *            CORTEX   算   —— 看不见的东西怎么从能测到的量反推
 *            BLUEYARD 做   —— 今晚就能做的七件事（这一栏）
 *            TECH     知道 —— 现在正在发生什么
 *       ⚠️ 这一栏有三类数字，界面上必须分开标：
 *            推算（月相 / 节气）· 年度周期（流星雨）· 本站整理（任务 / 题目 / 星图）
 *
 *    ② 中国航天真实数据台（CnPanel）—— 原来就有，内容一个字没改
 *       天宫课堂、科普活动等面向青年的官方科普内容，服务端解析官方公开栏目，
 *       经同源 /cn-api/feed 下发，界面上没有写死的字。
 *
 *  和全站一致：挂在 SceneManager 的转场时间轴上，旧场景退出 → 银河空镜 →
 *  本场景进入（头部 / 值班台 / 星图 / 清单 / 题目 错峰上浮）。
 *  ⚠️ 容器用 .scene-scroll（可滚动）+ 不用 justify-content:center —— 见 blueyard.css。
 * ========================================================================== */

import type { Theme } from '../config/themes'
import CnPanel from '../cnspace/CnPanel'
import MissionCenter from './MissionCenter'
import './blueyard.css'

export default function BlueyardScene({ theme }: { theme: Theme }) {
  return (
    <section className="byard scene-scroll" data-wheel-scroll>
      <div className="byard__inner">
        {/* ------------------------------------------------------------ 头部 */}
        <header className="byard__head">
          <div className="byard__titles">
            <p className="kicker" data-stagger>
              {theme.kicker}
            </p>
            <h1 className="byard__title">
              <span className="headline__line" data-stagger>
                {theme.headline[0]}
              </span>
              <span className="headline__line headline__line--accent" data-stagger>
                {theme.headline[1]}
              </span>
            </h1>
            {theme.blurbCn ? (
              <p className="byard__sub" data-stagger>
                {theme.blurbCn}
              </p>
            ) : null}

            {/* 原来的五个标签照旧留着，它们是这一栏的「关键词」。
                外层沿用全局 .logos（首页/其它栏目的标签行就是它），
                只补自己的间距，不另起一套。 */}
            {theme.logos.length > 0 ? (
              <div className="logos byard__tags">
                {theme.logos.map((name, i) => (
                  <span
                    key={name}
                    className="logo"
                    data-stagger
                    style={{ animationDelay: `${(i % 5) * 0.7}s` }}
                  >
                    {name}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </header>

        {/* ---------------------------------------------------- 青年任务中心 */}
        <MissionCenter />

        {/* ---------------------- 中国航天真实数据台（天宫课堂 / 科普活动）
            中国载人航天 · 国家航天局 · 国家天文台 官方公开栏目，
            服务端解析后经同源 /cn-api/feed 下发。这一段和改造前完全一样。 */}
        <CnPanel
          category="blueyard"
          label="中国航天 · 青年科普"
          note="天宫课堂 · 科普活动 · 航天知识（面向青年）"
          limit={9}
          gridMax="248px"
        />

        {/* ------------------------------------------------------------ 页脚 */}
        <footer className="byard__foot" data-stagger>
          <span className="byard__foot-main">
            Source · 上方任务中心里：<b>月相与节气为公式推算</b>、<b>流星雨为年度固定周期</b>、
            <b>任务与知识题为本站整理</b>；<b>下方数据台</b>为中国航天官方公开栏目原文
          </span>
          <span className="byard__foot-meta">
            推算内核 <code>src/blueyard/sky.ts</code> · 整理内容{' '}
            <code>src/blueyard/program.ts</code> · 精度由{' '}
            <code>_analysis/verify-sky.js</code> 与公开历表对拍
          </span>
        </footer>
      </div>
    </section>
  )
}
