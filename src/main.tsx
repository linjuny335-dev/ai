import { createRoot } from 'react-dom/client'
import * as THREE from 'three'
import App from './App'
import './styles.css'
// 液态玻璃（UI 组件层）与 TECH 场景（终端布局）单独成文件，互不相干。
// 各栏目自己的样式（photon.css / foundry.css / home.css）由各自的场景组件 import。
import './ui/glass/glass.css'
import './tech/tech.css'

/* ----------------------------------------------------------------------------
 * 关闭 three 的色彩管理。
 *
 * 本项目全程使用「sRGB 直通」：自写的 ShaderMaterial 直接把值写进缓冲区，
 * 不做线性空间转换。如果保持色彩管理开启，THREE.Color('#8a7bff') 会被当成
 * 线性值处理，颜色会明显偏暗偏灰；底图照片也会被二次伽马。
 * 我们全部使用无光照材质（Basic / Shader），所以关掉它没有任何副作用。
 * -------------------------------------------------------------------------- */
THREE.ColorManagement.enabled = false

/* 不使用 StrictMode：WebGL 上下文与 AudioContext 在开发环境的双挂载下
   会重复初始化，得不偿失。 */
createRoot(document.getElementById('root')!).render(<App />)
