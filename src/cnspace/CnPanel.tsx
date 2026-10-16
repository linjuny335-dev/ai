/* ============================================================================
 *  CnPanel —— 一个板块里的「中国航天真实数据」区
 * ----------------------------------------------------------------------------
 *  五个板块共用这一个组件，只是传入不同的 category：
 *      photon   ← 国家天文台的观测/图片/科普 + 国家航天局航天知识
 *      foundry  ← 航天科技集团 + 载人航天工程 + 国家航天局（工程研制）
 *      cortex   ← 国家天文台科研 + 载人航天空间科学
 *      blueyard ← 天宫课堂、科普活动等面向青年的科普内容
 *      tech     ← 四个来源最新内容的汇总（带话题筛选）
 *
 *  三种状态，一律如实显示，不拿假内容凑数：
 *      加载中    「正在连接中国航天数据……」 + 骨架卡片
 *      部分失败  其余来源照常显示；失败的来源单独列出名字与原因 + 「重新加载」
 *      全部失败  「该数据源暂时无法连接」 + 「重新加载」
 *
 *  数据来源与缓存全在服务端（server/cnspace/）：
 *    前端只请求同源 /cn-api/feed，不直接抓官网（CORS + 礼貌问题，见 lib/cnspace.ts）。
 * ========================================================================== */

import { useCallback, useMemo, useState, type CSSProperties } from 'react'
import GlassButton from '../ui/glass/GlassButton'
import GlassSegmented from '../ui/glass/GlassSegmented'
import GlassSurface from '../ui/glass/GlassSurface'
import {
  CN_TOPICS,
  CN_TOPIC_LABEL,
  cnAgo,
  useCnFeed,
  type CnCategory,
  type CnItem,
} from '../lib/cnspace'
import CnCard from './CnCard'
import { CN_SOURCES } from './sources'
import './cnspace.css'

interface Props {
  category: CnCategory
  /** 面板左上角的小标题 */
  label: string
  /** 小标题右边的一句话说明 */
  note?: string
  /** 是否显示话题筛选（TECH 页用） */
  filter?: boolean
  /** 最多显示多少条（默认 12，即每个来源 3 条左右） */
  limit?: number
  /** 列表区高度上限（CSS 长度）。不传用样式里的默认值 */
  gridMax?: string
}

/** 骨架：只在真正首次加载时出现，形状和真卡片一致，避免加载完跳一下 */
function Skeleton() {
  return (
    <div className="cn-slot">
      <GlassSurface className="cn-skeleton" tilt={false}>
        <div className="cn-sk cn-sk--thumb" />
        <div className="cn-sk cn-sk--title" />
        <div className="cn-sk cn-sk--title cn-sk--w60" />
        <div className="cn-sk cn-sk--w40" />
      </GlassSurface>
    </div>
  )
}

export default function CnPanel({ category, label, note, filter, limit = 12, gridMax }: Props) {
  const { status, items, sources, error, syncAt, snapshot, refreshing, anyFailed, reload } =
    useCnFeed(category)

  /** 展开的卡片 id —— 允许多张同时展开，点哪张哪张动，不会连带别的 */
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set())
  const toggle = useCallback((id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  /* ---------------------------------------------------- 话题筛选（TECH） */
  const [topic, setTopic] = useState('all')

  const filtered = useMemo(() => {
    if (!filter || topic === 'all') return items
    return items.filter((i) => (i.topicLabels ?? []).includes(topic as never))
  }, [items, filter, topic])

  const shown: CnItem[] = filtered.slice(0, limit)

  /* 来源标签行：有内容的来源都显示；失败的来源即使没有内容也显示（要让用户看见） */
  const srcChips = useMemo(() => {
    const byId = new Map(sources.map((s) => [s.id, s]))
    const countOf = (id: string) => items.filter((i) => i.source === id).length
    return CN_SOURCES.map((m) => {
      const st = byId.get(m.id)
      return { meta: m, state: st, n: countOf(m.id) }
    }).filter((x) => x.n > 0 || (x.state && !x.state.ok))
  }, [sources, items])

  const firstLoad = status === 'loading'
  const hardFail = status === 'error'
  const failedSources = sources.filter((s) => !s.ok)

  const filterOptions = useMemo(
    () => [
      { value: 'all', label: CN_TOPIC_LABEL.all, badge: String(items.length) },
      ...CN_TOPICS.map((t) => ({
        value: t,
        label: CN_TOPIC_LABEL[t],
        badge: String(items.filter((i) => (i.topicLabels ?? []).includes(t as never)).length),
      })),
    ],
    [items],
  )

  return (
    <div className="cn-panel" aria-busy={firstLoad}>
      <div className="cn-panel__head">
        <span className="cn-panel__label" data-stagger>
          {label}
        </span>
        {note ? <p className="cn-panel__note">{note}</p> : null}
        <span className="cn-panel__meter" data-stagger>
          {firstLoad ? (
            <>
              <i className="cn-panel__pulse" aria-hidden="true" />
              正在连接中国航天数据
            </>
          ) : (
            <>
              <i className="cn-panel__pulse" aria-hidden="true" />
              {snapshot ? '快照 · 抓取于 ' : '同步于 '}
              {cnAgo(syncAt)}
              {refreshing ? ' · 更新中' : ''}
              {' · '}
              {shown.length}/{items.length}
            </>
          )}
        </span>
      </div>

      {/* 来源小标签：一眼看清这些内容分别来自哪个官方网站 */}
      {!firstLoad && srcChips.length > 0 ? (
        <div className="cn-srcs">
          {srcChips.map(({ meta, state, n }) => (
            <span
              key={meta.id}
              className={`cn-src${state && !state.ok ? ' is-bad' : ''}`}
              style={{ '--sc': meta.accent } as CSSProperties}
              title={
                state?.ok
                  ? `${state.name} · 读取栏目：${state.columns.join(' / ')}`
                  : state
                    ? `${state.name} 暂时无法连接`
                    : meta.chip
              }
            >
              <i className="cn-src__dot" aria-hidden="true" />
              {meta.chip}
              <em className="cn-src__n">{state && !state.ok ? '失败' : `${n} 条`}</em>
            </span>
          ))}
        </div>
      ) : null}

      {filter ? (
        <div className="cn-filter">
          <div data-stagger>
            <GlassSegmented<string>
              options={filterOptions}
              value={topic}
              onChange={setTopic}
              ariaLabel={`${label} 话题筛选`}
            />
          </div>
        </div>
      ) : null}

      <div
        className="cn-grid"
        data-wheel-scroll
        style={gridMax ? ({ '--cn-grid-max': gridMax } as CSSProperties) : undefined}
      >
        {firstLoad ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} />)
        ) : hardFail ? (
          <GlassSurface className="cn-state" tilt={false}>
            <div className="cn-state__icon" aria-hidden="true">
              ⚠
            </div>
            <h3 className="cn-state__title">该数据源暂时无法连接</h3>
            <p className="cn-state__text">
              这一轮没能从官方网站取到内容{error ? `（${error}）` : ''}。
              <br />
              稍后再试，或点下面按钮立刻重试。
            </p>
            <GlassButton onClick={reload}>重新加载</GlassButton>
          </GlassSurface>
        ) : shown.length === 0 ? (
          <GlassSurface className="cn-state" tilt={false}>
            <div className="cn-state__icon" aria-hidden="true">
              ○
            </div>
            <h3 className="cn-state__title">这里暂时没有内容</h3>
            <p className="cn-state__text">
              {items.length === 0
                ? '这一栏目目前没有官方内容，稍后会自动更新。'
                : '这个筛选条件下没有条目，换一个话题看看。'}
            </p>
            {topic !== 'all' ? (
              <GlassButton onClick={() => setTopic('all')}>看全部</GlassButton>
            ) : null}
          </GlassSurface>
        ) : (
          shown.map((it, i) => (
            <CnCard
              key={it.id}
              item={it}
              index={i}
              delay={i * 38}
              open={openIds.has(it.id)}
              onToggle={() => toggle(it.id)}
            />
          ))
        )}
      </div>

      {/* 部分失败也要说出来 —— 静默降级在界面上等于撒谎（约定第七条） */}
      {!firstLoad && anyFailed ? (
        <div className="cn-panel__head">
          <span className="cn-panel__label" style={{ color: 'rgba(255,150,150,0.9)' }}>
            部分来源暂时无法连接
          </span>
          <ul className="cn-state__list">
            {failedSources.map((s) => (
              <li key={s.id}>
                {s.name}
                {s.failedColumns.length ? ` —— ${s.failedColumns.join(' / ')}` : ''}
              </li>
            ))}
          </ul>
          <span className="cn-panel__meter">
            <GlassButton onClick={reload}>重新加载</GlassButton>
          </span>
        </div>
      ) : null}
    </div>
  )
}
