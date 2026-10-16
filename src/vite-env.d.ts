/// <reference types="vite/client" />

/**
 * 自定义环境变量。
 * 统一在 src/lib/env.ts 里读取，业务代码不要直接访问 import.meta.env。
 * 填法见项目根目录的 .env.example。
 */
interface ImportMetaEnv {
  /** 可选：GitHub 只读 token，提升搜索接口限流（10 → 30 次/分钟） */
  readonly VITE_GITHUB_TOKEN?: string
  /** 可选：Hugging Face token，提升限流 / 访问受限模型 */
  readonly VITE_HF_TOKEN?: string
  /** 可选：钉死 Hugging Face 端点。留空 = 自动回退镜像 */
  readonly VITE_HF_ENDPOINT?: string
  /**
   * 可选：NASA API Key（PHOTON 用的 APOD 接口）。
   * 不填则退化为官方公共演示 Key「DEMO_KEY」，每小时只有 10 次额度。
   * 免费申请：https://api.nasa.gov/
   */
  readonly VITE_NASA_API_KEY?: string
}
