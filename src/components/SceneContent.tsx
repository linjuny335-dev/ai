/* ============================================================================
 *  SceneContent —— 一个 Scene 的 DOM 内容（前景）
 * ----------------------------------------------------------------------------
 *  它不自己写动画：整块由 SceneManager 用 GSAP 统一驱动
 *  （x / scale / opacity / blur），内部的 [data-stagger] 元素做错峰入场。
 *
 *  带 data-stagger 的元素会被 SceneManager 在进场时逐个上浮；
 *  想让某个元素参与错峰，加这个属性即可。
 *
 *  ℹ️ 这里原来还有一组「通用文案块」（HeadlineBlock / BrandBlock / Words），
 *     是五个板块还没各自成篇时的兜底排版。2026-09-21 五栏全部有了自己的
 *     场景组件（最后一栏 BLUEYARD 也改成了青年任务中心），兜底已经没有任何
 *     主题会走到，留着只会让后来的人以为「还有一条老路」—— 所以删掉了。
 *     对应样式（.headline/.blurb/.logos/.brand）仍留在 styles.css 里，
 *     各场景的标题仍在复用 .headline__line / .kicker。
 * ========================================================================== */

import type { Theme } from '../config/themes'
import BlueyardScene from '../blueyard/BlueyardScene'
import CortexScene from '../cortex/CortexScene'
import FoundryScene from '../foundry/FoundryScene'
import HomeScene from '../home/HomeScene'
import PhotonScene from '../photon/PhotonScene'
import TechScene from '../tech/TechScene'

export default function SceneContent({ theme }: { theme: Theme }) {
  // 各有自己的界面，但都挂在同一条转场时间轴下：
  //   home    —— 首页入口（同一个银河的安静状态 + 「开始探索」）
  //   tech    —— 液态玻璃终端（航天三源实时数据 + 中国航天四源汇总）
  //   photon  —— 观测台（NASA APOD 当天真实天文图片 / 视频 + 国家天文台数据台）
  //   foundry —— 航天装备展厅 + 发射任务时间轴（Launch Library 2 真实发射数据）
  //   cortex  —— 天文实验室（三张可动手的台子，数值由物理公式实时计算）
  //   blueyard—— 青年任务中心（月相与节气推算 + 观星任务星图 + 知识挑战）
  //
  // 五个板块到这里已经各有各的界面了，所以下面不再有「兜底分支」：
  // 主题表里每个 id 都必须在上面对上号，漏一个就是真漏了，不该悄悄退回旧版。
  if (theme.entry) return <HomeScene theme={theme} />
  if (theme.id === 'tech') return <TechScene theme={theme} />
  if (theme.id === 'photon') return <PhotonScene theme={theme} />
  if (theme.id === 'foundry') return <FoundryScene theme={theme} />
  if (theme.id === 'cortex') return <CortexScene theme={theme} />
  if (theme.id === 'blueyard') return <BlueyardScene theme={theme} />

  return null
}
