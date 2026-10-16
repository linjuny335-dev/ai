/* ============================================================================
 *  底图纹理加载（Backdrop 与 NebulaField 共用）
 * ----------------------------------------------------------------------------
 *  三张银河照片放在 public/textures/ 下，按 THEMES 去重后统一加载，
 *  返回「纹理路径 → 数组下标」的映射，供转场时按索引取用。
 * ========================================================================== */

import { useMemo } from 'react'
import { useLoader } from '@react-three/fiber'
import * as THREE from 'three'
import { THEMES } from '../config/themes'

export interface BackdropTextures {
  textures: THREE.Texture[]
  /** 主题下标 → textures 数组下标 */
  indexOfTheme: number[]
}

export function useBackdropTextures(): BackdropTextures {
  const paths = useMemo(
    () => Array.from(new Set(THEMES.map((t) => t.palette.backdrop.src))),
    [],
  )

  const loaded = useLoader(THREE.TextureLoader, paths)

  return useMemo(() => {
    const pos = new Map<string, number>()
    paths.forEach((p, i) => pos.set(p, i))
    return {
      textures: loaded,
      indexOfTheme: THEMES.map((t) => pos.get(t.palette.backdrop.src) ?? 0),
    }
  }, [paths, loaded])
}
