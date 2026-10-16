import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { cnSpacePlugin } from './server/cnspace/plugin.js'

/* ============================================================================
 *  中国航天内容聚合（服务端）
 * ----------------------------------------------------------------------------
 *  国家航天局 / 中国载人航天 / 国家天文台 / 中国航天科技集团 四个官网
 *  **都没有 API、也没有 RSS**，只能取公开页面自己解析。
 *  浏览器直接抓会被 CORS 拦，所以统一走这里的同源接口 /cn-api/*：
 *      GET /cn-api/feed            聚合内容（1 小时缓存，逐个来源容错）
 *      GET /cn-api/health          诊断（每个来源/栏目/上次更新时间）
 *  实现见 server/cnspace/（纯 Node，零依赖）。
 * ========================================================================== */

/* ============================================================================
 *  Hugging Face 镜像反代
 * ----------------------------------------------------------------------------
 *  hf-mirror.com 的服务端不给浏览器返回 CORS 头（实测：curl 带 Origin 能拿到
 *  Access-Control-Allow-Origin，Chrome 里却被 CORS 拦下），所以前端**不能**
 *  直接跨域请求它，必须走同源代理。
 *
 *  这里把 /hf-api/** 反代到 https://hf-mirror.com/api/**，
 *  前端只请求 /hf-api/models?… ，浏览器看到的是同源请求，不触发 CORS。
 *
 *  为什么这不是「开发环境的权宜之计」：huggingface.co 在中国大陆常常直连不通，
 *  而这个项目是静态部署。所以：
 *      npm run dev / preview  → 本文件已配好，开箱能用
 *      生产静态托管            → 需要在网关 / CDN 上加一条同样的规则：
 *                                /hf-api/*  →  https://hf-mirror.com/api/*
 *  规则没配时前端会拿到一个 200 的 HTML，JSON 解析失败 → 正常回落到错误态，
 *  不会白屏。错误信息里也会直接提示要加这条规则（见 src/lib/env.ts 的 HF_PROXY_HINT）。
 * ========================================================================== */
const HF_MIRROR = 'https://hf-mirror.com'

const hfProxy = {
  '/hf-api': {
    target: HF_MIRROR,
    changeOrigin: true,
    // hf-mirror 的真实接口在 /api 下，这里把前缀换回去
    rewrite: (p: string) => p.replace(/^\/hf-api/, '/api'),
    // 镜像站首包偶尔慢（要回源上游），给足时间
    timeout: 20000,
    proxyTimeout: 20000,
  },
}

/* ============================================================================
 *  端口 / 监听地址
 * ----------------------------------------------------------------------------
 *  云平台把公网端口通过 PORT 环境变量注入，并要求服务绑 0.0.0.0。
 *  本地跑（没有 PORT）时沿用原来的 5183(dev) / 4173(preview)，行为不变。
 *
 *  allowedHosts: true —— 线上是通过反代域名访问的，Vite 的 Host 校验会拦下来
 *  并报 "Blocked request. This host is not allowed."，这里显式放开。
 * ========================================================================== */
const envPort = Number(process.env.PORT) || 0
const DEV_PORT = envPort || 5183
const PREVIEW_PORT = envPort || 4173

export default defineConfig({
  plugins: [react(), cnSpacePlugin()],
  server: {
    host: '0.0.0.0',
    port: DEV_PORT,
    allowedHosts: true,
    proxy: hfProxy,
  },
  preview: {
    host: '0.0.0.0',
    port: PREVIEW_PORT,
    allowedHosts: true,
    proxy: hfProxy,
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1800,
  },
})
