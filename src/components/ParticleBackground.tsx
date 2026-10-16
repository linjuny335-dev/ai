/* ============================================================================
 *  ParticleBackground —— 背景层的唯一入口（只有 20 行，是刻意的）
 * ----------------------------------------------------------------------------
 *  ▸ 这个文件是「隔离层」。它只做两件事：查注册表、把 spec 递进去。
 *  ▸ 因此你可以放心替换背景，而完全不碰 Scene / 几何体 / UI / 状态管理。
 *
 *  三种换法，按改动量从小到大：
 *
 *  A. 换样式（最常见）
 *     改 src/config/particleDefaults.ts 里的数值，或改某个主题的 particle 覆盖项。
 *     例：把 arms 从 4 改成 7，旋臂立刻从四条变七条。
 *
 *  B. 换实现（换一整套粒子算法）
 *     新建 src/backgrounds/MyField.tsx，签名 (props: { spec: ParticleSpec }) => JSX，
 *     到 src/backgrounds/index.ts 注册一个 id，再到 themes.ts 里改 background。
 *
 *  C. 彻底不要粒子（要视频 / 贴图 / 纯 CSS 背景）
 *     把下面 <Impl /> 换成你自己的组件，或者直接在 Scene.tsx 里不渲染本组件。
 *     注意背景层必须自己处理配色：用 useLiveTheme() 拿当前主题色。
 * ========================================================================== */

import { BACKGROUNDS, DEFAULT_BACKGROUND } from '../backgrounds'
import type { ParticleSpec } from '../config/particleDefaults'

export interface ParticleBackgroundProps {
  /** 背景实现 id，来自主题配置的 theme.background */
  backgroundId: string
  /** 已经和 PARTICLE_DEFAULTS 合并过的完整参数 */
  spec: ParticleSpec
}

export default function ParticleBackground({ backgroundId, spec }: ParticleBackgroundProps) {
  const Impl = BACKGROUNDS[backgroundId] ?? BACKGROUNDS[DEFAULT_BACKGROUND]
  return <Impl spec={spec} />
}
