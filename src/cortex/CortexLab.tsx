/* ============================================================================
 *  CortexLab —— CORTEX 栏目「天文实验室」
 * ----------------------------------------------------------------------------
 *  这一栏想干的事和别的板块不一样：
 *
 *      PHOTON  看 —— 今天宇宙长什么样
 *      FOUNDRY 找 —— 我们要造什么才能去
 *      CORTEX  算 —— 那些看不见的东西，怎么从能测到的量反推出来
 *
 *  所以这里不是文章列表，是**三张可以自己动手的台子**：
 *
 *      ① 恒星光谱台  拖温度 + 半径 → 黑体颜色 / 光谱型 / 峰值波长 / 光度
 *      ② 行星轨道台  拖半长轴 + 反照率 → 公转周期 / 轨道速度 / 平衡温度
 *      ③ 黑洞视界台  拖质量 → 史瓦西半径 / 视界面积 / 霍金温度 / 蒸发时标
 *
 *  ⚠️ 诚实底线 —— 这一点和装备展厅是同一套要求，但标的不是「出处」而是「公式」：
 *     实验室里的数字**不是从接口取回来的，是自己算出来的**。所以界面上必须
 *     ① 摆出每条结论用的公式（`FORMULAS`）；
 *     ② 摆出所有用到的物理常数与单位（`CONSTANT_TABLE`）；
 *     ③ 明确写着「本台数值由物理公式实时计算，不是官方数据」。
 *     缺了这三条，这些数字就会假装成观测数据 —— 那就是造假。
 *     公式本身的可信度由 _analysis/verify-lab.js 负责：它拿公认天体数值反查，
 *     对不上就不让过。
 *
 *  样式约定（和全站一致）：
 *    · 玻璃质感只用 ui/glass/GlassSurface，这里不自己写 backdrop-filter
 *    · 指针交互产物（拖动滑杆）只进本组件的 state，不外溢到 3D 层
 *    · 颜色一律走 var(--accent) / var(--accent-rgb)，切板块自动跟着变
 *    · 入场动画由 SceneManager 驱动，这里只给元素加 data-stagger
 * ========================================================================== */

import { useMemo, useState } from 'react'
import GlassSegmented from '../ui/glass/GlassSegmented'
import GlassSurface from '../ui/glass/GlassSurface'
import {
  CONSTANT_TABLE,
  FORMULAS,
  HOLE_PRESETS,
  ORBIT_PRESETS,
  PLANET_BAR,
  PLANET_BAR_RANGE,
  PLANET_BAR_TICKS,
  RANGE,
  SCALE_MARKS,
  STAR_PRESETS,
  VISIBLE,
  bigLen,
  logToVal,
  planckRelative,
  rgbCss,
  sci,
  sig,
  solveHole,
  solveOrbit,
  solveStar,
  valToLog,
} from './lab'
import './cortex.css'

type BenchId = 'star' | 'orbit' | 'hole'

/* ─────────────────────────────── 小零件 ─────────────────────────────── */

/** 一条读数：标签 + 值 + 单位。值用等宽数字，拖动时不会左右抖。 */
function Read({ label, value, unit, note }: { label: string; value: string; unit?: string; note?: string }) {
  return (
    <div className="cread">
      <span className="cread__l">{label}</span>
      <span className="cread__v">
        {value}
        {unit ? <em className="cread__u">{unit}</em> : null}
      </span>
      {note ? <span className="cread__n">{note}</span> : null}
    </div>
  )
}

/**
 * 滑杆。
 * ⚠️ 用原生 input[type=range] 而不是自己拼拖动条：原生自带键盘操作（方向键 / Home / End），
 *    这对手不方便用鼠标的人是真需求，而且拖动时不需要我们写 pointermove。
 * ⚠️ 必须显式 pointer-events:auto —— .scene-wrap 默认 pointer-events:none，
 *    只放行 button / a / .logo（见 styles.css），原生 input 会被下方画布接走事件。
 */
function Slider({
  id,
  label,
  hint,
  min,
  max,
  step,
  value,
  display,
  onChange,
}: {
  id: string
  label: string
  hint?: string
  min: number
  max: number
  step: number
  value: number
  display: string
  onChange: (v: number) => void
}) {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0

  return (
    <label className="cslide" htmlFor={id}>
      <span className="cslide__top">
        <span className="cslide__l">{label}</span>
        <span className="cslide__v">{display}</span>
      </span>
      <input
        id={id}
        className="cslide__range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        data-lab={id}
        aria-label={label}
        aria-valuetext={display}
        /* 只为了让轨道左半边填色 —— 纯视觉，不参与任何计算 */
        style={{ ['--fill' as string]: `${pct.toFixed(2)}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint ? <span className="cslide__hint">{hint}</span> : null}
    </label>
  )
}

/** 一排预设。点一下把输入拨到这颗天体上 —— 预设值本身标了「本站整理」。 */
function Presets<T>({ items, active, onPick }: { items: { id: string; label: string; hint: string; value: T }[]; active: string | null; onPick: (id: string, v: T) => void }) {
  return (
    <div className="cpre">
      <span className="cpre__l">换成真实天体</span>
      <div className="cpre__row">
        {items.map((p) => (
          <button
            key={p.id}
            type="button"
            title={p.hint}
            className={'cpre__b' + (active === p.id ? ' is-on' : '')}
            onClick={() => onPick(p.id, p.value)}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ───────────────────────── ① 恒星光谱台 ───────────────────────── */

/** 黑体谱曲线：横轴波长（线性 100–2500 nm），纵轴相对强度 */
function StarCurve({ T, color, peakNm }: { T: number; color: string; peakNm: number }) {
  // 画布取宽扁比例（470 × 230 ≈ 2:1）：图形区是固定的 262px 高，
  // viewBox 太窄的话 SVG 会按高度缩放、左右各留一大片空，看着像没画满。
  const W = 470
  const H = 230
  const x0 = 30
  const x1 = W - 26
  const yb = 170   // 基线
  const yt = 100   // 峰值顶
  const NM0 = 100
  const NM1 = 2500

  const { line, area, peakX, visX0, visX1 } = useMemo(() => {
    // ⚠️ 曲线形状**直接调用 lab.ts 的普朗克公式**，绝不在这里另写一份 ——
    //    两份实现迟早会走偏，到时候「图上的峰」和「读数里的 λ_max」对不上，
    //    而验收脚本只查得到读数，查不到图，这种错会静悄悄留着。
    const pts: [number, number][] = []
    const N = 160
    for (let i = 0; i < N; i++) {
      const nm = NM0 + ((NM1 - NM0) * i) / (N - 1)
      pts.push([nm, planckRelative(nm, T)])
    }
    const max = Math.max(...pts.map((p) => p[1])) || 1
    const toX = (nm: number) => x0 + ((nm - NM0) / (NM1 - NM0)) * (x1 - x0)
    const toY = (v: number) => yb - (v / max) * (yb - yt)
    const d = pts.map(([nm, v], i) => `${i ? 'L' : 'M'}${toX(nm).toFixed(1)} ${toY(v).toFixed(1)}`).join(' ')
    return {
      line: d,
      area: `${d} L${x1} ${yb} L${x0} ${yb} Z`,
      peakX: Math.max(x0, Math.min(x1, toX(peakNm))),
      visX0: toX(VISIBLE.min),
      visX1: toX(VISIBLE.max),
    }
  }, [T, peakNm, x0, x1, yb, yt])

  const ticks = [100, 500, 1000, 1500, 2000, 2500]

  return (
    <svg className="cfig cfig--curve" viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label={`${sig(T)} K 黑体辐射谱，峰值波长 ${sig(peakNm)} 纳米`}>
      <defs>
        {/* 可见光用**真实的光谱色序**画成一条色带，贴在波长轴下方。
            放在轴下方而不是当整块背景：整块会把曲线和读数压得看不清（试过）。 */}
        <linearGradient id="cspecVis" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#8a4ce0" />
          <stop offset="15%" stopColor="#4a6bff" />
          <stop offset="29%" stopColor="#2fd2e0" />
          <stop offset="35%" stopColor="#5fdc7c" />
          <stop offset="49%" stopColor="#d6e84f" />
          <stop offset="57%" stopColor="#f8da4a" />
          <stop offset="65%" stopColor="#f6952f" />
          <stop offset="86%" stopColor="#e8442f" />
          <stop offset="100%" stopColor="#b02222" />
        </linearGradient>
      </defs>

      {/* 可见光窗口的两条边界 —— 让「峰落在窗口的哪个位置」看得出来 */}
      <line x1={visX0} y1={yt - 4} x2={visX0} y2={yb} className="cfig__visedge" />
      <line x1={visX1} y1={yt - 4} x2={visX1} y2={yb} className="cfig__visedge" />

      <path d={area} fill={rgbCss(hexToRgb(color), 0.14)} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />

      {/* 峰值标记：位置由维恩位移定律算出来，不是量出来的 */}
      <line x1={peakX} y1={yt - 10} x2={peakX} y2={yb} className="cfig__peak" />
      <circle cx={peakX} cy={yt - 10} r="3" fill={color} />
      <text x={Math.min(peakX + 7, x1 - 4)} y={80} className="cfig__peakt" textAnchor={peakX > x1 - 90 ? 'end' : 'start'}>
        λ_max {sig(peakNm)} nm
      </text>

      {/* 波长轴 + 光谱色带。
          「可见光」这几个字排在色带**左边**、和色带同一行 ——
          原来放在色带上方、和 λ_max 抢位置，两个标签会叠在一起（踩过）。 */}
      <line x1={x0} y1={yb} x2={x1} y2={yb} className="cfig__axis" />
      <rect x={visX0} y={yb + 4} width={Math.max(1, visX1 - visX0)} height={9} fill="url(#cspecVis)" rx="1.5" />
      <text x={visX0 - 7} y={yb + 12} className="cfig__visl" textAnchor="end">可见光 380–750 nm</text>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={x0 + ((t - NM0) / (NM1 - NM0)) * (x1 - x0)} y1={yb} x2={x0 + ((t - NM0) / (NM1 - NM0)) * (x1 - x0)} y2={yb + 4} className="cfig__axis" />
          <text x={x0 + ((t - NM0) / (NM1 - NM0)) * (x1 - x0)} y={yb + 27} className="cfig__tick" textAnchor="middle">
            {t}
          </text>
        </g>
      ))}
      <text x={x1} y={H - 4} className="cfig__tick" textAnchor="end">波长 / nm</text>
    </svg>
  )
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [255, 255, 255]
}

function StarBench() {
  const [T, setT] = useState(5772)
  const [R, setR] = useState(1)
  const [pre, setPre] = useState<string | null>('sun')
  const r = useMemo(() => solveStar({ T, R }), [T, R])
  const color = rgbCss(r.rgb)

  return (
    <>
      <div className="clab__panel">
        <Slider
          id="star-t" label="表面温度" min={RANGE.starT.min} max={RANGE.starT.max} step={10}
          value={T} display={`${sig(T, 4)} K`}
          hint={`量程 ${RANGE.starT.min}–${RANGE.starT.max} K，从红矮星到蓝超巨星`}
          onChange={(v) => { setT(v); setPre(null) }}
        />
        <Slider
          id="star-r" label="半径" min={0} max={1000} step={1}
          value={Math.round(valToLog(R, RANGE.starR.min, RANGE.starR.max) * 1000)}
          display={`${sig(R, 3)} R☉`}
          hint="对数刻度：0.05 – 1000 个太阳半径，白矮星到红超巨星都够用"
          onChange={(v) => { setR(Number(logToVal(v / 1000, RANGE.starR.min, RANGE.starR.max).toPrecision(4))); setPre(null) }}
        />
        <Presets items={STAR_PRESETS} active={pre} onPick={(id, v) => { setT(v.T); setR(v.R); setPre(id) }} />
      </div>

      <div className="clab__stage">
        <div className="clab__figwrap clab__figwrap--star">
          <div className="cstar" aria-hidden="true">
            <span className="cstar__glow" style={{ background: `radial-gradient(circle, ${rgbCss(r.rgb, 0.55)} 0%, ${rgbCss(r.rgb, 0)} 70%)` }} />
            <span className="cstar__disc" style={{ background: color, boxShadow: `0 0 46px 6px ${rgbCss(r.rgb, 0.45)}` }} />
          </div>
          <StarCurve T={T} color={color} peakNm={r.peakNm} />
        </div>

        <div className="clab__reads">
          <Read label="光谱型（MK 分类）" value={`${r.cls.cls} 型`} note={`${r.cls.name} · 如${r.cls.eg}`} />
          <Read label="峰值波长 λ_max" value={sig(r.peakNm, 4)} unit="nm" note={`${r.peakBand}波段（维恩位移定律）`} />
          <Read label="相对太阳的光度" value={r.lumRel >= 1e5 || r.lumRel < 1e-2 ? sci(r.lumRel) : sig(r.lumRel, 4)} unit="L☉" note="光度 ∝ 半径² × 温度⁴（斯特藩–玻尔兹曼）" />
          <Read label="绝对光度" value={sci(r.lumW, 3)} unit="W" note="1 L☉ = 3.828 × 10²⁶ W（IAU 名义值）" />
        </div>
        <p className="clab__verdict">
          {r.verdict}
          {r.peakNm < VISIBLE.min
            ? `；大部分能量落在紫外，肉眼只能看到它剩下的那点蓝白色`
            : r.peakNm > VISIBLE.max
              ? `；大部分能量落在红外，肉眼只能看到它剩下的那点红色`
              : `；峰值 ${sig(r.peakNm, 4)} nm 正好落在可见光里，肉眼能直接看出它是${r.cls.name}`}
        </p>
      </div>
    </>
  )
}

/* ───────────────────────── ② 行星轨道台 ───────────────────────── */

/**
 * 太阳系位置尺：把当前选的轨道放到八大行星里比一比。
 * 单独画一把尺而不是塞进轨道盘里 —— 0.387 到 30 AU 跨了近两个数量级，
 * 盘里那点地方根本排不下这些刻度。
 */
function OrbitScale({ a }: { a: number }) {
  const W = 380
  const H = 158
  const x0 = 28
  const x1 = 356
  const y = 90
  const { min, max } = PLANET_BAR_RANGE
  const toX = (v: number) => x0 + valToLog(Math.min(Math.max(v, min), max), min, max) * (x1 - x0)
  const mx = toX(a)

  return (
    <svg
      className="cfig cfig--planets"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`当前轨道半长轴 ${sig(a, 3)} 天文单位，在太阳系八大行星中的位置`}
    >
      <text x={x0} y={16} className="cfig__visl" textAnchor="start">
        放进太阳系里比一比（对数刻度）
      </text>

      <line x1={x0} y1={y} x2={x1} y2={y} className="cfig__axis" />
      {PLANET_BAR_TICKS.map((t) => (
        <g key={t}>
          <line x1={toX(t)} y1={y} x2={toX(t)} y2={y + 5} className="cfig__axis" />
          <text
            x={toX(t)}
            y={y + 34}
            className="cfig__tick"
            textAnchor={t === min ? 'start' : t === max ? 'end' : 'middle'}
          >
            {t} AU
          </text>
        </g>
      ))}

      {/* 八大行星：单字标签，避免小行星带那几颗挤在一起叠字 */}
      {PLANET_BAR.map((p) => (
        <g key={p.cn}>
          <circle cx={toX(p.a)} cy={y} r="2.6" className="cfig__pd" />
          <text x={toX(p.a)} y={y - 13} className="cfig__pt" textAnchor="middle">
            {p.short}
          </text>
        </g>
      ))}

      {/* 当前这颗：画成**空心圈**而不是实心大点 ——
          实心点会把它正上方那个行星的单字标签吃掉（地球那一格踩过） */}
      <line x1={mx} y1={y - 40} x2={mx} y2={y + 10} className="cfig__peak" />
      <circle cx={mx} cy={y} r="6" className="cfig__mkr" />
      <circle cx={mx} cy={y} r="2.2" className="cfig__mk" />
      <text
        x={Math.min(Math.max(mx, x0 + 34), x1 - 34)}
        y={y - 48}
        className="cfig__peakt"
        textAnchor="middle"
      >
        你选的 {sig(a, 3)} AU
      </text>
      <text x={x1} y={y + 50} className="cfig__tick" textAnchor="end">
        对数刻度（每格 10 倍）· 常用实测值
      </text>
    </svg>
  )
}

function OrbitBench() {
  const [a, setA] = useState(1)
  const [alb, setAlb] = useState(0.306)
  const [pre, setPre] = useState<string | null>('earth')
  const r = useMemo(() => solveOrbit({ a, albedo: alb }), [a, alb])

  // 视觉半径按对数缩放：a=0.2 不会缩成一个点，a=50 也不会跑出画布。
  // 界面上有标注说明这是示意缩放，真实半径在右边那把尺子上。
  const vis = 46 + valToLog(a, RANGE.orbitA.min, RANGE.orbitA.max) * 52
  // 动画周期按真实公转周期的比例压缩：地球 8 秒，水星就真的更快、海王星更慢
  const dur = Math.min(48, Math.max(2.4, r.periodYr * 8))

  return (
    <>
      <div className="clab__panel">
        <Slider
          id="orbit-a" label="轨道半长轴" min={0} max={1000} step={1}
          value={Math.round(valToLog(a, RANGE.orbitA.min, RANGE.orbitA.max) * 1000)}
          display={`${sig(a, 3)} AU`}
          hint="对数刻度：0.2 – 50 AU（1 AU = 1.496 × 10⁸ km）。右边的动画已按真实周期比例压缩，地球转一圈约 8 秒"
          onChange={(v) => { setA(Number(logToVal(v / 1000, RANGE.orbitA.min, RANGE.orbitA.max).toPrecision(4))); setPre(null) }}
        />
        <Slider
          id="orbit-albedo" label="反照率（反射掉多少阳光）" min={0} max={0.9} step={0.001}
          value={alb} display={`${(alb * 100).toFixed(1)} %`}
          hint="0 = 全吸收（像煤块），0.9 = 全反射（像金星浓云）"
          onChange={(v) => { setAlb(v); setPre(null) }}
        />
        <Presets items={ORBIT_PRESETS} active={pre} onPick={(id, v) => { setA(v.a); setAlb(v.albedo); setPre(id) }} />
      </div>

      <div className="clab__stage">
        <div className="clab__figwrap clab__figwrap--orbit">
          {/* 正方形是轨道盘，说明文字放在盘外面 —— 之前把说明绝对定位在盘的
              bottom:-22px，直接压到下面的读数卡上了（踩过） */}
          <div className="corbit" style={{ ['--orb' as string]: `${vis}%`, ['--dur' as string]: `${dur.toFixed(2)}s` }}>
            <span className="corbit__stage">
              <span className="corbit__sun" />
              <span className="corbit__track" />
              <span className="corbit__spin">
                <span className="corbit__planet" style={{ background: r.tint, boxShadow: `0 0 16px 2px ${r.tint}` }} />
              </span>
            </span>
            <span className="corbit__tag">盘内按对数缩放（示意）</span>
          </div>
          <OrbitScale a={a} />
        </div>

        <div className="clab__reads">
          <Read label="公转周期" value={r.periodYr >= 1000 ? sci(r.periodYr, 3) : sig(r.periodYr, 4)} unit="年" note={`≈ ${sig(r.periodDay, 4)} 个地球日（开普勒第三定律 T² = a³）`} />
          <Read label="平均轨道速度" value={sig(r.speed, 4)} unit="km/s" note={`地球是 29.78 km/s（v = √(GM☉/a)）`} />
          <Read label="行星平衡温度" value={sig(r.teq, 4)} unit="K" note={`${(r.teq - 273.15).toFixed(1)} ℃（只算日照收支，不含温室效应）`} />
          <Read label="与恒星的距离" value={sig(r.distMkm, 4)} unit="百万 km" note={`即 ${sig(a, 3)} AU`} />
        </div>
        <p className="clab__verdict">{r.verdict}</p>
      </div>
    </>
  )
}

/* ───────────────────────── ③ 黑洞视界台 ───────────────────────── */

/**
 * 黑洞视界图：**一张宽扁的图**，左边一个按对数缩放的视界盘，右边一把 1 km – 10¹⁰ km 的对数尺。
 * 为什么合成一张而不是上下叠两张：图形区是固定 262px 高，叠两张会让每张都只剩一半，
 * 而且上下两张的横向留白对不齐，看着散。合成一张宽画布还能把尺度标注排开。
 */
function HoleFigure({ rsKm, M }: { rsKm: number; M: number }) {
  const W = 560
  const H = 196
  const cx = 118
  const cy = 86

  /* 视界盘的半径按**对数**映射到 34–80：1 M☉ 到 M87* 差 10 个数量级，
     真按比例画的话前者连一个像素都不到。真实尺度由右边那把尺子负责，
     这里只负责「看得出来质量越大视界越大」。 */
  const t = valToLog(Math.min(M, RANGE.holeM.max), RANGE.holeM.min, RANGE.holeM.max)
  const ring = 34 + t * 46        // 光子环半径（约 1.5 r_s）
  const disc = ring / 1.5         // 视界半径

  // 右边那把对数尺
  const sx0 = 268
  const sx1 = 538
  const sy = cy
  const toX = (km: number) => sx0 + (Math.log10(Math.max(1, km)) / 10) * (sx1 - sx0)
  const mx = Math.max(sx0, Math.min(sx1, toX(rsKm)))

  return (
    <svg
      className="cfig cfig--hole"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`质量 ${sci(M, 3)} 个太阳质量的黑洞，史瓦西半径 ${bigLen(rsKm)}`}
    >
      <defs>
        <radialGradient id="choleGlow">
          <stop offset="0%" stopColor="rgba(var(--accent-rgb),0)" />
          <stop offset="55%" stopColor="rgba(var(--accent-rgb),0.26)" />
          <stop offset="100%" stopColor="rgba(var(--accent-rgb),0)" />
        </radialGradient>
      </defs>

      {/* ── 左：视界盘 ── */}
      <circle cx={cx} cy={cy} r={ring * 1.32} fill="url(#choleGlow)" />
      {/* 光子环：光线绕黑洞一圈后逃出来的地方，半径约 1.5 r_s —— 不是视界本身 */}
      <circle cx={cx} cy={cy} r={ring} className="cfig__photon" />
      <circle cx={cx} cy={cy} r={disc} className="cfig__horizon" />
      <text x={cx} y={cy + 3} className="cfig__holet" textAnchor="middle">视界</text>
      <text x={cx} y={H - 8} className="cfig__tick" textAnchor="middle">
        虚线是光子环（约 1.5 r_s）
      </text>

      {/* ── 右：对数刻度尺 ── */}
      <line x1={sx0} y1={sy} x2={sx1} y2={sy} className="cfig__axis" />
      {SCALE_MARKS.map((m, i) => {
        const x = toX(m.km)
        // 标签错成两行：最右边两个（1 AU / 海王星轨道）在对数轴上本来就挨得近，
        // 排一行会叠字（踩过）。
        return (
          <g key={m.label}>
            <line x1={x} y1={sy - 4} x2={x} y2={sy + 4} className="cfig__axis" />
            <text
              x={x}
              y={sy + 18 + (i % 2) * 12}
              className="cfig__tick"
              textAnchor={i === 0 ? 'start' : i === SCALE_MARKS.length - 1 ? 'end' : 'middle'}
            >
              {m.label}
            </text>
          </g>
        )
      })}
      <text x={sx1} y={sy + 50} className="cfig__tick" textAnchor="end">
        对数刻度（每格 10 倍）/ km
      </text>

      {/* 当前这颗落在尺子上的位置 */}
      <line x1={mx} y1={sy - 14} x2={mx} y2={sy + 12} className="cfig__peak" />
      <circle cx={mx} cy={sy - 14} r="3.2" className="cfig__mk" />
      <text
        x={Math.min(Math.max(mx, sx0 + 34), sx1 - 34)}
        y={sy - 24}
        className="cfig__peakt"
        textAnchor="middle"
      >
        这里 · {bigLen(rsKm)}
      </text>
    </svg>
  )
}

function HoleBench() {
  const [M, setM] = useState(4.3e6)
  const [pre, setPre] = useState<string | null>('sgrA')
  const r = useMemo(() => solveHole({ M }), [M])

  return (
    <>
      <div className="clab__panel">
        <Slider
          id="hole-m" label="黑洞质量" min={0} max={1000} step={1}
          value={Math.round(valToLog(M, RANGE.holeM.min, RANGE.holeM.max) * 1000)}
          display={`${M >= 1e4 ? sci(M, 3) : sig(M, 4)} M☉`}
          hint="对数刻度：0.1 – 10¹⁰ 个太阳质量。这里算的是不转动、不带电的史瓦西黑洞"
          onChange={(v) => { setM(Number(logToVal(v / 1000, RANGE.holeM.min, RANGE.holeM.max).toPrecision(4))); setPre(null) }}
        />
        <Presets items={HOLE_PRESETS} active={pre} onPick={(id, v) => { setM(v.M); setPre(id) }} />
        <p className="clab__hint">
          视界的定义是「连光都跑不出去的那个边界」—— 它不是一层膜，也不是一个面，
          而是一个<b>一去不回的单向面</b>：进去可以，出来没有路。
        </p>
      </div>

      <div className="clab__stage">
        <div className="clab__figwrap clab__figwrap--hole">
          <HoleFigure rsKm={r.rsKm} M={M} />
        </div>

        <div className="clab__reads">
          <Read label="史瓦西半径 r_s" value={bigLen(r.rsKm)} note="2GM/c² —— 视界到中心的距离" />
          <Read label="视界面积" value={sci(r.areaKm2, 3)} unit="km²" note="4πr_s²（黑洞熵正比于它）" />
          <Read label="霍金温度" value={sci(r.hawkingK, 3)} unit="K" note="质量越大反而越冷，宇宙微波背景才 2.725 K" />
          <Read label="霍金蒸发时标" value={sci(r.evapYr, 3)} unit="年" note="与质量三次方成正比，宇宙年龄才 1.4 × 10¹⁰ 年" />
        </div>
        <p className="clab__verdict">{r.verdict}</p>
      </div>
    </>
  )
}

/* ─────────────────────────────── 主组件 ─────────────────────────────── */

export default function CortexLab() {
  const [bench, setBench] = useState<BenchId>('star')
  const [basisOpen, setBasisOpen] = useState(false)

  const formulas = FORMULAS[bench]

  return (
    <>
      {/* ───────────────── 实验台本体 ───────────────── */}
      <GlassSurface className="clab" tilt={false} data-stagger>
        <div className="clab__head">
          <div className="clab__headtext">
            <p className="clab__label">
              天文实验室
              <span>拖动滑杆 · 数值实时重算</span>
            </p>
            {/* ⚠️ 这句底线声明必须留在**台子最上面**，不许挪到下面去：
                它原来挂在台子末尾，恒星台一屏放不下时它就掉出首屏了 ——
                「本台数值不是官方数据」这句话是看不到等于没写。 */}
            <p className="clab__disclaimer">
              <b>本台数值由物理公式实时计算，不是官方数据</b>
              <span>每条结论用的公式与常数见下方「本台依据」，官方发布的中国航天内容在下面数据台</span>
            </p>
          </div>
          <GlassSegmented
            ariaLabel="选择实验台"
            value={bench}
            onChange={(b) => setBench(b as BenchId)}
            options={[
              { value: 'star', label: '恒星光谱台', icon: '✦', title: '温度与半径，决定一颗恒星看起来是什么颜色、有多亮' },
              { value: 'orbit', label: '行星轨道台', icon: '◎', title: '离恒星多远，决定一年有多长、表面有多暖' },
              { value: 'hole', label: '黑洞视界台', icon: '●', title: '质量一行，撑出多大一个视界' },
            ]}
          />
        </div>

        <div className="clab__body">
          {bench === 'star' ? <StarBench /> : bench === 'orbit' ? <OrbitBench /> : <HoleBench />}
        </div>
      </GlassSurface>

      {/* ───────────────── 依据：公式与常数 ───────────────── */}
      <GlassSurface className="cbasis" light={false} data-stagger>
        <button
          type="button"
          className="cbasis__head"
          aria-expanded={basisOpen}
          onClick={() => setBasisOpen((v) => !v)}
        >
          <span className="cbasis__t">
            本台依据
            <em>公式与常数逐条列出 · 可自己拿计算器复核</em>
          </span>
          <span className="cbasis__fold">{basisOpen ? '收起 −' : '展开 +'}</span>
        </button>

        {basisOpen ? (
          <div className="cbasis__body">
            <div className="cbasis__col">
              <p className="cbasis__h">这一台用到的公式</p>
              <ul className="cbasis__list">
                {formulas.map((f) => (
                  <li key={f.expr}>
                    <code className="cbasis__expr">{f.expr}</code>
                    <span className="cbasis__legend">{f.legend}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="cbasis__col">
              <p className="cbasis__h">
                用到的常数
                <em>国际通用物理常数，{CONSTANT_TABLE.length} 条</em>
              </p>
              <ul className="cbasis__consts">
                {CONSTANT_TABLE.map((c) => (
                  <li key={c.sym}>
                    <span className="cbasis__sym">{c.sym}</span>
                    <span className="cbasis__cname">{c.name}</span>
                    <span className="cbasis__cval">{c.value}</span>
                    <span className="cbasis__ckind">{c.kind}</span>
                  </li>
                ))}
              </ul>
            </div>
            <p className="cbasis__note">
              预设天体（比邻星 / 太阳 / 天狼星 A / 水星 / 地球 / 人马座 A* 等）用的是常用的实测值，
              <b>属于本站整理</b>，不是从官方接口取的数；按钮悬停能看到具体取值。
              公式本身合不合天文上的公认结论，由 <code>_analysis/verify-lab.js</code> 拿公认数值反查，
              对不上就不让发布。
            </p>
          </div>
        ) : null}
      </GlassSurface>
    </>
  )
}
