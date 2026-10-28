# Chat 气泡与发送快捷键验收记录

日期：2026-10-28。基线：`22fb1fe`（PR7-C），开始时工作区干净。本轮未 commit、push 或 deploy，未修改后端。

## 实现与原因

### Assistant

现有顺序是控制标记过滤 → Bubble 拆分 → MarkdownRenderer。SSE 使用 `chat-send-accumulator`；HTTP presenter 复用同一过滤器。残缺控制前缀原本已保留在 accumulator.pending，不进入正文，本轮保持此契约。

直接缺陷在旧 `Bubble.splitIntoChunks`：空内容、或所有分段被过滤后仍返回 `[""]`，会创建带 padding/min-height 的空 BubbleSegment；同时只将 `line === ""` 视为分界，空格和不可见字符可能留成空段。

拆分移到 `bubble-chunks.ts`，在最终可见正文进入 BubbleSegment 前：

- 空段返回 `[]`；空格、控制字符和默认不可见 Unicode 字符只参与可见性判断，不改写正文。
- 普通换行保留；空白行分段，连续及首尾空段被过滤。
- 保留原有三反引号 fence 例外及独立 thematic break 过滤，不引入 Markdown AST 分段或新状态机。
- Bubble 的 hasBody 与最终 chunks 一致；Thinking、DRIFT、HEART、工具结果、附件及生成状态仍沿用原入口。

### User 与原文

User 在同一个 Bubble 中按每个换行展示多个 BubbleSegment，忽略空白段。Bubble 外层只挂一次 message ID、头像、时间和 MessageActions；reaction 继续只挂在最后一个视觉气泡。

不创建新 Message，不改 POST 次数、数据库消息数量或 receipt 身份。HTTP 与 optimistic overlay 都由同一个 Bubble 渲染。复制仍接收完整 `message.content`，不拼接视觉分段。

经用户确认，仅将 Sender 和发送 controller 的两处 trim 改为校验用途，实际提交、乐观消息与 payload 使用原文，包括首尾空格/换行。发送锁、附件校验、receipt、去重、对账、regenerate 流程未重构。

只读核对本地 AionHome 后端源码：

- `aion-chat/routes/chat.py:609`，MsgCreate.content 无 strip 配置。
- `routes/chat.py:1385` 附近，send_message 原样传递 `body.content`。
- `routes/chat.py:809` 附近，_persist_send_messages 直接将 content 写入 User 行。
- `aion-chat/chat_public_display.py:146`，公开投影复制 User content 并直接返回。

该路径未发现影响 User 原文保存的 strip；未连接真实后端、数据库或模型做写入联调。当前 Penumbra 的 MessageActions 没有消息编辑入口，本轮未新增编辑 UI；底层原消息内容保持完整。

### 快捷键

Chat Settings 增加三选一，复用 SegmentedControlItem；判断集中在 Sender，后续复用 Sender 的页面自然继承。

| 值 | Enter | Shift+Enter |
| --- | --- | --- |
| none（默认） | 换行 | 换行 |
| enter | 发送 | 换行 |
| shift-enter | 换行 | 发送 |

IME composing ref、native isComposing、keyCode 229 均阻止快捷发送；Ctrl/Meta/Alt、重复 keydown 不触发发送。按钮继续走原 handleSubmit，保留空内容、附件未就绪、发送中与重复提交保护。

沿用项目 localStorage + 页面事件方式，键为 `penumbra-chat-send-shortcut`。useSyncExternalStore 将修改同步到已挂载的 Sender 和设置项，刷新恢复；缺失/非法值回退 none。存储不可用时，本页内仍生效。

身份接口只有 authenticated 状态，没有稳定用户 ID；因此以同源浏览器配置为隔离边界，不按账号或会话隔离。不同浏览器配置不互相影响，同一浏览器配置下的同源标签页共享偏好。

## 修改文件

业务文件：

- `src/components/chat/Bubble.tsx`
- `src/components/chat/bubble-chunks.ts`（新增）
- `src/components/chat/Sender.tsx`
- `src/components/chat/send-shortcut-preference.ts`（新增）
- `src/components/chat/ChatRequestParametersMenu.tsx`
- `src/application/chat-send/chat-send-controller.ts`（只改原文保留与空校验）

验证文件：

- `src/components/chat/Bubble.chunks.test.tsx`（新增）
- `src/components/chat/send-shortcut-preference.test.ts`（新增）
- `src/components/chat/Sender.test.ts`
- `src/components/chat/Sender.interactions.test.tsx`
- `src/application/chat-send/chat-send.test.ts`
- `tests/browser/chat-bubbles-shortcuts-smoke.cjs`（新增）

## 验证结果

- 针对性 Vitest：75 个文件、883 项通过；随后新增 6 项移动设备判断用例，Sender 23 项全部通过；偏好测试加强后 3 项全部通过（合计覆盖 889 项）。
- `npx tsc -b` 通过。
- `npm run build` 通过；仍有 Vite 的大 chunk 提示。
- 新增浏览器测试在 320/390/1280px 全部通过：三档按键、按钮、IME 事件、修饰键、刷新/非法值、原文 payload/复制、User 多气泡的单 POST/单 ID、receipt 替换、跨 chunk 命令、SSE/HTTP 一致性、会话切换及输入区宽度。
- 已有 `chat-thinking-smoke.cjs`：320/390/1280px 通过。
- 已有 `chat-pr7-interaction-smoke.cjs`：390/1280px 通过，覆盖附件、跨会话与重挂载、失败重生成、499 receipt 恢复。
- 浏览器均使用隔离 Chrome 配置和合成 HTTP/SSE/WS；没有全站截图或逐页视觉验证。气泡观感等待用户截图验收。

## 已知边界

- 移动/触屏主输入设备保守地禁用发送快捷键，包含 iPad 桌面 UA；这些设备接外置键盘也保持回车换行。桌面窄窗口不会单纯因宽度禁用快捷键。
- 合成 Chromium 的 IME 事件与触屏模拟不代替 iOS/Android 真机输入法验收。
- localStorage 被禁用时只能本页保存，刷新无法恢复。
- 保留 Markdown 现有分段限制：例如 `~~~js\nconst a = 1;\n\nconst b = 2;\n~~~` 中间的空行仍会拆成两个气泡，因为现有逻辑只跟踪三反引号；带空行的列表/引用也可能跨泡。此为既有复杂 Markdown 结构问题，留给独立专项核对。
