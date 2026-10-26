# Chat PR6.5-B — 快捷参数与Header收口

日期：2026-10-26（Asia/Shanghai）。按[PR6.5-A审计](./chat-pr6-5-config-audit.md)及用户确认实施。仅修改Penumbra；未commit、push或部署，等待人工验收。

## 最终语义与作用域

Header右侧为“当前会话搜索 → 聊天快捷配置”。面板只提供上下文消息数和Temperature：桌面Popover、手机Dialog，共用同一个表单与校验函数。使用现有Input/Button/Popover/Dialog及Mist token，模型仍只在Composer修改；不增加“更多设置”。

- 默认快照为空，两字段均省略；30/1.0只提示后端契约默认，不表示读取过服务器配置。
- 上下文严格整数1–100；温度按已确认protocol：Anthropic 0–1，OpenAI/Gemini明确协议0–2。历史Profile未提供协议时禁用温度输入，不按模型名猜测。0保留，非法/非有限值或越界不应用。
- “应用到后续请求”才改变已应用快照；无有效变化时禁用。取消/关闭丢弃本次编辑；“恢复后端默认”立即清空已应用覆盖并关闭，后续请求真正省略字段。也可清空单个输入并应用，仅删除该项。
- Workspace controller持有唯一内存快照；作用域是当前已确认会话与Connection/Protocol/Model。身份变化清空；每次身份更替生成新的scope对象，A→B→A不会复用旧表单授权。同身份列表/历史刷新保留快照。
- 不写DB、Settings JSON、localStorage或会话配置，不新增读取/保存API；离开/刷新不承诺恢复。Thinking、全局参数、HEART/DRIFT、Voice/TTS、缓存、carryover与后台任务均未扩展。

源码：[参数校验/作用域owner](/Users/remix/Desktop/Penumbra/src/components/chat-workspace/chat-request-parameters.ts:1)、[共享表单](/Users/remix/Desktop/Penumbra/src/components/chat/ChatRequestParametersMenu.tsx:1)、[Workspace接入](/Users/remix/Desktop/Penumbra/src/components/chat-workspace/chat-workspace-controller.ts:201)。

## 请求组装与执行锁

ChatView在send/canonical target regenerate调用前读取最新Workspace状态，将同一已应用快照交给既有`mapChatSendExecutionInput`/`mapChatRegenerateExecutionInput`。send合并附件且保留原正文及client_msg_id；regenerate仍为空body、query传参。未应用时wire与原来一致，不额外附默认数字/null。捕获后的数值快照不受后续UI变化影响。

UI沿用managementLocked，Controller还同步检查execution guard、会话mutation/切换、configurationPending和scope引用；不能凭尚未重渲染的旧按钮或旧表单绕过。在生成、最终确认和结果未知期间不能应用/恢复配置。

422、上游不支持及网络异常继续走既有错误/HTTP核对/SubmissionRecovery保护，不自动重发、降温或换模型。参数应用不改终端错误恢复规则：失败提交仍可从暂存恢复，按现有手动流程核对/返回编辑，不因“应用参数”清除错误。MCP追加仍使用后端原父请求冻结策略。

源码：[send/regen组装](/Users/remix/Desktop/Penumbra/src/components/chat/ChatView.tsx:88)、[已有请求mapper](/Users/remix/Desktop/Penumbra/src/application/chat-send/chat-send-request.ts:10)。AionHome生产代码、Provider/Renderer、SSE/WS、持久化回执与历史窗口逻辑没有修改。

## 会话管理与搜索

移除Header重复ConversationMenu。桌面侧栏与手机抽屉继续复用ConversationsList、ConversationMenu、ConversationDialog及原rename/delete mutation；包括当前会话。抽屉先关闭再打开确认弹窗，取消后恢复到稳定入口，删除当前选剩余会话、删除最后一项保留空态和新建入口。

PR3浏览器测试改从列表/手机抽屉定位当前会话菜单，并补当前messages/window合成响应及最后会话删除检查。Header当前搜索、列表全局搜索与原文弹框源码均未调整。

## 验证结果

- `npm test`：**161个文件、2147项全部通过**，包含新增30项参数契约、3项共享表单交互、3项Workspace owner集成，以及已有模型持久化、附件/未知恢复和regen回执回归。
- `npx tsc --noEmit -p tsconfig.json`：通过。
- `npm run build`：通过（包含`tsc -b`与生产Vite构建）。
- `chat-pr6-5-config-smoke.cjs`：**320/390/1280px全部通过**。真实production Chat配合合成HTTP/WS，检查默认省略、上下文边界、温度0、协议范围、send/regen同值、空body、取消/默认恢复、模型/协议/会话更替清空、422提交保护、结果未知锁、无Settings/Registry写入、无横向溢出及Escape焦点恢复；同时验证面板关闭不清除当前搜索、侧栏/抽屉全局搜索仍可打开。
- `chat-pr3-smoke.cjs`：桌面/手机通过。覆盖侧栏/抽屉当前与其他会话重命名/删除、失败与取消、确认、最后一项删除、新建入口、焦点、草稿隔离、执行锁，以及原阅读/主页导航回归。
- 修改涉及的文档表格及新增引用、统一清单159个稳定ID与状态统计、`git diff --check`核对通过；旧模型菜单记录里的历史Windows截图路径原样保留，不属于本次产物。AionHome工作树保持干净，未访问私人配置/聊天或真实模型。

截图位于[320px](/private/tmp/penumbra-chat-pr65/parameters-320.png)、[390px](/private/tmp/penumbra-chat-pr65/parameters-390.png)、[1280px](/private/tmp/penumbra-chat-pr65/parameters-1280.png)，已核对布局。headless合成验证不代替真实手机软键盘、原生返回手势及上游模型能力验收。

## 已更新的原有文档

- [settings-inventory.md](./settings-inventory.md)：长期唯一清单。C01标模型读写/执行已接通；C02/C03分别写明入口、读取、临时应用、消费者与作用域；统计相应调整。C04 Thinking仍暂缓；全局温度与请求温度分开；HEART/DRIFT保留消费者，TTS后台同步和本机Voice链缺口只登记。连接管理/全局默认绑定仍未接入。
- [frontend-migration-plan.md](./frontend-migration-plan.md)、[frontend-contracts.md](./frontend-contracts.md)：纠正旧model权威/secret陈述，更新Main读取/保存边界及两参数的临时请求契约。
- [chat-pr3-conversations.md](./chat-pr3-conversations.md)、[chat-model-menu-ux.md](./chat-model-menu-ux.md)：更新Header/列表/抽屉入口与Composer分工，保留模型自动保存与协议保护。
- [C1历史审计](./configuration-ownership-audit.md)、[7月Settings历史审计](./audits/settings-domain-audit-2026-07-31.md)及PR6.5-A报告仅补现行状态指引，原审计判断保留；未建立第二份大型配置矩阵。

## 人工验收

PC与手机检查两参数的输入、取消、恢复默认、范围错误及Header/Composer分工；生成和结果未知时应禁用应用。切换会话或模型后再打开面板，旧临时覆盖应消失。手机软键盘与短横屏检查表单滚动、按钮可达和关闭焦点；从抽屉管理当前/其他/最后会话。具体上游不支持Temperature时应保留原错误并手动修正，不自动换路由。
