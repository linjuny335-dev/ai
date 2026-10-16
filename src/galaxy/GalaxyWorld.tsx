/* ============================================================================
 *  GalaxyWorld —— 始终存在的「同一个宇宙」
 * ----------------------------------------------------------------------------
 *  §1  它挂在页面最底层（.galaxy-world: position: fixed; inset: 0; 100vw/100vh），
 *      从进入网站到离开，只挂载一次，绝不跟着某个 Scene 一起创建 / 销毁。
 *  §6  换区 = 两层 GalaxyLayer 重叠交叉溶解，各带独立的 scale / x / y。
 *  §5  穿梭时整个宇宙做一次「推进弧线」：scale 1 → 1.09 → 1（两端归零，不会漂）。
 *  §9  银河只走 5vw，前景 UI 走 30vw，速度差 ≈ 6:1，形成视差景深。
 *
 *  §16 三种转场模式（world.mode，见 worldState.ts）：
 *      slide —— 上面这一套：两层交叉溶解 + 侧移，用于章节之间平级移动。
 *      push  —— 从首页向前推进：**只留一层**，整组沿推进弧线强烈前冲（峰值约 1.34×），
 *               不侧移、不溶解。因为首页与 PHOTON 共用同一张底图，
 *               交叉溶解只会把两张一模一样的图错位叠起来（重影），反而像换图。
 *      pull  —— 从章节退回首页：同样是**只留一层 + 不侧移**，但整组沿同一条
 *               弧线**后退**（缩到 0.8 倍再落回 1），读起来是「离开这里，回到入口」。
 *
 *  children 里放的是星点 / 粒子（ParticleBackground）—— 它们同样属于这个世界，
 *  所以也被包在同一个推进组里，和银河底图同步位移。
 * ========================================================================== */

import { useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import GalaxyLayer from './GalaxyLayer'
import {
  AMPLITUDE,
  PULL,
  PUSH,
  galaxyA,
  galaxyB,
  smoothstep,
  travelArc,
  world,
} from './worldState'

export default function GalaxyWorld({ children }: { children?: ReactNode }) {
  const root = useRef<THREE.Group>(null)

  useFrame(() => {
    const g = root.current
    const mix = smoothstep(world.mix)
    const arc = travelArc(world.mix) // 0 → 1 → 0
    const d = world.dir
    const mode = world.mode
    /** 推进 / 退回都是「纵深」转场：单层、不侧移、不溶解。只有 slide 才做那些 */
    const deep = mode !== 'slide'
    const amp = mode === 'pull' ? PULL : PUSH
    /** 弧线乘号：前进是变大的，退回是变小的 */
    const sign = mode === 'pull' ? -1 : 1

    if (deep) {
      /* ---- push / pull：纵深转场 ------------------------------------
         只保留 A 这一层（就是当前这片银河），B 彻底不参与 ——
         首页与 PHOTON 用的是同一个纹理实例，叠两层只会重影。
         不侧移、不换区，整片银河沿弧线冲出去（或退回去）再落回原位。 */
      galaxyA.tex = world.from
      galaxyA.opacity = 1
      galaxyA.scale = 1 + amp.layerZoom * arc
      galaxyA.x = 0
      galaxyA.y = 0

      galaxyB.tex = world.to
      galaxyB.opacity = 0
      galaxyB.scale = 1
      galaxyB.x = 0
      galaxyB.y = 0
    } else {
      // ---- slide：两个银河层的相对运动 --------------------------------
      // A：当前区域。一边被 B 盖住，一边继续向后 / 向外退，像是被抛在身后。
      galaxyA.tex = world.from
      galaxyA.opacity = 1
      galaxyA.scale = 1 + 0.08 * mix
      galaxyA.x = -d * AMPLITUDE.galaxyVw * mix
      galaxyA.y = -d * AMPLITUDE.galaxyVh * mix

      // B：目标区域。从侧后方以 1.04 的倍率推入，最终正好落在 scale 1 / x 0。
      galaxyB.tex = world.to
      galaxyB.opacity = world.mix
      galaxyB.scale = 1.04 - 0.04 * mix
      galaxyB.x = d * AMPLITUDE.galaxyVw * (1 - mix)
      galaxyB.y = d * AMPLITUDE.galaxyVh * (1 - mix)
    }

    // ---- 整个宇宙的纵深弧线（镜头感） ----------------------------------
    if (g) {
      g.scale.setScalar(
        deep ? 1 + sign * amp.arcScale * arc : 1 + AMPLITUDE.pushScale * arc,
      )
      g.position.x = deep ? 0 : -d * AMPLITUDE.galaxyVw * 0.35 * arc
      g.rotation.z = deep ? 0 : d * 0.006 * arc
    }
  })

  return (
    <group ref={root}>
      <GalaxyLayer channel={galaxyA} order={-1002} />
      <GalaxyLayer channel={galaxyB} order={-1001} />
      {children}
    </group>
  )
}
