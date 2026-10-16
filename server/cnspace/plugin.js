/* ============================================================================
 *  cnspace/plugin.js —— 把聚合器挂成 Vite 中间件
 * ----------------------------------------------------------------------------
 *  为什么用 Vite 插件而不是另起一个后端服务：
 *    这个站是「一个前端 + 一个 Vite 服务」的结构（线上跑的也是 Vite 服务）。
 *    挂中间件 = 前端仍然只请求同源 /cn-api/*，不跨域、不加端口、不改部署方式。
 *
 *  同时挂 dev（configureServer）和 preview（configurePreviewServer）：
 *    本地预览、线上服务两边都得有这条路由，否则换了模式就 404。
 *
 *  路由：
 *    GET /cn-api/feed            聚合内容（带缓存）
 *    GET /cn-api/feed?refresh=1  强制刷新（界面「重新加载」）
 *    GET /cn-api/health          诊断：每个来源/栏目/上次更新时间
 * ========================================================================== */

import { getFeed, getDiagnostics } from './store.js'

const sendJson = (res, code, body) => {
  const text = JSON.stringify(body)
  res.statusCode = code
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.end(text)
}

function middleware() {
  return async (req, res, next) => {
    const url = new URL(req.url || '/', 'http://localhost')
    if (!url.pathname.startsWith('/cn-api/')) return next()

    if (url.pathname === '/cn-api/health') {
      return sendJson(res, 200, { ok: true, ...getDiagnostics() })
    }

    if (url.pathname === '/cn-api/feed') {
      const force = url.searchParams.get('refresh') === '1'
      try {
        const { feed, fromCache, snapshot, refreshing } = await getFeed({ force })
        return sendJson(res, 200, {
          ok: true,
          fromCache,
          snapshot, // true = 用的是真实数据快照（实时抓取失败）
          refreshing,
          ...feed,
        })
      } catch (e) {
        // 连快照都没有 → 如实返回失败，前端按「数据源暂时无法连接」渲染
        return sendJson(res, 200, {
          ok: false,
          error: e?.message || String(e),
          items: [],
          sources: [],
          counts: { total: 0, bySource: {}, byCategory: {} },
        })
      }
    }

    return sendJson(res, 404, { ok: false, error: 'unknown cn-api route' })
  }
}

export function cnSpacePlugin() {
  const attach = (server) => {
    server.middlewares.use(middleware())
    // 预热：服务起来后台先抓一次，用户第一眼就能看到内容（不阻塞启动）
    setTimeout(() => {
      getFeed({ force: false }).catch((e) => {
        console.warn('[cnspace] 预热失败：' + (e?.message || e))
      })
    }, 1200)
  }
  return {
    name: 'cnspace-feed',
    configureServer: attach,
    configurePreviewServer: attach,
  }
}
