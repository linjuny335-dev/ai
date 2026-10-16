# BLUEYARD — 交互式 WebGL 主题体验

基于 **React + Vite + React Three Fiber** 的沉浸式单页，内容是一条**天文科普线**：
先看见宇宙 → 再探索宇宙 → 再理解宇宙 → 再让青年参与 → 最后看最新航天动态。

| # | 栏目 | 讲什么 |
| --- | --- | --- |
| 01 | **Photon** 光 · 看见宇宙 | 光是我们唯一的信使：望远镜、镜面、传感器 |
| 02 | **Foundry** 器 · 探索宇宙 | 火箭与卫星：运载能力决定人能走多远 |
| 03 | **Cortex** 智 · 读懂宇宙 | 黑洞、引力波、暗物质：看不见的东西怎么被反推 |
| 04 | **Blueyard** 青年 · 参与宇宙 | 本月天象、观测入门、拍星星 |
| 05 | **Tech** 实时 · 航天动态 | 真实接口拉的航天新闻 / 开源项目 / 遥感模型 |

核心不是一个「会换背景的网页」，而是**一个连续的宇宙**：
全屏银河世界（GalaxyWorld）常驻在最底层永不重建，左侧轨道导航切换的是**同一个宇宙里的不同区域** ——
点击后当前信息节点被镜头甩到身后，画面进入一段只有星点粒子的银河空镜，
银河的颜色与区域在这段空镜里逐渐变化，然后新的信息节点从另一侧进入视野。
整条时间轴由 GSAP 统一驱动（约 1.9 秒：退出 → 空镜 → 换区 → 进入），详见第四节。

每个区域有独立的程序化 3D 几何体、文案与漂浮名字，最后统一走 Bloom 发光后期。
**五个栏目的配色、几何体、粒子参数在上一轮就已经定好，本轮只改了目录名与文案内容**，
视觉部分一行未动。

参考风格：BlueYard Capital 官网那类「宇宙粒子 + 滚动/切换叙事」的站。
底图用的是 `public/textures/` 下的银河照片（按主题去重后加载）。

---

## 快速开始

```bash
npm install
npm run dev        # http://127.0.0.1:5183
```

其它命令：

```bash
npm run build      # 类型检查 + 生产构建，产物在 dist/
npm run preview    # 预览构建产物，http://127.0.0.1:4173
npm run typecheck  # 只跑类型检查
```

### 操作

| 操作 | 效果 |
| --- | --- |
| 点左侧轨道节点 / 滚鼠标滚轮 / `←` `→` / 数字键 `1`–`5` | 切换到另一个银河区域（约 1.9 秒的镜头转场） |
| 顶部 `HOME / TECH / DISCOVER` | HOME = 第一个区域；TECH = 科技终端；DISCOVER = 全部状态面板 |
| 在 TECH 列表上滚 | 先滚列表；滚到头/底后再继续滚才切区域 |
| 鼠标移动 | 相机视差，画面轻微跟随 |
| 按住拖拽 | 探索视角，松手后缓慢回中 |
| 悬停 Logo / 玻璃卡片 | 发光高亮 / 玻璃朝鼠标倾斜 + 高光跟随 |
| 左上 `ALL` | 展开全部状态面板 |
| 右下 `AUDIO` | 开关实时合成的环境音（无音频文件） |
| 右上角 `开启手势控制` | 开启**摄像头手势控制**（点了才申请摄像头）：食指移动 = 星光标；捏合 = 点击；左右挥手 = 换区域；张开手掌 = 银河散开解体、握拳 = 聚拢回来。手机上不启用，鼠标操作全程照旧（见第十三节） |

---

## 目录结构

```
blueyard-r3f/
├── public/textures/              银河底图（5 张，其中 rose / amber 已无主题引用，留着备回退）
└── src/
    ├── config/
    │   ├── themes.ts             ⭐ 主题配置：配色 / 文案 / Logo / 几何体 / 背景
    │   └── particleDefaults.ts   ⭐ 粒子参数默认值
    ├── galaxy/                    ★ 转场系统（见第四节）
    │   ├── worldState.ts          唯一真源：时间轴常量 / 世界状态 / 层通道
    │   ├── GalaxyWorld.tsx        常驻宇宙（两层银河 + 推进弧线）
    │   └── GalaxyLayer.tsx        单层银河底图（可独立 scale / x / y / opacity）
    ├── components/
    │   ├── Scene.tsx              主 Canvas，定义渲染顺序
    │   ├── ParticleBackground.tsx ⭐ 背景层唯一入口（隔离层）
    │   ├── SceneContent.tsx       一个 Scene 的 DOM 内容
    │   ├── FixedNavigation.tsx    §10 永不动的顶部 / 左侧 UI
    │   └── CentralGeometry.tsx    按主题选几何体
    ├── backgrounds/
    │   ├── index.ts              ⭐ 背景注册表
    │   ├── NebulaField.tsx       默认粒子背景（GLSL 星系）
    │   ├── shaders.ts            所有着色器
    │   └── types.ts              背景接口契约
    ├── geometry/
    │   ├── index.ts              ⭐ 几何体注册表
    │   ├── SpiralOrbits.tsx      发光螺旋 / 轨道线
    │   ├── CubeNetwork.tsx       立方体网络（InstancedMesh）
    │   ├── WireBrain.tsx         线框大脑
    │   ├── HoloCore.tsx          全息球
    │   └── common.ts             材质同步工具
    ├── scene/
    │   ├── SceneManager.tsx      ★ 全站唯一的转场时间轴（GSAP）
    │   ├── LiveTheme.tsx         3D 层的实时状态（颜色插值 / 换区进度）
    │   ├── SceneGeometry.tsx     随 Scene 进出的 3D 前景
    │   ├── Effects.tsx           Bloom / Vignette
    │   ├── PointerRig.tsx        鼠标视差 + 拖拽
    │   ├── pointer.ts            指针状态（普通对象，不进 React state）
    │   ├── timing.ts             统一帧间隔上限
    │   ├── fade.tsx              前景不透明度上下文
    │   └── useBackdropTextures.ts
    ├── lib/                       ★ 外部数据层（与 UI 完全解耦）
    │   ├── env.ts                 ⭐ 环境变量与端点（API Key 只从这里读）
    │   ├── http.ts                带超时 / 取消 / 错误归类的 JSON 请求
    │   ├── format.ts              时间与大数格式化（三个源共用）
    │   ├── datetime.ts            日期 / 时刻 / 倒计时换算（PHOTON + FOUNDRY 共用）
    │   ├── useResource.ts         ⭐ 「单个资源」的通用状态机（loading/ready/error）
    │   ├── useImageReady.ts       图片预加载 + decode（换图不跳变）
    │   ├── apod.ts                ⭐ NASA APOD 适配器（PHOTON 的真实数据源）
    │   ├── apodArchive.ts         真实数据离线存档（接口不可用时的最后兜底）
    │   ├── launches.ts            ⭐ Launch Library 2 适配器（FOUNDRY 的真实数据源）
    │   ├── techTypes.ts           ⭐ 统一领域模型：TechItem / SourceDef / FeedDef
    │   ├── sources.ts             ⭐ 数据源注册表（HN + GitHub + Hugging Face）
    │   ├── useFeed.ts             ⭐ 通用状态机：缓存 / 取消 / 自动刷新
    │   ├── hn.ts                  HN Algolia 检索 API（航天新闻）→ TechItem
    │   ├── github.ts              GitHub 搜索 API（topic 限定）→ TechItem
    │   ├── huggingface.ts         Hugging Face API（遥感模型 / Spaces，search 限定）→ TechItem
    │   └── cnspace.ts             ⭐ 中国航天四源数据层（只请求同源 /cn-api/feed，见第十节）
    ├── home/                      ★ 首页入口层（entry 主题，与 PHOTON 共用底图）
    │   ├── HomeScene.tsx          场景主体：主标题 / 副文案 / 「开始探索」
    │   └── home.css               首页的布局与排版
    ├── photon/                    ★ PHOTON 板块（NASA APOD 真实天文图 / 视频观测台）
    │   ├── PhotonScene.tsx        场景主体：头部 / 存档标注 / 观测台 / 信息面板 / 页脚
    │   ├── useApodDay.ts          「当前看哪一天」状态机 + 三层取数降级
    │   ├── ApodStage.tsx          观测台：双层交叉淡入（换天不闪白、不硬切）
    │   ├── ApodMedia.tsx          图片 / 视频 / 兜底三种渲染
    │   ├── ApodLightbox.tsx       放大查看（高清图 hdurl）
    │   ├── ApodInfo.tsx           标题 / 日期 / 「了解它」展开 NASA 英文原文
    │   ├── DateTrack.tsx          日期轨道（← → / 节点 / 原生日期框 / 今天）
    │   ├── ApodKeyForm.tsx        在页面上填入自己的 NASA Key（存本地、免重新构建）
    │   └── photon.css             PHOTON 的布局与排版
    ├── foundry/                   ★ FOUNDRY 板块（Launch Library 2 真实发射任务）
    │   ├── FoundryScene.tsx       场景主体：头部 / 选中任务 / 时间轴 / 页脚
    │   ├── useLaunches.ts         批次 + 游标状态机（自动落到下一场未发射的）
    │   ├── LaunchTimeline.tsx     5 站时间轴（左右浏览整批真实任务）
    │   ├── LaunchCountdown.tsx    发射倒计时（每秒重算，精度不超出官方精度）
    │   ├── LaunchDetail.tsx       任务详情面板（液态玻璃，Esc / 点背景关闭）
    │   └── foundry.css            FOUNDRY 的布局与排版
    ├── tech/                      ★ TECH 板块（三源实时数据 + 液态玻璃终端）
    │   ├── TechScene.tsx          场景主体：数据源切换 / 列表 / 状态态
    │   ├── TechCard.tsx           统一个玻璃卡片（三个源共用一套布局）
    │   ├── SyncMeter.tsx          自动刷新倒计时（独立组件，避免整列表每秒重渲染）
    │   └── tech.css               TECH 的布局与排版（质感在 ui/glass）
    ├── ui/glass/                  ★ 液态玻璃公共组件
    │   ├── glass.css              五层玻璃质感 + 所有玻璃动画
    │   ├── GlassSurface.tsx       基底：指针高光 / 倾斜 / 上浮
    │   ├── GlassSegmented.tsx     滑动玻璃指示器（数据源 / 分类 / 顶部导航）
    │   ├── GlassButton.tsx        按压 + 折射波纹
    │   └── GlassTopNav.tsx        HOME / TECH / DISCOVER
    ├── cnspace/                   ★ 中国航天四源「数据台」（见第十节）
    │   ├── CnPanel.tsx            面板：来源标签 / 加载态 / 失败态 / 话题筛选 / 列表
    │   ├── CnCard.tsx             一条官方内容的玻璃卡片（展开简介 + 查看原文）
    │   ├── sources.ts             四个来源的展示元信息（简称 + 强调色，仅此而已）
    │   └── cnspace.css            数据台的布局与排版（质感同样来自 ui/glass）
    ├── store/useThemeStore.ts    场景 / 音频 / 面板状态（Zustand）
    ├── ui/                        Navigation · TopBar · BackHome · AudioButton · Loader
    │   ├── Navigation.tsx         左侧「银河轨道」导航
    │   ├── TopBar.tsx             左上角「All N」（**这里不要再加按钮**，见 4.7）
    │   ├── BackHome.tsx           右上角「← Entry 返回主页」（首页不渲染，见 4.7）
    │   ├── meteor/                ★ 鼠标流星拖尾（见第十二节）
    │   │   ├── meteor.ts          计算内核：纯函数 + 可脱离 DOM 逐帧推进的状态机
    │   │   ├── MeteorTrail.tsx    渲染层：1 个 Canvas 2D + rAF（按年龄分桶的三层折线）
    │   │   └── meteor.css         只有 z-index(8) 与 pointer-events:none，无视觉效果
    │   └── gesture/               ★ 摄像头手势控制（见第十三节）
    │       ├── gesture.ts         内核：判定 + 平滑，纯函数、能在 Node 里逐帧验算
    │       ├── handTracker.ts     摄像头 + MediaPipe（lazy import，点了开关才加载）
    │       ├── GestureControl.tsx 1 个 Canvas 2D + rAF + 点击合成；探针 window.__gesture
    │       └── gesture.css        只有 z-index(9) 与 pointer-events:none
server/cnspace/                    ★ 服务端聚合（纯 Node ESM，零依赖，见第十节）
    ├── plugin.js                  Vite 插件：把 /cn-api/* 挂成同源中间件
    ├── store.js                   聚合 / 缓存 / 降级 / 归一化
    ├── columns.js                 ⭐ 唯一真源：抓哪四个来源的哪几个栏目
    ├── parsers.js                 四套 CMS 模板的解析规则（每套都贴了真实 HTML 片段）
    ├── net.js                     抓取层：真实 UA + 重试 + 同域名串行 ≥400ms
    ├── text.js                    去标签 / 字符集 / 日期 / 话题标签 / 稳定 id
    ├── cli.js                     node server/cnspace/cli.js 手动跑一次（排障 / 出快照）
    ├── snapshot.json              **真抓到的**内容快照（实时抓取彻底失败时的兜底）
    └── detail-cache.json          详情页磁盘缓存（7 天，让二次刷新几乎零请求）
```

---

## 一、换背景（这是被重点隔离的部分）

背景层经过三层解耦，替换它**不会碰到**任何几何体、UI 或状态代码：

```
themes.ts 里的 background: 'nebula'
        ↓
ParticleBackground.tsx   查注册表 → 渲染对应组件（只有 20 行）
        ↓
backgrounds/index.ts     注册表：{'nebula': NebulaField, ...}
        ↓
backgrounds/NebulaField.tsx   真正的实现
```

### 方式 A：只调参数（最常用）

改 `src/config/particleDefaults.ts`，或只改某个主题里的 `particle` 覆盖项。
全部字段都直接映射到 GLSL uniform：

| 字段 | 作用 | 试试改成 |
| --- | --- | --- |
| `count` | 粒子数量 | `20000` 省电 / `160000` 更密 |
| `radius` | 星系盘半径 | 相机在 `z=6`、`fov=45`，`3.5`–`4.5` 刚好铺满 |
| `thickness` | 盘面厚度 | `0.05` 薄如纸 / `3` 蓬松星云 |
| `arms` | 旋臂数量 | `7` 会变成七条臂 |
| `swirl` | 缠绕强度 | `0.5` 近乎直臂 / `5` 卷成漩涡 |
| `spin` | 自转速度 | 负数反向 |
| `drift` | 云状扰动 | `2` 边缘很毛糙 |
| `pointSize` | 点尺寸 | |
| `brightness` | 整体亮度 | |
| `photoMix` | 照片取色占比 | `0` 只用主题色 / `1` 完全用照片颜色 |
| `parallax` | 鼠标视差强度 | |
| `hazeCount` / `hazeSize` | 雾霭层的数量与尺寸 | |
| `bigStarChance` | 大亮星占比 | |
| `tilt` | 盘面倾角（弧度） | `1.4` 近似侧面看 |

### 方式 B：换一整套粒子算法

1. 新建 `src/backgrounds/MyField.tsx`：

```tsx
import type { ParticleSpec } from '../config/particleDefaults'
import { useLiveTheme } from '../scene/LiveTheme'

export default function MyField({ spec }: { spec: ParticleSpec }) {
  const live = useLiveTheme()   // 每帧插值好的主题色，切主题自动过渡
  // ...自己的 useMemo 建缓冲区、自己的 useFrame 更新 uniform
  return <points ... />
}
```

2. 在 `src/backgrounds/index.ts` 里注册：

```ts
export const BACKGROUNDS: Record<string, BackgroundComponent> = {
  nebula: NebulaField,
  myField: MyField,       // ← 加这一行
}
```

3. 在 `src/config/themes.ts` 里改目标主题的 `background: 'myField'`。

原来的 `NebulaField.tsx` 一行都不用动，随时可以切回来。

### 方式 C：完全不要粒子

在 `src/components/Scene.tsx` 里去掉 `<ParticleBackground />`，
换成你自己的组件（视频、流体、纯 CSS 背景都行）。
注意背景层要自己处理配色 —— 用 `useLiveTheme()` 拿当前主题色。

---

## 二、加 / 删主题

只改 `src/config/themes.ts` 一个文件，往 `THEMES` 数组里 push 一项：

```ts
{
  id: 'nova',                        // 会写到 <html data-theme> 上
  nav: 'Nova',                       // 导航里的英文主名（保留英文）
  navCn: '新星 · 点亮宇宙',           // 导航里的中文副名（第二行）
  icon: 'spiral',                    // spiral | cube | brain | eye | tech | brand
  kicker: '第六章 · 新星 — 点亮宇宙',
  headline: ['WHAT IF WE COULD', 'FOLD SPACETIME'],
  blurb: '...',
  blurbCn: '...',
  logos: ['AAA', 'BBB', 'CCC'],      // 想加几个加几个
  summary: 'VIEW ALL 面板里的描述',
  geometry: 'wireBrain',             // geometry/index.ts 里的 id
  background: 'nebula',
  palette: {
    core: '#eef7ff', mid: '#5fa8ff', edge: '#123a72', glow: '#a9d4ff',
    accent: '#5fa8ff',
    backdrop: { src: '/textures/galaxy-indigo.jpg', tint: '#a9c9ff', gain: 1.0 },
    // 可选：只给「中心几何体」换色，粒子与文字不受影响。
    // 不填 = 几何体直接用上面的 mid / edge / glow。
    geometry: { mid: '#ff74cf', edge: '#5d2a6b', glow: '#ffc4ef' },
  },
  particle: { radius: 4.2, swirl: 3 },   // 可选，只覆盖要改的
}
```

> `backdrop.tint` 用 `'#ffffff'` 就是「不给照片染色」，照片按自己的颜色显示（`gain` 单独控亮度）。
> `palette.geometry` 是给「换了底图色系、想让几何体跟着换但粒子保持原样」准备的；
> 想在转场里也平滑过渡，它已经接进了 `LiveTheme` 的插值管线，不用额外处理。

再去 `src/styles.css` 补一组强调色变量，DOM 层的高亮就会跟上：

```css
html[data-theme='nova'] {
  --accent: #5fa8ff;
  --accent-2: #bcdcff;
  --accent-rgb: 95, 168, 255;
}
```

左侧轨道导航、VIEW ALL 面板、键盘数字键都会自动多出一个。

**删除主题**：从 `THEMES` 数组里删掉对应项即可，其余代码无需改动
（`go()` 会自动环绕，索引不会越界）。

### 当前五位栏目（天文科普线，顺序不要随意调）

五个栏目是一条递进的叙事线：**先看见 → 再探索 → 再理解 → 再参与 → 最后看动态**。

| # | id | 导航（英 / 中） | 讲什么 |
| --- | --- | --- | --- |
| 01 | `photon` | Photon / 光 · 看见宇宙 | 光是我们唯一的信使。哈勃、韦布、薇拉·鲁宾…望远镜怎么把星光读成证据 |
| 02 | `foundry` | Foundry / 器 · 探索宇宙 | 火箭与卫星。运载能力决定人类能走多远 |
| 03 | `cortex` | Cortex / 智 · 读懂宇宙 | 黑洞、引力波、暗物质 —— 看不见的东西怎么被反推出来 |
| 04 | `blueyard` | Blueyard / 青年 · 参与宇宙 | 给青年爱好者：本月天象怎么看、观测入门、拍星星 |
| 05 | `tech` | Tech / 实时 · 航天动态 | 真实接口拉的航天新闻 / 开源项目 / 遥感模型，见第五节 |

> 改名只改 `themes.ts` 的 `nav` / `navCn` / `kicker` / `headline` / `blurb` / `blurbCn` / `logos` / `summary`。
> **英文主名照旧保留，中文副名走 `navCn`** —— 导航第二行、VIEW ALL 面板都会自动带上。
> 中文副名越短越好：它决定轨道节点的宽度，太长会吃掉正文通道
> （宽度与让位关系见下面「导航」一节）。

`logos` 那一行是「漂浮的关键名字」，一组控制在 **5 个**左右：
多词短语超过 5 个会在 1440 下折到第二行，看着很散（`blueyard` 一开始就是六个，已减到五个）。

想要「品牌介绍页」那样的形态，给主题加个 `brand` 字段就会切换成
字标 + 链接的排版。**当前五个栏目都没用这个字段**（`blueyard` 原本是品牌页，
现在改成了正常内容页），所以 `SceneContent` 里的 `BrandBlock` 目前是备用代码。

### 导航：左侧「银河轨道」

`src/ui/Navigation.tsx` + `styles.css` 里的 `.orbnav*`。五个栏目是左侧一条竖直轨道上的
五个圆形节点，节点之间一条细发光线，线上有三颗缓慢流动的光点。

每个节点的文字是**两行**：英文主名（`theme.nav`）+ 中文副名（`theme.navCn`）。
中文那行用 `--font-sans`（等宽字体下中文很难看）、字号更小、透明度略低，见
`.orbnav__label-en` / `.orbnav__label-cn`。`navCn` 留空时只显示英文，DOM 与旧版一致。

几何全由 `.orbnav` 上的 CSS 变量决定，改这几个就能整体缩放：

| 变量 | 作用 | 默认 |
| --- | --- | --- |
| `--node-h` | 节点行高 = 轨道上的节点间距 | `62px` |
| `--disc` | 圆形节点直径 | `36px` |
| `--halo` | 选中光晕直径 | `46px` |
| `--orb-rgb` | 光晕与流动光点的颜色（**紫蓝**） | `148, 140, 255` |

轨道长度 `--track-h` 和垂直居中偏移都是 `calc()` 从上面推出来的，**加删主题不用改样式**。
`--orb-rgb` 想让它跟随主题色（Tech 页是青色），换成 `var(--accent-rgb)` 即可 ——
现在固定成紫蓝是按「紫蓝色光晕」的要求做的。

高亮滑动**不用 JS 逐帧补间**：光晕只有一个元素，钉在第一个节点上，
靠 `transform: translateY(calc(var(--i) * var(--node-h)))` 平移，`--i` 由 React 写。
位移交给 CSS `transition`（只动 `transform`），跑在合成器线程，
主线程被 WebGL 转场占满时也不会卡。

响应式与「让位」：

- **≥ 1200px**：节点带两行文字标签，轨道右边缘到 **~161px**（只有英文时是 140px，
  中文副名让它宽了约 20px）。TECH 页的正文列是居中定宽的，
  窄一点就会贴到视口边被轨道压住，所以给 `html .tech` 加了左右**对称**的 `200px` 内边距
  —— 对称 = 正文仍在视口正中，只是不再吃满两侧空白。其余四个银河页面实测文字左边缘
  在 330px 之后（余量 169~248px），不需要让位，保持原样。
- **< 1200px**：轨道收成纯圆点贴在左边缘（约 28px 宽），隐藏文字标签。

**加中文副名之后一定要重量一遍间距**（这是实测踩到的）：
`navCn` 决定了节点宽度，节点一宽、轨道右边缘就往右推，原先算好的让位可能就不够了。
各页面的余量见 `_analysis/by-astro.js` 输出的 `spacing` 字段
（旧的纯几何探针是 `_analysis/by-nav5.js`）。

---

## 三、加新几何体

1. 新建 `src/geometry/MyShape.tsx`：

```tsx
import { useFrame } from '@react-three/fiber'
import { useFade } from '../scene/fade'
import { useLiveTheme } from '../scene/LiveTheme'
import { paint, hints } from './common'

export default function MyShape() {
  const live = useLiveTheme()
  const fade = useFade()

  useFrame((state) => {
    // 遍历子物件，把颜色刷成主题色、不透明度乘上转场进度
    // userData 约定见 common.ts
  })

  return (
    <group>
      <mesh userData={hints({ slot: 'mid', opacity: 0.9 })}>
        <torusKnotGeometry args={[1.6, 0.02, 220, 8]} />
        <meshBasicMaterial transparent depthWrite={false}
          blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>
    </group>
  )
}
```

发光的要点：用 `meshBasicMaterial` + `AdditiveBlending` + `toneMapped={false}`，
颜色亮度超过 Bloom 阈值（0.62）就会自动溢光。

2. 在 `src/geometry/index.ts` 注册 → 3. 主题里写 `geometry: 'myShape'`。

---

## 四、转场：一个连续的宇宙，而不是几个页面

核心心智模型：**背景不是「每个页面一张图」，而是同一个宇宙里的不同区域**。
切页时发生的是「镜头从一个区域飞到另一个区域」，全程只有一条 GSAP 时间轴。

### 4.1 结构

```
SceneManager（GSAP timeline，全站唯一）
   ├─ 写 world      { from, to, mix, dir, mode }   → GalaxyWorld / LiveTheme 每帧读
   ├─ 写 scene3d    { x, scale, opacity, spin }    → SceneGeometry 每帧读
   └─ 直接补间 DOM  .scene-wrap

GalaxyWorld  ← 常驻，永不重建：GalaxyLayer A（当前区域）
                              GalaxyLayer B（目标区域，交叉溶解在上层）
                              children = ParticleBackground（星点 / 粒子）
```

`world` / `scene3d` 都是**普通对象**（`src/galaxy/worldState.ts`），
GSAP 直接补间它们的字段，R3F 的 useFrame 每帧来读 —— 全程不触发 React 重渲染。
React 只在「空镜结束」那一帧换一次内容，所以不存在「两个页面同时存在」。

### 4.2 时间轴

| 时间 | 阶段 | 发生的事 |
| --- | --- | --- |
| 0.00s | `exit` | 前景 UI：`x 0 → ∓30vw`、`scale 1 → 1.12`、`opacity 1 → 0`、`blur 0 → 4px`，`power3.in`；3D 前景同步（∓28vw） |
| 0.35s | `travel` | 银河两层开始交叉溶解；宇宙整体做推进弧线 `scale 1 → 1.09 → 1`；画布极轻微模糊 2.5px |
| 0.55s | | 前景已完全消失 —— **画面上只剩银河、星点、粒子**（空镜 700ms） |
| 1.25s | settle | 新区域形成；此刻才 `setShown()`，React 换内容（此时不可见，所以看不到跳变） |
| 1.25s | `enter` | 新 UI 从另一侧 `±32vw → 0`、`scale 0.94 → 1`、`opacity 0 → 1`、`blur 4 → 0`，`power3.out`；文字错峰上浮 |
| 1.93s | `idle` | 解锁，接受下一次点击 |

方向（`world.dir`）：`index` 变大 → 旧内容向左、新内容从右；变小则全部反过来，
银河的位移方向同步翻转。`isTransitioning` 期间一切导航请求被丢弃（含键盘、滚轮）。

**滚轮导航**（`src/ui/useWheelNav.ts`）：向下滚 = 下一区域，向上滚 = 上一区域，
走的是和键盘完全相同的 `next()/prev()`，所以时序、方向、锁都一样。
三个常量在文件顶部可以调：`THRESHOLD`（累积多少像素算一次，默认 42）、
`COOLDOWN`（两次触发的最小间隔，默认 1900ms —— **不要小于转场总时长 1.93s**，
否则请求会在转场途中被丢弃、手感像失灵）、`GESTURE_GAP`（超过这个间隔算新手势）。
VIEW ALL 面板打开时会把滚轮交还给面板，不触发切换。

**视差**：前景 UI 走 30vw，银河只走 5vw，速度差 6:1 —— 这就是景深的来源。

### 4.3 换区不是换图

`GalaxyLayer` 常驻两层：

- A（当前区域）：`scale 1 → 1.08`、`x 0 → ∓5vw`，被上层盖住
- B（目标区域）：`scale 1.04 → 1`、`x ±5vw → 0`、`opacity 0 → 1`

两层各自带独立的位移，合成结果像「穿过一片紫色云层，逐渐进入蓝色区域」。
转场结束时把 B 固化为新的 A（`settleWorld()`），因为此刻 B 已经完全不透明且位于正中，
固化动作在视觉上是零跳变。

### 4.4 想调哪里

| 想改什么 | 改哪里 |
| --- | --- |
| 各阶段时长 / 缓动 | `src/galaxy/worldState.ts` 的 `TIMING` |
| 位移幅度、缩放、模糊 | 同文件的 `AMPLITUDE` |
| **进出入口层的幅度（push / pull）** | 同文件的 `PUSH` / `PULL`（时序仍共用 `TIMING`） |
| 银河推进 / 后退幅度 | `GalaxyWorld.tsx` 的「纵深」分支（`sign × amp.arcScale`） |
| 粒子密度 / 旋臂等 | `src/config/particleDefaults.ts`（切换时逐帧平滑逼近，不会跳） |

**粒子密度**也做了平滑：缓冲区一次分配 12 万粒子的容量，
`spec.count` 只改一个 `uActive` uniform，粒子逐颗溶解/浮现；
`radius` / `arms` / `swirl` 这类参数现在也会逐帧插值，换区时不会「跳」一下。

### 4.5 银河不能压过信息

画布之上叠了三层固定压暗（都不跟着转场移动）：

1. `.galaxy-veil` —— 统一暗色 Overlay `rgba(2,5,15,0.28)`
2. `.pocket` —— 中央径向暗袋（blur 46px，避免出现方块边界）
3. `.scrim` —— 上下渐变压暗

想让银河更亮就调 `.galaxy-veil` 的 alpha（建议不低于 0.2，否则正文会开始吃力）。

### 4.6 首页入口层，以及 push / pull

首页（`entry: true` 的 `home` 主题）**不是另一个页面，是同一个宇宙的一个更安静的状态**：
它和 PHOTON 共用**同一张底图 + 同一套色板 + 同一个几何体**（`themes.ts` 里逐字段相同），
只把粒子的 `count / spin / drift / brightness / parallax` 压到安静档，
再把前景元素减到最少（轨道导航 / All N / AUDIO / 滚轮提示全部收起，见 `.fixed-ui--home`）。

于是「从入口深入 / 退回入口」就不该做左右滑动，而应该是**沿镜头轴向的纵深运动**，
这是两种模式和 `slide` 并列的原因（三者共用同一条 timeline，只换幅度）：

| 模式 | 用在 | 前景 UI | 银河 | 两层交叉溶解 |
| --- | --- | --- | --- | --- |
| `slide` | 章节之间 | 左右甩 ±30vw | 侧移 5vw + 换区换色 | 做 |
| `push` | 入口 → 章节 | **放大**淡出（1 → 1.26） | 沿弧线前冲（peak 1.34×） | **不做** |
| `pull` | 章节 → 入口 | **缩小**淡出（1 → 0.90） | 沿弧线后退（谷 0.80×） | **不做** |

**为什么 push / pull 不做交叉溶解**：入口与 PHOTON 的底图是**同一个纹理实例**，
两层叠起来只会让同一张图错位重影，看起来反而像「换图」。
只留 A 层、不侧移，才是「继续在这片银河里往前（后）走」。

选择规则在 `SceneManager.tsx` 的 `travelMode(from, to)`：**两端至少一端是 entry，
且两端 `palette.backdrop.src` 相同**才走纵深；方向由「去的是不是 entry」决定
（去 entry = `pull`，去章节 = `push`）。
底图不同的场景强行纵深，会在空镜结束那一刻硬切一张图 —— 那正是要避免的「突然换图」。

⚠️ **退回不能复用 push**：同一个前冲动作读起来等于「又前进了一次」，与「返回」的心理预期相反。

⚠️ **银河能缩多小有硬下限**：底图层平面是视口的 `OVERSCAN = 1.4` 倍（`GalaxyLayer.tsx`），
所以整组 `scale` 最小只能到 `1 / 1.4 ≈ 0.714`，再小就会看到平面边缘。
`PULL.arcScale = 0.2`（最小 0.8×）留了余量：`0.8 × 1.4 = 1.12` 倍视口，不漏边。
改这个值请一并回看 `OVERSCAN`。

### 4.7 「返回主页」按钮放哪（别放左上角）

`src/ui/BackHome.tsx`，右上角，`go(ENTRY_INDEX)`，**在入口层直接不渲染**（不是渲染后藏起来）。

放右上角是**量出来的结论**，不是审美偏好：

- 宽屏下 PHOTON / TECH 的正文从 **x = 200** 开始（`html .photon { padding-left: 200px }`），
  而 1280×720 这种矮视口下 `.photon__head` 会被垂直居中顶到 **y = 7** —— 正好落进顶部那条横带。
- 左上角在「All N」（82px 宽）之后只剩约 90px，装不下一个带完整文案的按钮。
  实测过并排放：按钮簇宽到 281px，**直接压住了 PHOTON 的标题**。
- 右上角在「正文右边界 `vw - 200`」之外，任何场景、任何视口都不会压到正文；
  同时它不动 All N 的位置（风险为零），并与右下的 AUDIO 构成同一条「全局操作」纵列。

> ℹ️ **既有状况（不是这个按钮引入的）**：矮视口下 PHOTON 内容溢出、被垂直居中，
> 正文会顶进顶部横带，此时顶部居中导航会压住 1~11 处文字、All N 压 0~1 处。
> 本按钮在常见视口是 **0 重合**，极矮视口与 All N 持平。
> 要根治得从「矮视口给正文留出顶部安全带」入手，而不是挪按钮。

**量「有没有压住文字」必须用 `Range`**：块级元素 `el.getClientRects()` 返回的是**整行盒**，
会把「居中的顶部导航压住 h1」误报成重叠；正确的是
`document.createRange().selectNodeContents(el).getClientRects()`
（辅助脚本 `_analysis/measure-collide.js` / `measure-topbar.js`）。

---

## 五、TECH 板块（航天动态 · 三源实时数据 + 液态玻璃）

> 这一栏是「实时 · 航天动态」。三个源的 feed 都已经**限定到航天领域**，
> 所以这里是真实航天新闻 / 航天开源项目 / 卫星遥感模型，不是泛科技内容。
> 想改成别的领域，只改各 adapter 里的检索词/限定词即可（见 5.1），界面不用动。

### 5.0 整体结构：一个模型，三个适配器

界面只认识 `TechItem`（`src/lib/techTypes.ts`），不认识任何站点的原始字段。
每个数据源只管把响应「翻译」成 `TechItem[]`，翻译完就与来源无关 ——
所以卡片、列表、搜索、自动刷新、错误态全都是三源共用的同一套代码。

```
src/lib/
├── env.ts           ⭐ 环境变量与端点（API Key 只从这里读，代码里不出现密钥）
├── http.ts            带超时 / 取消 / 错误归类的 JSON 请求
├── format.ts          时间与大数格式化
├── techTypes.ts     ⭐ TechItem / SourceDef / FeedDef —— 统一契约
├── sources.ts       ⭐ 数据源注册表（顺序 = 界面选项卡顺序）
├── useFeed.ts       ⭐ 通用状态机：缓存 + 取消 + 自动刷新
├── hn.ts              Hacker News  → TechItem（航天新闻，走 Algolia 检索）
├── github.ts          GitHub        → TechItem（航天项目，走 topic 限定）
└── huggingface.ts     Hugging Face  → TechItem（遥感模型，走 search 限定）
```

想加第四个源（arXiv / Product Hunt / …）：写一个导出 `SourceDef` 的文件，
加进 `sources.ts` 的 `SOURCES` 数组即可，界面部分一行都不用改。

### 5.1 三个数据源与它们的接口

| 源 | 选项卡 | feed | 接口 | Key |
| --- | --- | --- | --- | --- |
| Hacker News | **News** `◆` | Launch / Mission / Satellite | `hn.algolia.com/api/v1/search?query=…` | 不需要 |
| GitHub | **Repos** `⬡` | Space / Satellite / Earth Obs | `api.github.com/search/repositories`（`topic:` 限定） | 可选 |
| Hugging Face | **Models** `✦` | Satellite / Earth Obs / Spaces | `huggingface.co/api/models`、`/api/spaces`（`search=` 限定） | 可选 |

**Hacker News 为什么不用官方 Firebase 接口**：
`/v0/{top,new,ask}stories` 只有三个固定榜单，**没有关键词检索**，拿不到「航天」这个主题。
所以改用 HN 官方文档推荐的 Algolia 检索接口（公开、免 Key、带 CORS）：

```
Launch     query=rocket     tags=story  numericFilters=created_at_i>（90 天前）,points>5
Mission    query=NASA       同上
Satellite  query=satellite  同上
```

窗口和门槛都是**每次请求时算**的（写成模块常量的话，页面开着不刷新窗口就不会滑动）。

> ⚠️ **必须先清洗标题，否则列表会被污染**。实测踩过两次：
> 1. Algolia 是**跨字段**检索 —— 搜 `NASA` 会命中正文提到 NASA 但标题毫不相干的帖子，
>    实际漏进来过「Scientists reverse brain aging, with a nasal spray」。
>    → 规则一：**标题必须真的含关键词**。
> 2. 但第一版用的是 `title.includes(keyword)`，而 `"nasal".includes("nasa")` 是 **true**，
>    所以那条又被放行了。
>    → 改用 `\b` 词边界，并且放宽成 `\bkeyword(?:s|es)?\b`
>    （严格 `\brocket\b` 会误杀「Rockets, Calculators…」这种复数）。
> 3. 同形异义词还要走黑名单：`color space` / `Rocket League` / `Rocket.Chat` / `namespace`…
>    见 `hn.ts` 的 `TITLE_NOISE`。
>
> 代价是「Rocketlab」这种连写词会被排除 —— 可接受，因为候选数量远多于列表需要的条数。

**GitHub 为什么用搜索接口 + topic 限定**：GitHub 没有官方 Trending API。
这里**不用关键词**而用 topic —— 实测关键词会撞同形异义词：
`rocket` 作为关键词会返回 `vaultwarden` 和 `Rocket.Chat`，`topic:` 限定则干净得多。

```
Space      q=topic:space stars:>20            sort=stars
Satellite  q=topic:satellite stars:>10        sort=stars
Earth Obs  q=topic:remote-sensing stars:>30   sort=stars
```

fork / archived 的仓库会在客户端过滤掉，所以请求时多要了一倍结果再截断。

> ⚠️ **超时给到 20 秒**（`github.ts` 的 `TIMEOUT`）。实测搜索接口**冷启动要 7~8 秒**
> （TLS 握手 + 搜索后端冷查询），热连接只要 0.4 秒。
> 原来写的 12 秒在这台机器上已经贴边，弱网下会直接判超时 ——
> 而超时表现为「Signal lost」错误态，比多等几秒糟糕得多。
> 这段时间界面上是骨架屏，不是白屏。
> 排查时如果只看 4~5 秒就断言「GitHub 挂了」，那是等得不够久。

**Hugging Face 的 search 限定**：`/api/models` 和 `/api/spaces` 原生支持 `search=` 参数，
直接拼在查询串里即可，不需要新代码。

```
Satellite  /models?search=satellite&sort=likes
Earth Obs  /models?search=remote sensing&sort=downloads
Spaces     /spaces?search=satellite&sort=trendingScore
```

检索词要选**不容易被用户名借用的专有名词**：`search=space` 会撞上叫 `spacepxl` 的用户
和 `state-spaces` 组织（实测返回 `spacepxl/Wan2.1-VAE`、`state-spaces/mamba`），所以没用它。
`search=earth observation` 只有 1 条结果，也换成了 `remote sensing`。

**Hugging Face 的国内网络问题**：`huggingface.co` 在中国大陆常常直连不通
（本机 curl 实测 21 秒超时，但浏览器里可能因为系统代理而能通）。
所以 `huggingface.ts` 做了端点探测，默认两个端点：

| # | 端点 | 说明 |
| --- | --- | --- |
| 1 | `https://huggingface.co/api` | 官方站，直连 |
| 2 | `/hf-api` | 同源反代 → `https://hf-mirror.com/api` |

- **首包并发探测**：两个端点同时发请求，谁先成功用谁，落败的立刻 `abort`。
  这样最坏耗时 = 最快那个端点的耗时（实测 0.8s），不会在黑洞端点上干等超时。
- 探测结果写进 `sessionStorage`，后续请求直接命中，不再重复探测。
- 卡片链接也跟着换成能打开的域名（走镜像时链接指 `hf-mirror.com`），
  footer 上会显示当前实际使用的端点。

> ⚠️ **为什么第二个端点是 `/hf-api` 而不是直接写 `hf-mirror.com`**：
> 镜像站的服务端**不给浏览器返回 CORS 头**。实测：`curl` 带上 `Origin` 能拿到
> `Access-Control-Allow-Origin`，但同一 URL 在 Chrome 里被拦下并报
> `No 'Access-Control-Allow-Origin' header is present`。
> 所以纯前端跨域直连镜像站**必然失败**，只能走同源代理。
>
> - `npm run dev` / `npm run preview` → `vite.config.ts` 已配好，开箱能用
> - **当前线上（本项目的发布方式）** → 云平台跑的就是这个 Vite 服务，
>   所以 `vite.config.ts` 里的 `server.proxy` / `preview.proxy` **在生产同样生效**，
>   不需要额外做任何事（已实测：线上 `/hf-api/models` 直接返回真实 JSON）。
> - **换成纯静态托管时**（把 `dist/` 丢到 CDN / OSS 那种）→ 服务端没有代理了，
>   需要在网关或 CDN 上加一条规则：`/hf-api/*` → `https://hf-mirror.com/api/*`
>
>   没配这条规则时，前端会正常回落到「取数失败」错误态（带 Retry），
>   不会白屏；错误文案里也会直接提示要加这条规则。

### 5.2 API Key 放在哪里（不要写进代码）

**新建 `blueyard-r3f/.env.local`**，把 `.env.example` 复制过去按需填写：

```ini
# 可选：GitHub 只读 Token。匿名搜索 10 次/分钟 → 带 Token 30 次/分钟
VITE_GITHUB_TOKEN=

# 可选：Hugging Face Token。提高限流，或访问受限（gated）模型时用
VITE_HF_TOKEN=

# 可选：钉死 Hugging Face 端点。留空 = 官方站失败自动回退 hf-mirror.com
VITE_HF_ENDPOINT=

# PHOTON 用 —— 强烈建议填，见下面说明。
# 免费申请：https://api.nasa.gov/  （1 分钟，1000 次/小时）
# ⚠️ 不填会退化为公共演示 Key「DEMO_KEY」：全世界共用、只有 10 次/小时，
#    PHOTON 是首屏默认板块，一进站就取数 —— 页面会周期性降级到离线存档或失败卡。
# ⚠️ 线上必须在**部署方的构建变量**里配（Vite 的 VITE_* 是打包时写进 JS 的）。
VITE_NASA_API_KEY=
```

FOUNDRY 用的 Launch Library 2 **不需要任何 Key**，所以没有对应的变量。

> 不想动环境变量也行：页面上（失败卡 / 离线存档标注条里）可以直接「填入我的 Key」，
> 存进浏览器本地、立即生效、无需重新构建。临时救急够用，长期稳定还是配在 `.env.local`。

⚠️ `VITE_*` 会被编译进前端产物，浏览器里能看到。所以这里只放「公开只读、
被人看到也无所谓」的令牌；服务端密钥绝不能放这里。`.env.local` 已被 `.gitignore`
的 `*.local` 规则忽略，不会进版本库。

- `.env.local` 已被 `.gitignore` 的 `*.local` 规则忽略，不会被提交
- **改完必须重启 `npm run dev`** —— Vite 只在启动时读环境变量
- ⚠️ **`VITE_*` 会被编译进前端 JS 包**，任何人打开开发者工具都能看到。
  所以这里只放「被人看见也无所谓」的只读令牌。真正敏感的服务端密钥
  必须加一层后端代理转发，不要走前端。
- 两个 Token **都不填也能正常跑**，只是 GitHub 更容易被限流

### 5.3 自动更新（数据不用手写，也不用手动刷）

`useFeed.ts` 负责，三源行为一致：

- **默认每 3 分钟静默重取一次**（`DEFAULT_AUTO_MS = 180_000`），
  只在页面可见时发请求 —— 切到后台不浪费配额
- 从后台切回来 / 窗口重新获得焦点时，若距上次同步超过一个周期，**立即补一次**
- 命中缓存（TTL 3 分钟）时先显示旧数据再后台刷新，界面不闪空
- 界面右上角的 **`◉ 02:41` 胶囊就是倒计时**，点它可暂停 / 恢复自动刷新；
  请求进行中会变成 `Syncing…` 并加快脉冲

> 为什么要 3 分钟：GitHub 匿名搜索限流是 10 次/分钟。
> 三个 feed 来回切 + 3 分钟一次的自动刷新，留了足够的余量。

### 5.4 液态玻璃在哪

**`src/ui/glass/`**，样式在 `glass.css`。五层质感全用伪元素，不额外堆 DOM：

1. 半透明渐变 + 紫蓝环境色（银河从底下透上来）
2. `backdrop-filter: blur(16px) saturate(1.35)`
3. 边缘高光（`inset 0 1px 0` + 细边框 + 内发光）
4. 折射光带（极淡斜向光，指针进入后缓慢横移）
5. 指针高光（跟随鼠标的径向渐变）

已经用上玻璃的地方：顶部导航 `HOME/TECH/DISCOVER`、左上角 `ALL` 按钮、搜索框、
**数据源切换（News / Repos / Models）**、**每个源的分类切换**、自动刷新胶囊、
全部内容卡片、加载骨架、失败/空态面板、`Refresh` 按钮、VIEW ALL 弹窗与其内部卡片。

卡片左上角的序号用的是**该数据源的强调色**（HN 橙 / GitHub 绿 / HF 黄），
一眼能看出这条是哪来的 —— 只改了一个 CSS 变量 `--src`，没有额外 DOM。

### 5.5 交互与性能约定

- 指针位置**只写 CSS 变量**（`--gx/--gy/--tx/--ty`），不进 React state，用 rAF 合并，一帧最多一次
- 跟手时 `.is-live` 用 0.18s 过渡；离开后回落到 0.55s —— 所以不会「弹」回去
- 只用 `transform / opacity` 做动画；光带与波纹只在 hover / 点击时才播
- 卡片 hover：`scale 1.02` + 上浮 5px + 朝鼠标倾斜 4.5°；按下 `scale 0.98` + 一圈折射波纹
- **入场动画必须挂在包裹层**（`.glass-enter` 在 `.news-slot` / `.topnav > div` 上）：
  `animation` 的终态会锁住 `transform`，直接加在 `.glass` 上会把 hover 倾斜吃掉
- 进入 TECH 走的是**同一条转场时间轴**，玻璃在 0.52s 内 `scale .96 → 1`、`rotate → 0`、透明 → 清晰
- **倒计时单独做成 `SyncMeter` 组件**：它每秒重渲染一次，
  如果放在 `TechScene` 里，整张卡片列表会跟着每秒重渲染一遍 ——
  在 `backdrop-filter` 场景下这是纯粹的浪费

### 5.6 滚轮的优先级

`useWheelNav.ts` 里加了一条：指针在 `[data-wheel-scroll]`（TECH 列表）里时，
**没滚到边界就让列表自己滚**；滚到底/顶之后再继续滚，才切到下一个银河区域。
所以列表内滚动和区域切换不会互相抢。

### 5.7 怎么测

```bash
npm run dev        # → http://127.0.0.1:5183
```

1. 点左侧轨道第 5 个节点 `TECH`（或顶部导航 `TECH`）→ 走完 1.9 秒银河转场后应出现 12 条真实航天新闻
2. 鼠标移到卡片上：卡片朝鼠标倾斜、高光跟随、轻微上浮放大；移开自然回位
3. 点 `Launch / Mission / Satellite`：玻璃块平滑滑动，列表换成另一批真实航天新闻
   （应该全是火箭 / NASA / 卫星相关，看不到 `color space`、`Rocket League`、`nasal spray` 这类噪声）
4. 点数据源切换 `◆ News` → `⬡ Repos` → `✦ Models`：
   - Repos 出现真实航天仓库（star / fork / 语言色点 / topics）
   - Models 出现真实遥感模型（♥ likes / downloads / task 标签）；
     footer 会显示 `huggingface.co` 或 `hf-mirror.com (proxy)`，表示实际走的哪个端点
   - 每个源各自记住了自己选中的分类，切回来不会重置
   - **Repos 第一次切过去可能要等 5~10 秒**（GitHub 搜索接口冷启动，见 5.1），
     期间是骨架屏，不是卡住了
5. 右上角 `◉ 02:41` 在倒计时；点一下变 `Auto off`，再点恢复
6. 在列表上滚 → 列表滚动；**滚到底再继续滚** → 切到下一个银河区域
7. 搜索框输入 `starlink` / `NASA` / `satellite` → 实时过滤（标题 / 作者 / 描述 / 标签）
8. 断网（DevTools → Offline）后点 `Refresh` → 出现 `Signal lost`；恢复网络点 `Retry` → 数据回来
9. 顺便看一下左侧导航：每个节点是**两行**（英文主名 + 中文副名），
   点不同的节点时紫蓝光晕沿轨道滑过去

想改条数：`TechScene.tsx` 里 `useFeed(source, feed, 12)` 的 12。
想改自动刷新周期：`useFeed.ts` 的 `DEFAULT_AUTO_MS`（单位 ms）。
想加分类：往对应源文件的 `feeds` 数组里加一项即可。
**想把这一栏换成别的领域**：改 `hn.ts` 的 `FEED_QUERY` / `github.ts` 的 topic 限定 /
`huggingface.ts` 的 `search=` 词，界面一行不用动。

---

## 六、PHOTON 板块（NASA APOD 真实天文图 · 看见宇宙）

> 「我们知道的宇宙，几乎全部来自光。」

这一栏**没有一张图、一个标题、一段说明是本地写死的**。页面上出现的每一个字，
都是 NASA 官方 APOD 接口当天真实发布的内容。

### 6.1 数据从哪来

| 项 | 值 |
| --- | --- |
| 接口 | `https://api.nasa.gov/planetary/apod` |
| 单日 | `?api_key=KEY&date=YYYY-MM-DD` |
| 区间 | `?api_key=KEY&start_date=A&end_date=B`（**整段只算 1 次额度**） |
| 需要 Key 吗 | **需要，而且强烈建议用自己的**（不填会退化为官方 `DEMO_KEY`：全世界共用、只有 10 次/小时 —— 见 6.6） |
| Key 放哪（长期） | 项目根目录 `.env.local` 的 `VITE_NASA_API_KEY=`（见 `.env.example`）；**线上要在部署方的构建变量里配** |
| Key 放哪（临时） | 页面上直接填 —— 失败卡 / 存档标注条里的「填入我的 Key」，存浏览器本地、立即生效、免重新构建 |
| 代码里读它的唯一位置 | `src/lib/env.ts`（`nasaApiKey()`；**在发请求那一刻读**，不能捕获成常量） |
| 适配器 | `src/lib/apod.ts`（唯一的数据入口） |
| 离线存档 | `public/apod-archive.json` + `src/lib/apodArchive.ts` |
| 历史区间 | `1995-06-16` 至今，按 **UTC** 自然日划分 |

### 6.2 为什么翻日期几乎不花额度

`DEMO_KEY` 只有 10 次/小时，所以「点一次 → 请求一次」是行不通的。
`useApodDay.ts` + `apod.ts` 的做法是**按 30 天一块预取**：

```
第 0 块 = [今天-29, 今天]      ← 进页面时取这一块（1 次额度）
第 1 块 = [今天-59, 今天-30]
第 2 块 = …
```

块内任意跳转（← → 日期节点 / 原生日期框）全部命中 `localStorage` 缓存，**零请求**；
块整体迁移时才 +1 次。

**缓存不过期**（这里改过一版，原因值得记一下）：APOD 一天只发布一次，某一天发布之后
内容就不会再变了，所以「过去的日期永久缓存」其实对**所有**日期都成立。原先给「今天」
留了 30 分钟 TTL，代价是同一天里每半小时就重取一整窗 —— 而 `DEMO_KEY` 只有
10 次/小时还是全世界共用的，等于页面被自己的刷新刷成了限流失败页。改完之后：

| 场景 | NASA 请求次数 |
| --- | --- |
| 同一天内第一次访问 | 1（区间请求） |
| 同一天内再访问（哪怕隔几小时） | **0** |
| 跨天后第一次访问 | 1（只缺「今天」这一天） |
| 块内任意翻页 / 随机探索 | 0 |

敢永久缓存「今天」是因为**失败路径从不写缓存**：超时 / 429 / 400 都不会把结果落盘，
所以「今天还没发布」这种状态不会停在空结果上，下次访问会重新请求。
想要强制拿最新版就点「重新加载」—— 那个按钮会**绕过缓存**真去取一次。
（代价：NASA 事后修订某天的图文不会自动跟到，手动重新加载即可。）

### 6.3 三个必须遵守的行为

1. **绝不拿编造的内容顶上。** 取不到 → 三层降级（下一节），最后一层也没有才显示
   「数据暂时获取失败」+ 原因 + 「重新加载」+ 填入自己 Key 的入口。
   失败态下页面上**不会出现任何标题 / 图片**（验收脚本专门断言了这一点）。
2. **换天不跳变。** 新图先 `new Image()` 预加载 + `decode()`，解码完成才把新的一层
   挂上去，旧层同时向左轻移淡出（620ms）。等待发生在背后，屏幕上始终是一张完整的图。
   ⚠️ 预加载**不要设 `crossOrigin`** —— `apod.nasa.gov` 不返回 CORS 头，设了会被浏览器
   拦截：控制台报错、还要卡 4.5 秒才走 onerror。详见 `useImageReady.ts` 的注释。
3. **视频日不报错。** 当天内容是视频时，`.mp4` 直链用 `<video>`、YouTube / Vimeo 转成
   embed 用 `<iframe>`；两者都没有才显示一张「去 APOD 官方页面看」的卡片。

### 6.4 界面怎么用

| 操作 | 结果 |
| --- | --- |
| 点画面 / 右下角「放大查看」 | 打开放大视图（取高清图 `hdurl`），`Esc` 或点背景关闭 |
| 「了解它」 | 展开 **NASA 英文原文**（不翻译、不改写），换天自动收起 |
| 「随机探索」 | 在 1995-06-16 → 今天之间随机挑一天（仍是真实条目） |
| ← / → | 前 / 后一天 |
| 日期轨道上的圆点 | 亮 = 已取到真实数据，空 = 点了才会取 |
| 原生日期框 | 想跳哪天跳哪天（`min` / `max` 就是 APOD 的真实边界） |
| 「今天」 | 回到 NASA 最新的一天（降级到存档时这个按钮会变成「最新存档」） |
| 观测日志里点某一夜 | 直接翻回那一夜（这一栏独有：它记的是**你本次看过哪几夜**） |
| 失败卡 / 存档条里的「填入我的 Key」 | 存进浏览器本地，立刻用它重新取数 —— 免重新构建 |

### 6.5 接口不可用时会发生什么（三层取数，这一版加的）

**问题**：`DEMO_KEY` 是 NASA 的**公共演示 Key，全世界共用、只有 10 次/小时**。
PHOTON 又是首屏默认板块 —— 一进站就取一次数。也就是说只要不配自己的 Key，
页面就会**周期性地**变成一张失败卡。那不是「边缘情况」，是必然会发生的。

所以 `useApodDay.ts` 把取数分成了三层，按代价从低到高：

```
① 本地缓存          命中就零请求（APOD 某天发布后不再变）
② NASA 官方接口      区间请求 1 次额度拿 30 天
③ 公开数据离线存档   前两层都失败时的最后兜底 → public/apod-archive.json
```

第 ③ 层**不是假数据**：那份 JSON 装的是某次真连 NASA 抓下来的**原始响应行**
（由 `_analysis/make-apod-archive.js` 从真实响应生成），加载时走 `apod.ts` 里
**完全相同的 `normalize()`**，所以存档条目和实时条目的字段结构不可能跑偏。

三条不可越界的规矩：

1. **只在网络失败之后才加载**，而且**失败时不写进实时缓存** —— 存档和实时数据在
   存储上完全分开，不会互相污染。网络恢复后存档标注自动消失。
2. **界面上必须明确标注**：琥珀色标注条写清「离线存档 / 什么时候抓的 / 覆盖哪些天 /
   为什么降级 / 这不是实时数据」，并给出 **「重新加载」** 和 **「填入我的 Key」** 两个出口。
3. **存档模式下日期游标与随机探索都夹在存档区间内**，宁可告诉用户「这一天存档里没有」，
   也绝不显示区间外的任何内容。翻页**就地读存档，不再打网络**（否则接口挂着时
   每翻一天都白烧一次额度）。

只有连存档也拿不到时（例如静态托管没带上这个文件），才显示失败卡 —— 那时卡片上会
带一个**真的能点**的 Key 输入框（`.apod-key__input` 必须显式 `pointer-events: auto`，
因为 `.scene-wrap` 只放行 `button / a / .logo`，原生 `input` 会被底下的银河画布吃掉点击）。

> ⚠️ **线上必须配自己的 Key**：Vite 的 `VITE_*` 是打包那一刻写进 JS 的，
> 部署完再去服务器补 `.env` 没用 —— 要在 CI / 部署平台的环境变量里配好再构建。

### 6.6 怎么确认页面上是真数据

```bash
cd ..
# 全量验收（回放已录制的真·NASA 响应，不烧额度）
NODE_PATH="$HOME/.workbuddy/binaries/node/workspace/node_modules" \
  URL=http://127.0.0.1:5183/ node _analysis/by-photon.js

# 降级路径验收（429 → 存档 / 存档也没了 → 失败卡 + 填 Key / 二次访问零请求）
NODE_PATH="$HOME/.workbuddy/binaries/node/workspace/node_modules" \
  node _analysis/by-photon-resilience.js

# 完全不拦截的真实网络冒烟（这一版就是靠它才发现「打开就是失败卡」的）
NODE_PATH="$HOME/.workbuddy/binaries/node/workspace/node_modules" \
  node _analysis/by-user-view.js
```

主脚本**不信界面上的任何字**：它抓页面自己发出的 `api.nasa.gov` 响应，
再拿界面显示的标题 / 说明 / 图片地址跟接口 JSON **逐字段比对**，
同时验证加载态、降级到存档、失败态（必须明说且不出现替代内容）、放大、了解它、
随机、视频日、横向滚动与控制台报错。

2026-09-21 起还多了两组（见 6.7）：**观测读数**（页面上写的像素必须等于图片
自己解码出来的像素，比例要与真实宽高自洽）与**观测日志**（每一条标题都能在真实
NASA 响应里逐字找到、点一行真的会翻过去、失败态里必须一条都没有）。
读数内核是纯函数，另有不依赖浏览器的验算：`node _analysis/verify-measure.js`。

> ⚠️ **不要只用回放模式验收。** `page.route` 拦下来的请求用 `route.fulfill()`
> 满足时，`page.on('response')` **不会触发** —— 也就是说「回放全绿」证明不了
> 真网络下可用。必须至少有一条**完全不拦截**的用例，否则会漏掉
> 「429 时打开就是一张失败卡」这种真实故障。`by-user-view.js` 就是干这个的。

报告在 `_analysis/_photon_shots/report.json` 与 `_analysis/_resilience_shots/report.json`。

> 页脚也直接把这件事写在界面上：数据来源 + 当前 Key 类型 + 本小时剩余额度 +
> 「本次为实时取数 / 本次命中本地缓存」（降级时改标「离线存档 · 抓取时间 · 共 N 天」）。

### 6.7 观测台：读数与观测日志（2026-09-21 追加）

PHOTON 的定位是这一站里唯一的**「看」**——别人是读、是拆、是做题，这里是观测。
所以这一版把「观测」的两件真东西摆了出来，都不含一个编造的数字：

**① 观测读数（`src/photon/measure.ts` + `ApodStage` 的 `.apod-stage__measure`）**

画面下方那一行 `画面像素 960 × 1083 · 比例 1 : 1.13 竖向`，是等图**真的解码出来**
之后读 `<img>.naturalWidth / naturalHeight` 得到的 —— 它不是从任何数据源查的，
也不是写死的。所以验收判据特别干脆：**页面上写的数字必须等于图片自己的像素**。

- 读数只对**图像**出现。视频 / 嵌入帧没有可读的像素，那一行整个不渲染
  （不会先填一个「—」占位）。
- 没量到之前显示「测量中……」，绝不先填一个数。
- 读数用 key 锁住「这是哪一张图的尺寸」：换天的瞬间屏幕上可能还是旧图，
  不按 key 比对就会把上一张的尺寸挂在新的一天上（那就是「状态显示撒谎」）。
- 比例三步走：能约分的约到最简（`3000×2000` → `3 : 2`）；约分后项数 > 40 就落回
  常见摄影比例、容差 2%（`1439×960` → `3 : 2`）；连常见比例都对不上才退成小数比，
  且**小数永远放右边**（`960×1083` → `1 : 1.13`，不是 `0.89 : 1`）。
- 这个是纯函数，能单独验算，不用开浏览器：
  `node _analysis/verify-measure.js`（26 项：约分 / 落回 / 小数比 / 朝向 /
  非法输入必须返回 null —— 宁可什么都不显示，也不编一个数）。

**② 观测日志（`src/photon/ApodLog.tsx`）**

右栏下半那张卡记的是**本次会话观测过的每一夜**（最多 6 夜，就是日期轨道 ±3 天那一周），
点一行直接翻回那一夜。它是这一栏最不一样的地方：别的栏目记的是内容，这里记的是**你的观测**。

三条纪律（和取数铁律是同一套）：

1. 只记**界面真的显示过**的条目 —— 日期与标题就是那一刻屏幕上的那一条，
   所以日志里没有一个是编的（验收会逐条拿真实 NASA 响应核对）。
2. **只活在内存里，不写 `localStorage`。** 这条是硬要求：日志一旦落盘，接口全挂时
   页面上会冒出一串旧标题，看起来就像「拿历史数据顶上」—— 而失败态明令不许出现
   任何替代内容。验收里专门有一条断言：失败态下 `.apod-log__row` 数量必须为 0。
3. 上限 6 夜，同一天只留一条；当前那一夜用白点 + 高亮日期标出来。

> 改动不改任何取数逻辑，也不动那 86 条既有断言锁住的选择器
> （`.apod-stage` / `.apod-layer--in` / `.apod-media__hit` / `.apod-info__acts` /
> `.apod-dates__pick-input` / `.apod-zoom` / `.apod-info__explain` / `.photon__head` /
> `.photon__foot` / `.orbnav`）。新东西全部挂在 `.apod-stage__measure` 与 `.apod-log` 上。

---

## 七、FOUNDRY 板块（Launch Library 2 真实发射任务 · 器 · 探）

> 「太空里没有一件事不依赖一台能扛过发射的机器。」

同样地：**任务名、火箭、机构、时刻、发射场、简介、状态，全部来自接口**，
没有一份本地任务清单。

### 7.1 数据从哪来

| 项 | 值 |
| --- | --- |
| 接口 | `https://ll.thespacedevs.com/2.2.0/launch/{upcoming\|previous}/` |
| 参数 | `?limit=20&mode=detailed`（`detailed` 才有嵌套的火箭 / 机构 / 发射场 / 简介） |
| 需要 Key 吗 | **不需要**（匿名可用；CORS 为 `*`） |
| 为什么用 2.2.0 | 实测对比过 2.3.0：2.2.0 的 `detailed` 一次就够渲染整页，2.3.0 要多请求一两次 |
| 适配器 | `src/lib/launches.ts`（唯一的数据入口） |
| 来源页 | 每个任务都链到 The Space Devs 的官方任务页 |

### 7.2 倒计时为什么必须这样算

发射时刻只有一处来源：接口的 `net`（NET = No Earlier Than，绝对时刻 ISO 8601）。

- **每秒读一次真实时钟重算**，`LaunchCountdown.tsx` 里没有任何写死的剩余时长。
- **精度不能超过数据精度**：接口用 `net_precision` 自报这个时刻准到什么程度。
  精度只到「小时」时显示 `T-00D 09H` 就停下 —— 硬要凑出 `09H 15M 13S`
  是在用假精度骗人。规则：
  `Second → D H M S`｜`Minute → D H M`｜`Hour → D H`｜`Day → D`｜更粗 → 只报日期。
- `net` 为 `null`（TBD）时**不算倒计时**，直接写「时刻待定」。
- 已经过了 T-0 的场次显示 `T+`（语义是「已过计划发射时刻」），数字照常跳动。

### 7.3 时间轴与详情

- 一次显示 **5 站**（窄屏 3 站），其实是一批 **20 场**真实任务，用 `←` `→` 浏览；
  两端到边就停，不循环（时间是有方向的）。
- 节点颜色 = 官方状态语义：`Go / In Flight` → 强调色，`Success` → 青绿，`Failure` → 红。
- **点任意一站** → 弹出液态玻璃详情面板（`createPortal` 到 `body`，`z-index` 60，
  `Esc` / 点背景关闭）：任务名 / 火箭 / 机构与类型 / 发射时刻（本地时区 + 精度）/
  发射场与工位 / 任务类型 / 目标轨道 / 官方状态 / 官方任务简介原文。
- 官方没给的字段显示「官方未提供」，**不留空也不编一个看起来合理的值**。
- 顶部 `即将发射 / 已完成` 切换会重新取数，并且**不保留上一批数据** ——
  两个列表语义完全不同，拿旧的一批撑场面会让人误以为「已完成的队列里全是没发射的任务」。

一个小细节：LL2 的 `upcoming` 头部会留着几场**刚过点、官方还没挪进 `previous`** 的任务。
所以进场时游标会自动落到「下一场还没发射的」上面（`useLaunches.ts` 的自动定位），
否则用户一进来看到的会是「T+ 已过计划时刻」，很容易以为网站坏了。

### 7.4 怎么确认页面上是真数据

```bash
cd ..
NODE_PATH="$HOME/.workbuddy/binaries/node/workspace/node_modules" \
  URL=http://127.0.0.1:5183/ node _analysis/by-foundry.js
```

脚本同样抓页面自己发出的 LL2 响应，然后：

- 时间轴上**每一个任务名**都必须在接口返回里找得到（否则就是编的）；
- 倒计时必须等于「接口 `net` − 现在」（误差不超过官方精度的一个单位），**且精度到秒时确实在跳**；
- 火箭 / 机构 / 发射场 / 轨道 / 状态逐项 === 接口字段；
- 加载态、失败态（不出现任何假任务）、重新加载恢复、左右浏览、状态切换、
  详情面板、横向滚动、控制台报错。

报告在 `_analysis/_foundry_shots/report.json`。

---

## 八、中国航天四源数据（无 API 官网 · 服务端解析）

> 这一节回答一个问题：**页面上这些中文航天内容，凭什么说是真的？**

### 8.1 四个来源，和它们各自被读取的栏目

| 来源 | 官网 | 实际读取的官方栏目 | 归到哪些板块 |
| --- | --- | --- | --- |
| **CNSA** 国家航天局 | `cnsa.gov.cn` | 要闻动态 · 航天知识 | tech / foundry / photon / blueyard |
| **CMSE** 中国载人航天 | `cmse.gov.cn` | 综合新闻 · 研制进展 · 空间科学研究与应用 · 科普教育（科普活动）· 天宫课堂 · 多媒体（天宫TV） | tech / foundry / cortex / blueyard |
| **NAOC** 中国科学院国家天文台 | `nao.cas.cn` | 科研动态 · 图片新闻 · 科普文章 | tech / photon / cortex / blueyard |
| **CASC** 中国航天科技集团 | `spacechina.com` | 集团要闻 · 一线新闻 · 航天科普（运载与发射 / 载人航天） | tech / foundry / photon / blueyard |

这张表的**唯一真源**是 `server/cnspace/columns.js`。改栏目只改那一个文件。

### 8.2 它们都没有 API —— 所以只能解析网页，而且不能在前端解

四个站全部实测过：`/rss.xml`、`/feed`、`/atom.xml`、`/sitemap.xml`、`/api`、`/index.json`
一律 404 / 405 / 返回 HTML 首页。**没有公开接口、没有 RSS。**

所以只能抓公开页面自己解析。但**解析不能放在浏览器里**，三个理由：

1. 这四个站都不给跨域头，浏览器直接 `fetch` 会被 CORS 拦掉；
2. 把抓取逻辑放进前端包，等于把「抓取行为」分发给每一个访客；
3. 解析规则改一次就要重新发版。

→ 统一走**同源** `/cn-api/*`：一个 Vite 插件中间件（`server/cnspace/plugin.js`）。
不跨域、不加端口、不改部署方式。**dev 和 preview 是两个不同的钩子，两个都挂了**
（`configureServer` + `configurePreviewServer`），换模式不会 404。

```
GET /cn-api/feed            聚合内容（服务端 1 小时缓存）
GET /cn-api/feed?refresh=1  强制刷新（界面上的「重新加载」）
GET /cn-api/health          诊断：每个来源 / 栏目的成败 + 上次更新时间
```

### 8.3 数据请求代码在哪 / 缓存逻辑在哪

| 你关心的 | 文件 |
| --- | --- |
| 去哪个官方页面取 | `server/cnspace/columns.js` |
| 怎么抓（UA / 重试 / 礼貌节流） | `server/cnspace/net.js` |
| 怎么把页面解析成字段 | `server/cnspace/parsers.js` + `text.js` |
| 聚合 / 归一化 / 去重 / 排序 | `server/cnspace/store.js` 的 `doRefresh()` / `normalize()` |
| **缓存** | 内存 TTL **1 小时**（`columns.js` 的 `TTL_MS`）+ **详情页磁盘缓存 7 天**（`detail-cache.json`，`DETAIL_TTL_MS`）+ 前端 5 分钟问一次服务端 |
| **兜底快照** | `server/cnspace/snapshot.json`（由 `cli.js --snapshot` 生成，装的是**自己真抓到的**内容） |
| HTTP 端点 | `server/cnspace/plugin.js` |
| 前端取数 + 状态机 | `src/lib/cnspace.ts`（模块级单例 store，五个板块共用一份数据） |
| 界面 | `src/cnspace/CnPanel.tsx` · `CnCard.tsx` · `cnspace.css` |

缓存策略是 **stale-while-revalidate**：命中就用，过期就先给旧的、后台换新的。
冷启动时若磁盘上有快照，**立刻把快照给前端**（界面标注「快照 · 抓取于 X」）再后台刷新，
不会让人对着空白等 3 秒。

### 8.4 页面上每一条，怎么确认来自官方

三重可核验：

1. **卡片上的来源小标签**（国家航天局 / 中国载人航天 / 国家天文台 / 航天科技集团）
   来自服务端的 `sourceName`，不是前端写死的字符串；
2. **「查看原文」指向 `sourceUrl`** —— 官方原文地址，点开就是官网那一页；
   验收脚本会逐条断言它落在官方域名白名单里
   （`cnsa.gov.cn` / `cmse.gov.cn` / `cas.cn` / `spacechina.com`）；
   - **唯一例外**：NAOC「科普文章」栏目的 href 大量指向 `mp.weixin.qq.com`
     （国家天文台自己的微信公众号文章）。这是**官方栏目本来就这么挂的**，
     不是我们转的。这种卡片会在来源旁边多打一个 **「微信原文」** 标记，
     验收时「有标记的才放行」，没标记又指向域名外的一律判失败。
3. **卡片还会显示「官方栏目」**（要闻动态 / 研制进展 / 天宫课堂…），
   对照 8.1 的表就能知道这条是从哪个页面取的。

### 8.5 有没有 mock / demo / 写死的假数据

**没有。** 逐个文件说明：

| 文件 | 有没有硬编码内容 |
| --- | --- |
| `server/cnspace/*.js` | 只有 URL、正则、选择器、字段名。**没有一条标题/日期/摘要** |
| `server/cnspace/snapshot.json` | 有内容，但那是 `cli.js` **真连官网抓下来的原始结果**，不是编的。只在实时抓取彻底失败时使用，界面会标注 |
| `src/cnspace/sources.ts` | 只有四个来源的**简称和强调色**（纯展示），没有内容 |
| `src/cnspace/CnPanel.tsx` / `CnCard.tsx` | 文案是交互提示（「点击展开简介」「该数据源暂时无法连接」），不含任何航天内容 |
| `src/lib/cnspace.ts` | 只有类型与请求逻辑 |

失败时界面显示的是**「该数据源暂时无法连接」+ 失败栏目与原因 + 重新加载**，
不做任何「用示例内容顶上」的动作 —— 验收脚本里有一条专门断言
「失败态下卡片数必须为 0」。

### 8.6 抓取时的三条自律

- **同域名串行 + 最小 400ms 间隔**（`net.js` 的 `withHostSlot`），跨域名才并行。
  一次刷新最多几十个请求，对政务站点不失礼。
- **不复制正文**：只留标题 / 日期 / 来源 / ≤130 字导语 / 原文链接。
  导语也是官方页面自己的段落（列表页的简介或详情页第一段），不是摘要生成。
- **不转存图片**：只保存官方图床 URL，前端直接引用（且不设 `crossOrigin`）。
  图片加载失败就整块不渲染，不拿占位图冒充官方配图。

### 8.7 已知的稳定性差异（如实说）

| 来源 | 稳定性 | 说明 |
| --- | --- | --- |
| NAOC 国家天文台 | 稳定 | 页面模板规范；科普文章那一栏指向公众号（见 8.4） |
| CMSE 中国载人航天 | 稳定 | 站点更新不频繁（实测「综合新闻」最新到 2026-08-23），不是抓取问题 |
| CNSA 国家航天局 | 偶发超时 | 有重试（3 次指数退避）兜住；只支持 HTTPS |
| CASC 航天科技集团 | 偶发超时 | 裸域名是 JS 跳转桩，必须走 `/n25/...` 栏目页 |

**单个来源失败不影响其它来源**：其余照常显示，失败的单独标红并点名原因。
四个全失败时退回 `snapshot.json`（真实快照，界面标注抓取时间）；
连快照都没有才显示失败卡。

### 8.8 怎么测

```bash
# 手动跑一次聚合（排障 + 刷新快照）
node server/cnspace/cli.js              # 只打印
node server/cnspace/cli.js --snapshot   # 顺便写快照
node server/cnspace/cli.js --json       # 输出完整 JSON

# 浏览器验收（34 项）
NODE_PATH="C:/Users/YLJBO/.workbuddy/binaries/node/workspace/node_modules" \
  URL=http://127.0.0.1:5197/ node _analysis/by-cnspace.js

# 失败态验收（13 项：部分失败 / 全部失败 / 重新加载真的会重打接口）
NODE_PATH="..." URL=http://127.0.0.1:5197/ node _analysis/by-cn-failure.js
```

`by-cnspace.js` 验的是：五个板块都有真卡片、原文链接全在官方域名、
没有假内容特征词、点卡片展开 / 再点收起、点链接不连带展开、
TECH 话题筛选条数与标签一致、矮/宽视口无横向滚动、无脚本报错。

### 8.9 接入时踩过的两个坑（都写进代码注释了）

1. **`pointer-events: none` 会静默吃掉滚轮**。`.scene-wrap` 是 `pointer-events:none`
   + 白名单（`button/a/.logo`），新加的滚动容器不在白名单里 →
   滚轮命中测试穿过它落到下面的画布 → `useWheelNav` 里的
   `el.closest('[data-wheel-scroll]')` 永远拿不到容器 →
   **表现是「列表根本没滚，直接切了板块」，滚动条也拖不动**。
   修法：给 `.scene-scroll` / `.cn-grid` 显式 `pointer-events: auto`。
   （3D 层全仓没有一处 `onPointer*`，鼠标视差挂在 `window` 上，所以放开是安全的。）
2. **板块变高之后被裁顶**。`flex + align-items:center` 的容器一旦内容超过视口，
   `center` 会把顶部裁掉（实测 720p 下 CORTEX 标题被吃掉 99px）。
   修法：容器 `overflow-y:auto`，子元素 `margin-block: auto`
   （放得下=居中，放不下=从顶部开始，都不裁）；列方向容器另需把
   `justify-content` 改成 `flex-start`。

---

## 九、性能

- 粒子全部在**顶点着色器**里算位置，CPU 每帧只更新十来个 uniform。
  12 万粒子的缓冲区一次分配到位，靠 uniform 控制显示数量。
- 立方体网络用 `InstancedMesh`，168 个立方体一次 draw call。
- `dpr` 上限 1.75；所有材质 `depthWrite: false` + 加法混合，省掉深度排序。
- 默认 4.6 万粒子。想在低端设备上更稳，把 `particleDefaults.ts` 的 `count`
  调到 20000 左右，或把 `Scene.tsx` 的 `dpr` 上限降到 1.25。
- 转场动画**不进 React**：GSAP 只补间普通对象与 DOM 节点，
  每帧的 React 渲染次数为 0；React 只在空镜结束那一帧重渲一次内容。
- 生产包约 1.42 MB（gzip 406 KB），主要是 three.js 本体（GSAP 约 25 KB）。
- 液态玻璃只用 `transform / opacity`，指针位置写 CSS 变量并用 rAF 合并，
  一张卡片 hover 时不产生任何 React 重渲染。12 张卡片各一层 `blur(16px)`，
  弱机可在 `glass.css` 里把 `.glass` 的 blur 降到 10px，或只给导航 / 弹窗保留玻璃。

---

## 十、已知事项

- `SceneManager.tsx` 里调用了 `gsap.ticker.lagSmoothing(0)`，**不要删**。
  GSAP 默认在单帧超过 500ms 时按 33ms 计入时间，在弱机 / 软件渲染下
  会把 1.9 秒的转场拖成十几秒（实测无头环境拖到 20s+）。关掉之后时间轴严格按真实时间走。
- 控制台会有一条 `THREE.Clock is deprecated` 警告，来自 React Three Fiber
  内部对 three r186 的调用，不影响功能，等上游跟进即可。
- 项目在 `main.tsx` 里关掉了 `THREE.ColorManagement`。
  因为全程使用无光照材质 + 自写着色器，直通 sRGB 才能让颜色符合预期；
  如果你引入 PBR 材质，需要重新打开并相应调整颜色。
- 未使用 `StrictMode`：开发环境的双挂载会重复初始化 WebGL 上下文与
  `AudioContext`。如需开启，请自行确认这两处没有副作用。
- 栏目里出现的机构 / 型号名（`HUBBLE`、`JAMES WEBB`、`SATURN V`、`FALCON 9`、`LIGO`…）
  都是真实的望远镜、运载火箭与探测器名称，只作科普展示，不涉及任何机构背书。
  要换成自己的内容，只改 `themes.ts` 里的 `logos` / `headline` / `blurb` 即可。
  底图银河照片请确认你有使用权。
- TECH 板块直接跨域请求三个官方 API（它们都带 `Access-Control-Allow-Origin: *`）：
  `hn.algolia.com`、`api.github.com`、`huggingface.co`。
  Hugging Face 的镜像端点走 `/hf-api` 同源反代（原因见 5.1）。
  如果部署环境不允许跨域，在网关或 dev server 上把它们反代成同源路径，
  再改 `hn.ts` / `github.ts` / `huggingface.ts` 里对应的 `BASE` 即可。
- PHOTON 的图片来自 `apod.nasa.gov`，**图片本身没有 CORS**。
  这一点有个坑：预加载时如果给 `<img>` 设了 `crossOrigin='anonymous'`，
  浏览器会按跨域处理并直接拦下（`blocked by CORS policy`），
  既污染控制台、又要等约 4.5 秒才走 `onerror`，换天时会看起来「卡住」。
  所以 `useImageReady.ts` **故意不设 `crossOrigin`** —— 我们只等解码，从不读像素。
  真需要读像素的话，正确做法是加同源图片代理，而不是打开 `crossOrigin`。
- FOUNDRY 的 Launch Library 2 匿名可用，但有每小时额度。界面对取数失败说得清楚
  （「数据暂时获取失败」+ 原因 + 重新加载），并且 5 分钟内复用会话缓存，
  正常浏览不会把额度刷掉。
- **本项目当前的发布方式跑的就是 Vite 服务，`/hf-api` 代理已生效，不用额外配置。**
  只有改成纯静态托管（CDN / OSS）时才需要在网关上补这条规则，不补也能跑（直连官方站）。
  不加也能跑（直连官方站），只是国内网络下 Models 可能取不到数据。
- GitHub 搜索接口**匿名限流 10 次/分钟**。正常浏览够用；若频繁切换分类看到
  `GitHub 限流` 提示，在 `.env.local` 里填 `VITE_GITHUB_TOKEN` 提到 30 次/分钟。
- GitHub / Hugging Face 两个 Token 纯可选，**不填也能完整跑通 TECH 的三个源**。
- ⚠️ **NASA 的 Key 不算「可选」**（这一条本轮改过口径）：不填会自动用 `DEMO_KEY`，
  但那是**全世界共用的一把演示 Key，只有 10 次/小时**。PHOTON 是首屏默认板块，
  一进站就取一次数 —— 也就是说只要不配自己的 Key，页面就会**周期性地**降级到
  离线存档、极端情况下变成失败卡。它只适合临时试跑，**不能当默认值交付**。
  花一分钟去 https://api.nasa.gov/ 申请一个（1000 次/小时），
  线上记得在**部署方的构建变量**里配好再构建。
  没配也不会白屏：会降级到 `public/apod-archive.json` 里的**真实 NASA 存档**，
  并在页面上明确标注「这不是实时数据」+ 给出「重新加载 / 填入我的 Key」两个出口（见 6.5）。
- 转场过程中 `.scene-wrap` 上有 `filter: blur()`，这一瞬间浏览器的
  `backdrop-filter` 采样会退化 —— 玻璃可能短暂「发实」。转场结束即恢复，
  真机 GPU 上几乎看不出来。
- HN 走的是 Algolia **关键词检索**（`rocket` / `NASA` / `satellite`），不是官方
  Firebase 榜单（那三个榜单没有关键词检索，拿不到「航天」这个主题）。
  检索是全文匹配，所以取回后会再用「标题必须含关键词 + 同形异义词黑名单」
  洗一遍（`color space` / `Rocket League` / `namespace`…），见 `hn.ts` 的 `TITLE_NOISE`。
  洗到一条不剩时报错误态（带 Retry），这比显示空白有用。
- HN 卡片同时给两个入口：标题进**原文**，右侧 `Discuss ↗` 进 HN 的讨论页
  （`news.ycombinator.com/item?id=…`）。原文本身就是 HN 站内页时只显示一个
  `Discuss ↗` —— 这是预期行为，不是 bug。
- **中国航天数据台的摆放位置（本轮的取舍，需要时好调）**：数据台接在每个板块
  **原有内容之后**，没有动任何板块自己的头部 / 主体 / 页脚。代价是接完之后
  板块整体变高，矮视口（≤900p）下 **PHOTON 的数据台落在首屏之外**，
  要向下滚一屏才能看到；FOUNDRY / CORTEX / BLUEYARD / TECH 的都在首屏内。
  为了能滚，四个板块的容器加了 `.scene-scroll`（可滚动 + `pointer-events:auto`，
  原因见 8.9）。如果你更希望一进 PHOTON 就先看到国家天文台的内容，
  把 `PhotonScene.tsx` 里 `<CnPanel>` 挪到 `.photon__main` **之前**即可 ——
  一行位置，不用改样式。
- CMSE 站点本身更新不频繁：实测「综合新闻」栏目的最新一条是 2026-08-23。
  界面上显示「最新到 2026-08-23」是**官方的真实状态**，不是抓取失败。
- NAOC「科普文章」栏目里不少条目的原文在 `mp.weixin.qq.com`（国家天文台自己的
  公众号），这是官方栏目本来就这么挂的；这类卡片会多一个「微信原文」标记，
  不要当成「跳到站外」的 bug。
- 服务端聚合首次冷启动约 3~6 秒（要抓十几个列表页 + 若干详情页）。Vite 插件在
  启动 1.2 秒后会后台预热一次；如果用户恰好在预热完成前打开，服务端会先把
  **磁盘上的真实快照**给前端（界面标注「快照 · 抓取于 X」），拿到新的再无感替换。
  详情页有 7 天磁盘缓存，之后每次刷新通常一条详情都不用抓。

---

## 十一、CORTEX 与 BLUEYARD：两个「动手」板块（2026-09-21 追加）

前面五个板块原来都是「标题 + 一列卡片」，长得太像。从 2026-09-21 起把 **03 CORTEX**
和 **04 BLUEYARD** 改成**给人动手的**板块 —— 拖滑杆、点任务、答题，而不是往下读。
**配色 / 几何体 / 粒子参数 / 转场时间轴一行未动**，新内容全部挂进既有的
`SceneManager` 单时间轴与 `worldState`。

| 板块 | 干什么 | 目录 |
| --- | --- | --- |
| 03 CORTEX | **算** —— 看不见的东西怎么从能测到的量反推 | `src/cortex/` |
| 04 BLUEYARD | **做** —— 今晚就能做的七件事 | `src/blueyard/` |

两者的容器都用 `.scene-scroll` + `data-wheel-scroll`（可滚动、滚轮先滚列表再滚板块、
到底才切板块），原因见 8.9。

### 11.1 CORTEX（智 · 天文实验室）

- 文件：`CortexScene.tsx`（壳）× `CortexLab.tsx`（三张台子）× `lab.ts`（计算内核）× `cortex.css`
- 三张台子：**恒星光谱台**（温度+半径 → 黑体颜色 / 光谱型 / 峰值波长 / 光度）、
  **行星轨道台**（半长轴+反照率 → 周期 / 轨道速度 / 平衡温度）、
  **黑洞视界台**（质量 → 史瓦西半径 / 视界面积 / 霍金温度 / 蒸发时标）
- **诚实底线与别处不同**：这里的数字**不是从接口取回的，是自己算出来的**。
  所以界面上必须同时摆出三样东西，缺一不可 ——
  ① 每条结论用的公式（`FORMULAS`）；② 用到的物理常数与单位（`CONSTANT_TABLE`）；
  ③ 明确声明「本台数值由物理公式实时计算，不是官方数据」。
  缺了这三条，这些数字就会伪装成观测数据。
- 验算：`_analysis/verify-lab.js`（拿公认天体数值反查公式）+ `_analysis/by-cortex-lab.js`（浏览器验收）
- ⚠️ 滑杆是原生 `<input>`，**必须显式 `pointer-events: auto`** ——
  `.scene-wrap` 只放行 `button / a / .logo`，否则事件被下方画布接走（同 PHOTON 的日期框）。

### 11.2 BLUEYARD（青年 · 青年任务中心）

- 文件：`BlueyardScene.tsx`（壳）× `MissionCenter.tsx`（五块 UI）× `sky.ts`（推算内核）
  × `program.ts`（本站整理的内容）× `blueyard.css`
- 五块内容，顺序即阅读顺序：
  **今晚值班台**（月相图 + 月龄 + 照亮比例 + 下一个节气 + 观测建议）→
  **天象日历**（从今天起的最近 6 条）→ **点亮你的星图 + 观星任务**（七任务 ↔ 北斗七星）→
  **知识挑战**（6 题，答完给解析并指出站内哪儿能验证）→ **本页依据**（公式 + 误差 + 四类内容说明）
- **推算内核 `sky.ts`：数字与时刻都是算出来的，不查表**
  - 月球相位角 i：Meeus《Astronomical Algorithms》48.4
  - 太阳视黄经 λ：同上第 25 章低精度式（二十四节气的定义就是 λ 落在 15° 整数倍上）
  - 朔望 / 节气时刻：对上面两个**单调角度函数**粗扫找变号 + 二分求根（40 次）
  - 实测精度（`_analysis/verify-sky.js` 拿两张独立历表逐条对拍）：

    | 量 | 与谁比 | 实测差 |
    | --- | --- | --- |
    | 朔 / 望 | 2026 公开天文年历（49 条）+ NASA 四次日月食食甚 | ≤ 28 分钟；对食甚最大 14.6 / 最小 1.4 分钟 |
    | 上弦 / 下弦 | 公开年历 | ≤ 50 分钟 |
    | 二十四节气 | 紫金山天文台 2026 年发布值 | ≤ 13 分钟 |
    | 照亮比例 | 由相位角推 | < 1% |

    ⚠️ 「弦」附近偏差大**不是 bug**：相位角公式与历表用的「视黄经相差 90°」定义
    本身就有偏差，朔望两点上无偏。所以界面上凡是给到「时:分」的地方
    **一律写成「约 HH:MM」**。
- **四类内容必须分开标**（`.btag`，视觉上四种颜色）——
  `推算`（月相/月龄/节气）· `年度周期`（流星雨极大与 ZHR，常年值、逐年浮动）·
  `本站整理`（任务/题/星图坐标）· `官方原文`（下方中国航天数据台）。
- **天象日历上为什么单拎一条常驻的「下一场流星雨」**：日历只显示「最近 6 条」，
  而流星雨极大是常年固定日期 —— 碰上朔望与节气挤在一起的几周（例如 9 月下旬到
  10 月中旬），6 条里一条流星雨都排不进去，`年度周期` 这一类标签就整类看不见了。
  所以把「下一场」单独常驻显示（已排进 6 条里时自动不重复）。
- **任务进度**：`localStorage['blueyard.missions.v1']`（只存本地、不上传）。
  星图与任务清单**共用同一份 `done` 状态**（状态提在 `MissionCenter`）；
  点星 = 点任务，两端星都亮那条连线才亮，「用斗口找北极星」做完才出现指极星延长线。
  星图按北斗七星**真实赤经赤纬**做等距圆柱投影（北在上，赤经向东即向左）。
- 怎么测：
  ```bat
  node _analysis\verify-sky.js     :: 推算内核 60 项（不需要浏览器）
  node _analysis\by-blueyard.js    :: 浏览器验收 107 项（真点真答真刷新）
  ```

#### 11.2.1 写这一栏时踩过的三个量法坑（改之前先看）

1. **`elementFromPoint` 只对「视口内」的点有意义。** 量「任务卡能不能被指针命中」
   之前必须先把清单 `scrollIntoViewIfNeeded()` —— 清单还在首屏之外时它对 7 张卡
   一律返回 `null`，会得到 7/7 的**假失败**。
2. **带 `viewBox` 的 SVG 里不能用 `locator.click({force: true})`。** 星图的
   `<circle>` 用 force 会跳过命中检查直接按坐标点，实测点空（分数一动不动），
   而且会把后面几次 `locator.click()` 一起拖到 30s 超时。改成
   「先滚进视口 → 自己算圆心 → `mouse.click(x, y)`」即可。
3. **量布局前要先滚回顶部。** 本节的 `by-blueyard.js` 会点任务、答题，
   这些操作把 `.scene-scroll` 滚下去了；`getBoundingClientRect().top` 量出来是负数，
   会看着像「标题被裁了」。脚本里统一走一个 `scrollTop()` 复位再量。

#### 11.2.2 cnsa.gov.cn 的缩略图会偶发取不到（不是我们的问题）

`by-blueyard.js` 会把「跨域资源没取到」单独列出来不计入失败。实测国家航天局的
`pic_*.png|jpg` 会 **404（返回 `text/html`）或被 ORB 拦截**，而 `cmse.gov.cn`
的图正常。已核对：**官方列表页自己就是那么挂的**（`../../n6758968/n6758973/c10774483/pic_10774483.png`），
我们的 `absUrl` 解析结果与之一致 —— 是对方站点自身的问题。
卡片侧已经处理好了：`CnCard` 的 `hasThumb = Boolean(item.image) && !imgFailed`，
`<img onError>` 一失败就整块隐藏缩略图，不会出现破图图标。

---

## 十二、鼠标流星拖尾 —— 指针是操纵杆，流星是天上独立的东西（2026-09-30 重做）

鼠标划过时，银河背景里有一颗流星跟着飞：往右划它往右飞、往左划往左飞、斜着划斜着飞，
后面拖一条会跟着转向弯、慢慢散掉的光尾。**不改**银河背景 / 液态玻璃 / 左侧轨道 / 转场，
是纯叠加的一层。

> **⚠️ 这一节推翻过一版，先看这段再动手。**
> **2026-09-24 首版**（已废弃）把流星头做成「指针的对数跟随」、最多滞后 70px ——
> 效果就是**箭头本身变成了流星**。用户明确否掉：「我要的不是鼠标变成流星，
> 鼠标是遥控器，流星是天上一个独立的东西。」
> **2026-09-30 重做**成下面这个「速度控制 + 位置保持」模型。
> 改这一层之前**务必先读 §12.3 的式子**，不要退回「让头跟着指针走」的思路。

### 12.1 文件与层级

| 文件 | 干什么 |
| --- | --- |
| `src/ui/meteor/meteor.ts` | 计算内核：纯函数 + 一个可脱离 DOM 推进的状态机 |
| `src/ui/meteor/MeteorTrail.tsx` | 渲染层：1 个 Canvas 2D + rAF |
| `src/ui/meteor/meteor.css` | 只有层级与 `pointer-events`，没有视觉效果 |

挂载点在 `App.tsx`，**z-index = 8**：

```
.galaxy-world(0) → .galaxy-veil(2) → .scrim(5) → .pocket(6)
   → 流星(8) → .scene-wrap(10) 内容 → .fixed-ui(20) UI → .loader(40)
```

这个位置是刻意的：在暗化层（veil / scrim / pocket）**之上**，所以流星不会被
「银河不能压过信息层级」的那几层压暗；又在内容层**之下**，所以
「不能挡住正文 / 按钮 / 天文图片」不是靠调透明度祈祷，而是**层级上就压不上去**。
`pointer-events: none` 是硬要求（这一层铺满全屏，吃掉指针事件就全废了）。

**为什么没把它放到内容之上（2026-09-24 试过 z=12，结论是留在 8）：**

- 先排除了「某个板块的底图会把它整层盖住」：五个板块的底图**全部由 z=0 的 WebGL 画布画**
  （`themes.ts` 的 `backdrop.src` → `useBackdropTextures()` → `GalaxyLayer` / `NebulaField`），
  全仓**没有任何** `url(/textures/...)` 的 CSS 底图（`grep -rn "url(/textures" src/` 为空）。
  所以 z=8 在任何一个板块都不会被底图吃掉。
- 差别只在玻璃卡上：z=8 时拖尾被卡的 `backdrop-filter: blur()` 吃掉，看起来是
  「光透过磨砂玻璃」；z=12 时拖尾直接压在正文与天文图片上。
- 取舍点：**TECH 是内容最密的板块**（整屏玻璃卡），z=8 下拖尾在卡缝与银河处清楚、
  跨卡时只剩一层朦胧光晕。但用户把硬约束写得很明：「**不能挡住正文、按钮和天文图片**」
  —— z=12 恰恰就是盖在上面。**宁可少看见一点，也不越这条线。**
- 想换取舍：`meteor.css` 里 `z-index: 8` → `12`，一行、无其它耦合。
  ⚠️ **不要放到 20 以上**（会盖住左侧轨道导航、All N、返回主页按钮）。

### 12.2 开 / 关的判据（桌面开，触屏关）

```ts
window.matchMedia('(prefers-reduced-motion: reduce)').matches  // 有 → 关
window.matchMedia('(hover: hover) and (pointer: fine)').matches // 无 → 关
```

关掉时**整层不渲染**（连 `<canvas>` 都不建），不是画了再 `display:none`。

⚠️ **不要用 `navigator.maxTouchPoints` 判桌面**：本机 headless Chrome 桌面环境
它返回 **10**，而真实触摸上下文返回 1 —— 拿它当开关会把桌面端也关掉。
实测媒体查询是准的：桌面 `hover:hover/pointer:fine` 双 true，移动上下文双 false。
另外混合设备（触屏笔记本）留了一个兜底：`touchstart` 时若**这一整段会话里从没见过
真鼠标移动**，就判定为触摸端并关掉。

### 12.3 模型：为什么是「速度控制 + 位置保持」（**这一节是灵魂**）

指针**不是**流星的锚点，而是它的**遥控杆**。每帧做两件事：

```
目标速度 = 指针速度(跟手)  +  (标准站位 − 当前位置) × POS_K     ← 比例校正
流星速度 → 指数逼近目标速度（时间常数 VEL_TAU）                 ← 惯性来源
```

这三行同时解决四件事，所以**不要拆开改**：

| 指针在干嘛 | 式子会怎么走 | 屏幕上的效果 |
| --- | --- | --- |
| 匀速直线飞 | 站位差收敛成常数，速度等于指针速度 | 流星平行跟着飞，**距离稳定在 `STANDOFF`（92~215px）附近** —— 这就是「不粘在箭头下面」 |
| 突然转弯 | 速度还指着旧方向，来不及改 | 甩出**外弧**，再被比例项慢慢拉回来 —— 这就是「转弯是弧线、不是折角」 |
| 停下 | 整个式子关掉，改纯阻尼（`COAST_TAU`） | 带着最后的速度**继续飞出去一段**，本体同时淡出（`FADE_TAU`） |
| 反向急拉 | 先按旧方向滑，再被拉回 | 先减速到接近 0、再反向 —— **不是瞬间掉头** |

**站位方向**取「指针平滑速度方向的**反**方向」→ 流星永远在指针**后面**。
于是屏幕上的顺序恒为 **指针 → 流星 → 光尾**，一条线，读起来最清楚。

**两条兜底**（别删）：
- `LEASH_HARD = 620`：到指针距离超过它硬拉回来 —— 防止极端操作下流星跑丢。
- `SEP_RADIUS = 58 / SEP_PUSH = 320`：指针**迎面擦过**流星时施加一个斥力。
  正常站位 92~215px 时这玩意儿完全不生效，只在「箭头怼到流星脸上」那一瞬推开它。
  没有这条时，指针急停后流星滑到指针正下方会有几帧重叠 —— 又变回「箭头压着流星」。
- `RESET_MS = 420`：久停（>`IDLE_MS = 90`）后再动、且流星已散尽时，让它在指针附近
  **重新出现**。不这么做的话，它会从屏幕另一头慢慢飞过来，像一颗迷路的流星。

### 12.4 参数：每条都对着一个明确要求

| 常量（`meteor.ts` 顶部） | 值 | 对应要求 |
| --- | --- | --- |
| `IDLE_MS` / `RESET_MS` | 90 / 420 ms | 「停下多久算停」「久停后再动从哪起手」 |
| `POINTER_TAU` | 0.05 s | 指针速度估计的平滑 —— 太小会抖，太大会跟手迟钝 |
| `STANDOFF_MIN/MAX/REF` | 92 / 215 / 1750 px | 「流星离指针有距离、越快拉得越开」 |
| `SEP_RADIUS` / `SEP_PUSH` | 58 px / 320 px·s⁻¹ | 「箭头不许压在流星上」 |
| `LEASH_HARD` | 620 px | 极端情况兜底，别跑丢 |
| `VEL_TAU` | 0.14 s | **惯性强弱**：越大越"重"、转弯弧线越大 |
| `POS_K` | 2.4 s⁻¹ | 回站位的黏着力：越大越贴着标准距离，越小越容易飘远 |
| `COAST_TAU` | 0.44 s | 「松手后滑行多远」 |
| `FADE_TAU` | 0.25 s | 本体淡出（约 4.6τ ≈ 1.15s 后看不见） |
| `STOP_SPEED` / `TRAIL_MIN_SPEED` | 7 / 12 px·s⁻¹ | 指数衰减永不真正归零，得有收口 |
| `LIFE_MIN` / `LIFE_MAX` | 620 / 900 ms | 尾巴单点寿命：慢→快 |
| `MAX_TAIL_PX` | 1150 px | **尾巴弧长上限**，见下 |
| `SPEED_REF` | 1700 px·s⁻¹ | 「多快算快」的归一化参考 |
| `SPARK_SPEED` / `SPARK_GAP_MS` / `SPARK_MAX` | 900 / 115 / 40 | 「慢的时候不散星点」「数量要克制」 |
| `EXTRA_*` | 见 §12.7 | 伴星 |
| `BUCKETS` / `MAX_POINTS` | 10 / 140 | 每帧绘制调用量有上限 |

**为什么寿命和长度要分开管**：尾巴长度 ≈ 速度 × 飞行时间。只靠寿命的话，鼠标甩到
3500px/s 时尾巴接近三千像素（横贯整屏，不是「稍微变长」）；可寿命又不能缩短来限长
—— 那会破坏「停下后约 1 秒淡出」这条硬要求。所以 **寿命管淡出时间，弧长管视觉长度**：
`trimByArc()` 从头部往回累加弧长，超出 1150px 的老段整段丢掉。
用弧长而不是直线距离，是因为急转弯时直线距离会明显小于实际长度、会把尾巴放长。

⚠️ 尾巴长度还受**历史长度**限制：单次 10 帧的甩动只填满 ~0.17s 的轨迹，
所以量「快速甩动尾巴多长」时必须**连续甩 0.5s 以上**，否则量到的是轨迹不够长、
不是 `MAX_TAIL_PX` 在起作用（早先的验收脚本就在这儿误判过一次）。

### 12.5 转弯为什么是弧线（不是折角）

指针给的是**折角**（鼠标事件本来就是一堆折线段），流星给的是**弧线**，
因为速度受 `VEL_TAU` 约束、位置又受 `POS_K` 拉回 —— 两级滞后叠起来自然成弧。
实测（`verify-meteor.js`，输入是瞬时 90° 折角 / 180° 掉头）：

| 量 | 指针 | 流星 |
| --- | --- | --- |
| 画圆一圈最大单帧转向 | — | **13.3°** |
| 90° 折角输入 | 90°（瞬时） | 摊到多帧，并出现**向外的过冲** |
| 180° 掉头 | 瞬时反向 | **先减速到 <0.2×峰值，再反向**（≥4 帧处于半速以下） |

### 12.6 松手之后会怎样

`active` 变假（指针静了 90ms）后：① 关掉操纵杆输入 → ② 速度按 `COAST_TAU` 阻尼、
继续沿原方向滑行 → ③ 本体按 `FADE_TAU` 淡出 → ④ `a < 0.004` 直接归零。
实测一次「冲到右边后松手」：190ms 内又滑出 **465px**，总长约 1.15s 完全看不见。
全部散尽（`isAlive()` 为假）时把最后一帧画过的矩形擦干净、**停掉 rAF** ——
鼠标静止时这一层 0 CPU。

### 12.7 伴星（「偶尔 1~2 颗更小更远的流星」）

不是主流星的分身，是**独立的**几颗，只借主流星的速度出生：

| 常量 | 值 | 含义 |
| --- | --- | --- |
| `EXTRA_MAX` | 2 | 同屏最多 2 颗 |
| `EXTRA_GAP_MS` | 1500 ms | 两批之间至少隔这么久（「偶尔」而不是「一直在」） |
| `EXTRA_SPEED` | 720 px·s⁻¹ | **主流星**超过它才可能带出伴星（慢慢挪时天空是安静的） |
| `EXTRA_SPEED_GAIN_MIN/MAX` | 0.4 / 0.72 | 速度倍率 —— 比主流星**慢**才像「更远」 |
| `EXTRA_DIST_MIN/MAX` | 200 / 460 px | 出生点离主流星多远 |
| `EXTRA_DRAG_TAU` | 1.1 s | 自己的阻尼，慢慢滑、慢慢散，**不受指针控制** |
| `EXTRA_LIFE_MIN/MAX` | 1100 / 1900 ms | 寿命 |

伴星渲染时整体 `globalAlpha` 乘 **0.62**、出生 `scale` **0.42~0.64** —— 更暗更小。

### 12.8 想调什么，改哪里

- **颜色**：`COLOR`（冷白 `core` / 浅蓝 `mid` / 淡紫 `outer` + 柔光 `halo` + 星点 `spark`）。
  五个色的色相 213°~250°、彩度 ≤ 0.50，**比本站主题强调色本身还淡**
  （强调色最大彩度 0.63）—— 验收里就是拿 `styles.css` 里的 `--accent` 现场标定的。
- **离鼠标远近**：`STANDOFF_MIN / STANDOFF_MAX`。
- **惯性强弱 / 弧线大小**：`VEL_TAU`（主）、`POS_K`（次）。
- **滑行距离**：`COAST_TAU`。**淡出快慢**：`FADE_TAU`。
- **变长 / 变短**：`MAX_TAIL_PX`（长度上限）、`LIFE_MIN/LIFE_MAX`（淡出时长）。
- **变亮 / 变淡**：`MeteorTrail.tsx` 里那三层 `globalAlpha` 的系数与 `lineWidth` 倍数
  （很宽的淡紫柔光 7.5× → 浅蓝中层 3× → 冷白亮芯 0.8×）。
- **星点多少**：`sparkCount()` 的档位与 `SPARK_GAP_MS`。
- **伴星频率**：`EXTRA_GAP_MS` / `EXTRA_SPEED`；**完全不想要伴星**：`EXTRA_MAX = 0`。
- **想让它更抢眼 / 愿意接受压在玻璃卡上**：`meteor.css` 的 `z-index: 8` → `12`
  （内容之上、固定 UI 之下）。取舍理由见 §12.1，**别超过 20**。
- **完全不想要**：删掉 `App.tsx` 里的 `<MeteorTrail />` 一行即可，其它都不用动。

### 12.9 怎么测

```bat
node _analysis\verify-meteor.js    :: 计算内核 84 项（纯 Node，不开浏览器）
node _analysis\by-meteor.js        :: 浏览器验收 48 项
node _analysis\_shot-meteor-v2.js  :: 出图：慢/快/画圆/滑行/伴星 五张 + 坐标 sidecar
python _analysis\_sheet-meteor-v2.py :: 把五张拼成对照图（把「指针在哪」画回图上）
```

`verify-meteor.js` 会把内核编译出来**按 60fps 逐帧推进**（`tsc --ignoreConfig` 编到
`_analysis/_meteorbuild/`，再 `require`），逐条量用户提的那几件事：

- **跟手方向**：左 / 右 / 斜，各用一份**全新 sky**（`dirRun()`）从零起手，
  避免上一段的残留速度污染方向；量流星位移与指针位移的夹角 < 40°。
- **不粘在箭头下面**：五个场景（慢 71px / 快 517px / 画圆 194px / 滑行 108px / 伴星 577px）
  距离全部 ≥ 20px，且**各不相同** —— 证明是「跟着跑」而不是「长在指针上」。
- **一颗连续的流星**：走 10 段折线，`spawnCount` 恒为 **1**（不是每动一下就重生一颗）。
- **画圆**：最大单帧转向 13.3°，且有足够的「正在转弯」帧。
- **180° 掉头**：最小速度 < 0.2×峰值，且有 ≥4 帧处于半速以下 —— **先减速再反向**。
- **快慢尾巴**：连续甩 0.6s 后，快 1173px vs 慢 228px。
- **尾巴朝运动反方向**：尾巴点与速度方向点积 < 0。
- **松手滑行 + 淡出**、**伴星 1~2 颗且更小**、**慢速不散星点 / 快速每批 2~4 颗**、
  **久停后重新起手**、**性能护栏**、**分桶回归**。

`by-meteor.js` 只验浏览器里才成立的事：开关判据（含手机上下文与 reduce 偏好）·
z-index 关系 · **真点一下左侧轨道导航看板块切没切**（证明不挡按钮）·
画布真实像素（有没有点亮）· DOM 不增长（403 → 403）· 帧间隔中位数 9.7ms ·
**它真的显示在屏幕上**——这条要用探针报的流星坐标**迭代逼近**把流星挪进窗口再裁图
（因为流星现在不在指针下面，早先「把指针拖到屏幕中心再截图」拍到的是一团空气），
最终 head 峰值 167 vs 关画布 61，信噪比 **43×**。

### 12.10 写这一层时踩过的坑（改之前先看）

**模型相关的两个（2026-09-30 重做时发现的真 bug）：**

1. **伴星生下来就死**：清理逻辑写的是「`a > 0.004 || trail.length > 0` 才留」，
   可伴星出生那一帧 `a` 还是 0、尾巴还没铺 → **生成即被删**，屏幕上永远看不到伴星，
   但 `extraLog` 里明明有记录（所以「日志有、屏幕上没有」的怪象）。
   修法：改成**按年龄**判（`now - bornAt < life + 1000`），并给铺尾巴加 `a > 0.02` 的门。
   ⚠️ 顺带把 `isAlive()` 也修了 —— 它原先同样因为「伴星被瞬间删掉」而**永远为真**，
   于是 rAF 永远不停（0 CPU 那条断言会假过）。
2. **指针会压在流星身上**：急停后流星滑到指针正下方，有几帧两者重叠 ——
   又变回「箭头压着流星」的观感。修法：加 §12.3 的**分离偏置**（`SEP_RADIUS/SEP_PUSH`）。

**验收方法相关（这几条是「看着像失败、其实脚本错了」）：**

3. **`pointerout` 会冒泡，不能当「鼠标离开窗口」用。** 它每跨过一次子元素边界都触发
   （实测一次拖动触发 7 次），拿它清状态会在划过卡片边缘的瞬间把尾巴清掉。
   判据要用 `e.relatedTarget === null`（真的走出窗口时才是 null，实测拖一次 0 次）。
4. **指数收敛永远不会真正停住**，而间距在速度衰减到 0 时会缩到下限 —— 于是停下之后
   那点「追上去」的亚像素位移会一直累积成新点，每个新点又活几百毫秒，
   把淡出时间拖长，屏幕上还多一个尾巴都没了却赖着的小光点。
   修法：**尾巴只在「指针真的在动」时铺**，不是「头部还可见就铺」。
5. **别用「数组净增」去数散星批次**：同一帧里既有新生的也有到期的，净增会小于
   实际生成数（实测出现过「一批 1 颗」的假象）。要断言「每批 2~4 颗」就得记
   **生成事件本身**（内核里的 `spawnLog`）。
   ⚠️ 但用 `spawnLog` 时要**先跑几帧热身再清空**：起手瞬间比例校正会过冲，
   会甩掉几颗星点，不清空就得到「慢速拖动也在散星点」的假失败。
6. **测试脚本里 `mouse.move(x, y, 1)` 是「瞬移」不是「滑过去」**：一步到位会让
   方向估计和速度估计全失真。要量方向就得**逐帧插值**地移动（`onFrame` 回调 + 每步 sleep）。
7. **验收读数不能取在「拖动结束很久之后」**：隔着一次 `evaluate` 往返（几十到几百
   毫秒），速度早已衰减回 0、尾巴也淡完了 —— 早先版本因此得到「快速拖动 speed=384」
   「松手那一刻 lit=0」这种**假失败**。要量峰值就记峰值（`__meteor.peek()`），
   要量淡出就把计时从「最后一个鼠标事件」起算、且中间别夹截图。
8. **「拖前 / 拖后两张截图相减」这套基线差分在这个站上不成立**：银河是 WebGL
   **一直在动**（星点流动 + 视差），两次截图之间背景已经变了。实测在拖动包围盒里
   **18~22% 的像素差值 > 12** —— 那几乎全是背景的运动，流星自己的贡献被淹没，
   z=8 / z=12 的读数差异**没有分辨力**，别拿它下结论。
   正确姿势：用 `__meteor` 探针隔离出画布自己的像素（`pixels()` / `peek()`）、
   在纯黑底上单独渲染、或者**放大裁图用眼睛看**。
9. **「信号 / 噪声」的两个估计量必须在同一量级上取**：`by-meteor` 早先 signal 只取
   1 个样本，noise 却取 3 张「关画布」图两两差的**最大值** —— 其中一对跨度是别人两倍，
   且 max 系统性偏高，环境一抖就变成假失败。修法：signal 取多张均值、noise 只取
   **时间相邻**的一对。**遇到亮度类断言先怀疑估计量，再怀疑产品。**

**出图相关的坑（做对照图时踩的）：**

10. **裁「指针 + 流星」的包围盒会把尾巴整根切掉** —— 光尾朝指针**反方向**延伸
    （流星永远拖在指针后面），只框这两个点的话尾巴在框外。要额外把「尾巴末端估计」
    （从指针指向流星的方向再往前推 `tailArc`）算进包围盒。B 组（长尾）第一版就是这么翻车的。

---

## 十三、摄像头手势控制 —— 用一只手在银河里移动 / 选择 / 点击 / 切页（2026-09-30 追加）

> 目标不是「摄像头识别演示」，而是**手指伸出去就真的能操作这个站**：
> 食指移动 → 一颗发光的星光标跟着走；食指+拇指轻捏 → 点到东西上；左右挥手 → 换章节；
> **慢慢张开手掌 → 背后的银河解体、散成漫天星尘；慢慢握紧拳头 → 星尘飞回原位，
> 银河恢复完整形态**。
> **鼠标的一切照旧可用**，两者互不干扰。

### 13.1 四个手势，和它们的判据

**所有可调参数只在 `src/ui/gesture/tuning.ts` 一个文件里**（`GESTURE_TUNING`）；
`gesture.ts` 里的同名常量全是**别名**（`export const X = T.X`），改值只改 `tuning.ts`。

| 手势 | 做什么 | 怎么判（数值都在 `tuning.ts` 里） |
| --- | --- | --- |
| **食指移动** | 一颗星光标跟手（不是鼠标箭头） | 食指尖 `INDEX_TIP` 归一化 → 镜像映射 → One-Euro 平滑（`POINTER_SMOOTHING`） |
| **食指+拇指轻捏** | = 点击当前光标下的元素，带一圈光波 | `PINCH_THRESHOLD=0.54` 按下 / `PINCH_RELEASE=0.76` 松开（**迟滞带 0.22**），一次捏合只点一次（`CLICK_MIN_GAP_MS=300`），且**握拳中不判点击**（`FIST_GUARD_CLICK=0.40`） |
| **左右挥手** | 换章节（复用原有转场，**不做新动画**）。**往左挥=下一个，往右挥=上一个** | **只看手掌中心 `palmCenter`（手腕 + 四指根），不看食指尖** —— 免得「移光标」被当成挥手。`SWIPE_WINDOW_MS=480` 内 `dx≥0.18` 且 `dx/dy≥1.5` 且纵向跨度 `≤0.26` 且**最近 220ms** 速度 `≥0.55/s` 且净位移占比 `≥0.7` 且单帧占比 `≤0.65`；冷却 `SWIPE_COOLDOWN=800ms`，且**手要先静下来**（`SWIPE_REARM_QUIET` 持续 `SWIPE_REARM_MS`）才重新上膛；**捏合中 / 握拳中不判挥手**（`FIST_GUARD_SWIPE=0.8`） |
| **张掌 / 握拳** | **银河背景本身解体散开 / 聚拢回原样**（不换区、不暂停页面） | ⚠️ **语义 2026-10-13 反转**：张开=散开、握拳=恢复，和旧版正好相反。判据**不再**用 `fistness`（取「最伸那根手指」—— 反转后会把「食指指着屏幕」当成张手），改用 `spreadFromHand()`：**四指伸展的平均值** `SPREAD_MEAN_FIST=0.50`→`SPREAD_MEAN_OPEN=1.10` 线性映射到 0..1，**再乘一个「伸直了几根手指」的闸**（`SPREAD_FINGER_OUT=0.62`、`SPREAD_GATE_FLOOR=0.2`）；死区 `SPREAD_DEADBAND=0.06`；方向不对称低通（张开 `SPREAD_OPEN_TAU=0.26s` 甩出去有惯性 / 握拳 `SPREAD_CLOSE_TAU=0.18s` 被吸回来更果断 / 手离开 `SPREAD_RELEASE_TAU=0.55s`），再叠背景层一道 0.09s |
| **成功反馈** | 挥手成功时屏幕对应边缘掠过一道很轻的流光（左挥→右缘，右挥→左缘） | `EDGE_FLASH_MS=620`，纯 Canvas 叠加（`globalCompositeOperation='lighter'`），无 DOM |

坐标映射（**镜像**，跟照镜子一样自然）：

```
nx = ((1 - tip.x) - 0.5) * REACH_GAIN + 0.5      REACH_GAIN = 1.6
ny = (     tip.y  - 0.5) * REACH_GAIN + 0.5
```

`REACH_GAIN>1` 是刻意的：手只要在画面中间 0.24~0.865 之间移动，光标就能覆盖整个视口 ——
**不用把手伸到镜头边缘**。`1-tip.x` 是自拍镜像：手往自己右边伸，光标就往屏幕右边走。

### 13.2 文件与层级

```
src/ui/gesture/
  gesture.ts         内核：纯函数 + 可脱离 DOM 逐帧推进的状态机（能在 Node 里验算）
  tuning.ts          **全部可调参数的唯一真源**（其它文件里的同名常量都是它的别名）
  handTracker.ts     摄像头 + MediaPipe，lazy import()，只在点了开关之后才加载
  GestureControl.tsx 一个 Canvas 2D + rAF + 交互合成；探针挂在 window.__gesture
  gesture.css        只写层级与 pointer-events，画面全在 Canvas 里
src/scene/gestureParticle.ts
                     手势 → 背景的**桥**：一个 `{ spread }` 普通对象（同 `pointer.ts` 的做法）
                     ★ 两层靠它通信，所以 NebulaField **不用**反向 import UI 层的代码
public/gesture/
  hand_landmarker.task   MediaPipe 手部 21 点模型（约 7.8MB）
  wasm/                  vision wasm（SIMD 与非 SIMD 两份）
```

**「张掌让银河解体」这条链路**（改之前先认清它跨了**四个**文件）：

```
gesture.ts  ──每帧写──▶  scene/gestureParticle.ts  ──每帧读──▶  backgrounds/NebulaField.tsx
（spreadFromHand         （唯一的桥，一个数字）        （再平滑一道 → 写 uSpread
  低通成 spread）                                          给 STAR_VERT + HAZE_VERT）
                                                                   │
                                                                   ▼
                                                    backgrounds/shaders.ts
                                              STAR_VERT / HAZE_VERT：打散旋臂、
                                              按种子分档拉远、纵向撑开、瓦解核球
                                                                   │
                                                                   ▼
                                                    galaxy/GalaxyLayer.tsx
                                              BACKDROP_FRAG 也读同一个 spread ——
                                              底图照片一起淡出/推近/去对比
```

⚠️ ⚠️ **底图照片必须一起参与，这是「效果明显」的关键，缺了它整套就白做。**
实测：只让粒子层按 `uSpread` 散开时，图上确实能看出旋臂松了，但**读起来是
「一张完整的银河 + 几个点在动」**，而不是「银河正在解体」—— 因为那张银河照片
一直是画面的主角。加入 `BACKDROP_FRAG` 的 `uSpread` 之后（降亮 72%、Ken Burns
推近 ×1.28、旋臂对比拉低），才是「整片银河散成星尘」。

⚠️ **`uSpread` 必须在两个顶点着色器里都声明**（`STAR_VERT` + `HAZE_VERT`），
在**两个材质的 `uniforms` 里都要有**、`useFrame` 里**都要每帧写**。
漏掉任何一处，症状分别是：着色器编译失败（整层渲染不出来）/ 效果不生效（星点散、雾霭不散）。
这一版就是这么踩的 —— 见 §13.10。

⚠️ **`BACKDROP_FRAG` 的 `uSpread` 是第四处**，漏了不会报错、只会让效果「不明显」——
所以 `_analysis/by-gesture.js` 之外，`__nebula` 探针与像素级脚本也要一起看。

挂载点：`src/components/FixedNavigation.tsx` 里 `.fixed-ui` 的**最后一个孩子**；
层级 `.gesture-ui` **z=9**（在 `.scene-wrap` 内容之上、`.fixed-ui` 的 z=20 之下、`.loader` z=40 之下）。
`.gesture-ui` 与画布都是 `pointer-events:none` —— **不是靠透明，是靠层级和事件穿透**，
所以底下真实的 `<button>` 照样收得到鼠标。

### 13.3 为什么资源要放在本站 `public/`

jsdelivr 在本机**被墙**（`curl` 直接 000），而 MediaPipe 官方文档默认就是从 CDN 取
wasm 和 `.task` 模型。所以：**wasm 与模型全部下载到 `public/gesture/`**，运行时用
`fetch` 拿成 Blob、再用 `blob:` URL 喂给 MediaPipe —— 运行期**一个第三方请求都不发**。
（验收里专门有一条断言：模型/wasm 的请求 URL 必须落在本站 `/gesture/` 下。）

### 13.4 两条「不许破」的线

1. **用户点开关之前，一个字节都不碰摄像头。** 加载页面时 `getUserMedia` 调用次数必须是 **0**、
   DOM 里没有 `<video>`、也**不下载模型**；只有点了右上角那个小开关才申请权限并 lazy import MediaPipe。
2. **关了 / 拒绝权限 / 手机端 → 站点一切照旧。**
   - 拒绝权限：给明确原因「摄像头权限被拒绝 · 站点其它功能不受影响」+ 一个「重试手势控制」出口；
   - 手机端（媒体查询 `(hover:hover) and (pointer:fine)` 为假）：**整层不渲染**，DOM 里 0 个节点；
   - ⚠️ 判桌面**不要用 `navigator.maxTouchPoints`** —— 本机 headless 桌面返回 **10**（详见 §12.2）。

界面上的开关是右上角一个很小的 GlassButton（首页 `top:26px`；章节里下移到 `top≈78px`，
给「返回主页」让位）。文案在 `开启手势控制` / `手势已开启` / `重试手势控制` 之间切换。

### 13.5 想调什么，改哪里

⚠️ **只改 `src/ui/gesture/tuning.ts`** —— 那是唯一的真源（见 §13.8）。
下表括号里是 `tuning.ts` 里的字段名（`gesture.ts` 里可能有别的别名）。

| 想要的效果 | 改什么（`tuning.ts` 字段） |
| --- | --- |
| **① 食指移动 → 光标** | |
| 光标更跟手 / 更稳 | `POINTER_SMOOTHING.MIN_CUTOFF`（**大**=更跟手）、`POINTER_SMOOTHING.BETA`（大=快动时更跟手，⚠️ 别动）、`POINTER_SMOOTHING.D_CUTOFF`（小=静止更干净） |
| 手不用伸太远 | `REACH_GAIN`（大=更小的手部位移覆盖全屏） |
| **② 轻捏 → 点击** | |
| 捏合更容易 / 更难触发 | `PINCH_THRESHOLD`（大=更容易，⚠️ 别超 0.6）/ `PINCH_RELEASE`（迟滞带，**别拉太近**） |
| 握拳时还是会被点到 | `FIST_GUARD_CLICK` 调**小**（详见 §13.10 的量法） |
| **③ 左右挥手 → 切板块** | |
| 挥手更灵敏 | `SWIPE_DISTANCE` 调小、`SWIPE_SPEED` 调小 |
| 挥手更难误触 | `SWIPE_DISTANCE` / `SWIPE_SPEED` / `SWIPE_DOMINANCE` 调大，或 `SWIPE_NET_RATIO` 调大 |
| 别一挥就切两页 | `SWIPE_COOLDOWN` + **`SWIPE_REARM_MS`**（后者才是「手回到原位才能再挥」那一闸） |
| 半握着手也能挥 | `FIST_GUARD_SWIPE` 调大（默认 0.8 = 只有几乎攥死才拦） |
| **④ 张掌 / 握拳 → 银河解体 / 聚拢** | |
| 张掌更容易散开 / 更难 | `SPREAD_MEAN_OPEN`（**调小**=手不用张那么开）、`SPREAD_MEAN_FIST`（**调大**=手不用握那么紧也算聚拢） |
| 「食指指着屏幕」被误当成张手 | `SPREAD_FINGER_OUT`（**调大**=要求更多手指伸直）、`SPREAD_GATE_FLOOR`（**调小**=根数不足时压得更狠） |
| 散开更跟手 / 更绵 | `SPREAD_OPEN_TAU`（小=更跟手）、`SPREAD_CLOSE_TAU`（聚拢方向）、`SPREAD_RELEASE_TAU`（手离开画面后多久恢复原样） |
| 手轻微抖动时银河反复散开/聚拢 | `SPREAD_DEADBAND`（**调大**=死区更宽） |
| 散得更多 / 更少 | `NebulaField.tsx` 的 `SPREAD_DISPLAY_TAU`（背景层那道惯性）与 `shaders.ts` `STAR_VERT` 里的 `0.42`/`3.8`/`1.85` 与 `vColor *= 1.0 - 0.85*sps*exp(-rf*4.5)`（核球瓦解） |
| 底图照片跟着散得不够 | `shaders.ts` `BACKDROP_FRAG` 里的 `0.28`（推近）、`0.55`（去对比）、`0.72`（降亮） |
| **⑤ 反馈** | |
| 流光提示更明显/更弱 | `EDGE_FLASH_MS`（时长；强度是代码里的固定曲线） |

### 13.6 怎么测

```bash
# 内核逐帧验算（纯 Node，不开浏览器，90 项）
node _analysis/verify-gesture.js

# 浏览器真跑（真 Chrome + 真 rAF + 真 DOM 点击 + 假摄像头，87 项）
NODE_PATH="C:/Users/YLJBO/.workbuddy/binaries/node/workspace/node_modules" \
  node _analysis/by-gesture.js

# 挥手流光：用画布像素读数 + 出图证明「光只出现在该亮的那一边」，15 项
NODE_PATH="C:/Users/YLJBO/.workbuddy/binaries/node/workspace/node_modules" \
  node _analysis/_shot-gesture-flash.js

# 张掌解体：用**真实渲染出来的像素**证明银河真的散开了（中心浓度读数 + 对照图，10 项）
NODE_PATH="C:/Users/YLJBO/.workbuddy/binaries/node/workspace/node_modules" \
  node _analysis/_shot-gesture-spread.js

# 出图（给人看的视觉证据）
node _analysis/_shot-gesture-visual.js   # 5 张 + 放大裁图
python _analysis/gesture-sheet.py        # 拼成 gesture-contact-sheet.png
python _analysis/gesture-flash-sheet.py  # 拼成 gesture-flash-sheet.png
```

⚠️ **读数类脚本一律取峰值、不要赌某一帧**（§13.7 第 10 条那个假失败的教训）。
`_shot-gesture-spread.js` 的主判据是 `lib-png-stats.py` 的 **`hfs`（高通 + 中心浓度）**，
不是普通 RMS —— 三条踩坑理由都写在那个脚本的 `BOX` 注释里，简述：
① 普通亮度²加权 RMS 会被**底图照片**那层低频辉光吃掉（照片也是 WebGL，CSS 藏不掉）；
② 即使做了高通，`rmsNorm` 也不该当判据 —— **星系静止时就已铺满画面**，再膨胀只是出画被裁；
③ 圆心**必须锚到窗口正中**，取质心的话旋臂自转漂 25px 就让读数摆 15%（SNR 从 40 掉到 1.4）。

两个脚本是**分工**的：`verify-gesture` 把内核当纯函数逐帧推（确定性、毫秒级）；
`by-gesture` 用 Chrome 的**假摄像头**证明「真点了按钮 → 真拿到流 → 真建起 MediaPipe → 循环在跑」，
而**手部动作**用 `window.__gesture.feed()` 注入同一份合成手夹具（`_analysis/lib-hand.js`），
所以动作判定同样确定。这一条同时也是「完全不拦截任何请求」的冒烟用例。

探针（和 `__meteor` 同一套做法）：

```js
// 手势层（window.__gesture）
__gesture.probe()        // {status, cursor:{x,y,alpha}, clicks, swipes, frames, pinchRatio,
                         //  spread, spreadPeak, fistness, lastHit, inferMs…}
__gesture.feed(lm)       // 注入合成关键点（null = 这一帧没有手；undefined = 恢复用摄像头）
__gesture.startOffline() // 不碰摄像头直接开一层，用来隔离测交互逻辑
__gesture.clickAt(x, y)  // 手动触发一次点击合成，验证命中规则

// 背景层（window.__nebula，挂在 NebulaField 上）
__nebula.spread()        // 粒子层**这一帧真正写进 uSpread** 的值（已过两道平滑）
__nebula.intent()        // 手势内核给的原始意图（未平滑）—— 两者对不上就说明桥断了
```

⚠️ **`spread` 与 `intent` 必须分开读**：只断 `__gesture.probe().spread` 的话，
即使 `uSpread` 根本没接到着色器上（例如 uniform 忘了声明 / 忘了每帧写）也照样全绿 ——
这一版就是这么骗过去的（§13.10）。
⚠️ 但它**也查不出 `BACKDROP_FRAG` 忘了接 `uSpread`** —— 那不会报错、只会让效果「不明显」，
所以像素级脚本 `_shot-gesture-spread.js` 是这一段唯一能兜住的证据。

### 13.7 写这一层时踩过的坑（改之前先看）

**产品逻辑上的（都是真 bug，Node 与浏览器两边各抓到一些）：**

1. **~~捏住的手被当成「张掌」~~**（**该动作已删除** —— 第四个手势已从「张掌停留 = 暂停」
   换成「握拳 / 张掌 = 星空解体 / 聚拢」（§13.11 又把语义反转过来了），
   `isPalmOpen()` 与 `PALM_*` 参数都不在了）。
   但这一条揭示的**同类坑仍然活着**：**一个「看手型」的判据，如果不排除「手正在做别的动作」
   的状态，几个手势就会互相打架** —— 用户这次的原话正是「这几个手势一定要分清楚」。
   现在对应的两道闸是 `FIST_GUARD_CLICK`（握拳中不判点击）与 `FIST_GUARD_SWIPE`（握拳中不判挥手），
   量法见 §13.10。
   ⚠️ **反转语义的代价**：`fistness`（取「最伸那根手指」）原先还兼职当银河的判据，
   反转后它会把「食指指着屏幕」当成张手 —— 所以银河改用 `spreadFromHand()`，
   **两套判据并存、不能混用**，见 §13.11 的 ①。
2. **~~挥手之后手还举着 → 自己暂停~~**（同理，随暂停功能一起删除）。
   留下来的教训是通用的：**「手停住 / 手静下来」这类计时判据，要给它一个「刚做完别的动作」的宽限期。**
   现在的对应物是挥手的 `SWIPE_REARM_MS` —— 触发过一次挥手后必须**先静下来 90ms** 才重新上膛。
3. **挥手判据不能用「整窗平均速度」。** 人挥手常是「停一下再挥」，用 420ms 窗口的平均速度
   会把这段助跑摊薄到阈值以下 → 干脆不触发。修法：速度只量**最近 `SWIPE_SPEED_WINDOW_MS=200ms`**
   那一段（`motionSpeed`），窗口位移仍然看整个 420ms。
4. **单帧瞬移会切页。** 跟踪丢失后重新捕获、或左右手互换时，关键点会**一帧跳很远**，
   于是被判成一次极快的挥手。修法：`SWIPE_MAX_STEP_RATIO=0.6` —— 任何单帧位移超过
   总位移的 60% 就否决（真人挥手是连续多帧的）。
5. **挥手后清空整个位移缓冲会瞎一帧** —— 空缓冲让内核以为「手静止」，当时会让「张掌停留」
   的计时当场起跑（该动作已删，但坑还在）。修法照旧保留：只丢掉历史，**保留最后一个点当基线**。
   现在的受益者是「重新上膛」的静默计时（`SWIPE_REARM_MS`）—— 它同样会被空缓冲骗到。
6. **`.gesture-ui` 绝不能让捏合点到自己**（否则误触一下就把摄像头关了）→ `clickAt` 里
   先 `if (he.closest('.gesture-ui')) continue`，并跳过 `HTML/BODY`。

**验收方法上的（看着像失败、其实是脚本错了）：**

7. **⚠️ 用合成手「挪光标」时，节奏必须按墙上时钟，不能按帧数。**
   第一版是一个 pose 一帧 rAF，而 **headless 的 rAF 不锁 vsync** —— 102 帧可能在一百多毫秒里
   跑完，于是**一整个 200ms 窗口里装下了全部位移**，那条「最近 200ms 速度」的挥手判据直接超阈值：
   本意只是「把光标挪到导航节点上」，结果顺手把板块切了，接着的捏合落在转场中途被 store 丢掉。
   修法：改成 `setTimeout` 匀着喂（`_shot-gesture-visual.js` 里约 45ms 一步、总时长 2.2s），
   并在日志里把 `swipes` 打出来 —— **sweep 结束挥手数必须仍是 0**，这是这类脚本的自检线。
   ⚠️ 后来 `by-gesture.js` 里那个「一帧一个 pose」的 `playFrames()` 也**整个删掉了**
   （换成 `sweep()`），并在原位留了注释 —— 那个函数留着迟早有人再用回去。
8. **别拿「回放全绿」当网络可用**（老规矩，见 §8）：`_shot-gesture-visual.js` 全程不拦截请求。
9. **窗口刚切完就点东西会被丢掉**：转场期间 store 的 `isTransitioning` 还锁着。
   出图脚本里加 `waitSettled()`（`data-theme` 连续 1.6 秒不变才算稳）。
10. **光波只有 560ms、半径 6→68px，`page.screenshot()` 本身有 100~200ms 延迟**，
    一帧抓不准；而且**压在亮背景上根本看不出来**。
    修法：先用 Pillow 在全页截图里量出**最暗的 260×260 窗口**，在那块空天上捏合，
    再 60ms 一帧连拍 5 张挑最清楚的那张（`_shot-gesture-ripple.js`）。
    ⚠️ **同一类毛病在「数像素」上也犯过一次**：`by-gesture.js` 那条「捏合画出了光波」原本
    只采**一帧**（捏合后固定等 110ms）去和 80×80 统计窗比涨幅 —— 线上跑出
    `3479/2800 = 1.243 < 1.25` 的**假失败**（本地同一份代码是过的，纯粹是采样时刻的相位差）。
    修法：**连采 7 帧取峰值**，并把判据从「涨幅 ≥1.25」改成「涨幅 ≥1.15 **且** 绝对增量 ≥500px」，
    峰值实测 +1079px（1.41×）。**凡是量短促动画，一律取峰值，不要赌某一帧。**

**一个已知的交互取舍（不是 bug，先如实记着）：**

- 挥手判据只看「横向、快、直」，**不要求手掌张开**。所以**快速横向甩手去够远端按钮**
  会被判成挥手 → 切章节；慢慢移动则不会（阈值 `SWIPE_SPEED`）。
  ⚠️ 两轮调高灵敏度之后（`1.0/s → 0.55/s`，见 §13.8 / §13.10），这条取舍**更值得注意**了。
  这是「挥一下翻页」这条需求的直接代价。如果以后觉得容易误切，最自然的收敛方向是
  「**挥手必须同时是张掌姿势**」（张掌挥 = 翻页，指哪打哪 = 只移光标），
  但会改动已验收的判定契约，要动就得连 `verify-gesture` 一起改。

### 13.8 灵敏度调参 —— 用户反馈「正常挥手切不动」（2026-09-30）

> 用户原话：「手势交互已经基本能用了，但灵敏度还不够，尤其是左右挥手经常不能切换到
> 上一个或下一个板块。**不要重做整个手势系统，只优化现有识别逻辑。**」
> 于是这一轮**没有动架构**，只动了 `tuning.ts` 里的数值 + 补了两道防误触闸。

**为什么原来切不动**：旧门槛是「480ms 窗口内位移 ≥0.30 画面宽 + 最近 200ms 速度 ≥1.0/s」。
真人随手一挥的横向位移大概只有 **0.25 画面宽**（0.3 已经算很用力了），
**标准动作反而够不到门槛** —— 和 §13.7 第 3 条是同一类毛病（判据在惩罚正常动作）。

| 参数 | 旧 | 新 | 为什么 |
| --- | --- | --- | --- |
| `SWIPE_DISTANCE` | 0.30 | **0.18** | 0.25 宽的正常挥动要能切；0.10 的普通移动仍切不动 |
| `SWIPE_SPEED` | 1.00/s | **0.55/s** | 同上；仍高于「慢慢挪」的 ~0.3/s |
| `SWIPE_WINDOW_MS` | 420 | 480 | 给稍慢一点的挥动留出累计位移的时间 |
| `SWIPE_MAX_VERTICAL` | 0.22 | 0.26 | 手不是机器，稍微斜一点不该否决 |
| `SWIPE_DOMINANCE` | 1.8 | 1.5 | 与上一条配套；横向仍必须明显占优 |
| `SWIPE_COOLDOWN` | 950 | 900 | 用户要求「约 0.8～1 秒」 |
| `PINCH_THRESHOLD` | 0.42 | **0.50** | 轻捏（夹具实测 0.415）要点得动，半握（0.675）不能误判 |
| `CLICK_MIN_GAP_MS` | 320 | 300 | 同上，稍稍放宽 |
| `SMOOTHING.MIN_CUTOFF` | 1.15 | **1.9** | 更跟手（滞后 5.4px/帧）；`BETA` 0.0055→0.009 |
| `SMOOTHING.BETA` | 0.0055 | 0.009 | 快动时更跟手 |

**两道新加的闸（提高灵敏度必须配套，否则就是变乱触发）：**

1. `SWIPE_NET_RATIO = 0.7` —— **净位移 / 最大跨度** 必须 ≥0.7。
   `dx` 量的是窗口内的最大跨度，**原地左右来回蹭也能把 dx 蹭大**；净位移一卡就露馅。
2. `SWIPE_REARM_QUIET = 0.35` / `SWIPE_REARM_MS = 90` —— **「重新上膛」**。
   冷却是按时间的，只能挡住同一次挥动的余波；这一道挡的是「挥完接着又横甩一下」。
   触发一次挥手后 `swipeArmed=false`，**手必须先静下来（速度 <0.35 持续 90ms）**才重新置 true。
   这就是用户说的「手回到正常位置以后才能再次触发」。

**`SMOOTHING` 为什么不能再降**：`verify-gesture` 有一条硬线 —— 平滑必须把抖动压掉一半以上。
`MIN_CUTOFF=1.9` 实测 σ(输入 5.32px) → σ(输出 1.88px)（降 65%），仍在线下；
**再调大就真的会抖**，别为了「跟手」把它调到 3 以上。

**实测（不是估算）**：
`verify-gesture` 里有一条断言直接量「正常幅度是否够门槛」，浏览器端 `by-gesture`
新增 4 条 —— **0.25 宽 / 0.29s 的左挥切下一个、同样节奏的右挥切上一个、
0.10 宽的普通移动不切、0.42 宽但摊到 1.5s 的慢挪不切**。
这四条在旧参数下第 1、2 条必然失败（0.25 < 0.30），所以它们是这次改动真正的回归线。

### 13.9 挥手成功反馈：边缘一道很轻的流光

用户要求「很轻，不要箭头之类的游戏感提示」。实现（`GestureControl.tsx` 的 `draw()`）：

- **在哪边**：向左挥（→ 下一板块）→ **右**缘；向右挥（→ 上一板块）→ **左**缘。
  语义是「画面往哪边翻过去了」，不是箭头。
- **画什么**：一条 `globalCompositeOperation='lighter'` 的冷色**渐变**（宽 `min(210, 17%视口)`，
  从边缘向内渐隐）+ 贴边一道极细的亮线（让人一眼看出「从哪边进来」）。
  没有 DOM 节点、没有 SVG、没有箭头 —— 全在原有的那张 Canvas 上。
- **强度曲线**：`alpha = (1-p)² × 0.45`，`p = 已过时间 / EDGE_FLASH_MS(620ms)`。
  平方衰减 = 快起慢落：看得见，但绝不抢戏。
- ⚠️ **流光画在「没有光标」时也要继续画** —— 它在 `if (!it || it.alpha <= 0.02) return` **之前**。

`_shot-gesture-flash.js` 用**画布像素读数**证明它（15/15）：在 `.gesture-cursor` 上量
左右各 15% 宽的边缘带，两边的读数差是 **+115,761,016 vs 0**（左挥）、**0 vs +115,843,478**（右挥）。
为什么不用「整页截图相减」：银河一直在动，差分里 18~22% 的像素变化来自背景（§12 同一个坑）。
流光只在 Canvas 上，直接读这张画布的像素就**和背景完全隔离**。

### 13.10 手感重调 v4：四个动作分清 + 握拳攥起星空（2026-10-02）

> 用户原话：「跟手有点慢，把延迟降低、让它更灵敏，但**不要完全取消平滑**，不然会一直抖」；
> 「**不要**要求食指和拇指完全碰在一起，只要两根手指明显靠近，就应该判断为一次点击」；
> 「左右挥手不要用食指位置判断，**尽量根据整只手或者手掌中心**的位置判断」；
> 「握拳 → 粒子逐渐向一个区域收拢；慢慢张掌 → 粒子向外散开，**根据手掌张开的程度连续变化**，
>  平滑、有惯性，不要瞬间炸开」；以及一条总要求：「**这几个手势一定要分清楚，不要互相打架**」。

这一轮**没有动架构**：只改了 `tuning.ts` 的数值、把第四个动作整个换掉、
并给「握拳」新加了一条从手势层通到背景着色器的链路。

**① 四个动作 ↔ 四组参数名**（一一对应，改动只改 `tuning.ts`）：

| # | 动作 | 参数组 |
| --- | --- | --- |
| 1 | 食指移动 = 光标 | `POINTER_SMOOTHING`（+ `REACH_GAIN`） |
| 2 | 食指 + 拇指轻捏 = 点击 | `PINCH_THRESHOLD`（+ `PINCH_RELEASE` 迟滞） |
| 3 | 整只手（`palmCenter` = 手腕+四指根）左右挥 = 切板块 | `SWIPE_DISTANCE` / `SWIPE_SPEED` / `SWIPE_COOLDOWN` |
| 4 | 握拳 / 张掌 = 星空粒子收拢 / 散开 | `FIST_THRESHOLD` / `OPEN_HAND_THRESHOLD`（⚠️ **此语义已于 §13.11 反转**，参数组换成 `SPREAD_*`） |

**② 调了什么（旧 → 新）**：

| 参数 | 旧 | 新 | 为什么 |
| --- | --- | --- | --- |
| `POINTER_SMOOTHING.MIN_CUTOFF` | 1.9 | **2.9** | 慢速时的时间常数 84ms → 55ms —— 「手指一动，光标马上跟」 |
| `POINTER_SMOOTHING.D_CUTOFF` | 1.0 | **0.5** | 把速度估计也压稳 → **静止时的抖动比原来还小**（不是拿灵敏度换的） |
| `PINCH_THRESHOLD` | 0.50 | **0.54** | 「两根手指明显靠近」就点（夹具：张开 1.19 / 半握 0.675 / 轻捏 0.467 / 捏死 0.155） |
| `PINCH_RELEASE` | 0.72 | **0.76** | 迟滞带仍是 0.22；松手门槛 0.76 仍低于「拇指自然收在掌边」的 0.785 |
| `SWIPE_COOLDOWN` | 900 | **800** | 用户要的「成功切换以后停大约 0.8 秒」 |
| ~~`PALM_*`（张掌停留 = 暂停）~~ | — | **整套删除** | 第四个动作换成「握拳 / 张掌 = 粒子解体 / 聚拢」（语义见 §13.11） |

⚠️ `BETA` **没动**（0.009）。它是「静止抖动 vs 跟手」的支点，验收里有条硬线
（平滑必须把逐帧抖动压掉 ≥60%，实测 5.32px → 2.04px，降 62%）。
**要更跟手就抬 `MIN_CUTOFF`，别动 `BETA`。**

**③ 「握拳收拢星空」这条新链路**：手势层不认识背景、背景层不认识 UI ——
中间放一个普通对象当桥（和 `scene/pointer.ts` 完全同一套做法，见 §13.2）：

```
gesture.ts ──每帧写──▶ scene/gestureParticle.ts ──每帧读──▶ NebulaField.tsx ──写 uGather──▶ shaders.ts
```

判据是「**最伸着的那根手指**尖离掌心 ÷ 掌长」取四指**最大值**（不是平均）。
**取最大值这件事是关键**：只要还有一根手指伸着（比如「食指指着屏幕移光标」这个常态姿势），
就算不上握拳 → 移光标时**永远不会**顺手把星空攥起来。
夹具实测：张开手掌 1.224 / 半握 0.764 / 握拳 0.527（与手大手小、旋转无关）。

`uGather` 必须在**四个地方同时到位**，漏一处就是一种典型故障：

| 漏了哪儿 | 症状 |
| --- | --- |
| `HAZE_VERT` 里没写 `uniform float uGather;` | **雾霭层着色器整支编译失败**（`'uGather' : undeclared identifier`），那层直接渲染不出来 |
| 星点材质的 `uniforms` 里没有 `uGather` | 星点层永远不收缩（只有雾霭在收）—— 肉眼不一定看得出，效果少一半 |
| `useFrame` 里忘了 `su.uGather.value = …` | 同上（只写了雾霭的 `hu.`） |
| `window.__nebula` 探针没挂 | **上面任何一种都测不出来** —— 因为手势侧探针全绿 |

**④ 为什么必须有两道「防打架」的闸**（对着用户「手势必须分清」这条）：

1. `FIST_GUARD_CLICK = 0.40` —— **真握拳时拇指尖会横搭在食指上**，捏合比只有 **0.129**
   （比正常捏死还近）→ 不拦就会「用握拳控制粒子」时顺手点到页面。
   0.40 是**量出来**的，不是拍脑袋：手从张开匀速握到拳，捏合比掉到 0.54 的那一帧，
   闭合程度正好是 **0.469**，取 0.40 留 0.07 余量（`_analysis/_dbg-close-click.js` 有实测表）。
   正常「手指略弯着轻捏一下」的闭合程度只有 0.11~0.33，照常能点。
2. `FIST_GUARD_SWIPE = 0.80` —— 反过来，**半握着手挥手不能拦**（半握的闭合程度就有 0.53），
   所以这道闸只拦「几乎完全攥死」。验收里专门有一条「半握照样能挥」。

**⑤ 怎么验的**（三个脚本，全部读探针与真像素，不靠肉眼「看起来像」）：

| 脚本 | 项数 | 它证明什么 |
| --- | --- | --- |
| `verify-gesture.js` | **86/86** | 内核逐帧（纯 Node）：匀速移动滞后 4.9px（线是 45px）、阶跃后 **1 帧**到位、抖动降 62%；捏住 60 帧只点 1 次、没松开再捏不算第二次；收拢量随张开程度**单调**（1.00 → 0.89 → 0.53 → 0.11 → 0.00）；**食指指着屏幕 → 收拢量 0** |
| `by-gesture.js` | **86/86** | 真 Chrome + 真 rAF + 假摄像头：`__nebula.gather()` 跟着 `uGather` 走到 1.000、张掌回 0.000、**关掉手势后归零**；握拳全程 `clicks 3 → 3`、`swipes 5 → 5` |
| `_shot-gesture-gather.js` | **8/8** | **真渲染出来的像素**：亮斑 RMS 半径 0.1795 → 0.1176（**小 34%**），噪声底 1.8%（19 倍余量），出对照图 |

⚠️ **`_shot-gesture-gather.js` 的教训（比结论值钱，务必先看）**：
这个量法第一版取「画面中间」当统计窗口，把**标题文字**圈了进去 —— 而文字是画面里最亮的、
且完全不随手势变化，于是张开 → 握拳的读数只动了 **1.2%**，
看起来就像「手势压根没生效」，差点让我回头去改一段本来是对的着色器代码。
挪到「**全宽、下半幅**」（避开标题、避开右下角 (1362,844) 的音频按钮）之后，
同一组截图的读数动了 **34%**。窗口对比表写在 `_shot-gesture-gather.js` 的 `BOX` 注释里。
**凡是「量一个局部统计量」，先问一句：窗口里有没有比被测量更亮的不变量。**
另外，这个量有 ~5% 的噪声底（倾斜投影的旋臂在 8 秒里会转过 ~45°），
所以参照取「两次张开里较低的那次」，并要求信号 ≥ 噪声的 2 倍 —— **别拿它做 5% 级别的判定**。

---

### 13.11 手感重调 v5：**语义反转** + 底图一起解体（2026-10-13）

用户把第四个动作的要求整个反过来了：

> 「**张开手掌 = 银河散开** —— 星点、尘埃、光点从原位向外扩散，要**明显**，
> 像整片银河正在解体，变成大量星尘向宇宙中扩散，越张越散；
> **握紧拳头 = 聚拢** —— 散开的尘埃平滑地飞回原位，逐渐恢复完整形态，
> **完全握拳时银河基本恢复原来的完整形态**，像一个宇宙正被手掌吸回来。
> ……我要看到**银河本身**发生变化，而不只是前景多了几个特效。」

这一轮**没动架构、没动相机、没动识别**：手势内核还是那套，粒子还是那 12 万颗，
改的是 ① 判据换了指标 ② 着色器里的形变 ③ **底图照片也接进来**。

**① 判据必须换指标 —— 这是本轮最大的坑。**

旧判据 `fistness` 取的是「**最伸着那根手指**尖离掌心 ÷ 掌长」的四指**最大值**。
它当初为「握拳收拢」设计，语义反转后**直接变成错的**：
只要还有一根手指伸着，`fistness` 就接近 0 → **「食指指着屏幕移光标」会被当成完全张手**，
用户一边移光标一边就把银河炸开。

新判据 `spreadFromHand()` 用两个量：

| 量 | 作用 | 为什么 |
| --- | --- | --- |
| 四指伸展的**平均值** | 主判据，映射到 0..1 | 平滑连续，符合「根据张开程度连续变化」 |
| **伸直了几根手指**（≥`SPREAD_FINGER_OUT=0.62`） | 闸，`SPREAD_GATE_FLOOR=0.2` 起 | **平均值单独不够**，见下 |

⚠️ 这条是量出来的（`_analysis/_probe-spread.js`，15 个姿势）：

| 姿势 | 四指伸展均值 | 伸直根数 |
| --- | --- | --- |
| 张开手掌 | 1.105 | 4 |
| 张开 4 成 | 0.721 | 4 |
| **食指指着屏幕** | **0.647** | **1** |
| 两指 V | 0.842 | 2 |
| 握拳 | 0.486 | 0 |

**「指向」的均值 0.647 和「张开 4 成」的 0.721 几乎分不开**（只差 0.074）——
光看平均值必然误判。但**伸直根数**把它们干净地分开了（1 vs 4）。
所以 `0.62` 这个阈值是夹在「指向时非伸手指的最高值 0.527」与
「张开 4 成的最低值 0.659」之间量出来的。
另外实测：**捏合完全不改变四指伸展**（捏合时 mean 仍是 1.105），所以捏合不会误触银河。

**② 防抖三道**（用户：「手保持不动时不要反复散开/聚拢」）：
死区 `SPREAD_DEADBAND=0.06` 抹平贴着 0 的小幅抖动 + 方向不对称低通
（张开 0.26s 甩出去有惯性 / 握拳 0.18s 被吸回来更果断）+ 背景层再叠 0.09s。
验收里有一条：手不动 + ±0.006 关键点噪声跑 10 秒，**单帧最大变化 0.0000**。

**③ 着色器：四个动作叠加才读得出「解体」**（`STAR_VERT`）：

1. **打散旋臂** —— `theta += (aSeed.z - 0.5) * 3.8 * sps`（±110°）。只放大半径的话
   外面看着只是「银河变大了」，**不像解体**；这一步才是最关键的。
2. **飞行距离分档** —— `fly = aSeed.z²`，少数星尘飞很远、多数留在原地附近。
3. **纵向撑开** —— 主要靠「上下」长出去。⚠️ **径向不能无限放大**：相机在 z=6/fov=45，
   可见半宽只有约 **3.98** 世界单位，而星系半径就是 **3.9** —— 横向最多温和膨胀到 ~1.4 倍，
   再大粒子全飞出画面，银河看起来就变成「**消失了**」而不是「解体了」。
4. **核球瓦解** —— `vColor *= 1.0 - 0.85 * sps * exp(-rf * 4.5)`。
   ⚠️ **这一下比前三个加起来还关键**：中心那团最亮的核球是「银河」这个意象的锚点，
   它不弱化，粒子散开再多也还是读成「一张完整的银河」，因为眼睛先抓最亮的中心。

⚠️ **散开时不要把粒子调小调暗**（这一版先踩了）：那样只会让星尘直接消失，
读起来是「银河变淡了」。现在每颗保持原样，只把「大亮星」的额外放大收掉
（`1.0 + big*2.2*(1.0 - 0.75*sps)`）—— 星点不再是一颗颗亮钉子，而是均匀星尘。
外缘淡出用**原始半径 r** 而不是散开后的 rr，否则会在扩散后的新边缘切出一圈生硬的圆边。

**④ ⚠️⚠️ 底图照片必须一起参与 —— 缺了它整套就白做（本轮最贵的一课）。**

银河那张照片是**另一层 WebGL**（`galaxy/GalaxyLayer.tsx` + `BACKDROP_FRAG`），
CSS 藏不掉。第一版只改了粒子层，图上确实能看出旋臂松了，但读起来是
「**一张完整的银河 + 几个点在动**」，而不是「银河正在解体」—— 因为那张照片一直是画面的主角。

给 `BACKDROP_FRAG` 也接上 `uSpread`（`GalaxyLayer` 每帧读同一个桥）之后，照片会：
① 整体降亮 **72%**（星云棉絮被吹散）② 跟着**推近** `z × 1.28`（镜头往云层里钻）
③ 旋臂纹理**对比拉低**（`mix(c, vec3(lum), 0.55*sps)`，结构溶解成弥散辉光）。
三样都是跟着 `uSpread` 连续插值，所以握拳时原路长回来。

⚠️ 这一处**漏了不会报错、也不会让任何探针变红**，只会让效果「不明显」——
所以像素级脚本是唯一能兜住它的证据。

**⑤ 怎么验的**（三个脚本，全部读探针与真像素）：

| 脚本 | 项数 | 它证明什么 |
| --- | --- | --- |
| `verify-gesture.js` | **90/90** | 内核逐帧（纯 Node）：解体量随张开程度**单调上升**（0.00 → 0.37 → 0.58 → 0.79 → 1.00），**食指指着屏幕 → 0.000**、只伸两指 → 0.000、捏合期间**冻结**、手不动跑 10s 单帧变化 0.0000、手离开后先保持再慢慢恢复 |
| `by-gesture.js` | **87/87** | 真 Chrome + 真 rAF + 假摄像头：`__nebula.spread()` 跟着 `uSpread` 走到 1.000、握拳回 0.000、**关掉手势后归零**；张掌与握拳全程 `clicks 3 → 3`、`swipes 5 → 5` |
| `_shot-gesture-spread.js` | **10/10** | **真渲染出来的像素**：中心浓度 0.0505 → 0.0296（**降 41%**），半握 0.0420 稳居中间，回拢后 0.0547 恢复，噪声底 8.3%（5 倍余量），出对照图 |

⚠️⚠️ **`_shot-gesture-spread.js` 的量法三轮才立住，教训比结论值钱**：

| 轮次 | 量法 | 读数 | 为什么不行 |
| --- | --- | --- | --- |
| v4 | 亮度²加权 RMS | 动 **34%** | 窗口圈进了标题文字（最亮、不随手势变） |
| v5 | 同上，但先 CSS 藏掉 DOM | 动 **0.0%** | **底图照片也是 WebGL，CSS 藏不掉** —— 它那层低频弥散辉光把 RMS 锁死了 |
| v5 | 高通（灰度−高斯模糊）后的 RMS | 动 **2~3%** | **星系静止时就已铺满画面**，再膨胀只是让外圈粒子出画被裁掉 |
| v5 | 高通 + **中心浓度 conc** | 动 **41%** | ✅ |

最后还差一步：圆心取**质心**时 SNR 只有 1.4 —— 质心会随旋臂自转漂 25px，
而测量圈半径只有 91px。**锚到窗口正中**后 SNR 变成 **40**（信号 40.4% / 噪声 1.0%）。
另外 `core_frac` 必须**小**：离线扫过，0.06 → 信号 26% 干净；0.15 以上信号直接反号
（圈太大等于装进全部粒子）。完整扫描表在 `_shot-gesture-spread.js` 的 `BOX` 注释里。

**三条通用教训**：① 量局部统计量前先问「**窗口里有没有比被测量更亮的不变量**」，
CSS 藏得掉 DOM、藏不掉 WebGL；② **质心会漂**，量「中心浓度」这类量必须锚死圆心；
③ **量法本身也会骗你** —— 换指标前先离线扫一遍参数、确认信号方向和量级都对得上。

---

## 十四、首页「逐光而行」书法艺术字（2026-10-14 初版，2026-10-15 改用原图）

> ⚠️ **2026-10-15 已整章重写**：初版是「本机华文行楷提矢量轮廓 + SVG 逐笔流光」，
> 用户随后**上传了自己的狂草原图**并明确要求「优先使用原图，保留狂草造型」。
> → 整套矢量管线（`brushData.ts` + `extract-brush.py` / `split-strokes.py` /
> `build-brush-data.py`）**已删除**，不要再捡回来。
> 下面 §14.2 起是当前实现。

### 14.1 需求与最终效果

两行标题：上= `CHASING PHOTONS`（小字号、细体、大字距），下 = 「逐光而行」狂草书法，
作为首页核心视觉。要求：保留原图狂草造型与飞白 → 透明素材 → 银灰白+ 极淡雾蓝
（**不要冰蓝霓虹/强紫光**）→ 少量克制动效（淡入、星轨缓流、鼠标靠近星芒微亮，
**明确不要缩放/旋转/抖动**）→ 保留星河背景、导航、液态玻璃、手势、流星、转场。

### 14.2 透明素材怎么做的（`_analysis/make-brush-png.py`）

输入：用户上传的黑墨狂草 JPEG（1774×887，白底）
输出：`public/brush/zhu-guang-er-xing.png`（156KB）+ `.webp`（83KB），裁剪后 **1675×589**（宽高比 2.844）

**⚠️⚠️ 核心手法：`alpha = 1 − 亮度`，颜色自己生成 —— 而不是「把白像素删掉」。**
后者一定留白边：墨迹边缘是抗锯齿灰阶，JPEG 压缩还在边缘加了振铃，
这些像素是「白底与黑墨的混合」，直接丢白分量 → 深色背景上出现一圈发亮白边。
正确做法是：

```
alpha = 1 - luminance          ← 亮度当不透明度
RGB   = 目标银灰色（自己生成）   ← 颜色不取自原图
```

因为原图是**黑墨**（中性灰阶，颜色信息本就等于亮度），把颜色换成银灰、把亮度交给
alpha，**数学上不可能出现白边**：所有半透明像素颜色相同、只是更透明，边缘自然融进背景。
脚本里还有一道**白边自检**（统计「alpha 半透明但 RGB>235」的像素，必须为 0），
以及四角 alpha 必须为 0 —— 这两条写进验收脚本，不靠肉眼。

配色（`INK_TOP/INK_BOT/HAZE`）：`(226,231,238)` → `(176,186,198)`，底部 ~22% 掺
`(140,158,182)` 雾蓝。⚠️ 第一版取 `(243,246,250)` 太亮，实测预览接近纯白，
就是用户说的「刺眼」—— **降 `ALPHA_BOOST` 到 0.94、`ALPHA_GAMMA` 到 1.06** 才对。

### 14.3 组件与动效（`BrushTitle.tsx` / `brushTitle.css`，类名 `.brush2*`）

| 效果 | 实现 |
| --- | --- |
| 进场缓慢淡入 | `brush2In` 2.6s，opacity 0→1 + blur 7→0，`delay .35s` |
| 非常缓慢的高光流动 | `.brush2__sheen`，radial-gradient 中心跟随 `--mx/--my`，k=0.045，peak 仅 **0.16** |
| 鼠标靠近星芒微亮 | 8 颗，`opacity = --near × 0.55`，`.is-near` 由 rAF 判定，1.1s 过渡 |
| 主体稳定 | **不做**任何 transform / scale / 动画（验收里连采 4 次 transform 必须恒定） |

⚠️ 两条延续的硬约定：
- 指针只写 CSS 变量 + rAF（`--mx` / `--my` / `--near`），不进 React state。
- `.brush2` 是 `pointer-events:none`，**CSS `:hover` 永远不成立**（§14.4③的教训），
  `is-near` 用矩形命中判定自己加。

⚠️ **网页里不叠任何 `drop-shadow` / `text-shadow`** —— 发光会让「原图墨迹质感」
读成「发光的金属字」，恰是用户要避免的。颜色在素材阶段就定好了。

### 14.4 布局

`width: min(1120px, 76vw)` + `aspect-ratio: 1675/589`。
⚠️ 初版取 1240px 时，字的上缘会**顶到顶部导航**（`.topbar`），撞出「字压在导航上」
的观感 —— 截图看出来才收窄的。1280~2560 四种宽度实测都不溢出。

### 14.5 验收

`_analysis/by-home-brush.cjs` **36/36**：
两层结构 ✓素材 `naturalWidth=1675` ✓ **四角alpha=0** ✓ **白边像素=0** ✓
**渲染宽高比 = 素材宽高比（不变形）** ✓ 英文在中文上方 ✓ 水平居中且完整落在首屏中段 ✓
底边不侵入按钮 ✓ 点按钮真能进 PHOTON ✓ **主体 transform/尺寸恒定** ✓
星芒远 0.000→ 近 0.550 且 ≤0.6、离开复位 ✓ 1280/1600/1920/2560 不溢出 ✓ 控制台无报错 ✓

`live-check.cjs` 验线上：webp 请求 200、`naturalWidth=1675`、四角透明、
**旧 `.brush__svg` 已不存在**、零 pageerror。

⚠️ 探针自身的坑（都是假失败，不是代码问题）：
- 「远处」取点必须在**元素矩形外扩 12% 之外**（判定框是外扩的），
  原先取 (200,200) 恰好落在框内→ `is-near` 合理存在 → 报「鼠标不在附近时无 is-near」。
- 验透明要在浏览器里 `createImageBitmap` 后读 canvas，**不能**在 Node 里解 PNG。
- 想在页面里量像素**不要**把svg 序列化再 `drawImage`——会丢 CSS（动画态opacity、
  CSS 变量 transform 全失效），量出来是一片平灰光。
- 测近白色饱和度**必须用 HSV**（`(max-min)/max`）。HSL 在近白色上天生虚高：
  `#f4f7fa` 只有 6/255 色差，HSL 算出来 0.375 → 报「饱和度太高」是假失败。
- `feColorMatrix` 的 `values` 是 **4×5=20 个数**：行1(R)=0..4、行2(G)=5..9、
  行3(B)=10..14、行4(A)=15..19 → **alpha 系数是 `vals[18]`，RGB 常数是 `vals[4]/[9]/[14]`**。
