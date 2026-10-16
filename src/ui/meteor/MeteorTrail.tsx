/* ============================================================================
 *  鼠标流星 · 渲染层（Canvas 2D + requestAnimationFrame）
 * ----------------------------------------------------------------------------
 *  四个「不做」：
 *    · 不为每个移动点建 DOM —— 整个效果只有 1 个 <canvas>，光尾是画在画布上的折线
 *    · 不用一串小圆圈串成尾巴 —— 按年龄分桶，每桶整条折线一次 stroke
 *    · 不铺满屏幕烧性能 —— 只清上一帧真正画过的矩形，全静止时直接停掉 rAF
 *    · 不跟鼠标抢事件 —— pointer-events:none，且监听一律 passive
 *
 *  层级：夹在 .pocket(6) 之上、.scene-wrap(10) 之下 —— 流星在银河里飞，
 *  永远压在正文 / 按钮 / 天文图片下面，不可能挡住它们（见 meteor.css）。
 *
 *  ⚠️ 2026-09-30：语义从「指针=流星」改成「指针=操纵杆」。流星是天上一个
 *     独立物体，所以这里从「画一颗」变成「遍历主流星 + 伴星各画一颗」。
 * ========================================================================== */

import { useEffect, useRef, useState } from 'react'
import {
  advance,
  arcLength,
  bucketize,
  COLOR,
  createSky,
  headRadius,
  headWidth,
  isAlive,
  movePointer,
  setViewport,
  sparkAlpha,
  streakLen,
  type Meteor,
  type SkyState,
} from './meteor'
import './meteor.css'

const TAU = Math.PI * 2
const DEG = 180 / Math.PI

/** 这个设备该不该开：桌面精细指针 + 没有开启「减少动态效果」 */
export function meteorSupported(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
  // 触摸端（手机 / 平板）在这里就是 false —— 已实测：移动上下文 hover:none
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches
}

interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

export default function MeteorTrail() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [enabled, setEnabled] = useState(meteorSupported)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!enabled || !canvas) return
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

    const sky: SkyState = createSky(window.innerWidth, window.innerHeight)
    let raf = 0
    let last = 0
    let prevBox: Box | null = null
    let cssW = 0
    let cssH = 0
    let dpr = 1
    let sawMouse = false
    let prevHeading: number | null = null

    /* 峰值观察器：验收脚本从外面读一次状态要隔着一次 evaluate 往返（几十到几百毫秒），
       那时候操作早结束了、速度也衰减回去了 —— 直接读瞬时值量不到过程中的峰值。
       散星批次不在这里记：内核自己有 spawnLog（按净增量记会在同帧过期时失真）。 */
    const dbg = {
      maxSpeed: 0,
      maxPointerSpeed: 0,
      maxTailArc: 0,
      minDist: Infinity,
      maxDist: 0,
      maxExtras: 0,
      maxSparks: 0,
      /** 流星朝向的单帧最大变化（度）—— 量「转弯平不平滑」 */
      maxTurnDeg: 0,
    }

    /* ---- 画布尺寸：DPR 封顶 2，5K 屏也不用 4 倍像素去填 ---- */
    const resize = () => {
      const w = window.innerWidth
      const h = window.innerHeight
      const nextDpr = Math.min(window.devicePixelRatio || 1, 2)
      setViewport(sky, w, h)
      if (w === cssW && h === cssH && nextDpr === dpr) return
      cssW = w
      cssH = h
      dpr = nextDpr
      canvas.width = Math.max(1, Math.round(w * dpr))
      canvas.height = Math.max(1, Math.round(h * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      prevBox = null // 改画布尺寸会自带清空
    }
    resize()

    const clearBox = (b: Box | null) => {
      if (!b) {
        ctx.clearRect(0, 0, cssW, cssH)
        return
      }
      ctx.clearRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0)
    }

    /* ---- 画一帧，同时把「画过的范围」算出来给下一帧清 ---- */
    const render = (now: number): Box => {
      let x0 = Infinity
      let y0 = Infinity
      let x1 = -Infinity
      let y1 = -Infinity
      const grow = (x: number, y: number, pad: number) => {
        if (x - pad < x0) x0 = x - pad
        if (y - pad < y0) y0 = y - pad
        if (x + pad > x1) x1 = x + pad
        if (y + pad > y1) y1 = y + pad
      }

      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = 1

      /* dim：伴星整体压暗，读起来才「更小、更远」 */
      const drawOne = (m: Meteor, dim: number) => {
        const sc = m.scale
        const hw = headWidth(m.speed) * sc
        const r = headRadius(m.speed) * sc
        const glow = Math.max(hw * 1.7, r * 6)

        /* --- 光尾：按年龄分桶，新 → 旧 --- */
        for (const b of bucketize(m.trail, now)) {
          if (b.alpha < 0.012) continue
          const path = new Path2D()
          const p0 = b.pts[0]
          path.moveTo(p0.x, p0.y)
          for (let i = 1; i < b.pts.length; i++) path.lineTo(b.pts[i].x, b.pts[i].y)
          for (const p of b.pts) grow(p.x, p.y, glow)

          /* 三层叠加（'lighter' 累加）才有「柔和发光」而不是一条硬边细线：
               柔光（很宽很淡，淡紫） → 中间层（浅蓝） → 亮芯（冷白）
             只有亮芯的话，抠出来就是一根激光线 —— 实测过，边缘太硬。 */
          const A = b.alpha * dim
          ctx.globalAlpha = A * 0.1
          ctx.strokeStyle = `rgb(${COLOR.halo})`
          ctx.lineWidth = hw * b.widthScale * 7.5
          ctx.stroke(path)

          ctx.globalAlpha = A * 0.17
          ctx.strokeStyle = `rgb(${COLOR.mid})`
          ctx.lineWidth = hw * b.widthScale * 3
          ctx.stroke(path)

          ctx.globalAlpha = A * 0.42
          ctx.strokeStyle = `rgb(${COLOR.core})`
          ctx.lineWidth = Math.max(0.8, hw * b.widthScale * 0.8)
          ctx.stroke(path)
        }

        /* --- 星点：从光尾里甩出来的细小星光，数量很克制（只有主流星有） --- */
        if (m.driven) {
          for (const k of m.sparks) {
            const a = sparkAlpha(k, now)
            if (a < 0.02) continue
            grow(k.x, k.y, k.size * 4)
            const s = k.size
            ctx.globalAlpha = a * 0.62
            ctx.fillStyle = `rgb(${COLOR.spark})`
            ctx.beginPath()
            ctx.arc(k.x, k.y, s, 0, TAU)
            ctx.fill()
            // 一点点十字星芒 —— 有它才像星星，没它就是个圆点
            ctx.globalAlpha = a * 0.26
            ctx.lineWidth = 0.7
            ctx.beginPath()
            ctx.moveTo(k.x - s * 2.8, k.y)
            ctx.lineTo(k.x + s * 2.8, k.y)
            ctx.moveTo(k.x, k.y - s * 2.8)
            ctx.lineTo(k.x, k.y + s * 2.8)
            ctx.stroke()
          }
        }

        /* --- 流星头：沿运动方向的短光条 + 柔光晕 + 小亮核 --- */
        const ha = m.a
        if (ha > 0.004) {
          grow(m.x, m.y, glow)
          /* 方向优先取真实速度；速度太小就退回最后两个尾点 */
          let dx = m.vx
          let dy = m.vy
          let d = Math.hypot(dx, dy)
          if (d < 1 && m.trail.length >= 2) {
            const n = m.trail.length
            dx = m.trail[n - 1].x - m.trail[n - 2].x
            dy = m.trail[n - 1].y - m.trail[n - 2].y
            d = Math.hypot(dx, dy)
          }
          if (d > 0.001) {
            dx /= d
            dy /= d
            const len = streakLen(m.speed) * sc
            if (len > 2) {
              const ex = m.x - dx * len
              const ey = m.y - dy * len
              grow(ex, ey, hw * 1.2)
              const g = ctx.createLinearGradient(m.x, m.y, ex, ey)
              g.addColorStop(0, `rgba(${COLOR.core}, ${0.6 * ha * dim})`)
              g.addColorStop(0.55, `rgba(${COLOR.mid}, ${0.17 * ha * dim})`)
              g.addColorStop(1, `rgba(${COLOR.outer}, 0)`)
              ctx.globalAlpha = 1
              ctx.strokeStyle = g
              ctx.lineWidth = Math.max(0.8, hw * 1.15)
              ctx.beginPath()
              ctx.moveTo(m.x, m.y)
              ctx.lineTo(ex, ey)
              ctx.stroke()
            }
          }
          const gr = r * 6
          const rg = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, gr)
          rg.addColorStop(0, `rgba(${COLOR.core}, ${0.6 * ha * dim})`)
          rg.addColorStop(0.3, `rgba(${COLOR.mid}, ${0.2 * ha * dim})`)
          rg.addColorStop(0.66, `rgba(${COLOR.outer}, ${0.075 * ha * dim})`)
          rg.addColorStop(1, `rgba(${COLOR.halo}, 0)`)
          ctx.globalAlpha = 1
          ctx.fillStyle = rg
          ctx.beginPath()
          ctx.arc(m.x, m.y, gr, 0, TAU)
          ctx.fill()

          ctx.globalAlpha = 0.92 * ha * dim
          ctx.fillStyle = `rgb(${COLOR.core})`
          ctx.beginPath()
          ctx.arc(m.x, m.y, r, 0, TAU)
          ctx.fill()
        }
      }

      drawOne(sky.main, 1)
      for (const e of sky.extras) drawOne(e, 0.62)

      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'

      if (!Number.isFinite(x0)) return { x0: 0, y0: 0, x1: 0, y1: 0 }
      return {
        x0: Math.max(0, x0 - 6),
        y0: Math.max(0, y0 - 6),
        x1: Math.min(cssW, x1 + 6),
        y1: Math.min(cssH, y1 + 6),
      }
    }

    /* ---- 主循环：只在「还有东西要画」的时候转 ---- */
    const frame = () => {
      raf = 0
      const now = performance.now()
      const dt = last ? (now - last) / 1000 : 1 / 60
      last = now
      advance(sky, now, dt)

      /* 采样峰值 / 朝向变化率（只读，不参与绘制） */
      const m = sky.main
      const sp = Math.hypot(m.vx, m.vy)
      const psp = Math.hypot(sky.pvx, sky.pvy)
      if (sp > dbg.maxSpeed) dbg.maxSpeed = sp
      if (psp > dbg.maxPointerSpeed) dbg.maxPointerSpeed = psp
      if (m.trail.length > 1) {
        const arc = arcLength(m.trail)
        if (arc > dbg.maxTailArc) dbg.maxTailArc = arc
      }
      if (m.awake && m.a > 0.05) {
        const d = Math.hypot(m.x - sky.pointer.x, m.y - sky.pointer.y)
        if (d < dbg.minDist) dbg.minDist = d
        if (d > dbg.maxDist) dbg.maxDist = d
      }
      if (sky.extras.length > dbg.maxExtras) dbg.maxExtras = sky.extras.length
      if (m.sparks.length > dbg.maxSparks) dbg.maxSparks = m.sparks.length
      if (sp > 60) {
        const h = Math.atan2(m.vy, m.vx)
        if (prevHeading !== null) {
          let dd = h - prevHeading
          while (dd > Math.PI) dd -= TAU
          while (dd < -Math.PI) dd += TAU
          const deg = Math.abs(dd) * DEG
          if (deg > dbg.maxTurnDeg) dbg.maxTurnDeg = deg
        }
        prevHeading = h
      } else {
        prevHeading = null
      }

      if (!isAlive(sky)) {
        // 收尾：把最后一帧画过的地方擦掉再停机，屏幕不留残影
        clearBox(prevBox)
        prevBox = null
        last = 0
        return
      }
      clearBox(prevBox)
      prevBox = render(now)
      raf = requestAnimationFrame(frame)
    }

    const start = () => {
      if (raf) return
      last = 0
      raf = requestAnimationFrame(frame)
    }

    /* ---- 指针事件：被动监听，绝不 preventDefault，不跟拖拽抢事件 ---- */
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      sawMouse = true
      movePointer(sky, e.clientX, e.clientY, performance.now())
      start()
    }
    const onOut = (e: PointerEvent) => {
      /* ⚠️ pointerout 会冒泡：鼠标每跨过一次子元素边界都会触发。
         拿它当「离开窗口」用，就会在划过卡片边缘的瞬间把光尾清掉（真踩过）。
         只有 relatedTarget 为 null 才是真的走出了窗口。 */
      if (e.pointerType !== 'mouse') return
      if (e.relatedTarget) return
      sky.lastMoveAt = -1e9
      start()
    }
    // 失焦当作「停了」。注意别和 onOut 共用一个带 PointerEvent 签名的函数：
    // blur 是 FocusEvent，签名不兼容（tsc 直接报 TS2769）。
    const onBlur = () => {
      sky.lastMoveAt = -1e9
      start()
    }
    // 混合设备兜底：从没见鼠标动过就碰了屏幕 → 判定为触摸端，关掉
    const onTouch = () => {
      if (!sawMouse) setEnabled(false)
    }
    const onVis = () => {
      if (document.hidden) {
        if (raf) cancelAnimationFrame(raf)
        raf = 0
      } else if (isAlive(sky)) {
        start()
      }
    }

    ctx.globalCompositeOperation = 'source-over'

    // 供验收脚本读取真实状态与真实像素（只读，不参与绘制）
    ;(window as unknown as Record<string, unknown>).__meteor = {
      probe: () => {
        const now = performance.now()
        const m = sky.main
        const tail = m.trail
        return {
          ready: sky.primed,
          mainId: m.id,
          awake: m.awake,
          main: [Math.round(m.x), Math.round(m.y)],
          pointer: [Math.round(sky.pointer.x), Math.round(sky.pointer.y)],
          /** 主流星到指针的距离 —— 「不能粘在箭头下面」就看它 */
          dist: Math.round(Math.hypot(m.x - sky.pointer.x, m.y - sky.pointer.y)),
          speed: Math.round(Math.hypot(m.vx, m.vy)),
          pointerSpeed: Math.round(Math.hypot(sky.pvx, sky.pvy)),
          headAlpha: Number(m.a.toFixed(3)),
          points: tail.length,
          tailArc: Math.round(arcLength(tail)),
          sparks: m.sparks.length,
          buckets: bucketize(tail, now).length,
          extraCount: sky.extras.length,
          extras: sky.extras.map((e) => ({
            x: Math.round(e.x),
            y: Math.round(e.y),
            a: Number(e.a.toFixed(3)),
            scale: Number(e.scale.toFixed(2)),
            speed: Math.round(e.speed),
          })),
          /** 主流星重生次数。连续移动时必须恒为 1（「不要每移动一下就重新生成一颗」） */
          spawnCount: sky.spawnCount,
          extraBursts: sky.extraLog.length,
          sinceMove: Math.round(now - sky.lastMoveAt),
          traceLen: sky.trace.length,
        }
      },
      /** 逐帧轨迹（可只取后半段），量左右跟随 / 转弯 / 滑行全靠它 */
      trace: (from = 0) => sky.trace.slice(from),
      /** 清空峰值与轨迹 —— 验收脚本在每次「做一段动作」之前调一次 */
      reset: () => {
        dbg.maxSpeed = 0
        dbg.maxPointerSpeed = 0
        dbg.maxTailArc = 0
        dbg.minDist = Infinity
        dbg.maxDist = 0
        dbg.maxExtras = 0
        dbg.maxSparks = 0
        dbg.maxTurnDeg = 0
        sky.trace.length = 0
        sky.main.spawnLog.length = 0
        sky.extraLog.length = 0
        sky.spawnCount = 1
      },
      peek: () => ({
        maxSpeed: Math.round(dbg.maxSpeed),
        maxPointerSpeed: Math.round(dbg.maxPointerSpeed),
        maxTailArc: Math.round(dbg.maxTailArc),
        minDist: Number.isFinite(dbg.minDist) ? Math.round(dbg.minDist) : -1,
        maxDist: Math.round(dbg.maxDist),
        maxExtras: dbg.maxExtras,
        maxSparks: dbg.maxSparks,
        maxTurnDeg: Number(dbg.maxTurnDeg.toFixed(1)),
        bursts: sky.main.spawnLog.slice(),
      }),
      pixels: () => {
        const im = ctx.getImageData(0, 0, canvas.width, canvas.height).data
        let lit = 0
        let maxA = 0
        let sr = 0
        let sg = 0
        let sb = 0
        let sa = 0
        for (let i = 0; i < im.length; i += 4) {
          const a = im[i + 3]
          if (a > 8) {
            lit++
            if (a > maxA) maxA = a
            sr += im[i]
            sg += im[i + 1]
            sb += im[i + 2]
            sa++
          }
        }
        return {
          lit,
          maxAlpha: maxA,
          avgRGB: sa ? [Math.round(sr / sa), Math.round(sg / sa), Math.round(sb / sa)] : [0, 0, 0],
        }
      },
    }

    window.addEventListener('resize', resize)
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerout', onOut, { passive: true })
    window.addEventListener('blur', onBlur)
    window.addEventListener('touchstart', onTouch, { passive: true })
    document.addEventListener('visibilitychange', onVis)

    return () => {
      if (raf) cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerout', onOut)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('touchstart', onTouch)
      document.removeEventListener('visibilitychange', onVis)
      delete (window as unknown as Record<string, unknown>).__meteor
    }
  }, [enabled])

  return (
    <div className="meteor-trail" data-meteor={enabled ? 'on' : 'off'} aria-hidden="true">
      {enabled ? <canvas ref={canvasRef} className="meteor-trail__canvas" /> : null}
    </div>
  )
}
