/* ============================================================================
 *  NebulaField —— 默认的星系粒子背景
 * ----------------------------------------------------------------------------
 *  ▸ 完全独立：不 import 任何主题 / 几何体 / UI 代码，只接收 spec。
 *  ▸ 一次分配 12 万粒子的缓冲区，靠 uniform 控制实际显示数量，
 *    所以切换主题时粒子不会瞬移、不会重建。
 *  ▸ 想换成别的背景？见 src/backgrounds/index.ts 的说明。
 * ========================================================================== */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useLiveTheme } from '../scene/LiveTheme'
import { pointer } from '../scene/pointer'
import { gestureParticle } from '../scene/gestureParticle'
import { useBackdropTextures } from '../scene/useBackdropTextures'
import { HAZE_FRAG, HAZE_VERT, STAR_FRAG, STAR_VERT } from './shaders'
import { MAX_HAZE, MAX_STARS, type BackgroundComponentProps } from './types'
import { clampDt } from '../scene/timing'
import type { ParticleSpec } from '../config/particleDefaults'

/* ------------------------------------------------------------------ 缓冲区 */

/** 位置全部在着色器里算，这里只准备随机种子。
 *  只建一次（依赖为空），换背景样式不要动它。 */
function buildGeometry(count: number, spread: number) {
  const position = new Float32Array(count * 3)
  const seed = new Float32Array(count * 3)
  const scale = new Float32Array(count)
  const index = new Float32Array(count)

  for (let i = 0; i < count; i++) {
    seed[i * 3 + 0] = Math.random()
    seed[i * 3 + 1] = Math.random()
    seed[i * 3 + 2] = Math.random()

    const r = Math.random()
    scale[i] = r > 0.985 ? 1.5 + Math.random() * 1.7 : 0.45 + Math.random() * 0.7

    // 加一点抖动，让「密度淡出」的边界不是一条整齐的线
    index[i] = i + Math.random() * 0.9
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(position, 3))
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3))
  geo.setAttribute('aScale', new THREE.BufferAttribute(scale, 1))
  geo.setAttribute('aIndex', new THREE.BufferAttribute(index, 1))
  // 手动给包围球，避免因为 position 全零而被错误剔除
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), spread)
  return geo
}

/* ------------------------------------------------------------------ 材质 */

function makeStarMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: STAR_VERT,
    fragmentShader: STAR_FRAG,
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: 1 },
      uSize: { value: 26 },
      uRadius: { value: 7.4 },
      uThickness: { value: 1.35 },
      uArms: { value: 4 },
      uSwirl: { value: 1.15 },
      uSpin: { value: 0.055 },
      uDrift: { value: 0.9 },
      uRise: { value: 0.55 },
      uBrightness: { value: 1.05 },
      uPhotoMix: { value: 0.5 },
      uParallax: { value: 0.42 },
      uPulse: { value: 0 },
      uActive: { value: MAX_STARS },
      uSpread: { value: 0 },
      uBig: { value: 0.03 },
      uTexMix: { value: 1 },
      uTilt: { value: new THREE.Vector2(0.56, 0) },
      uMouse: { value: new THREE.Vector2(0, 0) },
      uColorCore: { value: new THREE.Color('#ffffff') },
      uColorMid: { value: new THREE.Color('#8888ff') },
      uColorEdge: { value: new THREE.Color('#333377') },
      uTexA: { value: null },
      uTexB: { value: null },
    },
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  })
}

function makeHazeMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: HAZE_VERT,
    fragmentShader: HAZE_FRAG,
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: 1 },
      uSize: { value: 22 },
      uRadius: { value: 7.4 },
      uThickness: { value: 1.35 },
      uPhotoMix: { value: 0.5 },
      uParallax: { value: 0.42 },
      uPulse: { value: 0 },
      uActive: { value: MAX_HAZE },
      uSpread: { value: 0 },
      uTexMix: { value: 1 },
      uTilt: { value: new THREE.Vector2(0.56, 0) },
      uMouse: { value: new THREE.Vector2(0, 0) },
      uColorMid: { value: new THREE.Color('#8888ff') },
      uColorEdge: { value: new THREE.Color('#333377') },
      uTexA: { value: null },
      uTexB: { value: null },
    },
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  })
}

/** 会平滑过渡的参数：换区时这些数值逐帧逼近目标，避免「跳一下」 */
const LERP_KEYS = [
  'radius',
  'thickness',
  'arms',
  'swirl',
  'spin',
  'drift',
  'rise',
  'pointSize',
  'brightness',
  'photoMix',
  'parallax',
  'bigStarChance',
  'tilt',
  'hazeSize',
] as const

type LerpKey = (typeof LERP_KEYS)[number]
type LerpValues = Record<LerpKey, number>

const pickLerp = (s: ParticleSpec): LerpValues => ({
  radius: s.radius,
  thickness: s.thickness,
  arms: s.arms,
  swirl: s.swirl,
  spin: s.spin,
  drift: s.drift,
  rise: s.rise,
  pointSize: s.pointSize,
  brightness: s.brightness,
  photoMix: s.photoMix,
  parallax: s.parallax,
  bigStarChance: s.bigStarChance,
  tilt: s.tilt,
  hazeSize: s.hazeSize,
})

/** spec 变化时把「静态」参数写进 uniform（每帧变的那几个在 useFrame 里写） */
function applySpec(mat: THREE.ShaderMaterial, v: LerpValues, isHaze: boolean) {
  const u = mat.uniforms
  if (isHaze) {
    u.uSize.value = v.hazeSize
    u.uRadius.value = v.radius
    u.uThickness.value = v.thickness
    u.uPhotoMix.value = v.photoMix
    u.uParallax.value = v.parallax
    return
  }
  u.uSize.value = v.pointSize
  u.uRadius.value = v.radius
  u.uThickness.value = v.thickness
  u.uArms.value = v.arms
  u.uSwirl.value = v.swirl
  u.uSpin.value = v.spin
  u.uDrift.value = v.drift
  u.uRise.value = v.rise
  u.uBrightness.value = v.brightness
  u.uPhotoMix.value = v.photoMix
  u.uParallax.value = v.parallax
  u.uBig.value = v.bigStarChance
}

/**
 * 手势「解体/聚拢」在这一层的显示惯性时间常数（秒）。
 * 手势内核已经按方向做过不对称低通（张开 0.26s / 握拳 0.18s），
 * 这里再叠一道短的 —— 用户要的「有速度、有惯性，绝不能突然炸开」就是两道叠出来的。
 * 放在这里而不是 tuning.ts：它是**背景层的显示惯性**，不是手势阈值，
 * 而且这样 NebulaField 不用反向 import UI 层的代码。
 */
const SPREAD_DISPLAY_TAU = 0.09

/* ------------------------------------------------------------------ 组件 */

export default function NebulaField({ spec }: BackgroundComponentProps) {
  const live = useLiveTheme()
  const { textures, indexOfTheme } = useBackdropTextures()

  const starGeo = useMemo(() => buildGeometry(MAX_STARS, 60), [])
  const hazeGeo = useMemo(() => buildGeometry(MAX_HAZE, 70), [])
  const starMat = useMemo(makeStarMaterial, [])
  const hazeMat = useMemo(makeHazeMaterial, [])

  // 释放 GPU 资源
  useEffect(
    () => () => {
      starGeo.dispose()
      hazeGeo.dispose()
      starMat.dispose()
      hazeMat.dispose()
    },
    [starGeo, hazeGeo, starMat, hazeMat],
  )

  const specRef = useRef(spec)
  const activeStar = useRef(spec.count)
  const activeHaze = useRef(spec.hazeCount)
  /** 平滑中的参数副本：换区时逐帧逼近新 spec，粒子密度 / 旋臂 / 尺寸都不会突然跳变 */
  const cur = useRef<LerpValues>(pickLerp(spec))
  /** 银河解体量的显示值（在桥给的意图上再平滑一道，见 SPREAD_DISPLAY_TAU） */
  const spreadCur = useRef(0)

  /* ---- 探针（给验收脚本用，和 __meteor / __gesture 同一套做法） -------- */
  useEffect(() => {
    const w = window as unknown as {
      __nebula?: { spread: () => number; intent: () => number }
    }
    w.__nebula = {
      /** 粒子层这一帧真正写进 uSpread 的值（已经过两道平滑） */
      spread: () => spreadCur.current,
      /** 手势内核给的原始意图（未平滑）——和它对不上就说明链路断了 */
      intent: () => gestureParticle.spread,
    }
    return () => {
      delete w.__nebula
    }
  }, [])

  useEffect(() => {
    specRef.current = spec
  }, [spec])

  useFrame((state, delta) => {
    const dt = clampDt(delta)
    const t = state.clock.elapsedTime
    const p = specRef.current
    const L = live.current
    const dpr = state.gl.getPixelRatio()

    // 密度平滑过渡：直接改 uActive，粒子逐颗溶解/浮现
    const k = 1 - Math.exp(-2.2 * dt)
    activeStar.current += (p.count - activeStar.current) * k
    activeHaze.current += (p.hazeCount - activeHaze.current) * k

    // 参数平滑过渡：换区时逐帧逼近新区域的参数，不会「跳」一下
    const kp = 1 - Math.exp(-2.6 * dt)
    const c = cur.current
    const tg = p
    c.radius += (tg.radius - c.radius) * kp
    c.thickness += (tg.thickness - c.thickness) * kp
    c.arms += (tg.arms - c.arms) * kp
    c.swirl += (tg.swirl - c.swirl) * kp
    c.spin += (tg.spin - c.spin) * kp
    c.drift += (tg.drift - c.drift) * kp
    c.rise += (tg.rise - c.rise) * kp
    c.pointSize += (tg.pointSize - c.pointSize) * kp
    c.brightness += (tg.brightness - c.brightness) * kp
    c.photoMix += (tg.photoMix - c.photoMix) * kp
    c.parallax += (tg.parallax - c.parallax) * kp
    c.bigStarChance += (tg.bigStarChance - c.bigStarChance) * kp
    c.tilt += (tg.tilt - c.tilt) * kp
    c.hazeSize += (tg.hazeSize - c.hazeSize) * kp
    applySpec(starMat, c, false)
    applySpec(hazeMat, c, true)

    // 极慢的「点头」，让盘面永远在轻微晃动
    const tiltX = c.tilt + Math.sin(t * 0.08) * 0.05
    const tiltY = Math.sin(t * 0.05) * 0.03

    // 手势「张开手掌 → 银河解体散开 / 握拳 → 聚拢回原样」。
    // 桥里放的是内核给的意图（0..1，已按方向低通）；这里再平滑一道就是用户要的「惯性」，
    // 所以散和收都不会是「啪」的一下，而是像星尘真的被甩出去 / 被吸回来。
    const kg = 1 - Math.exp(-dt / SPREAD_DISPLAY_TAU)
    spreadCur.current += (gestureParticle.spread - spreadCur.current) * kg

    const texA = textures[indexOfTheme[L.texFrom]] ?? null
    const texB = textures[indexOfTheme[L.texTo]] ?? null

    const su = starMat.uniforms
    su.uTime.value = t
    su.uPixelRatio.value = dpr
    su.uActive.value = activeStar.current
    su.uSpread.value = spreadCur.current
    su.uTilt.value.set(tiltX, tiltY)
    su.uMouse.value.set(pointer.x, pointer.y)
    su.uTexMix.value = L.mix
    su.uPulse.value = L.pulse
    su.uTexA.value = texA
    su.uTexB.value = texB
    su.uColorCore.value.copy(L.core)
    su.uColorMid.value.copy(L.mid)
    su.uColorEdge.value.copy(L.edge)

    const hu = hazeMat.uniforms
    hu.uTime.value = t
    hu.uPixelRatio.value = dpr
    hu.uActive.value = activeHaze.current
    hu.uTilt.value.set(tiltX, tiltY)
    hu.uMouse.value.set(pointer.x, pointer.y)
    hu.uTexMix.value = L.mix
    hu.uPulse.value = L.pulse
    hu.uSpread.value = spreadCur.current
    hu.uTexA.value = texA
    hu.uTexB.value = texB
    hu.uColorMid.value.copy(L.mid)
    hu.uColorEdge.value.copy(L.edge)
  })

  return (
    <group>
      {/* 雾霭层：大面积柔和星云，先画 */}
      <points
        geometry={hazeGeo}
        material={hazeMat}
        frustumCulled={false}
        renderOrder={-6}
      />
      {/* 星点层：主体 */}
      <points
        geometry={starGeo}
        material={starMat}
        frustumCulled={false}
        renderOrder={-5}
      />
    </group>
  )
}
