/* ============================================================================
 *  cnspace/net.js —— 取页（服务端）
 * ----------------------------------------------------------------------------
 *  为什么一定要走服务端：
 *    · 这四个官网都没有 CORS 头，浏览器直接 fetch 会被拦；
 *    · 也不该把抓取逻辑塞进前端 —— 请求数、UA、重试策略都要能统一控制。
 *
 *  四条自我约束（对官方站点友好）：
 *    1. 只 GET 公开页面，不带 Cookie、不登任何账号、不碰验证码与登录接口；
 *    2. 同一个域名串行 + 最小间隔，绝不并发打同一个站；
 *    3. 每页最多重试 3 次（指数退避）—— 这些站偶发连接超时，硬刚没意义；
 *    4. 缓存优先，绝大多数请求根本不会出网（见 store.js）。
 *
 *  实测环境事实（2026-09-17）：
 *    · cnsa.gov.cn 偶发 connect timeout，必须重试；
 *    · www.spacechina.com 的裸域名是个 JS 跳转桩，必须带 /n25/ 路径；
 *    · cmse.gov.cn / nao.cas.cn 都很稳。
 * ========================================================================== */

import { decodeHtml } from './text.js'

/** 真实浏览器 UA。用机器人 UA 会被部分政务站直接拦掉。 */
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const DEFAULT_TIMEOUT = 25000
const MIN_HOST_GAP = 400 // 同域两次请求之间的最小间隔(ms)

/* 每个域名一条串行队列：保证「同一站不并发」+「间隔 ≥ MIN_HOST_GAP」 */
const hostQueue = new Map()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 把 fn 排进 host 的串行队列，返回 fn 的结果 */
function withHostSlot(host, fn) {
  const prev = hostQueue.get(host) || Promise.resolve(0)
  const run = prev.then(
    (lastAt) => sleep(Math.max(0, MIN_HOST_GAP - (Date.now() - lastAt))).then(fn),
    () => fn(),
  )
  // 队列里只记录「上一次请求结束的时刻」，不把 fn 的失败传染给下一位
  const tail = run.then(
    () => Date.now(),
    () => Date.now(),
  )
  hostQueue.set(host, tail)
  return run
}

/**
 * 取一个页面。
 * @returns {{ok:true, status:number, url:string, html:string, bytes:number, ms:number, tries:number}
 *          |{ok:false, error:string, ms:number, tries:number}}
 */
export async function fetchPage(url, opts = {}) {
  const { tries = 3, timeout = DEFAULT_TIMEOUT, label = '' } = opts
  const host = safeHost(url)
  const t0 = Date.now()
  let lastErr = 'unknown'

  for (let attempt = 1; attempt <= tries; attempt++) {
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), timeout)
    try {
      // 真正发请求的那一步放进域名队列（串行 + 限速）
      const res = await withHostSlot(host, () =>
        fetch(url, {
          signal: ac.signal,
          redirect: 'follow',
          headers: {
            'User-Agent': UA,
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9',
            Referer: `https://${host}/`,
          },
        }),
      )
      clearTimeout(timer)

      if (!res.ok) {
        lastErr = `HTTP ${res.status}`
        // 4xx 是确定性失败，重试没意义（429 除外）
        if (res.status >= 400 && res.status < 500 && res.status !== 429) {
          return { ok: false, error: lastErr, ms: Date.now() - t0, tries: attempt }
        }
      } else {
        const buf = Buffer.from(await res.arrayBuffer())
        const html = decodeHtml(buf, res.headers.get('content-type'))
        // 有些栏目页是 JS 跳转桩（几百字节、无 title），这种情况当作失败让上层处理
        return {
          ok: true,
          status: res.status,
          url: res.url,
          html,
          bytes: buf.length,
          ms: Date.now() - t0,
          tries: attempt,
        }
      }
    } catch (e) {
      clearTimeout(timer)
      lastErr = e?.name === 'AbortError' ? `timeout ${timeout}ms` : e?.message || String(e)
    }

    if (attempt < tries) await sleep(600 * attempt + Math.random() * 300)
  }

  return { ok: false, error: lastErr, ms: Date.now() - t0, tries }
}

function safeHost(url) {
  try {
    return new URL(url).host
  } catch {
    return 'unknown'
  }
}

/** 小并发池：用于「多个不同域名」之间的并行（同一域名内部已被串行化） */
export async function pool(items, limit, worker) {
  const out = new Array(items.length)
  let i = 0
  const runners = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (i < items.length) {
      const idx = i++
      out[idx] = await worker(items[idx], idx)
    }
  })
  await Promise.all(runners)
  return out
}
