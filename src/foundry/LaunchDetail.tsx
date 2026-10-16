/* ============================================================================
 *  LaunchDetail —— 任务详情（点时间轴上的某一站弹出）
 * ----------------------------------------------------------------------------
 *  液態玻璃面板，字段全部来自 LL2 的真实返回，一个都不编：
 *
 *      任务名称 / 火箭 / 发射机构（+类型）/ 发射时刻（本地时区 + 精度）
 *      发射场（+工位）/ 任务类型 / 目标轨道 / 任务状态（官方说明）
 *      任务简介（官方英文原文，不翻译不改写）
 *      倒计时（由 net 实时算）· 官方任务页链接
 *
 *  createPortal 挂到 body：场景层 .scene-wrap 是独立的层叠上下文（z-index 10），
 *  面板必须盖住左侧轨道导航和顶部玻璃条，所以不能待在场景里。
 *
 *  官方没给的字段一律显示「官方未提供」，而不是留空或者填一个看起来合理的值。
 * ========================================================================== */

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatMomentLocal, localZoneLabel } from '../lib/datetime'
import type { LaunchItem } from '../lib/launches'
import { LAUNCH_SOURCE } from '../lib/launches'
import LaunchCountdown from './LaunchCountdown'
import { statusTone } from './LaunchTimeline'

interface Props {
  item: LaunchItem
  onClose: () => void
}

/** 一行「标签 + 值」。值为空时如实说官方没给 */
function Field({ label, value, mono = false }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div className="fdet__field">
      <span className="fdet__label">{label}</span>
      <span className={'fdet__value' + (mono ? ' is-mono' : '') + (value ? '' : ' is-empty')}>
        {value ?? '官方未提供'}
      </span>
    </div>
  )
}

export default function LaunchDetail({ item, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  /** 官方配图不一定有，加载失败也不该留一个破图框 */
  const [imgOk, setImgOk] = useState(Boolean(item.image))
  useEffect(() => {
    setImgOk(Boolean(item.image))
  }, [item.image])

  const tone = statusTone(item.status.abbrev)

  const node = (
    <div className="fdet" role="dialog" aria-modal="true" aria-label={`${item.name} 任务详情`}>
      <button type="button" className="fdet__backdrop" onClick={onClose} aria-label="关闭任务详情" />

      <div className="fdet__panel">
        {item.image && imgOk ? (
          <div className="fdet__hero" aria-hidden="true">
            <img src={item.image} alt="" onError={() => setImgOk(false)} />
          </div>
        ) : null}

        <header className="fdet__head">
          <div className="fdet__titles">
            <p className="fdet__kicker">
              <span className={`fdet__tone is-${tone}`}>{item.status.abbrev}</span>
              {item.missionType ? ` · ${item.missionType}` : ''}
              {item.orbit ? ` · ${item.orbit}` : ''}
            </p>
            <h2 className="fdet__title">{item.name}</h2>
            <p className="fdet__sub">
              {item.rocket ?? '火箭待定'} · {item.provider ?? '机构待定'}
            </p>
          </div>
          <div className="fdet__tools">
            <a className="fdet__link" href={item.pageUrl} target="_blank" rel="noreferrer">
              官方任务页 ↗
            </a>
            <button type="button" className="fdet__close glass" onClick={onClose}>
              关闭 ✕
            </button>
          </div>
        </header>

        <div className="fdet__count">
          <LaunchCountdown net={item.net} precision={item.netPrecision} />
        </div>

        <div className="fdet__grid">
          <Field label="发射时刻" value={item.net ? `${formatMomentLocal(item.net)} (${localZoneLabel()})` : null} mono />
          <Field label="时刻精度" value={item.netPrecision} />
          <Field label="发射场" value={item.location} />
          <Field label="发射工位" value={item.pad} />
          <Field label="火箭" value={item.rocket} />
          <Field label="发射机构" value={item.provider ? `${item.provider}${item.providerType ? ` · ${item.providerType}` : ''}` : null} />
          <Field label="任务类型" value={item.missionType} />
          <Field label="目标轨道" value={item.orbit} />
        </div>

        <section className="fdet__mission">
          <h3 className="fdet__h3">任务简介 · 官方原文</h3>
          <div className="fdet__desc" data-wheel-scroll>
            {item.mission ? (
              <p>{item.mission}</p>
            ) : (
              <p className="is-empty">官方这一场没有提供任务简介。</p>
            )}
          </div>
        </section>

        <footer className="fdet__foot">
          <span>
            来源 {LAUNCH_SOURCE.name} · {LAUNCH_SOURCE.org} · {LAUNCH_SOURCE.note}
          </span>
          <span className="fdet__footid">ID {item.id}</span>
        </footer>
      </div>
    </div>
  )

  return createPortal(node, document.body)
}
