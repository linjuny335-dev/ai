/* ============================================================================
 *  AudioButton —— 环境音（真实现，不是占位）
 * ----------------------------------------------------------------------------
 *  用 WebAudio 现场合成一段极低的持续和声，不加载任何音频文件。
 *  四个失谐振荡器过一道低通，再用 0.06Hz 的 LFO 缓慢扫动截止频率，
 *  听起来像风穿过空腔 —— 和星系主题很搭。
 * ========================================================================== */

import { useEffect, useRef } from 'react'
import { useThemeStore } from '../store/useThemeStore'

function startAmbient(): () => void {
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return () => {}

  const ac = new Ctor()

  const master = ac.createGain()
  master.gain.value = 0
  master.connect(ac.destination)

  const lowpass = ac.createBiquadFilter()
  lowpass.type = 'lowpass'
  lowpass.frequency.value = 620
  lowpass.Q.value = 0.7
  lowpass.connect(master)

  const nodes: OscillatorNode[] = []

  // 一组整数比的和声，避免拍频造成的刺耳感
  const freqs = [55, 82.5, 110.3, 164.8]
  freqs.forEach((f, i) => {
    const osc = ac.createOscillator()
    osc.type = i % 2 === 0 ? 'sine' : 'triangle'
    osc.frequency.value = f
    osc.detune.value = (i - 1.5) * 6
    const gain = ac.createGain()
    gain.gain.value = 0.2 / (i + 1)
    osc.connect(gain).connect(lowpass)
    osc.start()
    nodes.push(osc)
  })

  // 缓慢扫动，让声音「活着」
  const lfo = ac.createOscillator()
  lfo.frequency.value = 0.06
  const lfoDepth = ac.createGain()
  lfoDepth.gain.value = 260
  lfo.connect(lfoDepth).connect(lowpass.frequency)
  lfo.start()
  nodes.push(lfo)

  master.gain.linearRampToValueAtTime(0.085, ac.currentTime + 2.6)

  return () => {
    master.gain.cancelScheduledValues(ac.currentTime)
    master.gain.setValueAtTime(master.gain.value, ac.currentTime)
    master.gain.linearRampToValueAtTime(0, ac.currentTime + 0.7)
    window.setTimeout(() => {
      nodes.forEach((n) => {
        try {
          n.stop()
        } catch {
          /* 已经停过了 */
        }
      })
      void ac.close()
    }, 900)
  }
}

export default function AudioButton() {
  const audio = useThemeStore((s) => s.audio)
  const setAudio = useThemeStore((s) => s.setAudio)
  const stopRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (audio && !stopRef.current) {
      stopRef.current = startAmbient()
    } else if (!audio && stopRef.current) {
      stopRef.current()
      stopRef.current = null
    }
  }, [audio])

  useEffect(
    () => () => {
      stopRef.current?.()
      stopRef.current = null
    },
    [],
  )

  return (
    <div className="audiobtn">
      <button
        type="button"
        className={`ghostBtn${audio ? ' is-on' : ''}`}
        aria-pressed={audio}
        onClick={() => setAudio(!audio)}
      >
        <span className="audiobtn__bars" aria-hidden>
          <i />
          <i />
          <i />
          <i />
        </span>
        {audio ? 'Sound on' : 'Audio'}
      </button>
    </div>
  )
}
