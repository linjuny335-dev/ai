/* ============================================================================
 *  EquipHall —— FOUNDRY「航天装备展厅」
 * ----------------------------------------------------------------------------
 *  用户要的体验（原话）：
 *      看长征火箭、神舟、天舟、天宫、嫦娥、天问 →
 *      点某个装备，看到它的结构和用途 →
 *      点部件，了解它是干什么的
 *
 *  所以这一块是「展品 + 图鉴」，不是「新闻列表」：
 *      左栏  六个装备（展品目录）
 *      中栏  装备结构示意（SVG 线稿，编号热点就是部件）
 *      右栏  用途 / 选中部件的说明与参数
 *      下面  整器关键参数（每条标注出处）
 *
 *  ⚠️ 三条自律（和全站真实数据栏目同一个标准）：
 *    ① 结构示意图是**科普示意**，不是官方工程图 —— 页面上有明确标注，
 *       不假装是官方发布的图。
 *    ② 每条参数要么带官方页面链接（可点开核对原文），要么如实标「本站整理」，
 *       不存在「看起来像官网口径、其实是编的」这种状态。
 *    ③ 官方页面查不到明确写法的**具体数字**，就不写数字，只写定性描述。
 *
 *  交互约定：指针位置不写 React state；选中态才用 state（点击频率低，无所谓）。
 *  玻璃质感全部来自 ui/glass/glass.css，这里只做布局。
 * ========================================================================== */

import { createElement, useState } from 'react'
import { EQUIPMENT, equipmentById, shapeToSvg, type EquipFact, type Equipment } from './equipment'
import GlassSurface from '../ui/glass/GlassSurface'
import './equipment.css'

/** 把 '0 0 420 640' 解析成网格需要的尺寸 */
function parseViewBox(vb: string) {
  const n = vb.trim().split(/\s+/).map(Number)
  return { x: n[0] || 0, y: n[1] || 0, w: n[2] || 420, h: n[3] || 640 }
}

/* ─────────────────────────── 参数行（可核对出处） ─────────────────────── */
function Facts({ facts, dense = false }: { facts: EquipFact[]; dense?: boolean }) {
  return (
    <ul className={'efacts' + (dense ? ' efacts--dense' : '')}>
      {facts.map((f, i) => (
        <li className="efact" key={`${f.label}-${i}`}>
          <div className="efact__row">
            <span className="efact__label">{f.label}</span>
            <span className="efact__value">{f.value}</span>
            {f.src ? (
              <a
                className="efact__src"
                href={f.src.url}
                target="_blank"
                rel="noreferrer"
                title={`去官方页面核对：${f.src.name}`}
              >
                官方原文 ↗
              </a>
            ) : (
              <span className="efact__curated" title="官方页面没有集中写这一条，本项由本站整理">
                本站整理
              </span>
            )}
          </div>

          {/* 官方原文放在折叠块里：默认不占版面，想核对时一句话展开 */}
          {f.quote ? (
            <details className="efact__q">
              <summary>展开官方原文</summary>
              <blockquote>{f.quote}</blockquote>
              {f.src ? (
                <a className="efact__qlink" href={f.src.url} target="_blank" rel="noreferrer">
                  {f.src.name} ↗
                </a>
              ) : null}
            </details>
          ) : null}

          {f.note ? <p className="efact__note">{f.note}</p> : null}
        </li>
      ))}
    </ul>
  )
}

/* ─────────────────────────── 结构示意图（SVG） ────────────────────────── */
function Figure({
  eq,
  activeId,
  onPick,
}: {
  eq: Equipment
  activeId: string | null
  onPick: (id: string) => void
}) {
  const vb = parseViewBox(eq.viewBox)

  // 工程图纸感的淡网格：每 40 单位一条，纯装饰，不接事件
  const grid: { x1: number; y1: number; x2: number; y2: number; major: boolean }[] = []
  for (let x = 0; x <= vb.w; x += 40) grid.push({ x1: x, y1: 0, x2: x, y2: vb.h, major: x % 200 === 0 })
  for (let y = 0; y <= vb.h; y += 40) grid.push({ x1: 0, y1: y, x2: vb.w, y2: y, major: y % 200 === 0 })

  return (
    <svg
      className={'efig efig--' + eq.id}
      viewBox={eq.viewBox}
      role="img"
      aria-label={`${eq.name} 结构示意图（科普示意）`}
    >
      {/* 底衬：让线稿在任何底图上都读得清 */}
      <rect className="efig__plate" x={vb.x} y={vb.y} width={vb.w} height={vb.h} rx={18} />

      <g className="efig__grid" aria-hidden="true" pointerEvents="none">
        {grid.map((g, i) => (
          <line
            key={i}
            x1={g.x1}
            y1={g.y1}
            x2={g.x2}
            y2={g.y2}
            className={g.major ? 'efig__gl is-major' : 'efig__gl'}
          />
        ))}
      </g>

      {/* 部件形体：每个部件是一个可点的组 */}
      {eq.parts.map((part) => {
        const on = activeId === part.id
        return (
          <g
            key={part.id}
            className={'ehall__part' + (on ? ' is-on' : '') + (activeId && !on ? ' is-dim' : '')}
            onClick={() => onPick(part.id)}
          >
            <title>{part.name}</title>
            {part.shapes.map((s, i) => {
              const { tag, attrs } = shapeToSvg(s)
              const isDash = s.t === 'l' && s.dash === true
              return createElement(tag, {
                key: i,
                className: 'efig__shape' + (isDash ? ' efig__shape--dash' : ''),
                ...attrs,
              })
            })}
          </g>
        )
      })}

      {/* 编号热点单独一层画在最上面：不受部件绘制顺序影响，不会被别的部件压住 */}
      <g className="efig__marks">
        {eq.parts.map((p, i) => {
          const on = activeId === p.id
          return (
            <g
              key={p.id}
              className={'emark' + (on ? ' is-on' : '')}
              onClick={() => onPick(p.id)}
              role="button"
              tabIndex={0}
              aria-label={`部件 ${i + 1}：${p.name}`}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onPick(p.id)
                }
              }}
            >
              <circle className="emark__hit" cx={p.hot.x} cy={p.hot.y} r={15} />
              <circle className="emark__ring" cx={p.hot.x} cy={p.hot.y} r={12} />
              <circle className="emark__dot" cx={p.hot.x} cy={p.hot.y} r={8.5} />
              <text className="emark__no" x={p.hot.x} y={p.hot.y + 3.6}>
                {i + 1}
              </text>
            </g>
          )
        })}
      </g>
    </svg>
  )
}

/* ──────────────────────────────── 展厅 ────────────────────────────────── */
export default function EquipHall() {
  const [eqId, setEqId] = useState(EQUIPMENT[0].id)
  const [partId, setPartId] = useState<string | null>(null)

  const eq = equipmentById(eqId)
  const part = eq.parts.find((p) => p.id === partId) ?? null

  /* 横向构型（天宫 T 字、天问 环绕器）的画布比竖构型宽得多。
     在窄图形列里它们只能按宽度适配 → 线稿明显偏小；
     给这一类放宽图形列，线稿就能长到和竖构型一样高。 */
  const vb = parseViewBox(eq.viewBox)
  const isWide = vb.w / vb.h > 1

  /** 换装备：清掉部件选择（否则会拿着上一台装备的部件 id 去查） */
  const pickEquip = (id: string) => {
    setEqId(id)
    setPartId(null)
  }
  const pickPart = (id: string) => setPartId((cur) => (cur === id ? null : id))

  return (
    <div className="ehall">
      {/* ── 展品目录 ─────────────────────────────────────────────── */}
      <div className="ehall__rail" data-stagger>
        <p className="ehall__railtitle">
          展品目录 <span>EXHIBITS · {EQUIPMENT.length}</span>
        </p>
        <div className="ehall__tabs" role="tablist" aria-label="航天装备">
          {EQUIPMENT.map((e, i) => (
            <GlassSurface
              key={e.id}
              as="button"
              type="button"
              tilt
              tiltMax={3}
              className={'ehall__tab' + (e.id === eqId ? ' is-active' : '')}
              role="tab"
              aria-selected={e.id === eqId}
              onClick={() => pickEquip(e.id)}
            >
              <span className="ehall__tab-no">{String(i + 1).padStart(2, '0')}</span>
              <span className="ehall__tab-body">
                <span className="ehall__tab-name">{e.short}</span>
                <span className="ehall__tab-fam">{e.family}</span>
              </span>
            </GlassSurface>
          ))}
        </div>
      </div>

      {/* ── 展台 ─────────────────────────────────────────────────── */}
      <div className="ehall__stage" data-stagger>
        <GlassSurface className={'ehall__plate' + (isWide ? ' ehall__plate--wide' : '')} tilt={false}>
          <div className="ehall__figwrap">
            <Figure eq={eq} activeId={partId} onPick={pickPart} />
            <p className="ehall__fignote">
              科普示意 · 非官方工程图 —— 点图上的编号看部件
            </p>
          </div>

          <div className="ehall__side">
            <div className="ehall__head">
              <span className="ehall__fam">{eq.family}</span>
              <h2 className="ehall__name">{eq.name}</h2>
              <p className="ehall__en">{eq.en}</p>
              <p className="ehall__oneline">{eq.oneLine}</p>
            </div>

            {/* 部件选择：图上点编号，或者点这里 */}
            <div className="ehall__parts" role="tablist" aria-label={`${eq.short} 的部件`}>
              {eq.parts.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  className={'echip' + (p.id === partId ? ' is-on' : '')}
                  aria-pressed={p.id === partId}
                  onClick={() => pickPart(p.id)}
                >
                  <i className="echip__no">{i + 1}</i>
                  {p.name}
                </button>
              ))}
            </div>

            <div className="ehall__detail">
              {part ? (
                <>
                  <h3 className="ehall__dname">
                    {part.name}
                    {part.en ? <span className="ehall__den">{part.en}</span> : null}
                  </h3>
                  <p className="ehall__drole">{part.role}</p>
                  {part.facts?.length ? <Facts facts={part.facts} dense /> : null}
                </>
              ) : (
                <>
                  <h3 className="ehall__dname">它是干什么的</h3>
                  <p className="ehall__drole">{eq.summary}</p>
                  <p className="ehall__dhint">
                    上面 {eq.parts.length} 个编号就是它的部件 ——{' '}
                    <b>点一个看看</b>，会显示这个部件具体负责什么。
                  </p>
                </>
              )}
            </div>

            <div className="ehall__srcs">
              <span className="ehall__srclabel">官方页面</span>
              {eq.sources.map((s) => (
                <a key={s.url} className="ehall__srclink" href={s.url} target="_blank" rel="noreferrer">
                  {s.name} ↗
                </a>
              ))}
            </div>
          </div>
        </GlassSurface>

        {/* 整器参数：横跨一行，每条都标了出处 */}
        <div className="ehall__factbox">
          <p className="ehall__facttitle">
            关键参数 <span>· 每条都可点开核对官方原文</span>
          </p>
          <Facts facts={eq.facts} />
        </div>
      </div>

      <p className="ehall__disclaimer" data-stagger>
        本展厅的结构示意图与部件作用说明为<b>本站整理的科普内容</b>，不是官方发布；标有
        「官方原文 ↗」的参数可点开核对官方页面。真实航天动态与任务数据请见下方发射时间轴与数据台。
      </p>
    </div>
  )
}
