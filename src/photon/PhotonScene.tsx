/* ============================================================================
 *  PhotonScene —— PHOTON 栏目「光 · 看见宇宙」
 * ----------------------------------------------------------------------------
 *  体验主线（用户给的原话）：
 *      看见宇宙 → 切换日期 → 放大观察 → 阅读科普 → 随机探索
 *
 *  数据来源与降级顺序（详见 useApodDay 的「三层取数」）：
 *      ① 本地缓存 → ② NASA 官方接口 → ③ 真实数据离线存档
 *  页面上出现的每一个标题、每一个日期、每一段说明文字，都是 NASA 真实发布的
 *  内容 —— 没有 mock、没有 demo、没有本地写死的图文。
 *
 *  ⚠️ 只有一处例外需要说清楚：第 ③ 层「离线存档」装的是**某次真连 NASA
 *  抓下来的原始响应**（不是编的），并且页面上会用一条醒目的标注写明
 *  「这是 X 月 X 日抓取的存档，不是实时数据」，同时给出两个恢复实时的出口
 *  （重新加载 / 填入自己的 Key）。它存在的理由是：NASA 的公共演示 Key
 *  只有 10 次/小时且全世界共用，被刷空时若什么都不显示，栏目就等于不可用。
 *
 *  它依然挂在全站唯一的转场时间轴上（SceneManager）：
 *      旧场景退出 → 银河空镜 → 本场景进入（头部/游标/页脚错峰上浮）
 * ========================================================================== */

import { useEffect, useState } from 'react'
import type { Theme } from '../config/themes'
import type { ApodItem } from '../lib/apod'
import { formatMomentLocal } from '../lib/datetime'
import { nasaKeyNote } from '../lib/env'
import { useApodDay } from './useApodDay'
import ApodInfo from './ApodInfo'
import ApodKeyForm from './ApodKeyForm'
import ApodLightbox from './ApodLightbox'
import ApodLog, { logEntryOf, MAX_LOG, type ApodLogEntry } from './ApodLog'
import ApodStage from './ApodStage'
import CnPanel from '../cnspace/CnPanel'
import DateTrack from './DateTrack'
import GlassButton from '../ui/glass/GlassButton'
import GlassSurface from '../ui/glass/GlassSurface'
import './photon.css'

/** 首次加载的骨架：一块玻璃 + 一条扫光，不是假图片 */
function Standby({ label }: { label: string }) {
  return (
    <GlassSurface className="apod-state apod-state--standby" tilt={false}>
      <i className="apod-stage__spin apod-state__spin" aria-hidden="true" />
      <h3 className="apod-state__title">{label}</h3>
      <p className="apod-state__text">正在从 NASA 取当天的真实内容，请稍候。</p>
    </GlassSurface>
  )
}

/**
 * 失败态：网络和离线存档**都**拿不到时才出现。
 * 必须说清原因、给「重新加载」，并给一个能自己解决的出口 —— 填 Key。
 */
function Failed({
  reason,
  demoKey,
  onRetry,
}: {
  reason: string | null
  demoKey: boolean
  onRetry: () => void
}) {
  const throttled = Boolean(reason && /限流|429|403/i.test(reason))
  return (
    <GlassSurface className="apod-state apod-state--failed" tilt={false}>
      <div className="apod-state__icon" aria-hidden="true">
        ⚠
      </div>
      <h3 className="apod-state__title">数据暂时获取失败</h3>
      <p className="apod-state__text">
        {reason ? `${reason}` : '没能连上 NASA 的接口。'}
        <br />
        {throttled
          ? 'NASA 的公共演示 Key 只有 10 次/小时，而且是全世界共用的一把，额度用完后要等一小时。'
          : '检查网络后点「重新加载」；如果一直不通，可以填一把自己的 Key。'}
      </p>
      <GlassButton onClick={onRetry}>重新加载</GlassButton>
      {demoKey ? <ApodKeyForm onSaved={onRetry} /> : null}
      <p className="apod-state__note">
        这一栏不会用任何编造的图文代替 NASA 的真实数据。填 Key 后可恢复实时。
      </p>
    </GlassSurface>
  )
}

/**
 * 存档标注条：**必须**让人一眼看出现在看的不是实时数据。
 * 内容全是如实陈述：什么时候抓的、覆盖多少天、为什么降级、怎么恢复。
 */
function ArchiveNotice({
  meta,
  reason,
  demoKey,
  onRetry,
}: {
  meta: { capturedAt: string; start: string; end: string; total: number }
  reason: string
  demoKey: boolean
  onRetry: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="apod-arch" role="status">
      <div className="apod-arch__row">
        <span className="apod-arch__badge">离线存档</span>
        <span className="apod-arch__text">
          NASA 接口当前不可用（{reason}）—— 正在展示{' '}
          <b>{formatMomentLocal(meta.capturedAt)}</b> 抓取的<b>真实 NASA 存档</b>
          （{meta.start} → {meta.end}，共 {meta.total} 天）。这不是实时数据。
        </span>
        <GlassButton className="apod-arch__btn" onClick={onRetry}>
          重新加载
        </GlassButton>
        {demoKey ? (
          <button type="button" className="apod-arch__toggle" onClick={() => setOpen((v) => !v)}>
            {open ? '收起' : '填入我的 Key'}
          </button>
        ) : null}
      </div>
      {open && demoKey ? <ApodKeyForm compact onSaved={onRetry} /> : null}
    </div>
  )
}

export default function PhotonScene({ theme }: { theme: Theme }) {
  const view = useApodDay()
  const [zoomItem, setZoomItem] = useState<ApodItem | null>(null)

  const item = view.item
  const firstLoad = view.status === 'loading' && !item
  const failed = view.status === 'error' && !item

  /* 观测日志：每观测到新的一夜就记一笔。
     同样只活在内存里（见 ApodLog 的文件头）—— 刷新即清空，免得失败态
     被一串旧标题「顶上」，那正是这一栏明令禁止的事。 */
  const [log, setLog] = useState<ApodLogEntry[]>([])
  useEffect(() => {
    if (!item) return
    setLog((prev) => {
      const top = prev[0]
      if (top && top.date === item.date && top.title === item.title) return prev
      const rest = prev.filter((e) => e.date !== item.date)
      return [logEntryOf(item), ...rest].slice(0, MAX_LOG)
    })
  }, [item])

  return (
    <section className="photon scene-scroll" data-wheel-scroll>
      <div className="photon__inner">
        {/* ------------------------------------------------------------ 头部 */}
        <header className="photon__head">
          <div className="photon__titles">
            <p className="kicker" data-stagger>
              {theme.kicker}
            </p>
            <h1 className="photon__title">
              <span className="headline__line" data-stagger>
                {theme.headline[0]}
              </span>
              <span className="headline__line headline__line--accent" data-stagger>
                {theme.headline[1]}
              </span>
            </h1>
            {theme.blurbCn ? (
              <p className="photon__sub" data-stagger>
                {theme.blurbCn}
              </p>
            ) : null}
          </div>

          <div className="photon__cursor" data-stagger>
            <DateTrack
              date={item?.date ?? view.today}
              span={view.span}
              today={view.today}
              todayLabel={view.archive ? '最新存档' : '今天'}
              canPrev={view.canPrev}
              canNext={view.canNext}
              pending={view.pending}
              onPrev={view.goPrev}
              onNext={view.goNext}
              onToday={view.goToday}
              onPick={view.goDate}
            />
          </div>
        </header>

        {/* -------------------------------------------------- 存档降级标注 */}
        {view.archive && item ? (
          <ArchiveNotice
            meta={view.archive.meta}
            reason={view.archive.reason}
            demoKey={view.demoKey}
            onRetry={view.reload}
          />
        ) : null}

        {/* ------------------------------------------------------------ 主体 */}
        {firstLoad ? (
          <Standby label="正在连接宇宙数据……" />
        ) : failed ? (
          <Failed reason={view.error} demoKey={view.demoKey} onRetry={view.reload} />
        ) : item ? (
          <div className="photon__main">
            <ApodStage item={item} pending={view.pending} onZoom={() => setZoomItem(item)} />
            {/* 右栏：这一夜的说明 + 本次会话的观测日志。
                日志只在真有内容时出现（首次进入时它还是空的）。 */}
            <div className="photon__side">
              <ApodInfo item={item} onRandom={view.random} />
              <ApodLog entries={log} currentDate={item.date} onPick={view.goDate} />
            </div>
          </div>
        ) : null}

        {/* ------------------------------- 中国航天真实数据台（国家天文台 / 国家航天局）
            内容全部来自官方网站的公开页面，服务端解析后经同源 /cn-api/feed 下发；
            这里一个字都没有写死，也没有任何示例数据。 */}
        <CnPanel
          category="photon"
          label="中国航天 · 观测与天文科普"
          note="国家天文台 · 国家航天局 公开栏目"
          limit={9}
          gridMax="286px"
        />

        {/* ------------------------------------------------------------ 页脚 */}
        <footer className="photon__foot" data-stagger>
          <span className="photon__foot-main">
            Source ·{' '}
            <a
              className="photon__foot-link"
              href="https://apod.nasa.gov/"
              target="_blank"
              rel="noreferrer"
            >
              NASA APOD
            </a>{' '}
            · 每日天文学图片公开接口 · Key：{nasaKeyNote()}
          </span>

          <span className="photon__foot-meta">
            {view.archive ? (
              <>
                离线存档 · {formatMomentLocal(view.archive.meta.capturedAt)} 抓取 · 共{' '}
                {view.archive.meta.total} 天
              </>
            ) : (
              <>
                {view.quota?.rateRemaining != null
                  ? `本小时额度剩余 ${view.quota.rateRemaining}/${view.quota.rateLimit ?? '—'} · `
                  : ''}
                {view.fromNetwork ? '本次为实时取数' : '本次命中本地缓存（数据仍是 NASA 原件）'}
              </>
            )}
          </span>
        </footer>
      </div>

      {zoomItem ? <ApodLightbox item={zoomItem} onClose={() => setZoomItem(null)} /> : null}
    </section>
  )
}
