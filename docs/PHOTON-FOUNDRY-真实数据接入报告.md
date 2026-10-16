# PHOTON / FOUNDRY 真实数据接入报告

> 范围：本次只动了 **PHOTON（光 · 看见宇宙）** 和 **FOUNDRY（器 · 探）** 两个栏目。
> CORTEX / BLUEYARD / TECH 未改动（TECH 在上一轮已完成）。
> 全站既有的银河背景、液态玻璃、左侧轨道导航、粒子、以及「旧场景退出 → 银河空镜 → 新场景进入」
> 的转场时间轴都保持原样，新栏目挂在同一条转场轴上。

---

## 1. PHOTON 的真实数据在哪个文件

| 职责 | 文件 |
| --- | --- |
| **数据来源（唯一入口）** | `src/lib/apod.ts` |
| 真实数据**离线存档**（第三层兜底） | `src/lib/apodArchive.ts` + `public/apod-archive.json` |
| 「当前在看哪一天」状态机（含三层降级） | `src/photon/useApodDay.ts` |
| 页面骨架 | `src/photon/PhotonScene.tsx` |
| 观测台（画面 / 交叉淡入 / 放大热区） | `src/photon/ApodStage.tsx`、`src/photon/ApodMedia.tsx` |
| 科普信息面板（标题 / 原文 / 了解它） | `src/photon/ApodInfo.tsx` |
| 放大查看（灯箱） | `src/photon/ApodLightbox.tsx` |
| 日期轨道（← → / 日期点 / 跳转 / 今天） | `src/photon/DateTrack.tsx` |
| 在页面上填入自己的 NASA Key | `src/photon/ApodKeyForm.tsx` |
| 样式 | `src/photon/photon.css` |
| 图片「解码好了吗」预加载 | `src/lib/useImageReady.ts` |
| **Key 的唯一读取处** | `src/lib/env.ts`（`nasaApiKey()` / `setRuntimeNasaKey()`） |

## 2. FOUNDRY 的真实数据在哪个文件

| 职责 | 文件 |
| --- | --- |
| **数据来源（唯一入口）** | `src/lib/launches.ts` |
| 「即将发射 / 已完成 + 第几站」状态机 | `src/foundry/useLaunches.ts` |
| 页面骨架 | `src/foundry/FoundryScene.tsx` |
| 发射时间轴（5 站 / 左右浏览 / 点开详情） | `src/foundry/LaunchTimeline.tsx` |
| 倒计时（由官方 NET 实时算） | `src/foundry/LaunchCountdown.tsx` |
| 任务详情面板（液态玻璃） | `src/foundry/LaunchDetail.tsx` |
| 样式 | `src/foundry/foundry.css` |

两个栏目统一走同一套取数状态机：`src/lib/useResource.ts`
（首次取数 → 骨架屏；已有数据再取 → 旧数据留屏、静默换新；失败 → 错误态 + 重新加载）。

## 3. 实际请求了哪些 API

| 栏目 | 请求 | 说明 |
| --- | --- | --- |
| PHOTON | `GET https://api.nasa.gov/planetary/apod?api_key=…&start_date=A&end_date=B` | 主路径。一次拿回一整个 **30 天窗口**，区间请求只算 **1 次额度**，之后左右翻页全部命中本地缓存、零请求 |
| PHOTON | `GET https://api.nasa.gov/planetary/apod?api_key=…&date=YYYY-MM-DD` | 兜底：窗口里正好没有那天（如「今天」还没发布）时单独补一次 |
| PHOTON | 图片 / 视频字节：`https://apod.nasa.gov/apod/image/…` | 直接由 `<img>` / `<video>` / `<iframe>` 加载，不经过任何代理 |
| FOUNDRY | `GET https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=20&mode=detailed` | 「即将发射」批次 |
| FOUNDRY | `GET https://ll.thespacedevs.com/2.2.0/launch/previous/?limit=20&mode=detailed` | 「已完成」批次 |
| PHOTON | `GET /apod-archive.json`（同源） | **只在①②都失败后**才请求的真实数据离线存档，不是 API 调用、不花额度 |

LL2 用 `mode=detailed` 才有嵌套字段：`rocket.configuration.full_name`、`launch_service_provider.name`、
`pad.location.name`、`mission.orbit.name`、`mission.description`、`status.abbrev`、`net_precision.name`。

## 4. NASA 需不需要 Key？Key 放在哪？

**需要。** APOD 接口不带 `api_key` 会直接 403。

- 不填时自动回落到 NASA 官方公共演示 Key `DEMO_KEY`：**能取到真实数据，不是假数据**，
  但额度只有 **10 次/小时**，而且是**全世界共用的一把演示 Key**——
  实测经常一瞬间就被别人刷空（返回 429），界面上会明确显示
  「数据暂时获取失败 · 被限流（HTTP 429）」+ 额度说明 + 「重新加载」，**不会拿假图顶上**。
- 填自己的 Key 后额度是 **1000 次/小时**，免费、1 分钟申请：<https://api.nasa.gov/> → 填姓名邮箱 → 邮件里拿。
- **放哪**：`blueyard-r3f/.env.local`（与 `package.json` 同级），内容一行：

  ```
  VITE_NASA_API_KEY=你的40位key
  ```

  - 模板与说明见 `blueyard-r3f/.env.example` 最后一节。
  - `.env.local` 已被 `.gitignore` 的 `*.local` 规则忽略，**不会进版本库**。
  - 全项目**只有一处**读它：`src/lib/env.ts`。任何 `.ts/.tsx` 里都没有、也不允许
    出现 Key 字面量（已全量扫描确认）。
  - ⚠️ `VITE_*` 会被编译进前端产物，浏览器里能看到 —— NASA 的 APOD Key 属于
    「公开只读、被看到也无所谓」的类型，所以可以这么用；服务端密钥绝不能放这里。
  - 改完 `.env.local` 要**重启** `npm run dev`。
  - ⚠️ **线上必须在部署方的构建变量里配**：Vite 的 `VITE_*` 是打包那一刻写进 JS 的，
    部署完之后再去服务器补 `.env` 没有任何作用。
- LL2 **不需要 Key**。

### 4.1 也可以不改环境变量，直接在页面上填

失败卡和「离线存档」标注条里都有一个 **「填入我的 Key」** 输入框
（`src/photon/ApodKeyForm.tsx`）：粘贴进去点「保存并重试」，
Key 存进用户自己的 `localStorage`（`blueyard.nasa.key.v1`，不上传任何地方），
**立即生效、不需要重新构建**。页脚会如实写明现在用的是哪一把 Key。

Key 的优先级是：**页面填入 > 构建时 `VITE_NASA_API_KEY` > `DEMO_KEY`**。

### 4.2 不配自己的 Key 会怎样（这一版重点修的地方）

⚠️ 这一条务必知道：**`DEMO_KEY` 不是「能用的默认值」，它是全世界共用的一把演示 Key，
只有 10 次/小时**。PHOTON 又是首屏默认板块，一进站就取一次数 ——
不配自己的 Key，页面就会**周期性地**变成失败卡。这不是边缘情况，是必然会发生。

实测证据（`_analysis/why.log`，用浏览器自己的网络日志抓的）：

```
外部请求: https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY&start_date=2026-08-17&end_date=2026-09-15
[console] Failed to load resource: the server responded with a status of 429 ()
页面内直连对照: HTTP 429 remaining=null
界面: 「数据暂时获取失败 · 被限流（HTTP 429）」
```

所以现在把取数分成了三层（`src/photon/useApodDay.ts`）：

```
① 本地缓存          命中就零请求（APOD 某天发布后不再变）
② NASA 官方接口      区间请求 1 次额度拿 30 天
③ 公开数据离线存档   前两层都失败时的最后兜底
```

第 ③ 层**不是假数据**：`public/apod-archive.json` 装的是某次真连 NASA 抓下来的
**原始响应行**（由 `_analysis/make-apod-archive.js` 生成），加载时走 `apod.ts` 里
**完全相同的 `normalize()`**，所以存档条目和实时条目的字段结构不可能跑偏。

三条不可越界的规矩：

1. **只在网络失败之后才加载**，而且**失败时不写进实时缓存** —— 存档和实时数据在
   存储上完全分开，网络恢复后标注自动消失。
2. **界面上必须明确标注**（琥珀色标注条）：「离线存档 · NASA 接口当前不可用（被限流
   （HTTP 429））—— 正在展示 2026-09-15 20:45 抓取的真实 NASA 存档（2026-08-17 →
   2026-09-15，共 30 天）。这不是实时数据。」并给出 **「重新加载」** 和
   **「填入我的 Key」** 两个出口。
3. **存档模式下日期游标与随机探索都夹在存档区间内**，宁可说「这一天存档里没有」，
   也绝不显示区间外的内容；翻页**就地读存档，不再打网络**（否则接口挂着时每翻一天
   都白烧一次额度）。

只有连存档也拿不到时（例如静态托管漏了这个文件）才显示失败卡 —— 那时卡片上带一个
**真的能点**的 Key 输入框。

顺带把请求频率也降下来了（原先「今天」有 30 分钟 TTL，等于同一天里每半小时重取一整窗）：

| 场景 | NASA 请求次数 |
| --- | --- |
| 同一天内第一次访问 | 1 |
| 同一天内再访问（哪怕隔几小时） | **0** |
| 跨天后第一次访问 | 1（只缺「今天」） |
| 块内任意翻页 / 随机探索 | 0 |

敢永久缓存「今天」是因为**失败路径从不写缓存**（超时 / 429 / 400 都不落盘），
所以「今天还没发布」不会停在空结果上。想要强制拿最新版就点「重新加载」——
那个按钮会绕过缓存真去取一次。

## 5. 这些互动都做完了

### PHOTON（光 · 看见宇宙）

| 互动 | 实现 |
| --- | --- |
| 显示「今天的」天文图片 / 视频 + 标题 + 日期 + NASA 英文原文 + 来源 | ✅ 「今天」按 **UTC 自然日**算（北京时间凌晨那几小时本地日期比 UTC 早一天，直接用本地日期会被接口当「未来日期」拒绝） |
| ← / → 切换日期 | ✅ 日期轨道两侧的 ← →，切换时**不突然跳变** |
| 点日期轨道上的某一天 / 用日期输入框跳到任意一天 | ✅ 范围严格夹在 APOD 真实区间 `[1995-06-16, UTC 今天]` |
| 「今天」一键回到最新一天 | ✅ |
| 点画面放大查看（灯箱） | ✅ 用 NASA 的 `hdurl` 高清原图；`Esc` / 点背景 / 关闭按钮都能关 |
| 「了解它」展开 NASA 完整原文 | ✅ 默认收起，展开后长文自身可滚；换一天自动收回 |
| 「随机探索」 | ✅ 在 1995-06-16 至今之间随机挑一天，跳过去取真实数据（降级到离线存档时只在存档区间内挑） |
| 视频日不报错 | ✅ 直链 `.mp4` 走 `<video>`；YouTube 走官方 `<iframe>` 嵌入帧（实测两天都渲染正确、脚本零报错） |
| 像「在银河里观测天体」而不是普通图站 | ✅ 观测台外有缓慢旋转的轨道环 + 环上的观测点；换天是「旧图淡出微移 → 新图从右侧淡入」（620ms 交叉淡入），不是闪一下 |
| 接口挂了也得能用 | ✅ 三层取数降级（缓存 → 官方接口 → 真实数据离线存档）+ 琥珀色标注条说清「这不是实时数据」+ 两个恢复出口（见 4.2） |
| 不改环境变量也能恢复实时 | ✅ 页面上直接「填入我的 Key」，存浏览器本地、立即生效、免重新构建 |

### FOUNDRY（器 · 探）

| 互动 | 实现 |
| --- | --- |
| 显示任务名 / 火箭 / 机构 / 发射时刻 / 发射场 / 任务简介 / 状态 | ✅ 全部取自 LL2 字段 |
| 自动算倒计时（`T-02D 05H` 这类） | ✅ 目标时刻只有一个来源：接口的 `net`（绝对时刻）；组件每秒读一次 `Date.now()` 重算，**没有任何写死的剩余时长** |
| 倒计时精度不造假 | ✅ 接口的 `net_precision` 说到哪一级就显示到哪一级：`Second→D H M S` / `Minute→D H M` / `Hour→D H` / `Day→D`；`net` 为空（TBD）时直接显示「时刻待定」，不硬凑 |
| 3~5 个即将发射任务做成可左右浏览的时间轴 | ✅ 一屏 5 站（窄屏自动降为 3 站），两侧 ← → 浏览整批，并标出「第 n / 共 m 站」与当前站 |
| 点某个任务 → 液态玻璃详情面板 | ✅ 点时间轴的站点即选中 + 弹详情；`Esc` / 点背景关闭 |
| 「即将发射 / 已完成」状态切换 | ✅ 玻璃分段控件；切过去会**真实再发一次** LL2 请求（分别是 `upcoming` / `previous`） |
| 已完成批次显示 T+（已过计划时刻） | ✅ |

### 两个栏目共有的加载 / 失败体验

- 首次取数：**「正在连接宇宙数据……」** 骨架玻璃 + 转圈，**不显示任何假内容**。
- 取不到：
  1. 先降级到**真实数据离线存档**（PHOTON）—— 琥珀色标注条写明「什么时候抓的 /
     覆盖哪些天 / 为什么降级 / 这不是实时数据」+「重新加载」+「填入我的 Key」。
  2. 连存档也拿不到才显示**「数据暂时获取失败」** + 具体原因 + 「重新加载」
     + 填入自己 Key 的入口，并明确写着「这一栏不会用任何编造的图文代替 NASA 的真实数据」。
- 429 限流时额外说明这是**公共演示 Key 全世界共用、只有 10 次/小时**，以及怎么填自己的 Key。

## 6. 怎么证明数据是真的、不是假的

不是靠肉眼看，而是**可证伪的逐字段比对**：脚本把页面自己发出的接口响应抓下来，
再拿界面上显示的每一个字去跟接口原始 JSON 比。

| 脚本 | 覆盖 | 最新结果 |
| --- | --- | --- |
| `_analysis/by-photon.js` | PHOTON 54 项（含降级路径） | **54 / 54 通过，0 失败** |
| `_analysis/by-photon-resilience.js` | PHOTON 降级路径 33 项 | **33 / 33 通过，0 失败** |
| `_analysis/by-foundry.js` | FOUNDRY 44 项 | **44 / 44 通过，0 失败** |
| `_analysis/by-user-view.js` | 完全不拦截的真实网络冒烟 | 见下 |

跑法（先确保站点在跑，默认 <http://127.0.0.1:5183/>）：

```bash
cd C:/Users/YLJBO/WorkBuddy/2026-09-14-15-02-50
NODE_PATH="C:/Users/YLJBO/.workbuddy/binaries/node/workspace/node_modules" \
  node _analysis/by-photon.js              # 报告 → _analysis/_photon_shots/report.json
NODE_PATH="C:/Users/YLJBO/.workbuddy/binaries/node/workspace/node_modules" \
  node _analysis/by-photon-resilience.js   # 报告 → _analysis/_resilience_shots/report.json
NODE_PATH="C:/Users/YLJBO/.workbuddy/binaries/node/workspace/node_modules" \
  node _analysis/by-foundry.js             # 报告 → _analysis/_foundry_shots/report.json
NODE_PATH="C:/Users/YLJBO/.workbuddy/binaries/node/workspace/node_modules" \
  node _analysis/by-user-view.js           # 不拦截，真开一次页面

# 想重新真连一次 NASA（会花额度）：
FRESH=1 node _analysis/by-photon.js
```

关键的几条断言（都能在报告 JSON 里看到原始数据）：

- `标题 === NASA 原文标题`、`说明文字 === NASA 原文说明`（逐字相等，长度也相等）
- `界面没有出现 NASA 响应里没有的图片地址` → 界面上的 `img.src` 必须是接口返回的 `url` 或 `hdurl`
- `图片真的画出来了（naturalWidth>0）` → 图**字节**确实是从 `apod.nasa.gov` 实时下载并解码成功的
- `随机日的标题 === 该日 NASA 原文`、`随机日的画面 === 该日 NASA 媒体地址`
- **降级后**：`标题在真实存档里找得到（不是编的）`、`存档模式下翻页 0 次 NASA 请求`、
  `随机探索不越出存档区间`、`恢复实时之后存档标注条消失`
- **填 Key**：`保存后立刻触发重新取数`、`这次请求真的带上了刚填的 Key`、`Key 存在浏览器本地`
- **缓存**：`同一天第二次访问 0 次 NASA 请求`
- `时间轴上每个任务名都在接口返回里找得到（没有编的任务）`
- `倒计时 === 接口 net 减当前时间`（容差按官方精度取最小单位，Hour 精度就容 ±1 小时）
- `详情面板的发射时刻 === 接口 net 换算到本地时区`
- 失败态额外断言：`不显示任何图片标题` / `不显示任何任务`、`不渲染画面层` → 证明「取不到时没有拿假数据顶上」
- 布局：`没有横向滚动`、`一屏装得下`、`正文给左侧轨道让出了空间`
- 控制台：`没有脚本报错`

### ⚠️ 一条必须记住的教训：不要只用「回放模式」验收

`page.route` 拦下来的请求如果由 `route.fulfill()` 满足，
**`page.on('response')` 不会触发** —— 也就是说「回放全绿」**证明不了真网络下可用**。

这一版最初就是栽在这里：两套回放验收全绿，但用户真实打开时看到的是一张失败卡
（`DEMO_KEY` 被限流 429），因为回放时根本没走真网络。
所以现在必须额外保留一条**完全不拦截**的用例（`by-user-view.js`）—— 它什么都不做，
就是真开一次页面看首屏长什么样。这条用例是这次发现问题的唯一途径。

### 关于 PHOTON 的「录播」机制（为什么它 0 额度也能跑）

NASA APOD 的 `DEMO_KEY` 是**全世界共用**的一把演示 Key，额度 10 次/小时，
实测运行期间被刷空过（连续 4 次真连全部 429）。如果验收脚本每次都真连，
这个测试就变成了「看运气」。

所以 `by-photon.js` 做成了录播：

- 脚本会真连 NASA 一次，把**原始响应原样**存进 `_analysis/_photon_record.json`
  （文件里带 `url` + 抓取时间 + 状态码；种子存档是 `_analysis/_apod_window.json`，
  2026-09-15T12:45Z 抓到的真·30 天区间响应，含 30 条真实条目）。
- 之后每次运行从这个存档回放，**页面走的是完全相同的取数代码路径**，只是数据来自本地存档。
- 图片 / 视频**字节仍然实时从 `apod.nasa.gov` 下载**，`naturalWidth>0` 就是硬证据。
- 回放没覆盖到的请求默认**不直连**（会记为 `gap` 并单独记账），
  想要一次纯真网络的验收就加 `FRESH=1`。
- 随机探索那一项，脚本只在**点击的瞬间**把 `Math.random` 钉在
  「让它挑到存档区间里某一天」的取值上（点完立刻还原），
  应用侧 `randomApodDate → goDate → 取数` 的逻辑一行没改，所以回放模式下这一项也是真在验。

**真·网络证据（保存下来的原始日志）**

- `_analysis/photon3.log`：真连 NASA，前 11 项逐字段比对全部 PASS
  （标题 `A Daytime Eclipse: Moon Occults Venus`、说明 940 字、图片 960×1083 均来自接口原文）。
- `_analysis/photon-live.log`（FRESH 实跑）：NASA 返回 **429 remaining=0**，
  界面**如实**显示「数据暂时获取失败 · 被限流（HTTP 429）」+ 重新加载，
  **页面上没有任何替代内容** —— 这同时也验证了真·429 下的失败路径。
- `_analysis/foundry4.log`：FOUNDRY 44/44（LL2 有 4 次真实请求，全部 200）。

> 结论：NASA 那一侧想 100% 稳定地跑真网络验收，**得填一个自己的 Key**
> （免费，1000 次/小时）。DEMO_KEY 只适合演示，不适合压测。

## 7. 还有没有残留的 mock / demo / 写死数据？

**没有。** 已对 `src/`、`public/`、`index.html` 全量正则扫描
（`mock|假数据|示例数据|sample|placeholder|hardcode|写死|demoData|DEMO_KEY|FAKE`），
26 处命中**全部无害**，逐类说明：

| 类别 | 命中位置 | 说明 |
| --- | --- | --- |
| 着色器代码 | `src/backgrounds/shaders.ts`（6 处） | `uniform sampler2D`，正则误命中 "sample" |
| 注释里的「保证」 | `src/lib/apod.ts`、`src/lib/launches.ts`、`src/photon/PhotonScene.tsx`、`src/foundry/*`、`src/lib/useResource.ts` | 都是「**没有** mock / **绝不**显示假数据」这类约束说明，不是数据 |
| `DEMO_KEY` | `src/lib/env.ts`、`src/lib/apod.ts`、`src/vite-env.d.ts` | NASA **官方公共演示 Key**（是真实 Key，不是假数据），仅在用户未配置自己的 Key 时启用，且界面上会明确标出 |
| 表单占位符 | `src/tech/tech.css`、`src/tech/TechScene.tsx` | CSS `::placeholder` 与 `placeholder="Filter"`，UI 属性 |

PHOTON / FOUNDRY 里**没有任何本地图文清单、示例任务、写死的标题或倒计时**。
（`TECH` 也已在上一轮清干净；`dist/` 是构建产物，未计入。）

### 关于后来加的那份 `public/apod-archive.json`

它不是 mock。把它单独说清楚，免得以后有人扫到「存档」两个字误会：

- 内容是**某次真连 `api.nasa.gov` 抓下来的原始响应行**，由
  `_analysis/make-apod-archive.js` 直接从真实响应生成，生成时逐行校验
  `date` / `media_type` / `url` 三个关键字段缺一即拒绝出文件。
- 加载时走的是 `apod.ts` 里**和实时取数完全相同的 `normalize()`** ——
  不是另写一套转换逻辑，所以字段结构不可能跑偏。
- 它是**第三层兜底**，只在缓存和官方接口都失败之后才被加载；
  而且**失败时不写进实时缓存**，两者在存储上完全分开。
- 界面上**必须**标注它是存档（琥珀色标注条写明抓取时间、覆盖区间、
  「这不是实时数据」），不允许冒充实时。
- 存档模式下日期游标与随机探索都夹在存档区间内，绝不显示区间外的内容。

想核对的话：打开 `public/apod-archive.json`，随便挑一条日期去
`https://apod.nasa.gov/apod/apYYMMDD.html` 对一下，图文应当逐字一致。

## 8. 本轮修掉的真实 Bug（都是靠验收脚本抓出来的，不是猜的）

1. **图片 CORS 卡死**：`apod.nasa.gov` 不返回 `Access-Control-Allow-Origin`，
   给预加载的 `Image` 设 `crossOrigin='anonymous'` 会让预检被拦、卡约 4.5 秒才 `onerror`，
   期间连正在显示的图都被拖成 `naturalWidth=0`。→ 去掉 `crossOrigin`（我们从不读像素，不需要它）。
2. **换天时旧画面层泄漏**：`ApodStage` 的卸载定时器写在依赖 `current` 的 effect 里，
   `setCurrent` 会让 effect 重跑、cleanup 把刚设好的定时器立刻清掉，旧层就永远留在 DOM。
   → 定时器移进 `useRef`，只在卸载时清一次。
3. **画面点不到**：`.scene-wrap` 默认 `pointer-events: none` 只白名单 `button/a/.logo`，
   裸 `<img onClick>` 的点击会被下方的银河画布截走。
   → 图片外面包一层 `<button class="apod-media__hit">`（同时也拿到了键盘可达性）。
4. **FOUNDRY 的 429 误报**：首屏默认是 PHOTON，它一挂载就会去取 NASA；
   在 FOUNDRY 的验收里这条请求会留下与 FOUNDRY 无关的控制台记录。
   → FOUNDRY 验收里把 PHOTON 的 NASA 请求用本地存档回放喂掉（不占额度、零报错）。

### 补修（用户反馈「这个任务无法使用」之后）

5. ⭐ **不配 Key 时页面会周期性变成死页**（用户报的那个问题）。
   `DEMO_KEY` 是全世界共用的 10 次/小时演示 Key，PHOTON 又是首屏默认板块 ——
   一进站就取数，被刷空就是一张失败卡。实测：`api.nasa.gov` 返回 429、
   页面显示「数据暂时获取失败 · 被限流（HTTP 429）」。
   → 加「真实数据离线存档」第三层降级（明确标注 + 两个恢复出口）、
   加页面内填 Key 入口、并把请求频率从「每 30 分钟一次」降到「每访客每天一次」。
6. ⭐ **「本次为实时取数」会撒谎**：`fetchApodWindow` 在请求失败但本地有部分缓存时
   会静默用缓存顶上，而调用方无条件把页脚标成「实时取数」。
   → 数据层新增 `fromNetwork` 字段如实上报，界面照着显示。
   （顺带去掉了那个吞异常的分支本身：能走到它的路径上 target 一定不在缓存里，
   顶上来的数据答不出用户要的那一天，只会白打一次请求、把失败反馈从 15s 拖成 30s。）
7. ⭐ **新增的 Key 输入框点不到**：和 Bug 3 同一个坑 —— `.scene-wrap` 的
   `pointer-events` 白名单里没有 `input`。
   → `.apod-key__input` 显式 `pointer-events: auto`，并加进验收的命中测试。
8. **验收方法本身的缺陷**：`page.route` + `route.fulfill()` 满足的请求
   **不会触发 `page.on('response')`**，所以「回放全绿」证明不了真网络可用 ——
   这正是问题 5 之前没被发现的原因。
   → 新增完全不拦截的 `by-user-view.js` 冒烟用例。

## 9. 已知事项 / 建议

- ⚠️ **务必给 NASA 填一个自有 Key**（见第 4 节）。这不是「可选优化」：
  `DEMO_KEY` 全世界共用、只有 10 次/小时，不填的话 PHOTON 会周期性降级。
  没配也不会白屏（会降级到真实数据存档并明确标注），但那毕竟不是实时数据。
  **线上记得在部署方的构建变量里配好再构建。**
- 离线存档目前覆盖 **2026-08-17 → 2026-09-15 共 30 天**（就是当时真连抓下来的那一窗）。
  想扩就要跑 `_analysis/make-apod-archive.js`；
  注意它只接受**真连 NASA 抓到的原始响应**，不接受任何手工内容。
  拿到自己的 Key 之后可以批量抓历史日期把存档做厚（1000 次/小时，随便抓）。
- 生产静态托管时，如果用到 Hugging Face 镜像（TECH 栏目），要在网关上加一条
  `/hf-api/* → https://hf-mirror.com/api/*` 的反代规则（dev / preview 已由 `vite.config.ts` 配好）。
  没配时前端会正常回落到「取数失败」错误态（带重试按钮），不会白屏。
- 静态托管还要确认 `public/apod-archive.json` 被一起发布（Vite 会自动拷进 `dist/`，
  已实测 `dist/apod-archive.json` 38587B 存在）。漏了不会白屏，只是退化成失败卡。
- `apod.nasa.gov` 的图片/视频是**大文件直连**，网络抖动偶尔会有一条
  `Failed to load resource: net::ERR_CONNECTION_CLOSED`。验收脚本已把这类
  「媒体网络失败」与「脚本报错」分开记账：前者单列不判失败，后者必须为 0。
- `apod.nasa.gov` 取一张图在本机实测要 **5~6 秒**（141KB）。所以验收脚本里
  图片断言必须轮询等 `naturalWidth > 0`，不能采一次就断言。
- NASA 已在 APOD 说明里公告主站将迁到 `science.nasa.gov/apod`。
  真迁走的话要改 `src/lib/apod.ts` 的 `apodPageUrl()`（目前拼的是
  `apod.nasa.gov/apod/apYYMMDD.html`）。数据接口 `api.nasa.gov` 不受影响。

## 10. 实况复验（不做任何拦截的真实网络，可复核）

上面第 6 节说过「回放全绿 ≠ 真网络可用」，所以每次改动收尾都必须再跑一遍
**完全不做 `page.route` 拦截**的实况用例。下面是最近一次（2026-09-15 22:4x，本机预览
`http://127.0.0.1:4173/`，服务对象是 `dist/` 构建产物）的原文记录。

**PHOTON**（`_analysis/by-photon-settled.js`、`_analysis/_final/photon-settled.png`）

```
网络：429  https://api.nasa.gov/planetary/apod?api_key=***(DEMO_KEY)&start_date=2026-08-17&end_date=2026-09-15
      200  http://127.0.0.1:4173/apod-archive.json
媒体：OK (9175ms)  natural=960x1083  opacity=1  objectFit=contain
      https://apod.nasa.gov/apod/image/2609/MoonVenus_Mariat_960.jpg
标题：A Daytime Eclipse: Moon Occults Venus
日期：2026 年 9 月 15 日 · 周二（输入框 2026-09-15，与 stage 读数、信息卡三处一致）
正文：940 字，逐字为 NASA 原文
失败卡：false          画面层：正常渲染（已截图肉眼确认是那张真实日食照片）
存档标注：离线存档 | NASA 接口当前不可用（被限流（HTTP 429））—— 正在展示
        2026-09-15 20:45 抓取的真实 NASA 存档（2026-08-17 → 2026-09-15，共 30 天）。
        这不是实时数据。 [重新加载] [填入我的 Key]
页脚：SOURCE NASA APOD · 每日天文学图片公开接口 · Key：DEMO_KEY（公共演示 Key，
      10 次/小时；https://api.nasa.gov/ 可免费申请（1000 次/小时））
```

即：**即使被限流，叶子节点看到的仍然是一张真实 NASA 照片 + 一句如实说明 + 两个恢复出口，
而不再是原来那张干巴巴的失败卡。** 这正是本轮要修的东西。

**FOUNDRY**（`_analysis/by-final-check.js`、`_analysis/_final/foundry.png`）

```
网络：200  https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=20&mode=detailed
首条：OK (13259ms)  Gravity-1 · Orienspace Technology · Commercial
      NET 2026-09-16 05:55 (UTC+08:00) · Haiyang Oriental Spaceport · Yellow Sea (launch location 5)
倒计时：T- 00D 07H（官方精度 Hour，所以不显示分秒）
列表：28 场真实任务（Sentinel-3D & FLEX / SpaceX Falcon Polar Group #15 /
      Unknown Payload / USSF-259 / Progress MS-35 (60P) …）
页脚：SOURCE LAUNCH LIBRARY 2 · THE SPACE DEV… · 更新于 2026-09-15 22:08 · 本次为实时数据
```

FOUNDRY 不受限流影响（LL2 免 Key），这一轮它一直是实时数据。

**三套自动化验收同日复跑**（`_analysis/_rerun-*.log`）：

| 脚本 | 结果 |
| --- | --- |
| `by-photon.js` | 检查项 54，通过 54，失败 0，跳过 0 |
| `by-photon-resilience.js` | 降级路径验收 33/33 通过，0 失败 |
| `by-foundry.js` | 检查项 44，通过 44，失败 0 |

控制台里剩下的只有 `net::ERR_FAILED / ERR_CONNECTION_CLOSED` 这类
`apod.nasa.gov` 媒体抖动（脚本侧已单列记账，不计入脚本报错）。
