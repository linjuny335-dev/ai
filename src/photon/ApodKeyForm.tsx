/* ============================================================================
 *  ApodKeyForm —— 在页面上直接填入自己的 NASA Key
 * ----------------------------------------------------------------------------
 *  为什么需要它：NASA 的 DEMO_KEY 是全世界共用的 10 次/小时演示 Key，
 *  被刷空时页面就只能显示失败/存档。让用户在这里填一把自己的 Key
 *  （免费申请、1000 次/小时），**不用重新构建、不用改 .env、立即生效**。
 *
 *  三个约定：
 *      · Key 只存在**用户自己的浏览器** localStorage 里，不上传任何地方。
 *        页脚会如实写明「现在用的是哪一把 Key」。
 *      · 保存后立刻触发一次真正的重新取数（绕过缓存），用户马上能看到结果。
 *      · 输入框必须显式 `pointer-events: auto` —— .scene-wrap 默认
 *        pointer-events:none，只放行 button/a/.logo，原生 input 会被
 *        底下的银河画布吃掉点击（这是验收脚本抓出来的真实缺陷）。
 * ========================================================================== */

import { useState } from 'react'
import { NASA_SIGNUP_URL, runtimeNasaKey, setRuntimeNasaKey } from '../lib/env'
import GlassButton from '../ui/glass/GlassButton'

interface Props {
  /** 保存成功后调用（通常接「重新取数」） */
  onSaved: () => void
  /** 紧凑版：放在存档标注条里面 */
  compact?: boolean
}

export default function ApodKeyForm({ onSaved, compact = false }: Props) {
  const [value, setValue] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [saved, setSaved] = useState(() => runtimeNasaKey().length > 0)

  const save = () => {
    const v = value.trim()
    if (!v) {
      setNote('先把 Key 粘贴进来再保存。')
      return
    }
    if (!setRuntimeNasaKey(v)) {
      setNote('浏览器禁用了本地存储，保存不了 —— 请改用 .env.local 的 VITE_NASA_API_KEY。')
      return
    }
    setNote('已保存到本机浏览器，正在用它重新取数……')
    setSaved(true)
    setValue('')
    onSaved()
  }

  const clear = () => {
    setRuntimeNasaKey('')
    setSaved(false)
    setNote('已清除，改回公共演示 Key。')
    onSaved()
  }

  return (
    <form
      className={`apod-key${compact ? ' apod-key--compact' : ''}`}
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <p className="apod-key__head">
        填入你自己的 NASA Key 即可恢复实时数据
        <a className="apod-key__link" href={NASA_SIGNUP_URL} target="_blank" rel="noreferrer">
          免费申请 ↗
        </a>
      </p>

      <div className="apod-key__row">
        <input
          className="apod-key__input"
          type="text"
          name="nasa-key"
          autoComplete="off"
          spellCheck={false}
          placeholder="粘贴 Key，例如 AbCdEf123…"
          aria-label="NASA API Key"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <GlassButton type="submit">保存并重试</GlassButton>
        {saved ? (
          <button type="button" className="apod-key__clear" onClick={clear}>
            清除
          </button>
        ) : null}
      </div>

      <p className="apod-key__note">
        {note ??
          'Key 只保存在你自己的浏览器里，不会上传。公共演示 Key 只有 10 次/小时；自己的 1000 次/小时。'}
      </p>
    </form>
  )
}
