/* ============================================================================
 *  HomeScene —— 首页入口层（整个站的门）
 * ----------------------------------------------------------------------------
 *  §16 它**不是一个新世界**：底下跑的仍是那套常驻 GalaxyWorld，
 *      底图、tint、gain、色板、中心几何体都与 PHOTON 逐个字段相同
 *      （见 config/themes.ts 里 home 主题的注释）。
 *      首页只是「同一个银河的更安静状态」：少信息、少前景元素、粒子更慢更暗。
 *
 *  点「开始探索」不会换图，也不会新建动画：
 *      走的仍是 SceneManager 那唯一一条 timeline，只是幅度换成 push
 *      （前景朝镜头放大淡出 + 银河强烈前冲）。判断逻辑在 SceneManager 的
 *      pushTransition()：进出首页 + 两端共用同一张底图 → push。
 *
 *  入场照样用 data-stagger：SceneManager 进场时会把带这个属性的元素逐个上浮。
 * ========================================================================== */

import { FIRST_CHAPTER_INDEX, type Theme } from '../config/themes'
import { useThemeStore } from '../store/useThemeStore'
import GlassButton from '../ui/glass/GlassButton'
import BrushTitle from './BrushTitle'
import './home.css'

export default function HomeScene({ theme }: { theme: Theme }) {
  const go = useThemeStore((s) => s.go)

  return (
    <section className="home">
      <p className="home__kicker" data-stagger>
        {theme.kicker}
      </p>

      {/* ---- 标题：上下两层 -------------------------------------------
          第一行 CHASING PHOTONS（英文在上、字号小、细体、大字距、缓慢淡入）
          第二行「逐光而行」书法艺术字（中文在下、是主页的核心视觉主体）
          ⚠️ 这两个值仍来自 theme.headline —— 改文案只改 config/themes.ts。
          ⚠️ 原来第二行英文副标题被移除：视觉中心让给中文艺术字，
             kicker 已经承担了那层「英文小字」的角色。 */}
      <h1 className="home__title">
        <span className="home__title-en" data-stagger>
          {theme.headline[0]}
        </span>
        <BrushTitle />
      </h1>

      <p className="home__blurb" data-stagger>
        {theme.blurb}
      </p>
      <p className="home__blurb home__blurb--cn" data-stagger>
        {theme.blurbCn}
      </p>

      <div className="home__cta" data-stagger>
        {/* 全站唯一的入口按钮。玻璃质感与导航 / 卡片同一套（ui/glass） */}
        <GlassButton className="home__go" onClick={() => go(FIRST_CHAPTER_INDEX)}>
          开始探索
          <span className="home__go-en">ENTER</span>
        </GlassButton>
      </div>

      <p className="home__hint" data-stagger>
        滚动 · 按 → · 也可以直接开始
      </p>
    </section>
  )
}
