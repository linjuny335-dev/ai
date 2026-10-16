/* ============================================================================
 *  GestureControl —— 手势控制的界面与动作执行
 * ----------------------------------------------------------------------------
 *  右上角一个很小的开关 + 一层画光标的 Canvas。开启前什么也不做。
 *
 *  ── 它在这一层负责什么 ────────────────────────────────────────────────
 *   · 用户**点了才**申请摄像头（页面加载时一个字节都不碰）
 *   · 每帧把识别结果喂给内核（gesture.ts），再拿内核给的「意图」去做四件事：
 *        画光标 ／ 合成点击 ／ 切板块 ／ 把银河解体量写进粒子桥
 *   · 光标的绘制、点击的光波反馈、挥手时的边缘流光
 *
 *  ── 三个关键决定 ──────────────────────────────────────────────────────
 *  ① **不隐藏系统鼠标指针**。手势是"另一个输入设备"，鼠标随时还能用；
 *     真把手势玩崩了，鼠标还得能救场。所以这里只是**另画**一个发光星点，
 *     而不是去 `cursor: none` 掉箭头。（用户要的也是"不要直接显示普通箭头"，
 *     即这个指示器不要是箭头，而不是"把箭头藏起来"。）
 *  ② **点击是真的派发 DOM 事件**（`el.click()`），不是自己转发回调 ——
 *     站内 53 处 onClick 全都是真 `<button>`（GlassButton 与轨道导航都是），
 *     所以捏合点下去和鼠标点下去走的是同一条路，行为天然一致。
 *  ③ **一次捏合只点一次**由内核的迟滞 + 武装位保证（见 gesture.ts 的 PINCH_*），
 *     这一层不做去重 —— 免得两处各自"防抖"互相打架。
 *
 *  ── 拿不准的地方 ──────────────────────────────────────────────────────
 *  阈值（捏合比例、挥手幅度）是按**归一化到手掌尺寸**之后定的，所以与手大手小、
 *  离摄像头远近无关。但每个人的手型不一样，所以：
 *    · 界面上把实时 `pinchRatio` 通过 __gesture 探针暴露出来
 *    · 加一个 `?gesture=debug` 的读数浮层，用户能自己看手感对不对
 * ========================================================================== */

import { useCallback, useEffect, useRef, useState } from 'react'
import { ENTRY_INDEX } from '../../config/themes'
import { gestureParticle, resetGestureParticle } from '../../scene/gestureParticle'
import { useThemeStore } from '../../store/useThemeStore'
import GlassButton from '../glass/GlassButton'
import GlassSurface from '../glass/GlassSurface'
import {
  COLOR,
  EDGE_FLASH_MS,
  advance,
  createGesture,
  resetGesture,
  setViewport,
  type GestureState,
  type Intent,
  type Landmark,
} from './gesture'
import {
  startHandTracker,
  TRACKER_ERROR_TEXT,
  type Tracker,
  type TrackerErrorKind,
  type TrackFrame,
} from './handTracker'
import './gesture.css'

/* ---- 可点击元素：站内全是真 button，这里把常见可点语义都收进来 ---- */
const CLICKABLE =
  'button, a[href], input, select, textarea, [role="button"], [role="link"], label'

/** 这些标签**不**用捏合点，免得误触把摄像头关了 / 触发表单默认行为 */
const BLOCK_TAGS = new Set(['HTML', 'BODY'])

type Status = 'off' | 'starting' | 'on' | 'error'

interface Ripple {
  x: number
  y: number
  t: number
}

/** 调试读数（`?gesture=debug` 才显示） */
const DEBUG = (() => {
  if (typeof window === 'undefined') return false
  const q = new URLSearchParams(window.location.search)
  return q.get('gesture') === 'debug' || q.get('gestureDebug') === '1'
})()

export default function GestureControl() {
  const [desktop, setDesktop] = useState(false)
  const [status, setStatus] = useState<Status>('off')
  const [progress, setProgress] = useState<number | null>(null)
  const [label, setLabel] = useState('')
  const [errKind, setErrKind] = useState<TrackerErrorKind | null>(null)
  const [hint, setHint] = useState(false)
  const [dbg, setDbg] = useState('')

  const index = useThemeStore((s) => s.index)
  /** 首页时右上角没有「返回主页」按钮，开关可以贴到最上；章节里要给它让位 */
  const atEntry = index === ENTRY_INDEX

  /* ---- refs：高频的东西一律不进 React state ---------------------------- */
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const mountRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const trackerRef = useRef<Tracker | null>(null)
  const stateRef = useRef<GestureState | null>(null)
  const intentRef = useRef<Intent | null>(null)
  const trailRef = useRef<Array<{ x: number; y: number; t: number }>>([])
  const rippleRef = useRef<Ripple[]>([])
  /**
   * 挥手成功那一下，屏幕边缘的**流光**提示。
   * `dir: 1` = 向左挥（= 进入下一个板块）→ 光从**右**侧进来；
   * `dir: -1` = 向右挥（= 回到上一个板块）→ 光从**左**侧进来。
   * 刻意做得很轻（一道渐隐的冷色渐变 + 一条细亮边），不是箭头、不是游戏提示。
   */
  const flashRef = useRef<Array<{ dir: -1 | 1; t: number }>>([])
  const hoverRef = useRef<DOMRect | null>(null)
  const rafRef = useRef(0)
  const busyRef = useRef(false)
  const lastTRef = useRef(0)
  const frameNoRef = useRef(0)
  /** 测试用：注入的关键点。undefined = 用真摄像头 */
  const injectedRef = useRef<Landmark[] | null | undefined>(undefined)
  const statsRef = useRef({
    clicks: 0,
    lastHit: '',
    swipes: 0,
    frames: 0,
    /** 挥手流光放过几次（验收用） */
    flashes: 0,
    /** 最近一次挥手方向：1 = 下一板块，-1 = 上一板块，0 = 还没有 */
    lastSwipeDir: 0 as -1 | 0 | 1,
    /** 银河解体量到过的最大值（验收用：证明「张掌」真的驱动了粒子散开） */
    spreadPeak: 0,
  })

  const statusRef = useRef<Status>('off')
  statusRef.current = status

  /* ---- 只在桌面端渲染（手机上不启用，与用户要求一致） ------------------ */
  useEffect(() => {
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)')
    const on = () => setDesktop(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  /* ---- 点击合成 -------------------------------------------------------- */
  const clickAt = useCallback((x: number, y: number): string => {
    const els = document.elementsFromPoint
      ? document.elementsFromPoint(x, y)
      : ([document.elementFromPoint(x, y)].filter(Boolean) as Element[])
    for (const el of els) {
      const he = el as HTMLElement
      if (!he || !he.closest) continue
      // 自己这一层（开关按钮 / 画布）绝不参与 —— 防止误触把摄像头关了
      if (he.closest('.gesture-ui')) continue
      if (BLOCK_TAGS.has(he.tagName)) continue
      const hit = he.closest(CLICKABLE) as HTMLElement | null
      if (!hit) continue
      if ((hit as HTMLButtonElement).disabled) continue
      hit.click()
      return (hit.className || hit.tagName).toString().slice(0, 60)
    }
    return ''
  }, [])

  /* ---- 开 / 关 --------------------------------------------------------- */
  const stopAll = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = 0
    try {
      trackerRef.current?.stop()
    } catch {
      /* 已经停了 */
    }
    trackerRef.current = null
    if (stateRef.current) resetGesture(stateRef.current)
    intentRef.current = null
    trailRef.current.length = 0
    rippleRef.current.length = 0
    flashRef.current.length = 0
    hoverRef.current = null
    // ⚠️ 必须把粒子桥归零：否则在「握着拳」的时候关掉手势，
    //    星空会一直卡在收拢态（NebulaField 只在每帧读这个桥）。
    resetGestureParticle()
    const c = canvasRef.current
    if (c) c.getContext('2d')?.clearRect(0, 0, c.width, c.height)
  }, [])

  const enable = useCallback(async () => {
    if (busyRef.current || statusRef.current === 'on') return
    busyRef.current = true
    setErrKind(null)
    setStatus('starting')
    setProgress(null)
    setLabel('正在等待摄像头授权…')
    try {
      const tr = await startHandTracker({
        mount: mountRef.current!,
        onProgress: (r, l) => {
          setProgress(r)
          setLabel(l)
        },
      })
      trackerRef.current = tr
      if (!stateRef.current) {
        stateRef.current = createGesture({ w: window.innerWidth, h: window.innerHeight })
      }
      resetGesture(stateRef.current)
      setViewport(stateRef.current, { w: window.innerWidth, h: window.innerHeight })
      setStatus('on')
      setHint(true)
      window.setTimeout(() => setHint(false), 8000)
    } catch (e) {
      const kind = ((e as { gestureKind?: TrackerErrorKind }).gestureKind ??
        'unknown') as TrackerErrorKind
      setErrKind(kind)
      setStatus('error')
      stopAll()
    } finally {
      busyRef.current = false
    }
  }, [stopAll])

  const disable = useCallback(() => {
    stopAll()
    setStatus('off')
    setProgress(null)
    setLabel('')
    setErrKind(null)
  }, [stopAll])

  const onToggle = useCallback(() => {
    if (statusRef.current === 'on' || statusRef.current === 'starting') disable()
    else void enable()
  }, [disable, enable])

  /* ---- 主循环 ---------------------------------------------------------- */
  useEffect(() => {
    if (status !== 'on') return
    let alive = true

    const tick = () => {
      if (!alive) return
      rafRef.current = requestAnimationFrame(tick)
      frameNoRef.current++

      const now = performance.now()
      const view = { w: window.innerWidth, h: window.innerHeight }
      const st = stateRef.current
      if (!st) return

      /* 取这一帧的输入：测试注入优先，否则问摄像头要 */
      const inj = injectedRef.current
      let frame: TrackFrame | null = null
      if (inj !== undefined) {
        const dt = lastTRef.current ? Math.min(200, now - lastTRef.current) : 16.67
        frame = { lm: inj, dtMs: dt > 0 ? dt : 16.67 }
      } else if (trackerRef.current) {
        frame = trackerRef.current.poll(now)
      }
      lastTRef.current = now

      if (frame) {
        const it = advance(st, frame.lm, frame.dtMs, view)
        intentRef.current = it
        statsRef.current.frames++

        /* —— 四个动作 —— */
        if (it.click) {
          rippleRef.current.push({ x: it.x, y: it.y, t: now })
          if (rippleRef.current.length > 6) rippleRef.current.shift()
          statsRef.current.clicks++
          statsRef.current.lastHit = clickAt(it.x, it.y)
        }
        if (it.swipe === 1) {
          // 向左挥 = 下一个板块。流光从**右**侧进来（「翻过去了」的方向感）
          useThemeStore.getState().next()
          statsRef.current.swipes++
          statsRef.current.flashes++
          statsRef.current.lastSwipeDir = 1
          flashRef.current.push({ dir: 1, t: now })
          if (flashRef.current.length > 3) flashRef.current.shift()
        } else if (it.swipe === -1) {
          // 向右挥 = 上一个板块。流光从**左**侧进来
          useThemeStore.getState().prev()
          statsRef.current.swipes++
          statsRef.current.flashes++
          statsRef.current.lastSwipeDir = -1
          flashRef.current.push({ dir: -1, t: now })
          if (flashRef.current.length > 3) flashRef.current.shift()
        }
        // 张掌 / 握拳 → 银河粒子解体散开 / 聚拢回原样。
        // 这一层**只做搬运**：内核已经把握合度算好、死区滤掉并低通过了，
        // 这里每帧写进共享桥；真正的「惯性」在 NebulaField 读桥那一步再叠一道。
        gestureParticle.spread = it.spread
        if (it.spread > statsRef.current.spreadPeak) statsRef.current.spreadPeak = it.spread

        /* —— 悬停高亮（节流：每 4 帧查一次就够） —— */
        if (frameNoRef.current % 4 === 0 && it.active) {
          hoverRef.current = findHover(it.x, it.y)
        }
        if (!it.active) hoverRef.current = null
      }

      draw(now, view)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      alive = false
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
  }, [status, clickAt])

  /* ---- 卸载时一定要把摄像头关掉 ---------------------------------------- */
  useEffect(() => () => stopAll(), [stopAll])

  /* ---- 调试读数 -------------------------------------------------------- */
  useEffect(() => {
    if (!DEBUG || status !== 'on') return
    const id = window.setInterval(() => {
      const it = intentRef.current
      const s = statsRef.current
      setDbg(
        it
          ? `食指指尖 (${it.x.toFixed(0)}, ${it.y.toFixed(0)}) · 捏合比 ${it.pinchRatio.toFixed(2)}` +
              `${it.pinchDown ? ' [捏住]' : ''} · 闭合 ${(it.fistness * 100).toFixed(0)}% · ` +
              `银河解体 ${(it.spread * 100).toFixed(0)}% · ` +
              `手 ${it.handSeen ? '在' : '无'} · 点击 ${s.clicks} · 挥手 ${s.swipes} · ` +
              `识别 ${s.frames} 帧`
          : '等待识别…',
      )
    }, 200)
    return () => window.clearInterval(id)
  }, [status])

  /* ---- 探针（给验收脚本用，和 __meteor 同一套做法） -------------------- */
  useEffect(() => {
    const api = {
      status: () => statusRef.current,
      probe: () => {
        const it = intentRef.current
        const s = statsRef.current
        return {
          status: statusRef.current,
          cursor: it ? { x: it.x, y: it.y, alpha: it.alpha } : null,
          intent: it,
          clicks: s.clicks,
          lastHit: s.lastHit,
          swipes: s.swipes,
          frames: s.frames,
          /** 挥手流光放过几次 + 最近一次方向（1 = 下一板块，-1 = 上一板块） */
          flashes: s.flashes,
          lastSwipeDir: s.lastSwipeDir,
          /** 挥手是否已「重新上膛」—— 验收用来验证「手回到原位后才能再触发」 */
          swipeArmed: stateRef.current ? stateRef.current.swipeArmed : null,
          pinchRatio: it?.pinchRatio ?? null,
          handSeen: !!it?.handSeen,
          /** 银河解体：桥里的当前值 / 到过的峰值 / 手的闭合程度（验收用） */
          spread: gestureParticle.spread,
          spreadPeak: s.spreadPeak,
          fistness: it?.fistness ?? null,
          hasTracker: !!trackerRef.current,
          /** 上一次推理耗时（ms）；离线注入时为 null。用来分辨「慢」是识别慢还是渲染慢 */
          inferMs: trackerRef.current ? trackerRef.current.lastInferMs : null,
          injected: injectedRef.current !== undefined,
        }
      },
      /** 注入合成关键点（null = 这一帧没有手）。传 undefined 恢复用摄像头 */
      feed: (lm: Landmark[] | null | undefined) => {
        injectedRef.current = lm
      },
      /** 直接开一层（不碰摄像头）—— 只给验收脚本用，用来隔离测交互逻辑 */
      startOffline: () => {
        injectedRef.current = null
        if (!stateRef.current) {
          stateRef.current = createGesture({ w: window.innerWidth, h: window.innerHeight })
        }
        resetGesture(stateRef.current)
        setViewport(stateRef.current, { w: window.innerWidth, h: window.innerHeight })
        setStatus('on')
      },
      resetStats: () => {
        statsRef.current = {
          clicks: 0,
          lastHit: '',
          swipes: 0,
          frames: 0,
          flashes: 0,
          lastSwipeDir: 0,
          spreadPeak: 0,
        }
        flashRef.current.length = 0
        if (stateRef.current) resetGesture(stateRef.current)
        resetGestureParticle()
      },
      /** 手动触发一次点击（用于单独验证 clickAt 的命中规则） */
      clickAt,
      color: COLOR,
    }
    ;(window as unknown as { __gesture?: typeof api }).__gesture = api
    return () => {
      delete (window as unknown as { __gesture?: typeof api }).__gesture
    }
  }, [clickAt])

  /* ---- 绘制 ------------------------------------------------------------ */
  const draw = (now: number, view: { w: number; h: number }) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const W = Math.floor(view.w * dpr)
    const H = Math.floor(view.h * dpr)
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W
      canvas.height = H
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, view.w, view.h)

    const it = intentRef.current

    /* 光波：捏合成功的那一下 */
    if (rippleRef.current.length) {
      rippleRef.current = rippleRef.current.filter((r) => now - r.t < 560)
      for (const r of rippleRef.current) {
        const p = (now - r.t) / 560
        const ease = 1 - Math.pow(1 - p, 3)
        const rad = 6 + ease * 62
        ctx.save()
        ctx.globalCompositeOperation = 'lighter'
        ctx.beginPath()
        ctx.arc(r.x, r.y, rad, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(${COLOR.wave}, ${0.5 * (1 - p)})`
        ctx.lineWidth = 2.6 * (1 - p) + 0.5
        ctx.stroke()
        // 内圈：让"点到了"这件事更明确
        ctx.beginPath()
        ctx.arc(r.x, r.y, rad * 0.55, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(${COLOR.core}, ${0.34 * (1 - p)})`
        ctx.lineWidth = 1.2
        ctx.stroke()
        ctx.restore()
      }
    }

    /* 挥手流光：屏幕边缘一道很轻的渐隐冷光，表示「刚翻页了、从哪边翻的」。
       向左挥（下一板块）→ 右边缘；向右挥（上一板块）→ 左边缘。
       刻意做得很淡：不是箭头、不是游戏提示，只是一点亮。 */
    if (flashRef.current.length) {
      flashRef.current = flashRef.current.filter((f) => now - f.t < EDGE_FLASH_MS)
      for (const f of flashRef.current) {
        const p = (now - f.t) / EDGE_FLASH_MS
        const a = (1 - p) * (1 - p) * 0.45 // 快起慢落：看得见，但不抢戏
        const w = Math.min(210, view.w * 0.17)
        const fromLeft = f.dir === -1
        const x0 = fromLeft ? 0 : view.w
        const x1 = fromLeft ? w : view.w - w
        const tint = f.dir === 1 ? COLOR.wave : COLOR.mid
        const x = Math.min(x0, x1)
        ctx.save()
        ctx.globalCompositeOperation = 'lighter'
        const g = ctx.createLinearGradient(x0, 0, x1, 0)
        g.addColorStop(0, `rgba(${tint}, ${a})`)
        g.addColorStop(0.45, `rgba(${tint}, ${a * 0.32})`)
        g.addColorStop(1, `rgba(${tint}, 0)`)
        ctx.fillStyle = g
        ctx.fillRect(x, 0, w, view.h)
        // 贴边再压一条很细的亮线 —— 让「从哪边进来」一眼可读
        const lg = ctx.createLinearGradient(x0, 0, x1, 0)
        lg.addColorStop(0, `rgba(${COLOR.core}, ${(1 - p) * 0.5})`)
        lg.addColorStop(1, `rgba(${COLOR.core}, 0)`)
        ctx.fillStyle = lg
        ctx.fillRect(x, 0, Math.max(6, w * 0.12), view.h)
        ctx.restore()
      }
    }

    if (!it || it.alpha <= 0.02) return

    const { x, y } = it
    const a = it.alpha
    const tint = COLOR.mid
    const glow = COLOR.outer

    /* 彗尾：短、随速度变长，但绝不拖成一串点 */
    const tr = trailRef.current
    tr.push({ x, y, t: now })
    while (tr.length && now - tr[0].t > 260) tr.shift()
    if (tr.length > 2) {
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      ctx.lineCap = 'round'
      for (let i = 1; i < tr.length; i++) {
        const p0 = tr[i - 1]
        const p1 = tr[i]
        const age = 1 - (now - p1.t) / 260
        if (age <= 0) continue
        ctx.beginPath()
        ctx.moveTo(p0.x, p0.y)
        ctx.lineTo(p1.x, p1.y)
        ctx.strokeStyle = `rgba(${glow}, ${0.16 * age * age * a})`
        ctx.lineWidth = 5.4 * age
        ctx.stroke()
      }
      ctx.restore()
    }

    ctx.save()
    ctx.globalCompositeOperation = 'lighter'

    /* 柔光 */
    const g1 = ctx.createRadialGradient(x, y, 0, x, y, 34)
    g1.addColorStop(0, `rgba(${glow}, ${0.34 * a})`)
    g1.addColorStop(0.45, `rgba(${glow}, ${0.12 * a})`)
    g1.addColorStop(1, `rgba(${glow}, 0)`)
    ctx.fillStyle = g1
    ctx.beginPath()
    ctx.arc(x, y, 34, 0, Math.PI * 2)
    ctx.fill()

    /* 中间层 */
    const g2 = ctx.createRadialGradient(x, y, 0, x, y, 11)
    g2.addColorStop(0, `rgba(${tint}, ${0.75 * a})`)
    g2.addColorStop(1, `rgba(${tint}, 0)`)
    ctx.fillStyle = g2
    ctx.beginPath()
    ctx.arc(x, y, 11, 0, Math.PI * 2)
    ctx.fill()

    /* 十字星芒 —— 让它一眼是「星」而不是「圆点」 */
    ctx.strokeStyle = `rgba(${COLOR.core}, ${0.62 * a})`
    ctx.lineWidth = 1.15
    ctx.beginPath()
    ctx.moveTo(x - 13, y)
    ctx.lineTo(x - 3.4, y)
    ctx.moveTo(x + 3.4, y)
    ctx.lineTo(x + 13, y)
    ctx.moveTo(x, y - 13)
    ctx.lineTo(x, y - 3.4)
    ctx.moveTo(x, y + 3.4)
    ctx.lineTo(x, y + 13)
    ctx.stroke()

    /* 亮核 */
    ctx.fillStyle = `rgba(${COLOR.core}, ${a})`
    ctx.beginPath()
    ctx.arc(x, y, 2.9, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    /* 悬停：给可点元素描一圈，用户一眼知道"这儿能捏" */
    const hr = hoverRef.current
    if (hr && hr.width > 4) {
      ctx.save()
      ctx.setLineDash([5, 5])
      ctx.lineDashOffset = -(now / 40) % 10
      ctx.strokeStyle = `rgba(${COLOR.wave}, ${0.5 * a})`
      ctx.lineWidth = 1.4
      const r = 7
      const { left: L, top: T, width: Wd, height: Ht } = hr
      ctx.beginPath()
      ctx.moveTo(L + r, T)
      ctx.lineTo(L + Wd - r, T)
      ctx.arcTo(L + Wd, T, L + Wd, T + r, r)
      ctx.lineTo(L + Wd, T + Ht - r)
      ctx.arcTo(L + Wd, T + Ht, L + Wd - r, T + Ht, r)
      ctx.lineTo(L + r, T + Ht)
      ctx.arcTo(L, T + Ht, L, T + Ht - r, r)
      ctx.lineTo(L, T + r)
      ctx.arcTo(L, T, L + r, T, r)
      ctx.closePath()
      ctx.stroke()
      ctx.restore()
    }
  }

  /* ---- 渲染 ------------------------------------------------------------ */
  if (!desktop) return null

  const starting = status === 'starting'
  const btnText = starting
    ? label || '正在启动…'
    : status === 'on'
      ? '手势已开启'
      : status === 'error'
        ? '重试手势控制'
        : '开启手势控制'

  const btnTitle =
    status === 'error' && errKind
      ? `${TRACKER_ERROR_TEXT[errKind]} · 点击重试`
      : status === 'on'
        ? '点击关闭手势控制（摄像头会被释放）'
        : '用手在摄像头前控制网页：食指移动光标 · 捏合点击 · 左右挥手切板块 · 张开手掌银河散开 / 握拳聚拢回来'

  return (
    <div className="gesture-ui" ref={wrapRef} data-status={status}>
      {/* 摄像头只挂在这里，尺寸为 0、不可见；不录制、不上传 */}
      <div className="gesture-video" ref={mountRef} />
      <canvas className="gesture-cursor" ref={canvasRef} aria-hidden="true" />

      {/* 右上角一列：开关在上，提示/错误贴在它下面，自动错开已有「返回主页」 */}
      <div className={`gesture-stack${atEntry ? ' gesture-stack--entry' : ''}`}>
        {/* 玻璃从全站唯一那套 GlassButton 长出来，本组件不碰 backdrop-filter */}
        <GlassButton
          className={`gesturebtn${status === 'on' ? ' is-on' : ''}${
            status === 'error' ? ' is-error' : ''
          }`}
          onClick={onToggle}
          aria-pressed={status === 'on'}
          title={btnTitle}
          aria-label={btnTitle}
        >
          <span className="gesturebtn__dot" aria-hidden="true" />
          <span className="gesturebtn__txt">{btnText}</span>
          {starting && (
            <span className="gesturebtn__bar" aria-hidden="true">
              <i style={{ width: progress === null ? '38%' : `${Math.round(progress * 100)}%` }} />
            </span>
          )}
        </GlassButton>

        {status === 'error' && errKind && (
          <GlassSurface className="gesturechip gesturechip--err" light={false} role="status">
            {TRACKER_ERROR_TEXT[errKind]}
          </GlassSurface>
        )}

        {status === 'on' && hint && (
          <GlassSurface className="gesturechip gesturechip--hint" light={false} role="status">
            食指移动光标 · 捏合点击 · 左右挥手切板块 · 张掌银河散开 · 握拳聚拢
          </GlassSurface>
        )}

        {DEBUG && status === 'on' && (
          <GlassSurface className="gesturechip gesturechip--dbg" light={false}>
            {dbg}
          </GlassSurface>
        )}
      </div>
    </div>
  )
}

/** 找出坐标下方的可点元素并返回它的矩形（用于画悬停框） */
function findHover(x: number, y: number): DOMRect | null {
  const el = document.elementFromPoint(x, y) as HTMLElement | null
  if (!el || !el.closest) return null
  if (el.closest('.gesture-ui')) return null
  const hit = el.closest(CLICKABLE) as HTMLElement | null
  if (!hit || (hit as HTMLButtonElement).disabled) return null
  const cs = getComputedStyle(hit)
  if (cs.visibility === 'hidden' || cs.display === 'none') return null
  const r = hit.getBoundingClientRect()
  if (r.width < 8 || r.height < 8) return null
  if (r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth)
    return null
  return r
}
