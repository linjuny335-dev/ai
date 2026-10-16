/* ============================================================================
 *  env.ts —— 环境变量与端点，全站唯一入口
 * ----------------------------------------------------------------------------
 *  规则：任何地方都不准直接写 import.meta.env，也不准把密钥硬编码进代码。
 *  要加密钥 → 在项目根目录的 .env.local 里加一行（见 .env.example）。
 *
 *  现状（三个数据源）：
 *      Hacker News    官方公开 API，无需任何 Key
 *      GitHub         官方公开 API，可匿名调用；填 Token 只是把
 *                     「搜索接口 10 次/分钟」提到「30 次/分钟」
 *      Hugging Face   官方公开 API，可匿名调用；Token 用于提高限流 / 访问受限模型
 *
 *  ⚠️ 安全提示：Vite 的 VITE_* 变量会被编译进前端 JS 包，任何人打开
 *     浏览器开发者工具都能看到。所以这里只放「看得见也无所谓」的只读令牌。
 *     若哪天要放真正敏感的服务端密钥，必须加一层后端代理转发，不要走前端。
 * ========================================================================== */

/** 读字符串型环境变量，顺手 trim；不是字符串就回落 */
function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '')
}

/* ------------------------------------------------------------ 静态资源 */

/**
 * 静态资源基路径（Vite 的 base，默认 '/'）。
 * public/ 下的文件（比如 PHOTON 的离线存档）都从它拼出来，
 * 免得在组件里到处写 import.meta.env。
 */
export const ASSET_BASE = readString(import.meta.env.BASE_URL, '/') || '/'

/* ------------------------------------------------------------ GitHub */

/** 可选。未填则匿名访问（搜索接口 10 次/分钟） */
export const GITHUB_TOKEN = readString(import.meta.env.VITE_GITHUB_TOKEN)
export const HAS_GITHUB_TOKEN = GITHUB_TOKEN.length > 0

/* ------------------------------------------------------ Hugging Face */

/** 可选。未填则匿名访问 */
export const HF_TOKEN = readString(import.meta.env.VITE_HF_TOKEN)
export const HAS_HF_TOKEN = HF_TOKEN.length > 0

/** 一个 HF 端点 = 取数地址 + 网页地址（链接要用） */
export interface HfEndpoint {
  /** 接口前缀，后面直接拼 /models /spaces */
  api: string
  /** 网页基址，用来拼模型详情页链接 */
  web: string
  /** 界面上显示的短名 */
  label: string
}

/** 同源镜像代理路径。dev / preview 由 vite.config.ts 反代到 hf-mirror.com */
const MIRROR_PROXY_PATH = '/hf-api'

function endpointOf(raw: string): HfEndpoint {
  const origin = stripTrailingSlash(raw)
  return { api: `${origin}/api`, web: origin, label: origin.replace(/^https?:\/\//, '') }
}

/**
 * HF 端点列表，按顺序尝试；首包会并发探测，谁先成功用谁（见 huggingface.ts）。
 *
 * 为什么第二个是「/hf-api」这种同源路径而不是直接写 hf-mirror.com：
 *   hf-mirror.com 的服务端**不给浏览器返回 CORS 头**
 *   （curl 带 Origin 能拿到 Access-Control-Allow-Origin，Chrome 里却是
 *    `No 'Access-Control-Allow-Origin' header is present`，实测确认）。
 *   所以纯前端直连镜像站必然失败，必须走同源反代：
 *       dev / preview   → vite.config.ts 里 server.proxy / preview.proxy 已配好
 *       生产静态托管     → 需要在你的网关上加一条 /hf-api → https://hf-mirror.com/api
 *
 * VITE_HF_ENDPOINT 留空即用下面这套默认值；填了则只认填的那个（自建代理/内网镜像）。
 */
const configuredHf = readString(import.meta.env.VITE_HF_ENDPOINT)

export const HF_ENDPOINTS: readonly HfEndpoint[] = configuredHf
  ? [endpointOf(configuredHf)]
  : [
      { api: 'https://huggingface.co/api', web: 'https://huggingface.co', label: 'huggingface.co' },
      { api: MIRROR_PROXY_PATH, web: 'https://hf-mirror.com', label: 'hf-mirror.com (proxy)' },
    ]

/** 生产环境要配的反代规则，出错时的提示文案里会用到 */
export const HF_PROXY_HINT = `${MIRROR_PROXY_PATH} → https://hf-mirror.com/api`

/* ------------------------------------------------------------------ NASA */

/**
 * NASA APOD（天文图片）**必须**带 api_key 参数，不带直接 403。
 *
 * ⚠️ 关键事实（踩过坑，别忘）：
 *      DEMO_KEY 是 NASA 的**公共演示 Key，全世界共用，只有 10 次/小时**。
 *      只要栏目是首屏默认项，它就会周期性地被刷空 → 页面变成一张失败卡。
 *      所以它只是「没配 Key 时也能拿到真数据」的兜底，**不是可以长期交付的默认值**。
 *
 * Key 的三个来源，优先级从高到低（见 nasaApiKey()）：
 *      ① 运行时填入    —— 页面上「填入自己的 Key」存进 localStorage，立即生效、不用重新构建
 *      ② 构建时注入    —— .env.local 里的 VITE_NASA_API_KEY，线上部署要在构建侧配
 *      ③ DEMO_KEY      —— 都没有时的公共演示 Key
 *
 * 申请免费（1000 次/小时、即刻生效）：https://api.nasa.gov/ → 填姓名邮箱 → 邮件里有 Key
 *
 * ⚠️ 安全边界：VITE_* 会被编译进前端 JS 包，任何人翻开 DevTools 都能看到。
 *      NASA 的只读 Key 无所谓，但真正敏感的服务端密钥绝不能走这条路。
 */

/** 构建时注入的 Key（可能为空） */
const ENV_NASA_KEY = readString(import.meta.env.VITE_NASA_API_KEY)

/** 运行时填进来的 Key 存在这里。只存用户自己填的，不涉及任何敏感信息 */
const RUNTIME_KEY_STORE = 'blueyard.nasa.key.v1'

export const NASA_SIGNUP_URL = 'https://api.nasa.gov/'
export const NASA_KEY_HINT = `${NASA_SIGNUP_URL} 可免费申请（1000 次/小时）`

/** 读 localStorage，禁用存储 / 隐私模式时静默返回 null */
function store(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/** 页面上填入的 Key（没填过就是空串） */
export function runtimeNasaKey(): string {
  const s = store()
  if (!s) return ''
  try {
    return readString(s.getItem(RUNTIME_KEY_STORE))
  } catch {
    return ''
  }
}

/**
 * 保存页面上填入的 Key。
 * 传空串等于清除。返回是否保存成功（存储被禁用时返回 false）。
 */
export function setRuntimeNasaKey(key: string): boolean {
  const s = store()
  if (!s) return false
  const v = readString(key)
  try {
    if (v) s.setItem(RUNTIME_KEY_STORE, v)
    else s.removeItem(RUNTIME_KEY_STORE)
    return true
  } catch {
    return false
  }
}

export function clearRuntimeNasaKey(): void {
  setRuntimeNasaKey('')
}

/** Key 是哪来的 —— 界面要如实说清楚现在用的是哪一把 */
export type NasaKeyOrigin = 'runtime' | 'env' | 'demo'

export function nasaKeyOrigin(): NasaKeyOrigin {
  if (runtimeNasaKey()) return 'runtime'
  if (ENV_NASA_KEY) return 'env'
  return 'demo'
}

/**
 * 当前实际使用的 Key。
 * ⚠️ 必须**在发请求那一刻**调用，不能像以前那样在模块加载时捕获成常量 ——
 *    否则用户在页面上填了 Key 之后，不刷新页面就不生效。
 */
export function nasaApiKey(): string {
  return runtimeNasaKey() || ENV_NASA_KEY || 'DEMO_KEY'
}

/** 是不是在用公共演示 Key（界面据此解释「为什么会被限流」） */
export function usingDemoKey(): boolean {
  return nasaKeyOrigin() === 'demo'
}

/** 一行短说明，给页脚用 */
export function nasaKeyNote(): string {
  const origin = nasaKeyOrigin()
  if (origin === 'runtime') return '自有 Key（页面上填入）'
  if (origin === 'env') return '自有 Key（构建时注入）'
  return `DEMO_KEY（公共演示 Key，10 次/小时；${NASA_KEY_HINT}）`
}
