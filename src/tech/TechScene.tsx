/* ============================================================================
 *  TechScene —— 漂浮在银河里的「实时航天动态」终端
 * ----------------------------------------------------------------------------
 *  内容全部来自真实接口（src/lib/sources.ts 注册的三个源），不写死任何假数据：
 *
 *      Hacker News   → 航天新闻      hn.algolia.com 关键词检索（rocket / NASA / satellite）
 *      GitHub        → 航天开源项目   api.github.com/search/repositories（topic 限定）
 *      Hugging Face  → 卫星遥感模型   huggingface.co/api/models · spaces（search 限定）
 *
 *  这一层只负责：数据源切换 · 状态机（加载 / 失败 / 空）· 列表渲染 · 本地过滤。
 *  取数逻辑全在 useFeed + 各源 adapter 里，玻璃质感全在 ui/glass 里。
 *
 *  标题不写死在这里 —— 从 theme.headline 读，改文案只改 config/themes.ts。
 *
 *  它依然走全站同一条转场时间轴（SceneManager）：
 *      旧场景退出 → 银河空镜 → 本场景从另一侧进入 + 玻璃逐块浮现
 * ========================================================================== */

import { useCallback, useMemo, useState } from 'react'
import type { Theme } from '../config/themes'
import { hfEndpoint } from '../lib/huggingface'
import { useFeed } from '../lib/useFeed'
import { DEFAULT_SOURCE_ID, sourceById, SOURCES } from '../lib/sources'
import type { SourceId } from '../lib/techTypes'
import TechCard from './TechCard'
import SyncMeter from './SyncMeter'
import CnPanel from '../cnspace/CnPanel'
import GlassButton from '../ui/glass/GlassButton'
import GlassSegmented from '../ui/glass/GlassSegmented'
import GlassSurface from '../ui/glass/GlassSurface'

/** 每个源一次取多少条 */
const LIMIT = 12

const SOURCE_OPTIONS = SOURCES.map((s) => ({
  value: s.id,
  label: s.short,
  icon: s.icon,
  title: s.label,
}))

/** 每个源记住自己选中的 feed —— 来回切源时不会把选择重置掉 */
function buildInitialFeed(): Record<SourceId, string> {
  const map = {} as Record<SourceId, string>
  for (const s of SOURCES) map[s.id] = s.feeds[0].id
  return map
}

/** 骨架屏卡片：只在真正的首次加载时出现 */
function Skeleton() {
  return (
    <div className="news-slot">
      <GlassSurface className="news-card news-card--skeleton" tilt={false}>
        <div className="sk sk--top" />
        <div className="sk sk--title" />
        <div className="sk sk--title sk--short" />
        <div className="sk sk--meta" />
      </GlassSurface>
    </div>
  )
}

export default function TechScene({ theme }: { theme: Theme }) {
  const [sourceId, setSourceId] = useState<SourceId>(DEFAULT_SOURCE_ID)
  const [feedBySource, setFeedBySource] = useState<Record<SourceId, string>>(buildInitialFeed)
  const [query, setQuery] = useState('')

  const source = sourceById(sourceId)
  const feed = source.feeds.find((f) => f.id === feedBySource[sourceId]) ?? source.feeds[0]

  const { status, data, error, reload, syncAt, autoMs, auto, busy, toggleAuto } = useFeed(
    sourceId,
    feed,
    LIMIT,
  )

  /* 切源：清空过滤词，否则顶着上一个源的搜索词看新源会一片空白 */
  const changeSource = useCallback((id: SourceId) => {
    setSourceId(id)
    setQuery('')
  }, [])

  const changeFeed = useCallback(
    (id: string) => {
      setFeedBySource((prev) => ({ ...prev, [sourceId]: id }))
    },
    [sourceId],
  )

  /* 本地过滤：只筛已加载的内容，不再打接口 */
  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return data
    return data.filter(
      (it) =>
        it.title.toLowerCase().includes(q) ||
        it.owner.toLowerCase().includes(q) ||
        (it.description ?? '').toLowerCase().includes(q) ||
        (it.footLabel ?? '').toLowerCase().includes(q) ||
        it.tags.some((t) => t.toLowerCase().includes(q)),
    )
  }, [data, query])

  const firstLoad = status === 'loading'
  const failed = status === 'error'

  return (
    <section className="tech scene-scroll" data-wheel-scroll>
      <div className="tech__inner">
        {/* ------------------------------------------------ 头部：标题 + 工具 */}
        <header className="tech__head">
          <div className="tech__titles">
            <p className="kicker" data-stagger>
              {theme.kicker}
            </p>
            <h1 className="tech__title">
              <span className="headline__line" data-stagger>
                {theme.headline[0]}
              </span>
              <span className="headline__line headline__line--accent" data-stagger>
                {theme.headline[1]}
              </span>
            </h1>
            {theme.blurbCn ? (
              <p className="tech__sub" data-stagger>
                {theme.blurbCn}
              </p>
            ) : null}
          </div>

          <div className="tech__tools">
            {/* 搜索：本地过滤已加载的条目 */}
            <div className="glass tech-field" data-stagger>
              <span className="tech-field__icon" aria-hidden="true">
                ⌕
              </span>
              <input
                className="tech-field__input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter"
                aria-label="Filter loaded items"
                spellCheck={false}
              />
            </div>

            <div data-stagger>
              <SyncMeter
                syncAt={syncAt}
                autoMs={autoMs}
                auto={auto}
                busy={busy}
                onToggle={toggleAuto}
              />
            </div>
          </div>
        </header>

        {/* ------------------------- 中国航天四源汇总（TECH 的主内容）
            国家航天局 / 中国载人航天 / 国家天文台 / 航天科技集团
            四个官方网站的最新内容，按发布日期汇总；话题筛选为本地筛选，
            不额外打接口。内容全部来自真实页面，见 src/lib/cnspace.ts。 */}
        <CnPanel
          category="tech"
          label="中国航天 · 四源汇总"
          note="国家航天局 · 中国载人航天 · 国家天文台 · 航天科技集团"
          filter
          limit={12}
          gridMax="300px"
        />

        {/* --------------------------------------- 数据源切换 + 该源的分类 */}
        <div className="tech__switch">
          <div data-stagger>
            <GlassSegmented<SourceId>
              options={SOURCE_OPTIONS}
              value={sourceId}
              onChange={changeSource}
              ariaLabel="Data source"
            />
          </div>

          <p className="tech__hint" data-stagger title={feed.hint}>
            {feed.hint}
          </p>

          <div data-stagger>
            <GlassSegmented<string>
              options={source.feeds.map((f) => ({
                value: f.id,
                label: f.label,
                title: f.hint,
              }))}
              value={feed.id}
              onChange={changeFeed}
              ariaLabel={`${source.label} feed`}
            />
          </div>
        </div>

        {/* ---------------------------------------------------------- 列表区 */}
        <div
          className="tech__list"
          data-wheel-scroll
          // 列表自己能滚的时候，滚轮优先给列表（见 useWheelNav 的边界判断）
        >
          {firstLoad ? (
            Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} />)
          ) : failed ? (
            <GlassSurface className="tech-state" tilt={false}>
              <div className="tech-state__icon" aria-hidden="true">
                ⚠
              </div>
              <h3 className="tech-state__title">Signal lost</h3>
              <p className="tech-state__text">
                没能取到 {source.label} 的数据{error ? `（${error}）` : ''}。
                <br />
                检查网络后重试。
              </p>
              <GlassButton onClick={reload}>Retry</GlassButton>
            </GlassSurface>
          ) : list.length === 0 ? (
            <GlassSurface className="tech-state" tilt={false}>
              <div className="tech-state__icon" aria-hidden="true">
                ○
              </div>
              <h3 className="tech-state__title">Nothing here</h3>
              <p className="tech-state__text">
                {data.length === 0 ? '这个分类暂时没有内容。' : `没有匹配「${query}」的条目。`}
              </p>
              {query ? <GlassButton onClick={() => setQuery('')}>Clear filter</GlassButton> : null}
            </GlassSurface>
          ) : (
            list.map((it, i) => (
              <TechCard key={it.key} item={it} index={i} delay={i * 42} source={source} />
            ))
          )}
        </div>

        {/* ---------------------------------------------------------- 页脚信息 */}
        <footer className="tech__foot" data-stagger>
          <span>
            Source ·{' '}
            <a className="tech__foot-link" href={source.home} target="_blank" rel="noreferrer">
              {source.label}
            </a>
            {/* HF 有两个端点（官方站 / 镜像代理），把实际用的那个显示出来方便排查 */}
            {sourceId === 'hf' ? ` · ${hfEndpoint()}` : ''} · {list.length}/{data.length} shown
          </span>
          <GlassButton onClick={reload} disabled={firstLoad}>
            {firstLoad ? 'Loading…' : 'Refresh'}
          </GlassButton>
        </footer>
      </div>
    </section>
  )
}
