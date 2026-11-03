# Penumbra Settings PR1：基础框架、分类导航与系统概览

实施日期：2026-11-03（Asia/Shanghai）。依据 [Phase 0 复核](./settings-phase0-review.md) 第 10 节 PR1 边界及本轮要求。

## 起始状态与实施判断

- 分支：`main`；HEAD：`f51edec3c7a3a9b276f509c884fd8f8475a8056d`。
- 起始工作区仅有未跟踪的 `docs/settings-phase0-review.md`，原样保留。未 checkout、stash、clean、commit、push 或部署。
- 经典 `Desktop` 和 `EditorialDesktop` 均以 `isSettingsOpen` 直接挂载 `SettingsView`。`DesktopAppView` 承载业务 App，不承载 Settings；无需把 Settings 加入 App ID 或改动 Desktop 路由。
- Editorial 目前没有消费自定义桌面壁纸的链路。本轮保留此既有差异，不扩展背景实现。
- `/api/models` 是内置目录，不是远端可用模型全集。因此默认模型不在目录只作信息提示，不判断它失效。

## 修改文件与职责

| 文件 | 职责 |
| --- | --- |
| `src/components/settings/SettingsView.tsx` | 注册外观、系统状态两个可用分类；连接页面与概览 hook。 |
| `src/components/settings/SettingsShell.tsx`（新增） | 共享玻璃页面容器、响应式分类导航、内部返回栈、焦点与滚动容器、旧版入口。 |
| `src/components/settings/SettingsAppearance.tsx`（新增） | 从原 SettingsView 提取本机外观控件及读写；保留上传校验、壁纸预览、移除与保存中离页保护。壁纸读取失败回调增加卸载判断；分组说明允许窄屏换行。 |
| `src/components/settings/SettingsSafeBasics.tsx` | 三项独立概览、安全 readiness 文案、分项重试及全部重试。 |
| `src/components/settings/SettingsOverviewStates.tsx` | 分项 loading/error；401/403、网络、超时及契约异常的安全提示。 |
| `src/components/settings/settings-overview-controller.ts` | 三项状态与请求隔离；单项重试、取消及迟到结果丢弃。 |
| `src/components/settings/useSettingsOverview.ts` | 仅在系统状态分类激活时加载；离开分类或关闭 Settings 时取消。 |
| `src/application/settings-overview/settings-overview-service.ts`、`index.ts` | 按 section 调用既有 runtime client，净化错误；导出 section 类型。 |
| `src/components/settings/*.test.tsx`、`settings-overview-controller.test.ts`、`src/application/settings-overview/settings-overview.test.ts` | 页面结构、内部返回、存储保护、readiness 文案、并行/失败/取消/迟到响应及安全边界测试。 |
| `tests/browser/settings-pr1-smoke.cjs`（新增） | 两种真实 Desktop 上的生产 UI 验收；临时上下文、合成 HTTP/WS 与测试存储，拒绝外部请求。 |
| `docs/settings-pr1.md`（本文） | 实施与验收记录。 |

未修改 `lib/theme.ts`、`lib/wallpaper.ts`、贴纸存储、两种 Desktop、DesktopAppView、Chat、Diary 或后端源码。

## 页面结构与导航

可用分类：

1. **外观与本机偏好**：明暗模式、主题颜色、AI 主题色及气泡预览、桌面壁纸与显示参数。
2. **系统状态**：Session、模型目录、当前新会话默认配置的 Chat readiness / 连接配置诊断。

API 与连接、模型与任务分配、服务集成、MCP 工具（独立页面）、高级设置仅作为“后续开放”的静态文字；没有空页面、按钮或无行为入口。移除“日历设置”占位，业务配置保留各自 App。

桌面在 `md` 断点及以上使用窄分类栏与独立内容区，最大宽度 `max-w-6xl`。窄屏先显示分类列表，进入分类后隐藏侧栏，内容独占可用宽度。分类页和各内容页分别复用 `PageScrollArea`，不使用窗口长滚动。保留共享 `PageHeader`、玻璃表面及现有外观控件；分类栏、页内标题和概览标题使用既有玻璃底板，避免深色模式配浅色壁纸时文字直接落在壁纸上。

`SettingsShell` 以页面描述数组注册页面，暴露 `navigate(pageId)`、`goBack()`、`active`；后续子页可用 `nested` 注册，不占分类入口。内部返回弹出一层；一级页返回分类，嵌套页返回上级，均不调用 Desktop 的关闭回调。仅顶部“返回桌面”调用原 host 回调。进入分类时焦点移到标题，一级返回后焦点回到分类按钮。当前两个分类在 Settings 生命周期内保持挂载，切换不会打断原外观保存。

分类导航不修改 URL、不引入新路由或状态管理框架，不拼接根路径，沿用各 Desktop 的 base path。关闭再打开回到分类入口，外观重新读取原存储，系统状态在进入时重新读取。刷新和浏览器历史仍由现有 Desktop 管理；本 PR 不提供分类 URL、深链或浏览器历史中的 Settings 返回栈。原“返回旧版知远”仍为 `href="/" target="_top"`，这是离开 Penumbra 前往旧版的特例，不改成 `/penumbra/`。

## 外观存储边界

所有外观操作仍调用原函数，无自动迁移、服务器同步或后端写入：

| 数据 | 原契约 |
| --- | --- |
| 明暗模式 | localStorage `penumbra-theme-mode` |
| 主题颜色 | localStorage `penumbra-theme-color` |
| AI 主题色 | localStorage `penumbra-ai-color` |
| 壁纸显示参数 | localStorage `penumbra-wallpaper-settings`；`mode / fit / position / shade / textTone` |
| 壁纸 Blob | IndexedDB `penumbra-preferences`，版本 1，store `wallpapers`，key `desktop` |

保留 image 类型与 20 MiB 上传限制、已有 Blob 读取、预览 URL 清理、壁纸事件及明暗同步。以后外观资源服务器化可从独立 `SettingsAppearance` 与 `lib/wallpaper` 边界推进，不应改成整个 Settings 表单的通用保存。

## 系统概览调整

只调用既有 `GET /api/session`、`GET /api/models`、`GET /api/chat/readiness`，未新增探活或配置接口，runtime DTO / mapper / API 契约不变。

- service 改为按 `session / models / readiness` 读取；controller 并行启动三项，各项完成即发布，不等待其他项目，不因任何一项拒绝而清空另外两项。
- 每项都有独立 idle/loading/success/error。错误项有自己的重试；“全部重试”保留原手动重读能力，不生成配置写入。
- 每项有自己的 AbortController 和当前请求身份。新请求取消该项旧请求，旧结果（成功或失败）即使忽略取消也无法发布。离开系统分类、卸载、Strict Mode 清理时取消所有该生命周期请求并解除订阅。
- Session 只表示可读取的认证状态；401/403 仅在失败项说明读取未授权。模型目录可读取不证明上游可用。readiness 仅表示新会话默认配置，不代表现有会话选择，也不保证上游调用成功。没有合并“系统健康”灯。
- 为原有四类文案、`missing_credential`、`disabled_profile`、缺失/无效连接、默认选择缺失/重复/冲突、模型名称缺失、协议不兼容、服务地址/Registry 配置无效等补友好文案；保留 mapper 的 `generationUnsupported` 区别。
- 未知诊断及 `constructor` / `__proto__` 均使用通用安全提示，采用 own-property 判断，不展示原始诊断正文或任意异常。service 清除 ApiError 的原始 data/message，上游额外字段仍由既有 runtime mapper 丢弃。
- Provider 或默认配置未就绪只显示配置诊断；网络错误只描述该项读取失败，不据此把整个后端标记为离线。

## 验证结果

前端检查均通过：

```sh
npm test
npx tsc --noEmit --pretty false
npm run build
```

- 全量 Vitest：**211 个文件、2857 条测试通过**，含原 Chat、Diary、Desktop 和主题/壁纸测试。
- TypeScript：无错误。
- 生产构建：成功，使用项目既定 `/penumbra/` base；未部署。
- `git diff --check`：通过。构建生成的 `tsconfig.tsbuildinfo` 在交付前还原为起始内容，不作为业务改动。

浏览器使用临时 Chrome 上下文，不连接真实后端、Provider 或 MCP，不读取用户浏览器配置、密钥及真实站点存储。测试种入主题键和一张合成 PNG Blob；API/WS 均由 fixture 返回。三组验收：

| 脚本 | 覆盖与结果 |
| --- | --- |
| `settings-pr1-smoke.cjs`（生产 `/penumbra/`） | 经典 / Editorial × 320、390、1440，共 6 组通过。分类与页内返回、退出重开、已有主题与 Blob 读取不重置、预设/自定义颜色、三种明暗模式、壁纸上传/移除与参数保存/重读、三个概览成功及逐一 503、成功项不被遮蔽、单项重试仅请求该端点、慢接口隔离、已知/未知/原型名称诊断、卸载后迟到响应不污染重开、窄屏无横向溢出、旧版链接及 base path。每组后端写请求 0、页面异常 0、外部请求 0。 |
| 既有 `production-subpath-smoke.cjs` | 生产 `/penumbra/` 与开发 `/` × 1440、390，共 4 组通过。两种 Desktop、Chat 打开/刷新/返回/历史、桌面布局兼容与旧版跳转、API/WS 根路径、生产玻璃样式。页面异常 0。 |
| 既有 `diary-chat-pr4b-smoke.cjs` | 经典 / Editorial × 320、390、1280，另各有 390 深色，共 8 组通过。日历/聊天/阅读返回、正文提取预览、归档写入与结果核对、消息失效、归档后聊天、无正文与历史读取失败。使用 `/private/tmp` 的独立 `--base /` 构建适配该既有 fixture；所有写入只落在临时 fixture 内存。 |

新增 Settings 脚本复现：

```sh
npm run build
node tests/browser/settings-pr1-smoke.cjs <playwright模块路径> <Chrome可执行文件>
```

本轮使用 `/private/tmp/penumbra-pr4b-tools/node_modules/playwright` 和 `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`，无需新增项目依赖。Settings 合成验收 JSON 与截图位于 `/private/tmp/penumbra-settings-pr1-browser/`；已目视检查移动外观、桌面概览及 Editorial 移动概览截图。测试日志在 `/private/tmp/penumbra-settings-*.log`，均非交付源文件。

## 未完成项与已知限制

- 未实现 Connection、Feature Binding、服务集成、MCP 或高级配置编辑；后续独立 PR 注册可用页后才开放入口。
- 保留现有两种 Desktop 的壁纸消费差异；Editorial 可编辑本机壁纸偏好，但当前桌面自身不显示该壁纸。
- 无分类深链、跨刷新导航恢复或后端健康总览；三个读取状态只陈述各自的契约事实。
- 外观仍按当前 origin 存储；没有头像上传、外观服务器化、多设备同步、贴纸存储迁移或服务端 Settings 结构变化。
- 浏览器验收基于桌面 Chrome 的窄视口，不等同于 Safari、手机真机或生产配置验收。未调用真实上游或读取生产配置。

本轮只修改 Penumbra 前端及其测试/交付文档。未修改或运行 AionHome 后端，未执行真实配置写入、commit、push 或 deploy。完成后停止，等待人工验收。
