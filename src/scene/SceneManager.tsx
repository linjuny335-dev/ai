/* ============================================================================
 *  SceneManager —— 全站唯一的转场时间轴
 * ----------------------------------------------------------------------------
 *  §11 所有 Scene 共用这一套流程，没有第二处动画代码：
 *
 *      exitScene()         当前 Scene 前景被甩出视野
 *        → travelGalaxy()  银河空镜穿梭（画面里只剩宇宙）
 *        → changeGalaxyZone()  两层银河交叉溶解 + 换色换区
 *        → enterScene()    新 Scene 从另一侧进入
 *
 *  §12 整个时序由一条 gsap.timeline 串起来：
 *        0.00  exit    前景 UI 退出（power3.in）
 *        0.35  travel  银河穿梭开始，两层交叉溶解（power2.inOut）
 *        1.25  settle  新区域形成 → 此刻才换 React 内容
 *        1.25  enter   新 Scene 从另一侧进入（power3.out）
 *        1.93  idle    解锁
 *
 *  §13 方向：index 变大 → 旧内容向左、新内容从右；变小则全部反过来。
 *  §14 转场期间 store.isTransitioning = true，导航请求一律丢弃。
 *
 *  §16 三套幅度模型，**共用这一条 timeline**（时序完全一样，只换幅度）：
 *        slide —— 章节之间平级移动：左右甩出 / 进入，银河侧移 + 换区。
 *        push  —— 从首页深入章节：前景朝镜头方向放大淡出（被推过身），
 *                 银河与粒子沿推进弧线强烈前冲，不侧移、不换图。
 *        pull  —— 从章节退回首页：前景往远处缩小淡出，银河与粒子沿同一条
 *                 弧线后退，不侧移、不换图（push 的反向动作）。
 *      选择规则见下面 travelMode()：**只有「进出首页」且「两端共用同一张
 *      底图」时才走纵深模式**（换图的场景强行纵深会在空镜结束时硬切一张图）。
 *
 *  注意：本组件只补间「普通对象」（world / scene3d）和 DOM 节点，
 *  绝不触发 React 重渲染 —— React 只在空镜结束的那一帧换一次内容。
 * ========================================================================== */

import gsap from 'gsap'
import { useLayoutEffect, useRef } from 'react'

/**
 * 关掉 GSAP 的「卡顿平滑」。
 * 默认行为：单帧超过 500ms 时按 33ms 计入 —— 本意是避免卡顿后大跳，
 * 但在弱机 / 软件渲染下会把 1.9 秒的转场拖成十几秒（实测无头环境拖到 20s+）。
 * 关掉之后时间轴严格按真实时间推进：宁可跳帧，也不让转场本身变长。
 */
gsap.ticker.lagSmoothing(0)

import SceneContent from '../components/SceneContent'
import { THEMES } from '../config/themes'
import {
  AMPLITUDE,
  PULL,
  PUSH,
  TIMING,
  prefersReducedMotion,
  scene3d,
  settleWorld,
  world,
  type TravelMode,
} from '../galaxy/worldState'
import { useThemeStore } from '../store/useThemeStore'

/**
 * 这次转场该用「推进 / 退回 / 平级移动」？
 *
 * 「纵深」模式（push / pull）要**两条同时成立**：
 *   1. 两端至少有一端是首页入口层（只有进出首页才是「从入口深入 / 退回入口」）
 *   2. 两端共用同一张底图（src 相同）—— 纵深模式不做交叉溶解，
 *      如果底图不同，空镜结束那一刻会硬切一张图，那正是要避免的「突然换图」
 *
 * 方向由「去哪」决定：
 *   → 去首页（入口层）  = pull  退回
 *   → 去章节            = push  推进
 * 这样「开始探索」是往前冲、「返回主页」是往后撤，两个动作读起来是一对反向。
 */
function travelMode(from: number, to: number): TravelMode {
  const a = THEMES[from]
  const b = THEMES[to]
  if (!a || !b) return 'slide'
  const entryInvolved = a.entry === true || b.entry === true
  const sameBackdrop = a.palette.backdrop.src === b.palette.backdrop.src
  if (!entryInvolved || !sameBackdrop) return 'slide'
  return b.entry === true ? 'pull' : 'push'
}

export default function SceneManager() {
  const index = useThemeStore((s) => s.index)
  const shown = useThemeStore((s) => s.shown)
  const setShown = useThemeStore((s) => s.setShown)
  const setPhase = useThemeStore((s) => s.setPhase)
  const finish = useThemeStore((s) => s.finish)

  const layer = useRef<HTMLDivElement>(null)
  /** 供 effect 读取「当前显示的是谁」，避免因 shown 更新导致 exit 重跑 */
  const shownRef = useRef(shown)
  shownRef.current = shown

  /* ---------------------------------------------------- ① exit + travel */
  useLayoutEffect(() => {
    // 目标与当前一致（首帧 / 已到位）就没有转场
    if (index === shownRef.current) return

    const from = shownRef.current
    const dir = index > from ? 1 : -1 // §13 方向
    const mode = travelMode(from, index)
    /** 纵深转场（推进 / 退回）：不侧移，靠 scale 表达前后 */
    const deep = mode !== 'slide'
    const amp = mode === 'pull' ? PULL : PUSH

    // 告诉银河世界：从哪来、到哪去、往哪边走、用哪套幅度
    world.dir = dir
    world.from = from
    world.to = index
    world.mix = 0
    world.mode = mode
    setPhase('exit')

    const el = layer.current
    const galaxyEl = document.querySelector<HTMLElement>('.galaxy-world')
    const k = prefersReducedMotion() ? 0.04 : 1
    const uiBlur = deep ? amp.blurPx : AMPLITUDE.blurPx

    const tl = gsap.timeline({
      onComplete: () => {
        // 空镜结束：新银河区域已经形成 —— 固化起点，再换 React 内容
        settleWorld()
        setShown(index)
      },
    })

    // ① 前景 UI 退出
    //    slide：被镜头甩到左右 30vw 之外
    //    push ：朝观众方向放大并被推过身（没有横向位移 —— 镜头在往前冲，不是横移）
    //    pull ：往远处缩小淡出（没有横向位移 —— 镜头在往后撤）
    if (el) {
      tl.to(
        el,
        deep
          ? {
              scale: amp.uiExitScale,
              opacity: 0,
              filter: `blur(${uiBlur}px)`,
              duration: TIMING.exit * k,
              ease: TIMING.exitEase,
            }
          : {
              xPercent: -dir * AMPLITUDE.uiExitVw,
              scale: AMPLITUDE.uiExitScale,
              opacity: 0,
              filter: `blur(${uiBlur}px)`,
              duration: TIMING.exit * k,
              ease: TIMING.exitEase,
            },
        0,
      )
    }

    // ② 3D 前景同步退出（幅度同样按 geoVw，但比银河大得多 → 视差）
    tl.to(
      scene3d,
      {
        x: deep ? 0 : -dir,
        scale: deep ? amp.geoExitScale : AMPLITUDE.geoExitScale,
        opacity: 0,
        spin: -dir * (deep ? 0.14 : 0.32),
        duration: TIMING.exit * k,
        ease: TIMING.exitEase,
      },
      0,
    )

    // ③ 银河空镜穿梭 + 换区：与退出略重叠，画面上此时已无主要 UI
    tl.add(() => setPhase('travel'), TIMING.travelAt * k)
    tl.to(
      world,
      { mix: 1, duration: TIMING.travel * k, ease: TIMING.travelEase },
      TIMING.travelAt * k,
    )

    // ④ 极轻微的模糊，制造纵深感（幅度很小，不喧宾夺主）
    if (galaxyEl) {
      const gBlur = deep ? amp.galaxyBlurPx : 2.5
      tl.to(
        galaxyEl,
        { filter: `blur(${gBlur}px)`, duration: 0.42 * k, ease: 'sine.out' },
        TIMING.travelAt * k,
      )
      tl.to(
        galaxyEl,
        { filter: 'blur(0px)', duration: 0.52 * k, ease: 'sine.inOut' },
        (TIMING.travelAt + 0.45) * k,
      )
    }

    return () => {
      tl.kill()
    }
  }, [index, setPhase, setShown])

  /* ------------------------------------------------------------- ② enter */
  useLayoutEffect(() => {
    const el = layer.current
    const dir = world.dir
    const k = prefersReducedMotion() ? 0.04 : 1
    // 首屏首次进场（shown 就是首页）也走 push 的落定幅度：
    // 从略近处落到 1，读起来像「我们已经在这个银河里了」，而不是从右侧滑进来。
    const mode: TravelMode =
      world.mode === 'slide' && THEMES[shown]?.entry === true ? 'push' : world.mode
    const deep = mode !== 'slide'
    const amp = mode === 'pull' ? PULL : PUSH
    const uiBlur = deep ? amp.blurPx : AMPLITUDE.blurPx

    setPhase('enter')
    const items = el ? Array.from(el.querySelectorAll<HTMLElement>('[data-stagger]')) : []

    const tl = gsap.timeline({
      onComplete: () => finish(), // §14 解锁
    })

    // ③ 新 Scene 进入
    //    slide：从另一侧 32vw 处滑入
    //    push ：从略近处（1.12×）落定到 1，没有横向位移
    //    pull ：从略远处（0.94×）长回 1，没有横向位移
    if (el) {
      tl.fromTo(
        el,
        deep
          ? { xPercent: 0, scale: amp.uiEnterScale, opacity: 0, filter: `blur(${uiBlur}px)` }
          : {
              xPercent: dir * AMPLITUDE.uiEnterVw,
              scale: AMPLITUDE.uiEnterScale,
              opacity: 0,
              filter: `blur(${uiBlur}px)`,
            },
        {
          xPercent: 0,
          scale: 1,
          opacity: 1,
          filter: 'blur(0px)',
          duration: TIMING.enter * k,
          ease: TIMING.enterEase,
        },
        0,
      )
    }

    tl.fromTo(
      scene3d,
      deep
        ? { x: 0, scale: amp.geoEnterScale, opacity: 0, spin: dir * 0.1 }
        : { x: dir, scale: AMPLITUDE.geoEnterScale, opacity: 0, spin: dir * 0.26 },
      {
        x: 0,
        scale: 1,
        opacity: 1,
        spin: 0,
        duration: TIMING.enter3d * k,
        ease: TIMING.enterEase,
      },
      0,
    )

    // 文字错峰上浮，比容器晚一点点开始
    if (items.length) {
      tl.fromTo(
        items,
        { y: 20, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.6 * k, stagger: 0.045 * k, ease: 'power3.out' },
        0.1 * k,
      )
    }

    return () => {
      tl.kill()
    }
  }, [shown, finish, setPhase])

  return (
    <div className="scene-wrap" ref={layer}>
      <SceneContent theme={THEMES[shown]} />
    </div>
  )
}
