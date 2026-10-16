/* ============================================================================
 *  手势控制 · 摄像头与识别（MediaPipe Hand Landmarker）
 * ----------------------------------------------------------------------------
 *  这一层只干三件事：开摄像头 → 跑手部关键点识别 → 把关键点交给内核。
 *  它**不做**任何判断（阈值全在内核里），也**不保存**任何画面。
 *
 *  ── 三个刻意的决定 ─────────────────────────────────────────────────────
 *  ① **模型与 WASM 全部本地化**（public/gesture/）。jsdelivr 在国内是不通的
 *     （实测 curl 直接 000），如果按官方示例让 FilesetResolver 去 CDN 拉，
 *     这个功能在用户这儿会 100% 打不开。所以 wasm 从 npm 包里拷出来、
 *     模型下载到本地，路径由 FilesetResolver 指向自己的站点。
 *  ② **先下载成 Blob 再喂给 MediaPipe**。因为直接在 createFromOptions 里传 URL 的话，
 *     那 ~19MB 是 MediaPipe 内部 fetch 的，外面拿不到任何进度，用户会盯着一个
 *     不动的「加载中」几十秒。自己 fetch 成 Blob、拿到字节级进度，再传 blob: URL
 *     （MediaPipe 接受任何 fetch 得动的 URL），就能显示真实百分比。
 *  ③ **懒加载**。`@mediapipe/tasks-vision` 是 `await import()` 进来的，
 *     页面初始化完全不碰它 —— 没点「开启手势控制」之前，这 ~19MB 一个字节都不下载。
 *
 *  ── 隐私 ───────────────────────────────────────────────────────────────
 *  视频流只进 <video> → MediaPipe 推理，不录制、不上传、不落盘。
 *  停止时 stop() 会停掉所有 track、关掉 landmarker、移除 <video>。
 * ========================================================================== */

import type { Landmark } from './gesture'

export type TrackerErrorKind =
  | 'insecure' // 非 https/localhost，浏览器根本不给摄像头
  | 'unsupported' // 浏览器没有 getUserMedia
  | 'denied' // 用户拒绝
  | 'nocamera' // 没有摄像头 / 被占用
  | 'asset' // 模型或 wasm 下载失败
  | 'engine' // MediaPipe 初始化失败
  | 'unknown'

export const TRACKER_ERROR_TEXT: Record<TrackerErrorKind, string> = {
  insecure: '需要 https 或 localhost 才能用摄像头',
  unsupported: '这个浏览器不支持摄像头访问',
  denied: '摄像头权限被拒绝 · 站点其它功能不受影响',
  nocamera: '找不到可用的摄像头（或被其它程序占用）',
  asset: '识别模型下载失败，请检查网络后重试',
  engine: '识别引擎初始化失败',
  unknown: '手势控制启动失败',
}

export interface TrackFrame {
  /** 21 个关键点；null = 这一帧没看到手 */
  lm: Landmark[] | null
  /** 距上一帧的毫秒数（真实测得，不是固定值） */
  dtMs: number
}

export interface Tracker {
  /** 每帧调一次；有**新的识别结果**时返回它，否则返回 null（渲染层自己按需重画） */
  poll(now: number): TrackFrame | null
  /** 停摄像头、释放引擎。可重复调用 */
  stop(): void
  /** 隐藏的视频元素（调用方负责挂到 DOM 上；不在 DOM 里也能推理，挂上是更稳的老做法） */
  readonly video: HTMLVideoElement
  /** 上一次推理耗时（ms）—— 用于诊断与自适应降频 */
  readonly lastInferMs: number
}

/* ---- 只声明我们真正用到的那几个口子，避免被第三方 d.ts 的复杂签名卡住 ----
   （tasks-vision 的完整类型很深，这里按需收窄，比 `as any` 更容易看懂意图） */
interface RawLandmark {
  x: number
  y: number
  z?: number
}
interface LandmarkerLike {
  detectForVideo: (
    video: HTMLVideoElement,
    timestampMs: number,
  ) => { landmarks?: RawLandmark[][] }
  close?: () => void
}
interface VisionModule {
  FilesetResolver: { isSimdSupported: () => Promise<boolean> }
  HandLandmarker: {
    createFromOptions: (
      fileset: { wasmLoaderPath: string; wasmBinaryPath: string },
      options: Record<string, unknown>,
    ) => Promise<LandmarkerLike>
  }
}

/** 两次推理之间的最小间隔（ms）≈ 33fps 上限，防止识别把主线程吃满 */
const MIN_INFER_MS = 24
/** 超过这么久没有任何新结果，就补一帧「没有手」，让光标能正常淡出 */
const STALE_MS = 200

const WASM_DIR = `${import.meta.env.BASE_URL}gesture/wasm`
const MODEL_URL = `${import.meta.env.BASE_URL}gesture/hand_landmarker.task`

export interface StartOptions {
  /** <video> 挂到哪里（可以是隐藏容器） */
  mount: HTMLElement
  /** 加载进度：0..1，total 未知时为 null */
  onProgress?: (ratio: number | null, label: string) => void
}

/** 带进度的下载（拿不到 content-length 时 ratio 传 null，界面显示不确定态） */
async function fetchBlob(
  url: string,
  onProgress: ((r: number | null) => void) | undefined,
): Promise<Blob> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
  const total = Number(res.headers.get('content-length') || 0)
  if (!res.body) {
    const b = await res.blob()
    onProgress?.(1)
    return b
  }
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      chunks.push(value)
      loaded += value.length
      onProgress?.(total > 0 ? Math.min(1, loaded / total) : null)
    }
  }
  onProgress?.(1)
  return new Blob(chunks as BlobPart[])
}

function classifyError(e: unknown): { kind: TrackerErrorKind; detail: string } {
  const err = e as { name?: string; message?: string }
  const name = err?.name || ''
  const msg = err?.message || String(e)
  if (name === 'NotAllowedError' || name === 'SecurityError') return { kind: 'denied', detail: msg }
  if (name === 'NotFoundError' || name === 'OverconstrainedError')
    return { kind: 'nocamera', detail: msg }
  if (name === 'NotReadableError') return { kind: 'nocamera', detail: msg }
  return { kind: 'unknown', detail: msg }
}

/**
 * 启动手势追踪。**必须在用户点击之后调用**（否则会被浏览器拦、也违背用户的要求）。
 * 抛出的错误带 `.gestureKind`，调用方据此显示中文原因。
 */
export async function startHandTracker(opts: StartOptions): Promise<Tracker> {
  const { mount, onProgress } = opts

  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    const e = new Error('no getUserMedia')
    ;(e as { gestureKind?: TrackerErrorKind }).gestureKind = 'unsupported'
    throw e
  }
  if (!window.isSecureContext) {
    const e = new Error('insecure context')
    ;(e as { gestureKind?: TrackerErrorKind }).gestureKind = 'insecure'
    throw e
  }

  /* ---- 1. 摄像头 ------------------------------------------------------- */
  onProgress?.(null, '正在等待摄像头授权…')
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 30, max: 60 },
      },
      audio: false,
    })
  } catch (e) {
    const { kind, detail } = classifyError(e)
    const err = new Error(detail)
    ;(err as { gestureKind?: TrackerErrorKind }).gestureKind = kind
    throw err
  }

  const video = document.createElement('video')
  video.autoplay = true
  video.playsInline = true
  video.muted = true
  video.setAttribute('aria-hidden', 'true')
  video.srcObject = stream
  mount.appendChild(video)

  try {
    await video.play()
  } catch {
    /* 某些浏览器 play() 会抛但画面照样在跑，忽略 */
  }
  if (video.readyState < 2) {
    await new Promise<void>((res) => {
      const done = () => res()
      video.addEventListener('loadeddata', done, { once: true })
      setTimeout(done, 4000)
    })
  }

  const cleanupStream = () => {
    for (const t of stream.getTracks()) t.stop()
    video.srcObject = null
    video.remove()
  }

  /* ---- 2. 引擎与模型（本地、带进度） ----------------------------------- */
  let landmarker: LandmarkerLike
  try {
    const vision = (await import('@mediapipe/tasks-vision')) as unknown as VisionModule

    onProgress?.(null, '正在加载识别引擎…')
    // 按浏览器是否支持 WASM SIMD 选文件（MediaPipe 内部也是这么选的）
    const simd = await vision.FilesetResolver.isSimdSupported()
    const stem = simd ? 'vision_wasm_internal' : 'vision_wasm_nosimd_internal'

    const wasmBlob = await fetchBlob(`${WASM_DIR}/${stem}.wasm`, (r) =>
      onProgress?.(r === null ? null : r * 0.6, '正在加载识别引擎…'),
    )
    const modelBlob = await fetchBlob(MODEL_URL, (r) =>
      onProgress?.(r === null ? null : 0.6 + r * 0.4, '正在加载手势模型…'),
    )

    /**
     * ⚠️ 这里**不用** `FilesetResolver.forVisionTasks()`：它只会拼出本地 URL，
     *    而我们需要把 wasm 换成已经下载好的 blob，才能拿到进度。
     *    自己拼这个 fileset 结构是等价的（源码里就这两个字段）。
     */
    const fileset = {
      wasmLoaderPath: `${WASM_DIR}/${stem}.js`,
      wasmBinaryPath: URL.createObjectURL(wasmBlob),
    }
    const modelUrl = URL.createObjectURL(modelBlob)

    const common = {
      runningMode: 'VIDEO',
      numHands: 1,
      minHandDetectionConfidence: 0.55,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    }
    try {
      // GPU 代理快很多，但个别机器不行 —— 失败就退回 CPU
      landmarker = await vision.HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: modelUrl, delegate: 'GPU' },
        ...common,
      })
    } catch {
      landmarker = await vision.HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: modelUrl, delegate: 'CPU' },
        ...common,
      })
    }
    onProgress?.(1, '就绪')
  } catch (e) {
    cleanupStream()
    const kind: TrackerErrorKind =
      (e as { gestureKind?: TrackerErrorKind }).gestureKind ??
      (/HTTP|fetch|NetworkError|Failed to fetch/i.test(String(e)) ? 'asset' : 'engine')
    const err = new Error(String((e as Error)?.message || e))
    ;(err as { gestureKind?: TrackerErrorKind }).gestureKind = kind
    throw err
  }

  /* ---- 3. poll：按最小间隔跑推理 --------------------------------------- */
  let stopped = false
  let lastInferAt = -1e9
  let lastEmitAt = -1e9
  let inferMs = 0
  let lastLm: Landmark[] | null = null

  const tracker: Tracker = {
    video,
    get lastInferMs() {
      return inferMs
    },
    poll(now: number): TrackFrame | null {
      if (stopped) return null

      // 引擎卡住时补一帧「没有手」，否则光标会一直停在原地不淡出
      if (now - lastEmitAt > STALE_MS) {
        lastEmitAt = now
        lastLm = null
        return { lm: null, dtMs: Math.min(STALE_MS, Math.max(MIN_INFER_MS, now - lastInferAt)) }
      }

      if (video.readyState < 2) return null
      if (now - lastInferAt < MIN_INFER_MS) return null

      const t0 = performance.now()
      let out: TrackFrame
      try {
        const res = landmarker.detectForVideo(video, t0)
        const hand = res?.landmarks?.[0]
        lastLm = hand && hand.length >= 21 ? hand.map((p) => ({ x: p.x, y: p.y, z: p.z })) : null
        out = { lm: lastLm, dtMs: Math.min(400, Math.max(1, now - lastInferAt)) }
      } catch {
        out = { lm: null, dtMs: Math.min(400, Math.max(1, now - lastInferAt)) }
      }
      inferMs = performance.now() - t0
      lastInferAt = now
      lastEmitAt = now
      return out
    },
    stop() {
      if (stopped) return
      stopped = true
      try {
        landmarker.close?.()
      } catch {
        /* 引擎已经自己关了 */
      }
      cleanupStream()
    },
  }

  return tracker
}
