/* ============================================================================
 *  FoundryScene —— FOUNDRY 栏目「器 · 探索宇宙」
 * ----------------------------------------------------------------------------
 *  这一栏现在分两层，**展品在上、实时数据在下**：
 *
 *    ① 航天装备展厅（EquipHall）
 *       长征火箭 / 神舟 / 天舟 / 天宫 / 嫦娥五号 / 天问一号 六个装备，
 *       点装备看结构与用途，点部件看它具体干什么。
 *       结构示意是科普示意，参数逐条标了官方出处 —— 详见 equipment.ts 顶部的说明。
 *
 *    ② 真实发射任务（原来就有，位置下移，内容一个字没改）
 *       数据只有一处来源：Launch Library 2（The Space Devs）的公开接口
 *       （src/lib/launches.ts），**不需要 API Key**。
 *       页面上出现的每一个任务名、火箭、机构、时刻、发射场、简介、状态，
 *       都是接口返回的真实字段 —— 没有 mock、没有示例任务、没有本地写死的清单。
 *       取不到就显示「数据暂时获取失败 + 重新加载」，绝不拿假任务糊上去。
 *
 *  ③ 中国航天四源数据台（CnPanel）—— 也在下面，同样原样保留。
 *
 *  ⚠️ 「即将发射 / 已完成」这个开关跟着它控制的对象一起下移了 ——
 *     原来挂在标题旁边，而标题下面现在先出现的是装备展厅，
 *     开关离发射时间轴太远容易被误读成「切换装备」。
 *
 *  和全站其它场景一致：挂在 SceneManager 的转场时间轴上，
 *  旧场景退出 → 银河空镜 → 本场景进入（头部 / 主区 / 页脚错峰上浮）。
 * ========================================================================== */

import { useState } from 'react'
import type { Theme } from '../config/themes'
import type { LaunchItem } from '../lib/launches'
import { LAUNCH_SOURCE } from '../lib/launches'
import { formatMomentLocal, localZoneLabel } from '../lib/datetime'
import CnPanel from '../cnspace/CnPanel'
import GlassButton from '../ui/glass/GlassButton'
import GlassSegmented from '../ui/glass/GlassSegmented'
import GlassSurface from '../ui/glass/GlassSurface'
import EquipHall from './EquipHall'
import LaunchCountdown from './LaunchCountdown'
import LaunchDetail from './LaunchDetail'
import LaunchTimeline, { missionOf, statusTone } from './LaunchTimeline'
import { useLaunches } from './useLaunches'
import './foundry.css'

/** 首次加载骨架：一块玻璃 + 转圈，不是假任务 */
function Standby() {
  return (
    <GlassSurface className="fstate fstate--standby">
      <i className="fstate__spin" aria-hidden="true" />
      <h3 className="fstate__title">正在连接宇宙数据……</h3>
      <p className="fstate__text">正在从 Launch Library 2 取真实的发射任务，请稍候。</p>
    </GlassSurface>
  )
}

/** 失败态：说清原因 + 重新加载，不给任何替代数据 */
function Failed({ reason, onRetry }: { reason: string | null; onRetry: () => void }) {
  return (
    <GlassSurface className="fstate fstate--failed">
      <div className="fstate__icon" aria-hidden="true">
        ⚠
      </div>
      <h3 className="fstate__title">数据暂时获取失败</h3>
      <p className="fstate__text">
        {reason ?? '没能连上 Launch Library 2 的接口。'}
        <br />
        检查网络后点「重新加载」。
      </p>
      <GlassButton onClick={onRetry}>重新加载</GlassButton>
      <p className="fstate__note">这一栏不会用任何本地占位任务代替真实发射数据。</p>
    </GlassSurface>
  )
}

/** 选中任务的关键读数（一条：「标签 值」）。值可折两行，鼠标悬停看全文 */
function Read({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="fhero__read">
      <span className="fhero__rl">{label}</span>
      <span
        className={'fhero__rv' + (value ? '' : ' is-empty')}
        title={value ?? '官方未提供'}
      >
        {value ?? '官方未提供'}
      </span>
    </div>
  )
}

export default function FoundryScene({ theme }: { theme: Theme }) {
  const view = useLaunches()
  const [detail, setDetail] = useState<LaunchItem | null>(null)

  const firstLoad = view.status === 'loading' && view.items.length === 0
  const failed = view.status === 'error' && view.items.length === 0
  const active = view.active

  /** 点时间轴 = 选中 + 打开详情 */
  const pick = (i: number) => {
    view.goto(i)
    const it = view.items[i]
    if (it) setDetail(it)
  }

  const tone = active ? statusTone(active.status.abbrev) : 'hold'

  return (
    <section className="foundry scene-scroll" data-wheel-scroll>
      <div className="foundry__inner">
        {/* ------------------------------------------------------------ 头部 */}
        <header className="foundry__head">
          <div className="foundry__titles">
            <p className="kicker" data-stagger>
              {theme.kicker}
            </p>
            <h1 className="foundry__title">
              <span className="headline__line" data-stagger>
                {theme.headline[0]}
              </span>
              <span className="headline__line headline__line--accent" data-stagger>
                {theme.headline[1]}
              </span>
            </h1>
            {theme.blurbCn ? (
              <p className="foundry__sub" data-stagger>
                {theme.blurbCn}
              </p>
            ) : null}
          </div>
        </header>

        {/* ---------------------------------------------- 航天装备展厅（展品） */}
        <EquipHall />

        {/* ------------------------------------- 真实发射任务（Launch Library 2） */}
        {/* 开关属于这一块，就放在这一块头上 —— 不再挂在标题旁边 */}
        <div className="foundry__bodyhead" data-stagger>
          <p className="foundry__bodylabel">
            实时发射任务
            <span>{LAUNCH_SOURCE.name} · 倒计时由官方 NET 实时计算</span>
          </p>
          <div className="foundry__switch">
            <GlassSegmented
              ariaLabel="发射任务状态"
              value={view.kind}
              onChange={(k) => {
                setDetail(null)
                view.setKind(k)
              }}
              options={[
                { value: 'upcoming', label: '即将发射', icon: '▲', title: '还没发射的任务（按发射顺序）' },
                { value: 'previous', label: '已完成', icon: '▼', title: '最近已经发射过的任务' },
              ]}
            />
          </div>
        </div>

        {/* ------------------------------------------------------------ 主体 */}
        {firstLoad ? (
          <Standby />
        ) : failed ? (
          <Failed reason={view.error} onRetry={view.reload} />
        ) : active ? (
          <div className="foundry__body">
            {/* 选中任务：左边是它是什么，右边是它还有多久 */}
            <GlassSurface className="fhero" tilt={false}>
              <div className="fhero__info">
                <p className="fhero__top">
                  <span className={`fhero__tone is-${tone}`}>{active.status.abbrev}</span>
                  <span className="fhero__no">第 {view.index + 1} 站 / 共 {view.items.length} 站</span>
                  {active.webcastLive ? <span className="fhero__live">正在直播</span> : null}
                </p>

                <h2 className="fhero__name">{missionOf(active.name)}</h2>
                <p className="fhero__bys">
                  {active.rocket ?? '火箭待定'} · {active.provider ?? '机构待定'}
                  {active.providerType ? ` · ${active.providerType}` : ''}
                </p>

                <div className="fhero__reads">
                  <Read
                    label="发射时刻"
                    value={active.net ? `${formatMomentLocal(active.net)} (${localZoneLabel()})` : null}
                  />
                  <Read label="发射场" value={active.location} />
                  <Read label="工位" value={active.pad} />
                  <Read label="轨道 / 类型" value={[active.orbit, active.missionType].filter(Boolean).join(' · ') || null} />
                </div>

                <div className="fhero__acts">
                  <GlassButton onClick={() => setDetail(active)}>查看任务详情</GlassButton>
                  <a className="fhero__link" href={active.pageUrl} target="_blank" rel="noreferrer">
                    官方任务页 ↗
                  </a>
                </div>
              </div>

              <div className="fhero__clock">
                <LaunchCountdown
                  net={active.net}
                  precision={active.netPrecision}
                  hideZone
                />
              </div>
            </GlassSurface>

            {/* 时间轴：一次 5 站，左右浏览整批真实任务 */}
            <LaunchTimeline
              items={view.items}
              index={view.index}
              onStep={view.step}
              onPick={pick}
              upcoming={view.kind === 'upcoming'}
            />
          </div>
        ) : null}

        {/* ---------------------- 中国航天真实数据台（工程研制 / 火箭与发射）
            航天科技集团 · 中国载人航天 · 国家航天局 三家官方公开栏目，
            服务端解析后经同源 /cn-api/feed 下发。一个字都没写死。 */}
        <CnPanel
          category="foundry"
          label="中国航天 · 工程与发射"
          note="航天科技集团 · 中国载人航天 · 国家航天局"
          limit={9}
          gridMax="286px"
        />

        {/* ------------------------------------------------------------ 页脚 */}
        <footer className="foundry__foot" data-stagger>
          <span className="foundry__foot-main">
            Source ·{' '}
            <a className="foundry__foot-link" href={LAUNCH_SOURCE.home} target="_blank" rel="noreferrer">
              {LAUNCH_SOURCE.name}
            </a>{' '}
            · {LAUNCH_SOURCE.org} · {LAUNCH_SOURCE.note} · 倒计时由官方 NET 实时计算
          </span>
          <span className="foundry__foot-meta">
            {view.updatedAt ? `更新于 ${formatMomentLocal(new Date(view.updatedAt).toISOString())} · ` : ''}
            {view.fromCache ? '本次命中会话缓存（数据仍是接口原件）' : '本次为实时取数'}
          </span>
        </footer>
      </div>

      {detail ? <LaunchDetail item={detail} onClose={() => setDetail(null)} /> : null}
    </section>
  )
}
