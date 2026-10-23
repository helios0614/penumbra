# Chat PR2 — 共享布局、Composer 与生成状态

日期：2026-10-23（Asia/Shanghai）。本轮只修改 Penumbra UI 和 Main 展示适配，未 commit、push 或部署，等待人工验收。未读取生产聊天、个人数据或凭据；测试全部使用合成数据。

## 组件与依赖边界

| 处理 | 组件 / 文件 | 职责 |
|---|---|---|
| 复用并扩展 | `src/components/chat/Sender.tsx` | 保留本地草稿、自动增高、异步接受确认、同步提交锁、Enter / Shift+Enter / IME 保护；增加焦点和菜单状态、通用 `tools` 插槽 |
| 复用并扩展 | `BubbleList.tsx`、`Bubble.tsx` | 保留日期、Markdown、Thinking、DRIFT、附件提示和消息动作；增加尺寸跟随和气泡内执行提示 |
| 复用并迁移 | `MainModelSelection.tsx` | 从页头折叠条迁至 Sender 的 `+` 锚定 Popover；保留原 Connection / Protocol / literal 编辑、保存回调、Readiness、错误恢复及后台任务说明 |
| 复用 | `ConversationsList`、`MessageActions`、`MarkdownRenderer`、`ThinkingBlock`、`SimpleThink`、现有 Button / Popover / Sheet | 不重建这些交互 |
| 新增 | `ChatShell.tsx` | 只组合侧栏、Header、通知、Body、Composer，处理当前嵌入容器的 viewport 几何 |
| 新增 | `GenerationIndicator.tsx`、`bubble-surface.ts` | 无正文时的生成提示，复用普通 AI 气泡表面；三点仅改变透明度，支持 reduced motion |
| 局部抽离 | `chat-ui-types.ts` | 仅显示消息和附件 VM；原 presentation 类型入口继续 re-export，未全量重组目录 |
| 局部抽离 | `chat-scroll.ts`、`chat-viewport.ts`、`chat.css` | 独立视口尺寸、滚动跟随与响应式样式，均有卸载清理 |
| Main 适配仍在原处 | `ChatView.tsx` 内的 `ChatWorkspaceView` 与 `chat-workspace/presentation/chat-execution-composer.ts` | 提供 UI 消息、时间线身份、发送资格、重生成回调和模型编辑器插槽 |

共享 Shell / Sender / Bubble / BubbleList 没有导入 Main API、Registry、Readiness 或执行 Controller。Main Workspace / Send / Realtime 的状态所有权、owner/sequence、持久化确认和 Runtime 冻结保护保持原样。本轮没有修改 application、domain、后端或命令执行代码，也没有新增 Provider、附件、Diary 或无行为菜单项。

## 布局、焦点与滚动

- Composer 采用正常 flex 流中的独立底部区域，表面使用现有 `mist-solid`，左右及底部留白形成悬浮感。消息视口拥有剩余高度，末尾不需要依赖猜测的 overlay 占位。
- PC 默认单层；文字变多时 textarea 向上扩展，最多约六行 / 可视高度的四分之一，之后仅 textarea 内滚动。
- 手机和粗指针触屏设备（包括横屏）在空 textarea 聚焦后展开双层：正文在上、`+` 与发送在下，几何过渡为 200ms。同一个 textarea 节点一直保留。空内容 / 收起宽度下仅一行的草稿可在失焦后收起；显式换行或自动换行超过一行则保持双层。长文仍限制最大高度并内部滚动，使用公共 `scrollbar-none`。
- 展开条件为 Composer 内焦点、菜单打开或多行草稿。Popover 使用 Base UI 的外部关闭、Escape 和键盘导航；打开菜单时 textarea blur 不会让 Composer 折叠。鼠标/触屏关闭不强抢焦点，键盘关闭仍可回到触发器。浮层锚定整个 Composer 上沿，不翻转覆盖输入与发送区；没有自动聚焦 literal 输入而额外弹出手机键盘。
- layout effect 与 ResizeObserver 测量两个不可交互的文字镜像，分别得到收起宽度的行数、当前形态的正文高度。不再通过修改 textarea 高度来测量，保留输入法状态、焦点、选区和原生内部滚动。收起宽度用于折叠资格，避免“展开时一行、收起时两行”的反复切换。宽度变化重新测量；保留同步 ref 提交锁、composition ref 和 Safari `keyCode=229` 防护。
- `visualViewport.height + offsetTop` 与当前 Shell 实际底边比较，仅补偿被遮住的部分；浏览器已经缩小布局时不会再次扣除整块键盘高度。不调用 window/document 滚动方法。没有 VisualViewport 时使用原生布局、dvh 和 safe-area 的 CSS 回退。
- BubbleList 使用不透明 `timelineKey`，继续在切会话和一次新的 send 时跟到底部。后续流式增长、WS 刷新、Composer / viewport resize、Thinking 展开均只在先前距底部 96px 内时继续跟随；向上阅读时不强行跟随。
- 跟随只写消息视口的 `scrollTop`，已移除可能连带滚动祖先的 `scrollIntoView`。ResizeObserver 同时观察消息内容和消息视口，观察者与 scroll / viewport / window 监听均在卸载或时间线切换时清理。

模型入口第一层只显示模型、友好连接名和编辑入口，进入编辑后才显示 Readiness、Connection / Protocol / literal 和保存 / 重读；完整身份与后台影响说明放在次级详情。使用现有 translucent Input / AppSelect / Button、Mist Popover 和隐藏滚动条的 ScrollArea；浮层宽度最多 340px，高度受上方可用空间限制。表单仍提交原 `onSave(conversationId, selection)`，发送中、保存确认中和会话切换中继续锁定修改。保存仍由 PR1 Controller 完成 PUT、readback 和并发身份确认。

## 生成状态映射

旧 AionHome 的定时轮换文案仅作为视觉参考，没有搬入阶段计时器。

| 可靠的现有信号 | 当前 UI |
|---|---|
| `sending-user` | 保留既有用户乐观消息和“正在发送”；尚未宣称 AI 开始生成 |
| `streaming` / `regenerate-streaming`，无可见正文 | 在 assistant 自己的位置显示“正在生成 ···”；即使只有 start、Thinking 或 DRIFT，也不出现空白正文方块 |
| 同上，有可见正文 | 等待气泡直接让位给增量正文，不追加“正在输入”；Thinking、DRIFT 仍在各自原组件中 |
| `finalizing` / `regenerate-finalizing` | 无正文时在原气泡位置显示“正在确认保存 ···”；有正文时只在消息元信息处显示保存状态，不将 SSE 结束视为持久化成功 |
| 未知且 HTTP 尚未成功重读 | 保留临时正文，元信息标记“结果待确认”；无正文才在原位置显示静态提示。保留原错误和只读恢复按钮 |
| 成功 receipt + HTTP 确认 | 退出 overlay，展示持久化正文及原有消息动作 |
| canonical 明确失败，HTTP 原文未变 | 原 message ID 处恢复原持久化正文，保留安全错误反馈 |
| 未知后 HTTP 成功重读 | 按 PR1 `recoveryReadSucceeded` 展示 HTTP 历史；未知状态不被伪装成成功，继续原只读恢复 / 人工核对流程 |

canonical regenerate 始终替换展示数组中的目标位置，原消息对象不变、不插入第二条 assistant、不更换目标 ID 或 created_at。流式控制内容过滤、同 ID receipt 对比和事务确认都继续由既有代码负责。Composer 不再重复显示正常生成提示；异常、恢复和非执行中的 Readiness 提示仍可见。

## 自动验证

新增 / 扩展验证覆盖：Sender 焦点和菜单 blur、草稿异步接受/失败/并发编辑、重复提交、中文 IME / Safari 229 / 换行、自动增高与宽度重测；viewport 键盘覆盖/平移/旋转/原生 resize 回退与清理；消息底部跟随与历史阅读；模型锁定、真实身份回调、失败保留与 readback；状态气泡和既有 Thinking / DRIFT / 复制；真实前端 SSE parser → Send Controller → presentation → Bubble 的正常发送和三类 canonical regenerate 收尾。

| 检查 | 结果 |
|---|---|
| Chat 相关回归 | Follow-up：27 个文件、452 项通过 |
| `npm test -- --reporter=dot` | Follow-up：114 个文件、1723 项通过 |
| `npx tsc --noEmit` | 通过 |
| `npm run build` | `tsc -b` 与 Vite production build 通过 |
| `git diff --check` | 通过；构建产生的已跟踪 tsbuildinfo 已还原，临时日志已清理 |

组件交互测试沿用仓库的合成 hook / callback 与静态渲染方式；几何使用 EventTarget 和人工尺寸。它们不等于真实浏览器布局、Popover 触屏命中或原生键盘验收。网络测试仅 mock fetch / SSE 和人工 HTTP 确认，没有连接真实服务或使用生产数据。

## 人工验收步骤

使用测试环境及专用合成会话，分别在 PC、iOS Safari、Android Chrome / 项目实际 WebView 中检查：

1. **PC 布局**：默认 Composer 紧凑，消息末尾和发送按钮完整可见。输入六行以上，确认向上增长后 textarea 内滚动。Enter 发送、Shift+Enter 换行；中文选词 Enter 不误发。
2. **手机空聚焦**：无内容点入 textarea，检查约 200ms 展开双层、工具栏留在下层；关闭键盘、点消息空白处、再次聚焦，检查折叠自然且草稿保留。空 / 单行可收起，多行和自动换行应保持双层；横竖屏改变宽度后重新判定，长文能滚动但没有滚动条。
3. **菜单与焦点**：从聚焦 textarea 点 `+`，检查先显示简洁摘要，点编辑才显示表单；菜单可点击、不会被 blur 关闭，浮层不覆盖 Composer。查看次级身份详情，操作 Connection / Protocol / literal，点外部和 Escape 关闭，再回输入框。检查浮层受上方可视高度限制，触摸 / 滚轮 / 键盘可滚动，包含嵌套 AppSelect 下拉，所有形态无可见滚动条。
4. **模型确认**：保存非 catalog literal，核对实际 PUT 与 readback、Readiness、生效身份和最近 Main 后台任务说明。限速模拟慢保存、A/B 切换和刷新失败，确认旧响应不覆盖当前会话；生成时模型修改仍被锁定。
5. **滚动**：分别在底部和上方历史位置打开/关闭 Composer、键盘、Thinking，等待 SSE / WS 更新。底部继续跟随；上方阅读不被拉回。发送新消息和切会话仍按原规则定位。
6. **生成与草稿**：限速到响应头前，观察用户乐观气泡及 Composer 暂存提示，而非两份提交原文；接受后提示解除且草稿清空。接受前断网应恢复原文，若有并发新编辑则使用保留详情手动恢复，不能覆盖新草稿或自动重发。观察无正文等待、Thinking / DRIFT、第一段正文直接替代等待气泡和元信息保存确认。重生成只替换原位置；验证成功后新正文、明确失败后原文、断流未知时只读恢复三种收尾，核对目标 ID 不变、没有第二条 assistant。
7. **视觉与可访问性**：浅色 / 深色、长 Connection ID、长 literal、字体放大、窄屏、横屏及系统 reduced-motion；检查状态气泡柔和、无空白块、无上下重复提示，复制内容和原 Thinking / DRIFT 操作正常。

**必须真机确认的限制：**iOS 浏览器地址栏伸缩、键盘动画期间的 viewport offset / pan、输入法候选栏、第三方键盘、Android resize/pan 与 WebView 差异、硬件键盘、旋转后光标及 textarea 内滚动、Home indicator 安全区、Popover 嵌套 Select 和触屏命中。自动测试无法证明这些场景的最终视觉与原生行为；本轮尚未做真机或真实模型联调。

## PR2 UI Follow-up：根因、修正与文件

本次仍为 PR2 人工验收修正，没有提前接入 PR3。实施前工作区干净；后端、application、domain、Workspace / Send / Realtime 职责与 PR1 契约没有修改。

| 问题根因 | 本次修正 |
|---|---|
| 手机形态通过 grid 行列直接切换，没有可插值的高度与留白 | 稳定 textarea 与工具节点，200ms 高度 / padding / 圆角过渡；reduced-motion 下即时变化 |
| 只看焦点 / 菜单，blur 总是收起；新 textarea 漏用公共隐藏滚动条样式 | 引入收起宽度的视觉行数，宽度变化重测，多行失焦保持展开；保留滚动能力并使用 `scrollbar-none` |
| 模型首次打开就铺满原生表单、长说明；锚点在底层 `+`，浮层底部可能落在正文区域 | 摘要 / 编辑分层、公共控件和 ScrollArea；完整身份 / 影响说明次级展开，整个 Composer 作为锚点 |
| 用户乐观消息发布早于 `openExecution` 接受；Sender 等待接受期间一直显示原文 | 分离“待确认快照”和可编辑草稿的显示；保持原接受判断，不提前丢弃未确认文本 |
| GenerationIndicator 独立定义表面且有正文后仍追加进度气泡 | 与正文共享 Bubble surface 常量；第一段可见正文直接替代等待气泡，确认 / 未知反馈移至元信息 |

### 发送时序与恢复策略

真实路径为 `点击 → Sender ref 锁 → Controller sending-user / optimisticUser → 等待 openSendExecution → 成功 HTTP SSE 响应或 duplicate acknowledgement → send() 返回 true → Sender 清理已接受快照`。流式输出和最终 HTTP 持久化确认继续独立进行。最初截图对应 A 类等待能够由源码与合成慢响应复现；不能仅凭“正在发送”推断已接受。未发现接受之后自动残留原稿的 B 类路径；新增集成测试验证接受发生在第一块 SSE 正文前、接受后 Composer 已空，后续 uncertain 不会复活旧稿。

点击时保存完整原文与编辑 revision，仅暂时隐藏提交快照，并显示“正在提交，原文已暂存”。`onSend` 接受且 revision 未变化才释放原稿；失败 / 接受前结果未知恢复完整原文。期间有新编辑时不覆盖，即使新稿恰好与提交内容相同也保留新 revision；未接受的旧快照放在 Composer 的可恢复详情中，用户明确操作才追加到当前草稿，从不自动发送或丢弃另一份草稿。接受后的流式失败 / 未知按原 PR1 历史恢复，不自动恢复为待重发草稿。

修改文件：

- UI：`src/components/chat/Sender.tsx`、`MainModelSelection.tsx`、`Bubble.tsx`、`GenerationIndicator.tsx`、`chat.css`；新增 `bubble-surface.ts`，只抽取同一气泡表面常量。
- 公共 Popover：`src/components/ui/popover.tsx` 仅透传已有 Base UI `anchor` / `collisionAvoidance` 属性；其他调用的默认行为不变。
- 回归：`Sender.interactions.test.tsx`、`MainModelSelection.test.tsx`、`GenerationIndicator.test.tsx`、`chat-generation-flow.test.tsx`、`chat-geometry.test.ts`、`ChatView.test.tsx`。
- 验收记录：本文。

新增验证包括：自动换行收起资格、横竖屏重测和稳定 ref / IME、异步接受前快照与未知恢复、并发编辑 revision、原文追加恢复、摘要与编辑切换、共用控件 / 隐藏滚动容器、整个 Composer 锚点及关闭焦点配置、200ms / reduced-motion 样式、过渡多次 resize 时历史阅读不跳动、无正文到正文和元信息确认状态。测试仍为合成 callback / 几何及真实前端 transport 的 mocked fetch / SSE；没有把它们当作真实浏览器动画或真机键盘验收。
