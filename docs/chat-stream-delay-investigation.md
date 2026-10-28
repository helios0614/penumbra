# Main Chat 流式延迟 / Loading 定点排查

2026-10-28。本轮没有确认原现场的根因；没有修改生成、持久化、receipt、幂等、重试或日志生命周期语义。AionHome 工作区未修改；未调用真实 Provider，未 commit、push、deploy。

## 已确认的链路与边界

- 后端 send 在准备上下文后创建后台任务和队列；start 在 `routes/chat.py:2203` 入队，Provider 输出在 `:2344` 入队，`:2849` 每次队列读取后向 StreamingResponse yield。canonical regenerate 分别在 `:3977`、`:4165`、`:4341` 附近走同类路径；persisted 在提交替换后排队。没有看到路由主动累积全部正文后才 yield 的行为。实际运行证据来自源代码隔离副本、临时 SQLite、假 Provider + Uvicorn；未启动生产 main/lifespan、真实认证、中间网关和后台任务。
- [API reader](/Users/remix/Desktop/Penumbra/src/lib/api.ts:348) 逐次读取 fetch body；[SSE parser](/Users/remix/Desktop/Penumbra/src/lib/sse/sse-stream.ts:34) 在完整 frame 分隔符出现后立即 yield；[mapper](/Users/remix/Desktop/Penumbra/src/application/chat-execution/chat-execution-client.ts:149) 不等待流终结；[controller](/Users/remix/Desktop/Penumbra/src/application/chat-send/chat-send-controller.ts:323) 每个事件同步归约并 publish。没有发现“必须等 persisted 才能显示 chunk”的门槛。
- [session](/Users/remix/Desktop/Penumbra/src/application/chat-send/chat-execution-sessions.ts:8) 按 conversation 持有 controller，页面卸载不停止生成；[React 订阅](/Users/remix/Desktop/Penumbra/src/components/chat-workspace/useChatSend.ts:38) 通过 useSyncExternalStore 读取当前会话状态。
- [消息合成](/Users/remix/Desktop/Penumbra/src/components/chat-workspace/presentation/chat-execution-composer.ts:32) 在 HTTP history 已有同 ID Assistant 时直接返回持久化展示。这是**真实存在的 HTTP 整段展示路径**，不能把它误判成 SSE 流顺畅。活跃执行的普通 WS 通知会延后 history 刷新；切回会话重新读取 HTTP 后则可以直接显示已保存全文。测试用不同的 SSE / HTTP 合成正文验证了来源。
- 流没有 start/chunk 也存在通过精确 receipt 取得 Assistant ID、再读取 HTTP history 的恢复路径，浏览器测试验证其最后正文为 HTTP；并未添加这条路径或改变其未知结果语义。
- 控制标记过滤会有意隐藏 Thinking/内部命令以及未闭合控制标记前缀；正文无增长不能直接等同于未收到网络 chunk。诊断同时保留原始字节/完整 frame 的大小和归约后正文长度，不记录内容。

## 实测时序

以下均为合成数据与本机时间，不能推断线上网络表现。完整证据：[输出目录](/private/tmp/penumbra-sse-timing)。

实际 send / canonical regenerate 路由，假 Provider 分三段输出，间隔 1 秒和 3 秒：

| 路径 | 浏览器收到 start（距请求开始） | 三次正文读取时刻 | 后端 Assistant 提交后 WS 观察点 |
|---|---:|---|---:|
| 直连 send | 62ms | 262 / 1263 / 4265ms | 4268ms |
| Vite send | 61ms | 263 / 1264 / 4266ms | 4270ms |
| 直连 regenerate | 13ms | 273 / 1274 / 4276ms | 4279ms |
| Vite regenerate | 15ms | 276 / 1276 / 4279ms | 4285ms |

对应的 Provider → Queue → ASGI body 交付通常在同毫秒或相差 1–2ms；浏览器 reader 回调随后约 0–2ms 执行。WS 点只表示 commit 之后的参照，未用作流式基准。详见 [backend.json](/private/tmp/penumbra-sse-timing/backend.json) 和 [transport.json](/private/tmp/penumbra-sse-timing/transport.json)。

人为在 ASGI 外增加测试缓冲时：直连 send 后端 4273ms 已提交，浏览器直到 5276ms 才一次读到全部 SSE；经 Vite 则分别为 4258ms / 5263ms。这证明“持久化先完成、SSE 后整批到达”可以被测试检测；**缓冲来自本测试特意加入的层，并非已证实 Vite/线上代理有此缺陷**。

真实 ChatView / StrictMode、合成 fetch stream 的最终测试：1280px 和 390px 的首个 chunk → DOM commit 分别约 18ms / 26ms；均早于流关闭及 history 对账。导航后 HTTP 已有同 ID 时，后续 SSE chunk 仍被消费，但 UI 保持 HTTP 权威版本。空 SSE 的另一执行没有任何 chunk 事件，最终显示 HTTP 正文。独立保存 [桌面时间线](/private/tmp/penumbra-sse-timing/ui-1280.json)、[手机宽度时间线](/private/tmp/penumbra-sse-timing/ui-390.json)。

另以同一执行贯通真实路由 → Vite → 真实 ChatView → HTTP history，首段特意延迟 5.5 秒，最后 HTTP 查询短暂挂起以验证独立性。以下相对浏览器 `execution.begin`：

| 阶段 | 时刻 |
|---|---:|
| 后端 start 入队 / ASGI 交付 | 109 / 109ms |
| 浏览器 start reader / controller | 135 / 136ms |
| Provider 首段 / Queue / ASGI 交付 | 5610 / 5610 / 5610ms |
| 浏览器首段 reader / parser-mapper-controller | 5611 / 5612ms |
| 首段 DOM commit | 5643ms |
| 第二段 DOM commit | 6636ms |
| 第三段 DOM commit | 9648ms |
| 后端 Assistant commit 后 WS 观察点 | 9617ms |
| HTTP 对账开始 / 结束 | 9675 / 10068ms |
| HTTP 正文 DOM commit | 10087ms |

本次首个可见正文来自 SSE；最终由 HTTP 权威版本接管。并非所有 chunk 都必须早于 commit——最后一小段在 commit 后才得到 React 提交机会，但前两段已正常展示。[完整同执行证据](/private/tmp/penumbra-sse-timing/integrated.json)。

## Loading 与 PR7-B

[GenerationIndicator](/Users/remix/Desktop/Penumbra/src/components/chat/GenerationIndicator.tsx:13) 在 active + rotating 时建立 2500ms interval，以函数式 setState 取反；依赖仅为 active / rotating / 当前消息身份。正文出现、进入非轮转阶段或卸载时清理。没有依赖 chunk 或 debug 事件，没有发现计时器被清理后仍保留相同轮转阶段的确定性路径。

实测响应头延迟、收到 start 后正文再延迟、首页卸载/重入、会话切换、StrictMode 时，Loading 均持续切换，输入仍可编辑。受控 650ms 同步长任务跨过 tick 截止时，tick 间隔从 2500ms 变成约 2950ms，longtask 同时记录，随后恢复。这是诊断能力对照，**不是原现场卡死证据**。后台页计时器节流、设备休眠与移动浏览器挂起仍未覆盖。

PR7-B 的 SSE 观察同步执行于 mapper 之前，但普通正文仅走有界错误后缀检查；快照 drain 使用独立 HTTP 请求，不 await 在主流消费中，不写 generation controller。store 保存有界的 payloadJson 字符串，展开请求时才做结构展示。实测日志关闭时交接约 90 万字符的合成快照，同步 store 投影约 0.1–0.2ms，未打断 Loading 和 SSE。此数据不包括 drain 响应的全部 JSON 解码成本，也不代表任意设备或打开复杂 JSON 视图时的上限。未发现足以支持修改 PR7-B 的证据，仅增加阶段时间戳。

## 改动范围

所有运行时代码改动只用于默认关闭的开发诊断：

| 文件 | 用途 |
|---|---|
| [chat-timeline.ts](/Users/remix/Desktop/Penumbra/src/lib/chat-timeline.ts) | 开发环境显式开关、最多 2000 条内存时间线、执行身份映射、longtask / visibility；只复制允许的元数据字段 |
| [api.ts](/Users/remix/Desktop/Penumbra/src/lib/api.ts) | fetch body reader 字节读取时刻 |
| [chat-execution-client.ts](/Users/remix/Desktop/Penumbra/src/application/chat-execution/chat-execution-client.ts) | 响应头、完整 frame、JSON 消费、日志观察、mapper、EOF |
| [chat-send-controller.ts](/Users/remix/Desktop/Penumbra/src/application/chat-send/chat-send-controller.ts) | 事件消费、publish、receipt、HTTP 对账、完成；绑定执行身份，不改变状态规则 |
| [useChatSend.ts](/Users/remix/Desktop/Penumbra/src/components/chat-workspace/useChatSend.ts) | React 订阅状态提交 |
| [Bubble.tsx](/Users/remix/Desktop/Penumbra/src/components/chat/Bubble.tsx)、[useChatRenderTrace.ts](/Users/remix/Desktop/Penumbra/src/components/chat/useChatRenderTrace.ts) | DOM 提交与下一帧机会，区分 sse / history / waiting |
| [GenerationIndicator.tsx](/Users/remix/Desktop/Penumbra/src/components/chat/GenerationIndicator.tsx) | interval 建立、tick、清理与文案 state 提交；保留原 2.5 秒轮转行为 |
| [chat-system-log-client.ts](/Users/remix/Desktop/Penumbra/src/application/chat-system-log/chat-system-log-client.ts) | drain / snapshot 投影起止，不改轮询生命周期 |
| [chat-timeline.test.ts](/Users/remix/Desktop/Penumbra/src/lib/chat-timeline.test.ts) | 默认关闭、production 禁用、容量上限、返回副本、禁止混入正文/Prompt/Key |
| [chat-stream-timing.cjs](/Users/remix/Desktop/Penumbra/tests/browser/chat-stream-timing.cjs)、[chat-sse-backend.py](/Users/remix/Desktop/Penumbra/tests/diagnostics/chat-sse-backend.py) | 合成时序浏览器测试与真实后端源码隔离 harness |

未修改 Vite proxy 配置、SSE parser 规则、UI 权威数据覆盖规则、Loading 动画规则和后端生产文件。没有引入 WS 流式通道、自动重发、后台重试或首包超时。

## 使用诊断与复现

本地开发页面刷新后，在发送**之前**执行：

```js
window.__penumbraChatTimeline.enable()
// 复现后读取（仅事件/时间/大小/执行身份，不含正文）：
window.__penumbraChatTimeline.read()
// 停止观察并清空：
window.__penumbraChatTimeline.enable(false)
```

只在开发模式注册该 API；默认无采集、无新增 timer/observer、无持久化/上传。刷新即清空。`http.bytes` 是浏览器 JavaScript 读取回调的时间，不能直接证明网卡到达时间；主线程阻塞时这些回调本身也会延后。`ui.commit` 是 effect 观察到 DOM 已提交的时刻，`ui.frame` 是下一次 rAF 机会，不能宣称物理屏幕已绘制。历史消息只有在可靠的 start/receipt 绑定身份后才归属某次执行，未关联旧消息不冒认成本轮输出。

定位顺序：比较 http.bytes → sse.frame/json/observed/mapped → controller.event → session.publish → react.session / ui.commit；无正文而 ui.commit 的 source=history 表示 HTTP 展示。Loading 以 start/tick/commit/stop 与 page.longtask/visibility 交叉判断；不能仅凭长时间无 chunk 推断主线程冻结。

隔离复现：使用后端可用的 Python 测试环境运行 `tests/diagnostics/chat-sse-backend.py <AionHome目录>`，只复制 tracked Python、测试 JSON 和旧 Chat HTML 到临时目录；不要启动生产 main。需 fastapi、uvicorn、pytest、aiosqlite、markdown-it-py、mdit-py-plugins 等后端测试依赖。本次缺少的 Markdown 依赖仅安装到 `/private/tmp/penumbra-sse-python`，未改变项目依赖。

让单独的测试 Vite 使用 `PENUMBRA_DEV_PROXY_TARGET=http://127.0.0.1:45366`、监听 45365，运行浏览器脚本（可传 Playwright 模块路径和 Chromium 路径）。默认跑 UI 合成场景；`CHAT_TIMING_BACKEND=1 CHAT_TIMING_TRANSPORT_ONLY=1` 跑真实路由直连/代理及人为缓冲；`CHAT_TIMING_INTEGRATED=1` 跑真实路由到 UI 的完整路径。测试输出仅放临时目录。

## 验证与未证实项

- 前端全量：172 个文件 / 2224 项通过；production build 通过，仅原有 chunk size 提示。
- 后端隔离：send receipts、canonical regenerate route、debug capture，46 项通过。
- 浏览器：1280/390px 的上述定点时序及横向边界通过，pageerror=0；既有 PR7 interaction smoke 两个宽度通过。没有全站截图或逐页视觉验收。
- 没有原异常现场的生产时间线；不能确定原“最后全文”来自 SSE 还是 HTTP，诊断已能在下一次复现时区分。
- 未验证线上反向代理/CDN/压缩、生产 main 认证中间件、真实 Provider/记忆准备耗时、真实大历史/移动端挂起。不存在复现证据时，不将这些候选写成根因。
- 本轮**不需要重新部署后端**。重启本地 Penumbra 并刷新即可使用诊断；实测中 Vite 文件监听曾漏刷新埋点模块，重启后确认服务了当前源码。未修改用户 `.env.local`，测试服务使用单独端口和进程环境变量。
