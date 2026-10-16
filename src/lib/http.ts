/* ============================================================================
 *  http.ts —— 带超时 / 取消 / 错误归类的 JSON 请求
 * ----------------------------------------------------------------------------
 *  三个数据源都走这一层，好处是超时与取消语义统一：
 *      · 每个请求都有硬超时，接口抽风时界面不会永远转圈
 *      · 调用方传入的 AbortSignal 会透传下去，切换数据源时旧请求立刻作废
 *      · 主动取消（AbortError）与真失败（超时 / 4xx / 5xx）被区分开 ——
 *        前者不该弹错误提示，后者才该
 * ========================================================================== */

/** 默认单请求超时。Hacker News / GitHub 正常都在 1s 内返回 */
export const DEFAULT_TIMEOUT = 9000

export class HttpError extends Error {
  /** HTTP 状态码；0 表示没拿到响应（网络不可达 / 超时） */
  readonly status: number
  readonly url: string
  /** 响应体前若干字符，方便排查（比如 GitHub 的限流说明） */
  readonly detail: string

  constructor(message: string, status: number, url: string, detail = '') {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.url = url
    this.detail = detail
  }

  /** 值不值得重试：网络不通 / 限流 / 服务端错误 */
  get retryable(): boolean {
    return this.status === 0 || this.status === 429 || this.status >= 500
  }
}

export interface RequestOptions {
  /** 调用方的取消信号（切换数据源 / 组件卸载时 abort） */
  signal?: AbortSignal
  /** 本次请求的超时。默认 DEFAULT_TIMEOUT */
  timeoutMs?: number
  /** 额外请求头（Accept 已默认带上） */
  headers?: Record<string, string>
}

/** 调用方主动取消导致的错误（不该当成故障展示给用户） */
export function isAbortError(e: unknown): boolean {
  if (!e) return false
  if (typeof DOMException !== 'undefined' && e instanceof DOMException) {
    return e.name === 'AbortError'
  }
  return (e as { name?: string }).name === 'AbortError'
}

/**
 * GET 一个 Response（已做过状态码检查与错误归类），不做 JSON 解析。
 * 需要读响应头的调用方（比如 NASA 的 X-RateLimit-*）走这里。
 */
async function requestResponse(url: string, options: RequestOptions = {}): Promise<Response> {
  const { signal, timeoutMs = DEFAULT_TIMEOUT, headers } = options

  const ctrl = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    ctrl.abort()
  }, timeoutMs)

  const forwardAbort = () => ctrl.abort()
  signal?.addEventListener('abort', forwardAbort)

  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: ctrl.signal,
      headers: { Accept: 'application/json', ...headers },
      // 公开 JSON 接口，不做 HTTP 缓存层，缓存由 useFeed 自己管
      cache: 'no-store',
    })

    if (!res.ok) {
      let detail = ''
      try {
        detail = (await res.text()).slice(0, 240)
      } catch {
        /* 拿不到响应体就算了，状态码已经够用 */
      }
      throw new HttpError(`HTTP ${res.status} ${res.statusText || ''}`.trim(), res.status, url, detail)
    }

    return res
  } catch (e) {
    if (e instanceof HttpError) throw e
    // 调用方主动取消：原样抛出，交给上层忽略
    if (signal?.aborted && !timedOut) throw e
    if (isAbortError(e)) {
      throw new HttpError(
        timedOut ? `请求超时（${Math.round(timeoutMs / 1000)}s）` : '请求被中断',
        0,
        url,
      )
    }
    const msg = e instanceof Error ? e.message : String(e)
    throw new HttpError(`网络不可达：${msg}`, 0, url)
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', forwardAbort)
  }
}

/**
 * GET 一个 JSON。
 * 抛出的一定是 HttpError（网络层怪异错误会被包成 status=0）。
 */
export async function getJSON<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const res = await requestResponse(url, options)
  return (await res.json()) as T
}

/** 响应里能带回来的「接口侧元信息」 */
export interface JsonMeta {
  /** 接口自报的剩余额度（NASA 的 X-RateLimit-Remaining）。拿不到就是 null */
  rateRemaining: number | null
  /** 接口自报的额度上限（NASA 的 X-RateLimit-Limit） */
  rateLimit: number | null
}

/**
 * 取 JSON，并把响应头里的限流信息一起带回来。
 *
 * 为什么需要：NASA 的 DEMO_KEY 只有 10 次/小时，撞额度时
 * 界面必须能说清「是额度用完了」而不是笼统的「网络失败」，
 * 否则用户会误以为是站点坏了。
 *
 * 注意：浏览器只有在服务端显式 `Access-Control-Expose-Headers` 里
 * 列出这两个头时才能读到（NASA 有列），读不到就是 null，不影响取数。
 */
export async function getJSONWithMeta<T>(
  url: string,
  options: RequestOptions = {},
): Promise<{ json: T; meta: JsonMeta }> {
  const res = await requestResponse(url, options)
  const num = (name: string): number | null => {
    const raw = res.headers.get(name)
    if (raw == null) return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  }
  const json = (await res.json()) as T
  return {
    json,
    meta: {
      rateRemaining: num('X-RateLimit-Remaining'),
      rateLimit: num('X-RateLimit-Limit'),
    },
  }
}

/** 把任意异常转成一句人话，给界面上的错误态用 */
export function describeError(e: unknown): string {
  if (e instanceof HttpError) {
    if (e.status === 0) return e.message
    if (e.status === 403 || e.status === 429) return `被限流（HTTP ${e.status}）`
    if (e.status === 404) return '接口不存在（HTTP 404）'
    return e.message
  }
  return e instanceof Error ? e.message : String(e)
}
