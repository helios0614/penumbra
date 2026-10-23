# Chat `+` 模型快捷菜单 UX 收口

日期：2026-10-23（Asia/Shanghai）。仅调整 Penumbra Chat UI 与必要的交互衔接；未 commit、push 或部署，等待人工视觉验收。

## 需求核对与边界

实施前工作区干净。核对了 `chat-implementation-audit.md`、`chat-pr1-contracts.md`、`chat-pr2-ui.md`、`chat-daily-ui-followup.md`，以当前源码和安装的 Base UI 1.5.0 为准。现有分层支持本轮调整，没有需要改变设计方向的阻断冲突。

保留 `useMainModelSelectionDraft` 和 PR1 Workspace Controller，未修改 application、domain、Main Chat API、Registry、Runtime、消息持久化、WS/SSE 或命令行为。共享工具菜单不导入这些业务模块。未接入附件、额外空菜单项或其他范围外功能。

## 最终菜单与状态规则

`+` → 同一个工具浮层：

- 日常：一个模型选择控件同时显示模型名称和友好连接名，下拉直接提供真实连接的默认模型；手动 literal 作为当前选择保留。正常就绪不单独占一行解释状态。
- 手动调整：同一浮层内展开连接、模型名称、接口格式；此时不再重复展示日常选择控件。完整连接/接口标识仅在存在诊断时出现。长名称在选择控件中省略，展开候选可以换行；完整 literal 可在详情的输入框中查看、移动光标和编辑。
- 有默认模型且配置完整时直接自动保存；缺少模型或接口格式时自动展开详情供补全，不提交空配置。没有独立保存按钮。
- 保存期间显示待应用选择和简短进度，同时单独保留服务端已确认的当前身份。选择控件跟随最新编辑意图，使用户能够在快速切换时再次选择原来的当前模型。只有 readback 完成后，才回到“当前模型”。
- 失败时保留草稿、显示安全错误，提供“刷新状态”和完整配置的“重试切换”；没有自动重试或 fallback。无错误时刷新入口留在详情。成功提示供辅助技术播报，不继续占据日常菜单一整行。
- 后台影响仅保留：“切换模型也可能影响知远之后的主动消息与提醒。”
- 使用现有 Input、AppSelect、Button、Popover、ScrollArea。表单共用 comfortable 尺寸；按人工视觉反馈，select 正文、候选项及模型名称 input 在手机和桌面均统一为 14px，辅助连接名仍为 12px。移除菜单内手机端 16px 覆盖；Composer 消息输入框字号保持原值。

## Popover 定位根因与修正

存在两个独立根因：

1. Sender 的展开条件包含 `menuOpen`，并在整个 Composer 上监听 focus capture。触发器甚至 React Portal 内部的焦点也会改变形态，导致失焦单层点击 `+` 被强制展开。现在仅 textarea focus 与既有多行判定决定展开；菜单期间保持进入前的焦点形态。指针从 textarea 打开工具时阻止触发器抢焦点，保留草稿、选区和正在进行的输入法状态；键盘导航仍沿用 Base UI。
2. Base UI 1.5.0 的 `useAnchorPositioning` 在 `keepMounted` 分支用 `elements.domReference`（触发器）建立 `autoUpdate`；外部 Composer anchor 仅作为 `positionReference`。Composer 向上增高时，底部按钮可能不移动也不变尺寸，因此触发器的 resize/layout-shift 观察不能保证重算实际顶部。仅传 `composerRef` 不足以覆盖该动画。

新增轻量 `ComposerToolsMenu`，继续使用 Base UI Portal、外部关闭、Escape、焦点管理和 available-height/width 碰撞尺寸。浮层使用 fixed 定位，固定在实际 Composer 上方 12px，不翻转覆盖输入区。只在打开及关闭动画期间逐帧读取 Composer 实际矩形和 visualViewport/window 几何；几何有变化才更新虚拟 anchor，anchor 的 rect getter 始终实时读取，不缓存旧矩形。完全关闭后取消跟踪；再次打开重新测量。没有重写 Composer 的 200ms 动画或 viewport 补偿。

浮层最大宽度同时受 available-width 限制；最大高度受实际 available-height 限制，内容由 ScrollArea 内部滚动。未通过禁止 overflow 隐藏滚动问题。

## 四类滚动的排查与结果

| 区域 | 处理与证据 |
|---|---|
| 消息列表 | 保留原 BubbleList / trackChatScroll 的跟随规则，无新增 scrollTop 写入。浏览器中向上阅读后，菜单开/关前后 `[scrollTop, scrollHeight, clientHeight]` 均为 `[0, 2228, 570]` |
| Composer 文本 | 保留 textarea 的 overflow-y:auto、多行镜像测量与最大高度；继续使用 scrollbar-none。三行草稿保持原文、焦点和选区，Composer 增至 144px，浮层仍与顶部相距约 12px |
| 模型浮层 | 390×320 视口配合三行 Composer 时，菜单 `[scrollTop, scrollHeight, clientHeight]` 可达到约 `[241.6, 387, 145]`；接口格式、刷新与提醒均可到达。overscroll-behavior:contain 阻止滚动链传给祖先 |
| 页面/祖先 | 同一短视口中页面 `[0, 318, 318]`，没有额外页面高度或滚动；消息列表 scrollTop 仍为 0 |

右侧可见条的一个明确源码来源是公共 ScrollArea：Viewport 虽然有 scrollbar-none，组件仍额外渲染 Scrollbar。现在仅在 Chat 消息列表和模型菜单局部隐藏该装饰条；两处实际 viewport 仍能滚动。浏览器读到两处 Scrollbar 的 display:none，消息、textarea、菜单的 scrollbar-width 均为 none。嵌套 AppSelect 继续使用已有 scrollbar-none，并在本菜单局部限制滚动链。此前录屏未附本轮可读的几何记录，因此不将每一次历史异常都归因于同一原因。

## 自动保存与协议保留回归

现有 UI 草稿 Hook 和 PR1 Controller 均未改动：

- 改连接预填该连接的 default_model；保留当前 protocol。手动 literal 不改变 protocol。候选格式只来自服务端全局 allowedProtocols 与当前值，不推断连接能力。
- 完整快捷选择自动保存；手输 literal 仅在非 IME Enter 或完成编辑/失焦时提交，Enter + blur 去重。
- 当前 PUT + readback 完成后才处理最后一个排队意图；快速选择可以返回原来的已确认 custom literal。失败停止队列并保留最新草稿；刷新只读，不新增 PUT。
- 真实前端 Controller + mock HTTP 集成仍验证 PUT 仅包含 main_selection，保存后配置与 Readiness 一致，保存期间禁止发送。
- 沿用 owner/sequence 与会话 key，A/B 切换、旧响应、卸载清理、发送/重生成资格和草稿保护由相关回归覆盖。没有写全局默认，也没有热切换已开始的 Runtime。

## 修改文件与原因

| 文件 | 原因 |
|---|---|
| `src/components/chat/Sender.tsx` | 去掉菜单强制展开与整个容器的 focus capture，只让 textarea 焦点驱动形态；接入轻量工具菜单，保留原草稿和发送逻辑 |
| `src/components/chat/ComposerToolsMenu.tsx`（新增） | 共享工具容器，承载 Portal、焦点策略、整块 Composer 锚点和关闭后的编辑状态；不依赖 Main API |
| `src/components/chat/composer-menu-anchor.ts`（新增） | 弥补 keepMounted 的独立 anchor 观察缺口，跟踪过渡/视口几何并清理帧任务 |
| `src/components/ui/popover.tsx` | 可选透传原生 positionMethod，其他调用默认值不变 |
| `src/components/chat/MainModelSelection.tsx` | Main 适配层内收口日常/详情结构、快捷预设、状态和文案；继续使用已有保存 Hook |
| `src/components/chat/chat.css` | 可用空间尺寸、滚动圆角、隐藏 Chat 装饰滚动条、长名称省略和嵌套选择的滚动链 |
| `src/components/chat/Sender.interactions.test.tsx` | 单层打开、双层保持、Portal 焦点与既有发送/草稿/IME 回归 |
| `src/components/chat/ComposerToolsMenu.test.tsx`（新增） | 顶部移动、实时 rect、视口变化、关闭动画、重新打开与跟踪清理 |
| `src/components/chat/MainModelSelection.test.tsx` | 日常直切、原模型返回、空默认补全、长 literal、IME、自动保存、失败恢复和真实 Controller readback |
| 本文 | 记录实现范围、证据与人工验收边界 |

## 自动检查

| 检查 | 最终结果 |
|---|---|
| Chat / Main 相关回归 | 已通过；包含模型选择、发送/重生成、Readiness、会话 owner/sequence、草稿和几何跟随。新增 7 项针对本轮交互的测试，均纳入全量 |
| `npm test -- --reporter=dot` | 116 个文件、1738 项全部通过 |
| `npx tsc --noEmit` | 通过 |
| `npm run build` | TypeScript build 与 Vite 生产构建通过 |
| `git diff --check` | 通过；新增文件另检无行尾空白 |

已还原构建生成的已跟踪 `tsconfig.tsbuildinfo`。临时合成 fixture 和浏览器验收页已移除；仅保留源码、测试、本文和聊天附件截图。

后续 14px 字体微调：模型选择相关 14 项测试、TypeScript 与 diff 检查通过。上表全量测试及生产构建记录对应此前的菜单结构收口，本次纯字号调整未重复运行。

## PC / 手机人工验收重点

本轮通过本地浏览器及专用合成 fixture 检查，未读取真实聊天、凭据或浏览器存储，也未调用真实模型/后端。fixture 在交付前删除，不加入生产路由。

已执行：390×700、390×320、667×375 和 1024×700 的 Chromium 视口；单层 60px、双层 96px、三行 144px 与 PC 52px；浮层上方约 12px；默认/手动详情、长友好连接名称、嵌套选择、快捷 default_model、原接口格式保留、隐藏滚动条与短视口内部滚动。测试数据均为人工示例。浏览器截图保存在本聊天的 visualizations 目录。

截图：[日常菜单](C:/Users/Admin/.codex/visualizations/2026/10/23/01a1694b-7d18-7642-bb34-5da03612ed90/chat-menu-daily.png)、[短视口详情滚动到底部](C:/Users/Admin/.codex/visualizations/2026/10/23/01a1694b-7d18-7642-bb34-5da03612ed90/chat-menu-short.png)。

继续人工验收：

1. PC：鼠标/键盘开关、Escape、Tab、长 literal 全文查看、异常恢复；上方阅读与底部跟随分别检查。
2. 手机：失焦单层和聚焦双层分别点 `+`，检查 12px 间距；多行、长文内部滚动、键盘开合与旋转期间保持草稿、选区及形态。
3. 短屏：滚动到每个真实操作，操作嵌套选择后回到菜单；检查没有消息/页面串滚，也没有任何原生条。
4. 专用联调会话：快速选择多个连接、无默认补全、手输完成提交、保存失败/刷新/明确重试，以及 A/B 会话切换。检查只写当前会话，Protocol 始终保留，摘要仅以服务端确认身份为准。
5. 浅色/深色、系统字体放大和 reduced-motion 下做视觉确认；发送、重生成、草稿、Readiness 仍需一次真实服务冒烟。

尚未验证：iOS Safari 原生键盘和自动缩放、地址栏伸缩、visualViewport 动画/pan、输入法候选栏与第三方键盘、Android Chrome/WebView 的 resize/pan、真机触屏及原生选区。桌面 Chromium 的窄视口和合成 viewport 测试不能代替这些真机行为；没有进行真实模型或后端联调。
