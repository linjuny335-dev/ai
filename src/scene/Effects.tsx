/* ============================================================================
 *  Effects —— Bloom 发光后期
 * ----------------------------------------------------------------------------
 *  粒子 / 线框都用加法混合画亮色，配合 Bloom 就会出现「发光」质感。
 *  luminanceThreshold 决定多亮才开始溢出：调低 = 更多光晕，调高 = 更克制。
 *  主题切换瞬间会让 intensity 短暂冲高，形成一次「闪一下」的呼吸。
 * ========================================================================== */

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import type { BloomEffect } from 'postprocessing'
import { useLiveTheme } from './LiveTheme'

const BASE_INTENSITY = 0.85

export default function Effects() {
  const live = useLiveTheme()
  const bloom = useRef<BloomEffect>(null)

  useFrame(() => {
    if (!bloom.current) return
    // 转场脉冲期间提亮，结束后回到基准值
    bloom.current.intensity = BASE_INTENSITY + live.current.pulse * 0.5
  })

  return (
    <EffectComposer multisampling={0}>
      <Bloom
        ref={bloom}
        mipmapBlur
        intensity={BASE_INTENSITY}
        // 阈值调高：只有真正的高光（星核、亮线）才溢出，
        // 否则整张底图都会发亮，画面糊成一片。
        luminanceThreshold={0.62}
        luminanceSmoothing={0.26}
        radius={0.72}
      />
      <Vignette offset={0.32} darkness={0.6} />
    </EffectComposer>
  )
}
