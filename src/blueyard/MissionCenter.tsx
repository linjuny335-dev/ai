/* ============================================================================
 *  MissionCenter —— BLUEYARD「青年任务中心」
 * ----------------------------------------------------------------------------
 *  这一栏和其它四栏刻意不同：**别的栏目是给你看的，这一栏是给你做的**。
 *  所以它不摆数据，而是摆四件今晚就能动手的事：
 *
 *    ① 今晚值班台    月相（画出来的形状）、月龄、被照亮比例、下一个节气
 *                    —— 全部由日期推算，界面标公式与误差
 *    ② 天象日历      未来几条：朔望 / 节气（推算）+ 流星雨（年度固定周期）
 *    ③ 观星任务      七个任务，对应北斗七星的七颗星；做完一颗亮一颗
 *                    —— 进度存在你自己的浏览器里，不上传
 *    ④ 知识挑战      六道题，答完给解析，并指出站内哪儿能验证
 *
 *  ⚠️ 诚实纪律（这一栏有两种数字，必须分开标，不许混着说）：
 *      · 推算出来的（月相 / 月龄 / 节气）  → 标**公式**，时刻一律写「约 HH:MM」
 *      · 年度固定周期（流星雨极大日期）    → 标**年度周期**，不是今年的实测值
 *      · 本站整理的（任务 / 知识题 / 星图） → 标**本站整理**
 *      · 下方数据台（CnPanel）             → 官方公开栏目原文，原样保留
 *     两种数字在视觉上用了不同的小标签，翻到哪儿都能一眼分清。
 *
 *  ℹ️ 推算准不准，不是自己说的：_analysis/verify-sky.js 拿两张独立历表逐条对拍 ——
 *     公开天文年历的 2026 全年朔望时刻（49 条）、紫金山天文台发布的 2026 年
 *     二十四节气时刻（24 条），外加 NASA 的四次日月食食甚（日食必在朔、
 *     月食必在望）。实测朔望最大差 28 分钟、节气最大差 13 分钟。
 *
 *  ⚠️ 指针事件：本栏目所有可点元素都是 <button>（.scene-wrap 只放行
 *     button / a / .logo）。星图里的星也是可点的，用的是 SVG <circle> +
 *     onClick —— 这能成立是因为所在容器挂着 .scene-scroll
 *     （pointer-events:auto 会继承下来，FOUNDRY 的装备部件同理）。
 *     星图里的线与文字显式 pointer-events:none，免得挡住星星。
 * ========================================================================== */

import { useMemo, useState } from 'react'
import GlassButton from '../ui/glass/GlassButton'
import GlassSurface from '../ui/glass/GlassSurface'
import {
  DIPPER_LINES,
  DIPPER_STARS,
  DIPPER_VIEW,
  LEVEL_TEXT,
  MISSIONS,
  POLARIS_RAY,
  QUIZ,
  loadDone,
  saveDone,
} from './program'
import {
  daysUntil,
  fmtClock,
  fmtDay,
  julianDay,
  moonShape,
  nightAdvice,
  skyCalendar,
  type MoonShape,
  type SkyEvent,
} from './sky'

/* ══════════════════════════ 小零件 ══════════════════════════ */

/** 一条读数：标签 + 值 + 单位 */
function Read({
  label,
  value,
  unit,
  note,
}: {
  label: string
  value: string
  unit?: string
  note?: string
}) {
  return (
    <div className="bread">
      <span className="bread__l">{label}</span>
      <span className="bread__v">
        {value}
        {unit ? <em className="bread__u">{unit}</em> : null}
      </span>
      {note ? <span className="bread__n">{note}</span> : null}
    </div>
  )
}

/**
 * 月相图 —— 按相位角把「亮的那一块」画出来。
 * 亮区 = 一段半圆（外缘）+ 一段半椭圆（明暗界线），参数见 sky.ts 的 moonShape()。
 */
function MoonDial({ shape, size = 128 }: { shape: MoonShape; size?: number }) {
  const c = size / 2
  const R = c - 9
  const rx = Math.max(0.001, shape.rx * R)
  const path = [
    `M ${c} ${c - R}`,
    `A ${R} ${R} 0 0 ${shape.sweep} ${c} ${c + R}`,
    `A ${rx.toFixed(2)} ${R} 0 0 ${shape.secondSweep} ${c} ${c - R}`,
    'Z',
  ].join(' ')

  return (
    <svg
      className="bmoon"
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      role="img"
      aria-label={`今晚月相：${shape.name}，被照亮 ${Math.round(shape.illum * 100)}%`}
    >
      {/* 暗面：整轮月盘 */}
      <circle cx={c} cy={c} r={R} className="bmoon__dark" />
      {/* 亮面：由上面那条路径围出 */}
      <path d={path} className="bmoon__lit" />
      {/* 外圈刻度环，说明「这是一个球」 */}
      <circle cx={c} cy={c} r={R + 4} className="bmoon__ring" />
    </svg>
  )
}

/** 依据小标签：推算 / 年度周期 / 本站整理 / 官方 */
function Basis({ kind }: { kind: 'calc' | 'annual' | 'self' | 'official' }) {
  const map = {
    calc: { text: '推算', title: '由日期按公开天文算法算出，误差已在本页说明' },
    annual: { text: '年度周期', title: '常年天文年历数据，极大日期每年浮动一两天' },
    self: { text: '本站整理', title: '本站自己编写的科普内容，不代表任何机构' },
    official: { text: '官方原文', title: '来自官方网站公开栏目' },
  } as const
  const it = map[kind]
  return (
    <span className={`btag btag--${kind}`} title={it.title}>
      {it.text}
    </span>
  )
}

/* ══════════════════════════ ① 今晚值班台 ══════════════════════════ */

function Tonight({ now }: { now: Date }) {
  const shape = useMemo(() => moonShape(julianDay(now)), [now])
  const advice = useMemo(() => nightAdvice(shape.illum), [shape.illum])
  const nextTerm = useMemo(() => skyCalendar(now, 40).find((e) => e.kind === 'term') ?? null, [now])

  return (
    <GlassSurface className="bnight" tilt={false} data-stagger>
      <div className="bnight__dial">
        <MoonDial shape={shape} />
        <p className="bnight__dialcap">
          {shape.waxing ? '盈 · 走向满月' : '亏 · 走向新月'}
          <span>{now.getMonth() + 1}月{now.getDate()}日 当地时刻</span>
        </p>
      </div>

      <div className="bnight__reads">
        <div className="bnight__readshead">
          <span className="bnight__label">今晚值班台</span>
          <Basis kind="calc" />
        </div>
        <div className="bnight__grid">
          <Read label="月相" value={shape.name} note={`照亮 ${Math.round(shape.illum * 100)}%`} />
          <Read label="月龄" value={shape.age.toFixed(1)} unit="天" note="从最近一次新月起算" />
          {nextTerm ? (
            <Read
              label="下一个节气"
              value={nextTerm.name}
              note={`${fmtDay(nextTerm.at)} ${fmtClock(nextTerm.at)}`}
            />
          ) : null}
          {nextTerm ? (
            <Read
              label="距今"
              value={String(Math.max(0, daysUntil(now, nextTerm.at)))}
              unit="天"
              note="节气由太阳视黄经定，不是查表"
            />
          ) : null}
        </div>
        <p className="bnight__advice">
          <b>{advice.level}</b>
          {advice.text}
        </p>
      </div>
    </GlassSurface>
  )
}

/* ══════════════════════════ ② 天象日历 ══════════════════════════ */

const KIND_CN: Record<SkyEvent['kind'], string> = {
  phase: '月相',
  term: '节气',
  meteor: '流星雨',
}

function CalendarBox({ now }: { now: Date }) {
  const rows = useMemo(() => skyCalendar(now, 6), [now])

  /* ⚠️ 为什么单拎一条「下一场流星雨」常驻：
     日历只显示「最近 6 条」，而流星雨的极大日期是常年固定值 ——
     碰上朔望与节气挤在一起的那几周（比如 9 月下旬到 10 月中旬），
     6 条里一条流星雨都排不进去，「年度周期」这一类内容就整类看不见了。
     这一栏的诚实纪律要求三类数字**同时可辨**，不该因为日期凑巧就消失，
     所以把「下一场」单独拎出来常驻；已经排进 6 条里的则不重复显示。
     数据仍然取自 sky.ts 的 METEOR_SHOWERS（常年年历值），没有新数字。 */
  const nextMeteor = useMemo(() => {
    const m = skyCalendar(now, 40).find((e) => e.kind === 'meteor') ?? null
    if (!m) return null
    return rows.some((r) => r.kind === 'meteor' && r.name === m.name) ? null : m
  }, [now, rows])

  return (
    <GlassSurface className="bcal" tilt={false} data-stagger>
      <div className="bcal__head">
        <span className="bcal__label">
          天象日历
          <em>从今天起的最近 {rows.length} 条</em>
        </span>
      </div>

      <ul className="bcal__list">
        {rows.map((e, i) => (
          <li key={`${e.kind}-${e.name}-${i}`} className="bcal__row">
            <span className={`bcal__date is-${e.kind}`}>
              <b>{e.at.getDate()}</b>
              <em>{e.at.getMonth() + 1}月</em>
            </span>
            <span className="bcal__main">
              <span className="bcal__name">
                {e.name}
                <i className="bcal__kind">{KIND_CN[e.kind]}</i>
                <Basis kind={e.basis === 'annual' ? 'annual' : 'calc'} />
              </span>
              <span className="bcal__note">{e.note}</span>
            </span>
            <span className="bcal__time">{e.kind === 'meteor' ? '极大当晚' : fmtClock(e.at)}</span>
          </li>
        ))}
      </ul>

      {nextMeteor ? (
        <div className="bcal__next">
          <span className="bcal__nextl">下一场流星雨</span>
          <span className="bcal__nextm">
            <b>{nextMeteor.name}</b>
            <em>
              {fmtDay(nextMeteor.at)} · 还有 {Math.max(0, daysUntil(now, nextMeteor.at))} 天
            </em>
            <Basis kind="annual" />
          </span>
          <span className="bcal__nextn">{nextMeteor.note}</span>
        </div>
      ) : null}

      <p className="bcal__foot">
        月相与节气是<b>算出来的</b>（公式见底部「本页依据」）；流星雨是<b>年度固定周期</b>，
        表格中的 ZHR 为常年参考值，每年实际不同。
      </p>
    </GlassSurface>
  )
}

/* ══════════════════════════ ③ 观星任务 + 星图 ══════════════════════════ */

function StarMap({ done, onPick }: { done: Set<string>; onPick: (id: string) => void }) {
  const all = done.size === DIPPER_STARS.length
  return (
    <svg
      className={`bmap${all ? ' is-full' : ''}`}
      viewBox={`${DIPPER_VIEW.x} ${DIPPER_VIEW.y} ${DIPPER_VIEW.w} ${DIPPER_VIEW.h}`}
      role="img"
      aria-label={`北斗七星任务星图：已点亮 ${done.size} / ${DIPPER_STARS.length}`}
    >
      {/* 指极星延长线：只在「用斗口找到北极星」做完之后出现 */}
      {done.has('polaris') ? (
        <g className="bmap__ray">
          <line x1={POLARIS_RAY.x1} y1={POLARIS_RAY.y1} x2={POLARIS_RAY.x2} y2={POLARIS_RAY.y2} />
          <text x={POLARIS_RAY.lx} y={POLARIS_RAY.ly} textAnchor="end">
            北极星方向
          </text>
        </g>
      ) : null}

      {/* 连线：两端星都点亮了，这条线才亮 */}
      {DIPPER_LINES.map(([a, b]) => {
        const on = done.has(DIPPER_STARS[a].id) && done.has(DIPPER_STARS[b].id)
        return (
          <line
            key={`${a}-${b}`}
            className={`bmap__line${on ? ' is-on' : ''}`}
            x1={DIPPER_STARS[a].x}
            y1={DIPPER_STARS[a].y}
            x2={DIPPER_STARS[b].x}
            y2={DIPPER_STARS[b].y}
          />
        )
      })}

      {/* 七颗星 */}
      {DIPPER_STARS.map((s, i) => {
        const on = done.has(s.id)
        const r = 0.52 + (3 - s.mag) * 0.16
        return (
          <g key={s.id} className={`bmap__star${on ? ' is-on' : ''}`}>
            {on ? <circle className="bmap__glow" cx={s.x} cy={s.y} r={r * 3.2} /> : null}
            <circle className="bmap__disc" cx={s.x} cy={s.y} r={on ? r * 1.15 : r * 0.8} />
            <text className="bmap__cn" x={s.x} y={s.y - 1.5} textAnchor="middle">
              {s.cn}
            </text>
            <text className="bmap__en" x={s.x} y={s.y + 2.6} textAnchor="middle">
              {s.en}
            </text>
            {/* 点击星 = 勾选/取消对应任务 */}
            <circle
              className="bmap__hit"
              cx={s.x}
              cy={s.y}
              r={3.2}
              role="button"
              tabIndex={0}
              aria-label={`${s.cn} ↔ 任务「${MISSIONS[i].name}」`}
              onClick={() => onPick(s.id)}
              onKeyDown={(ev) => {
                if (ev.key === 'Enter' || ev.key === ' ') {
                  ev.preventDefault()
                  onPick(s.id)
                }
              }}
            />
          </g>
        )
      })}
    </svg>
  )
}

/**
 * 星图 + 进度（左上）。
 * 任务清单单独放在下面全宽那一块 —— 两块共用同一份 done 状态，
 * 所以状态提到 MissionCenter 里，这里只负责显示。
 */
function StarBoard({
  done,
  onToggle,
}: {
  done: Set<string>
  onToggle: (id: string) => void
}) {
  const n = done.size
  const total = MISSIONS.length

  return (
    <GlassSurface className="bmis" tilt={false} data-stagger>
      <div className="bmis__head">
        <span className="bmis__label">
          点亮你的星图
          <em>做完一个任务点亮一颗星 · 进度只存在你自己的浏览器里</em>
        </span>
        <span className="bmis__score">
          <b>{n}</b> / {total}
          <i>颗已点亮</i>
        </span>
      </div>

      <div className="bmis__stage">
        <StarMap done={done} onPick={onToggle} />
        <p className="bmis__caption">
          {n === total
            ? '七星全亮 —— 找星、拍月亮、看银河这条线你已经走完了。'
            : '星图按北斗七星的真实赤经赤纬投影，不是随手画的示意。点星星也能勾任务。'}
        </p>
      </div>
    </GlassSurface>
  )
}

/** 七个任务（全宽两列） */
function MissionList({
  done,
  onToggle,
}: {
  done: Set<string>
  onToggle: (id: string) => void
}) {
  return (
    <GlassSurface className="bmis bmis--list" tilt={false} data-stagger>
      <div className="bmis__head">
        <span className="bmis__label">
          观星任务
          <em>七个任务对应北斗七星；每一项都是今晚或这个月就能做的事</em>
        </span>
        <span className="bmis__score">
          <b>{done.size}</b> / {MISSIONS.length}
          <i>已完成</i>
        </span>
      </div>

      <ul className="bmis__list">
        {MISSIONS.map((m) => {
          const on = done.has(m.id)
          return (
            <li key={m.id}>
              <button
                type="button"
                className={`bmiss${on ? ' is-on' : ''}`}
                onClick={() => onToggle(m.id)}
                aria-pressed={on}
              >
                <span className="bmiss__box" aria-hidden="true">
                  {on ? '✓' : ''}
                </span>
                <span className="bmiss__body">
                  <span className="bmiss__name">
                    {m.name}
                    <i className="bmiss__star">{m.star}</i>
                    <i className="bmiss__lv">{LEVEL_TEXT[m.level]}</i>
                  </span>
                  <span className="bmiss__goal">{m.goal}</span>
                  <span className="bmiss__how">{m.how}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      <div className="bmis__foot">
        <Basis kind="self" />
        <span>
          任务、难度与做法均为本站整理，是给你上手用的清单，不是任何机构的发布内容。
        </span>
      </div>
    </GlassSurface>
  )
}

/* ══════════════════════════ ④ 知识挑战 ══════════════════════════ */

function QuizBox() {
  const [picked, setPicked] = useState<Record<string, number>>({})
  const answered = Object.keys(picked).length
  const right = QUIZ.filter((q) => picked[q.id] !== undefined && q.options[picked[q.id]]?.ok).length
  const finished = answered === QUIZ.length

  return (
    <GlassSurface className="bquiz" tilt={false} data-stagger>
      <div className="bquiz__head">
        <span className="bquiz__label">
          知识挑战
          <em>六道题 · 答完给出解析，并告诉你站内哪儿能验证</em>
        </span>
        <span className="bquiz__score">
          <b>{right}</b> / {QUIZ.length}
          <i>{finished ? '已答完' : `已答 ${answered} 题`}</i>
        </span>
      </div>

      <ol className="bquiz__list">
        {QUIZ.map((q, qi) => {
          const pick = picked[q.id]
          const doneIt = pick !== undefined
          return (
            <li key={q.id} className="bq">
              <p className="bq__q">
                <i>{qi + 1}</i>
                {q.question}
              </p>
              <div className="bq__opts">
                {q.options.map((o, oi) => {
                  let cls = 'bq__opt'
                  if (doneIt) {
                    if (o.ok) cls += ' is-ok'
                    else if (oi === pick) cls += ' is-bad'
                    else cls += ' is-dim'
                  }
                  return (
                    <button
                      key={o.text}
                      type="button"
                      className={cls}
                      disabled={doneIt}
                      onClick={() => setPicked((p) => ({ ...p, [q.id]: oi }))}
                    >
                      {o.text}
                    </button>
                  )
                })}
              </div>
              {doneIt ? (
                <p className="bq__why">
                  <b>{q.options[pick]?.ok ? '答对了 · ' : '正确答案是上面标绿的那一项 · '}</b>
                  {q.why}
                  <span className="bq__where">{q.where}</span>
                </p>
              ) : null}
            </li>
          )
        })}
      </ol>

      <div className="bquiz__foot">
        <Basis kind="self" />
        <span>题目与解析为本站整理；每道题的解析里都写了站内可以自己去验证的地方。</span>
        {answered > 0 ? (
          <GlassButton className="bquiz__reset" onClick={() => setPicked({})}>
            重做一遍
          </GlassButton>
        ) : null}
      </div>
    </GlassSurface>
  )
}

/* ══════════════════════════ ⑤ 本页依据 ══════════════════════════ */

const ALGOS: { expr: string; legend: string }[] = [
  {
    expr: 'i = 180° − D − 6.289°·sin M′ + 2.100°·sin M − …',
    legend: '月球相位角 i（Meeus《Astronomical Algorithms》48.4 简化式）：0° = 满月，180° = 新月。',
  },
  {
    expr: 'λ = L₀ + C − 0.00569° − 0.00478°·sin Ω',
    legend: '太阳视黄经 λ（Meeus 第 25 章低精度式）。二十四节气的定义就是 λ 落在 15° 的整数倍上，所以节气是算出来的，不是查表。',
  },
  {
    expr: 'k = (1 + cos i) / 2',
    legend: '被照亮的比例 k。月相图上那块亮区就是按 k 与相位角画出来的。',
  },
  {
    expr: 'JD = unix_ms / 86400000 + 2440587.5',
    legend: '儒略日。朔望与节气时刻用二分法在单调角度函数上求根，不查任何历表。',
  },
]

const ACCURACY: { key: string; val: string }[] = [
  { key: '朔 / 望', val: '与权威历表相差 ≤ 28 分钟；与 NASA 2026 年日月食食甚对拍最大 14.6 分钟、最小 1.4 分钟' },
  { key: '上弦 / 下弦', val: '与公开历表相差 ≤ 50 分钟 —— 相位角公式在「弦」附近与历表使用的「视黄经相差 90°」定义本身就有偏差，朔望两点上无偏' },
  { key: '二十四节气', val: '与紫金山天文台发布的 2026 年节气时刻相差 ≤ 13 分钟' },
  { key: '照亮比例', val: '误差 < 1%' },
  { key: '流星雨极大', val: '常年值，每年浮动一两天；ZHR 逐年不同（不是今年的实测值）' },
  { key: '星图坐标', val: '公开星表近似赤经赤纬，等距圆柱投影；天枢–摇光角距实测 25.7° 与星表一致' },
]

function BasisPanel() {
  const [open, setOpen] = useState(false)
  return (
    <div className="bbasis" data-stagger>
      <GlassSurface className="bbasis__inner" tilt={false}>
        <button type="button" className="bbasis__head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <span className="bbasis__t">
            本页依据：这一栏的数字是从哪来的
            <em>月相与节气是推算的、流星雨是年度周期、任务是本站整理的 —— 三类东西分开列在这里</em>
          </span>
          <span className="bbasis__fold">{open ? '收起 ▾' : '展开 ▸'}</span>
        </button>

        {open ? (
          <div className="bbasis__body">
            <div className="bbasis__col">
              <p className="bbasis__h">
                推算用的公式
                <em>月相与节气的每一处都是这几条算出来的</em>
              </p>
              <ul className="bbasis__list">
                {ALGOS.map((a) => (
                  <li key={a.expr}>
                    <code className="bbasis__expr">{a.expr}</code>
                    <span className="bbasis__legend">{a.legend}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bbasis__col">
              <p className="bbasis__h">
                误差与性质
                <em>所以界面上给到「时:分」的地方都写成「约 HH:MM」</em>
              </p>
              <ul className="bbasis__acc">
                {ACCURACY.map((a) => (
                  <li key={a.key}>
                    <b>{a.key}</b>
                    <span>{a.val}</span>
                  </li>
                ))}
              </ul>

              <p className="bbasis__note">
                这一页有<b>四类</b>内容，性质完全不同，请不要混着引用：
                ①<b> 推算</b>——月相、月龄、节气，由本机时间按上面的公式算出；
                ②<b> 年度周期</b>——流星雨极大日期与 ZHR，是常年天文年历数据；
                ③<b> 本站整理</b>——观星任务、知识题、星图坐标，是本项目自己编写的科普内容；
                ④<b> 官方原文</b>——本页最下方的中国航天数据台，来自官方公开栏目，一个字没有改写。
                计算内核在 <code>src/blueyard/sky.ts</code>，
                整理内容在 <code>src/blueyard/program.ts</code>，
                精度由 <code>_analysis/verify-sky.js</code> 与公开历表对拍。
              </p>
            </div>
          </div>
        ) : null}
      </GlassSurface>
    </div>
  )
}

/* ══════════════════════════ 出口 ══════════════════════════ */

export default function MissionCenter() {
  const now = useMemo(() => new Date(), [])

  /* 任务进度：状态提到这里，是为了让「星图」和「任务清单」这两块
     （一左一右、隔着一整个网格）共用同一份 done，不各存一份。 */
  const [done, setDone] = useState<Set<string>>(() => new Set(loadDone()))

  const toggle = (id: string) => {
    setDone((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      saveDone([...next])
      return next
    })
  }

  return (
    <div className="bmc">
      <Tonight now={now} />

      <div className="bmc__grid">
        <StarBoard done={done} onToggle={toggle} />
        <CalendarBox now={now} />
      </div>

      <MissionList done={done} onToggle={toggle} />
      <QuizBox />
      <BasisPanel />
    </div>
  )
}
