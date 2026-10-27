# PR7-A 后 send canceled：定向排查与最小修复

2026-10-27。仅排查 Main HTTP/SSE、执行 Session 和开发代理；未扩展 PR7-B，未修改后端，未 commit/push/部署。

## 结论与证据边界

**确认存在前端误中断：Main send/regenerate 继承了通用请求的 30,000ms 定时器。** 它从 `fetch` 之前开始计时，不区分浏览器建连、代理转发、上游连接、后端处理。30 秒内浏览器尚未收到响应头，就由 `src/lib/api.ts:createAbortContext` 的 timeout 回调设置 `abortKind = "timeout"` 并调用 `controller.abort()`（当前第 495–496 行），归一化为 `ApiError(TIMEOUT)`。

修复前，生产 `openSendExecution` + 合成延迟响应头可在精确 30,000ms 复现；测试追踪栈指向上述回调，执行 Session 的 caller signal 始终未 abort。修复后，回归显式传入旧的 30 秒配置保留该复现，默认策略则通过 300,000ms 延迟响应头测试。

用户提供的真实故障：两次约 30 秒 canceled、Response Headers 为空、无 SSE start；旧 Chat 对照为总计 25.37 秒（等待响应 13.12 秒、下载 12.25 秒）。这与前端定时器高度吻合，不能据此判断旧前端生成更快，也不能将等待时间直接归因于后端上下文准备。**没有这两次历史请求的浏览器 abort 栈及服务端访问/receipt 证据，因此不声称已证明其 TCP 阶段、抵达后端或持久化情况。**

## AbortSignal / reader 来源

```text
会话 controller.send
  → ActiveExecution.abortController.signal（执行 owner / caller）
  → openSendExecution(options.signal)
  → openApiStream
  → requestApiResponse
  → createAbortContext(callerSignal, timeoutMs)
      ├─ 内部 controller.signal → 原生 fetch
      ├─ caller abort → abortFromCaller → 内部 abort（ABORTED）
      └─ deadline → 内部 abort（TIMEOUT）
  → createManagedApiBody
      ├─ 收到响应后设 120 秒 idle deadline；每块字节重置
      ├─ timeout/caller → abortReading → reader.cancel + cleanup
      └─ 消费者提前结束/协议错误 → reader.cancel + cleanup
  → parseSseStream → mapChatExecutionStream → controller.consume
```

调用 `reader.cancel()` 也可能使 Network 显示 canceled；不能仅凭标签认定有 `AbortController.abort()`。新增测试区分：响应头 timeout、流 idle timeout、显式 dispose 的 caller abort、网络 TypeError、协议错误导致的 reader cancel。

## Session、Workspace 和 React 生命周期

- `useChatSend` 的 sessions 位于模块作用域；每个 conversation ID 独立创建并保存 controller。
- `useSyncExternalStore` unsubscribe 只删除监听器。`useChatSend` effect cleanup 只解绑当前 owner/reconciler 和 online/focus 监听，不 dispose 执行。
- 当前 owner 改变只影响状态投影、提交 owner 和历史核对入口。脱离当前 Workspace 的执行使用独立 background history window；当前 Workspace 读取变 stale 时回退 background reconciliation。
- `useChatWorkspace` cleanup 确实 dispose Workspace，取消 bootstrap/switch/history/list/configuration 等各自的读取 controller。它们与 Main send 的 caller controller 无引用共享。
- Main controller 的显式 `dispose()` 在 `chat-send-controller.ts:577` 调用执行 caller abort；本轮调用链检查及生命周期测试未发现生产 ChatView 导航/卸载路径调用它。
- StrictMode 重放 Workspace effect、刷新列表替代旧列表读取、history refetch 替代旧历史读取，均可取消 GET。这属于预期 stale-read 取消；应按 method、路径、owner 和信号身份与 POST send 分开判断。

Git 历史显示通用 30 秒配置和 timeout abort 早于 PR7-A Follow-up。Follow-up 的按会话 Session 改动未新增上述 30 秒 deadline，也没有在导航 cleanup 中 dispose 执行。测试未复现由此次 Session 生命周期改动触发的 send abort。

## 开发代理与三个网络阶段

1. **浏览器 → localhost Vite**：真实截图的 `Initial connection 30.75s` 是浏览器侧 Timing，不能用来判断 Vite → 上游的连接/处理耗时，也不能单凭它证明后端收到 POST。当前只读检查中 localhost 首页 200、连接约 0.4ms；`/api/session` 经 Vite 返回 401，TTFB 约 0.16 秒。未读取凭据或私人响应内容。
2. **Vite → 本地 SSH 转发 → 上游**：当前本地开发配置使用回环地址的 SSH 转发端口。对应端口有 SSH listener；直接和经 Vite 的 session GET 均返回 401，说明当前只读路径可达。401 是未携带登录 Cookie 的预期结果，不证明历史 send 已经抵达，也不验证已登录 POST 的实际处理。
3. **后端处理 → SSE**：本地后端代码中，send 先持久化 user，再捕获上下文和组装生成，最后返回 `StreamingResponse`；生成任务与 SSE 客户端读取解耦。因此缺少响应头、客户端 abort 或 canceled 均不能证明未持久化/后台已停止。这是代码能力，不是对那两次真实请求的归因。

`createDevProxyConfig` 未设置 `timeout` / `proxyTimeout`，没有 response body 重写或自定义缓冲。实际安装的 Vite 6.4.3 所用 http-proxy 在收到上游响应时设置下游 headers，随后 `proxyRes.pipe(res)`，没有立即 `res.flushHeaders()`。隔离真实 HTTP 测试发现：**上游即使已经 flush SSE headers，下游 fetch 仍可能等到第一块 body 才返回。** 最初“立即收到代理响应头”的假设在测试中失败，随后按真实行为核对。旧 Chat 的原生 fetch 没有 Penumbra 的 30 秒客户端 deadline，所以二者存在明确策略差异。

隔离集成测试使用真实 Vite 和生产代理配置，将目标设为临时回环 HTTP 服务：它确认 POST 在客户端 timeout 前确已抵达合成上游；旧式原生 fetch 能等到延迟响应；修复后的 Main opener 也能通过同一路径读取延迟 start/chunk。测试没有向真实后端发 send/regenerate，也不能代替真实历史请求的访问证据。

本轮不修改代理。仅提前 flush 代理 headers 不能解决上游尚无 headers 的合法长等待；移除 Main 继承的通用短 deadline 可以同时覆盖这两种情况。

## 最小修复与保留约束

仅修改 `chat-execution-client.ts` 的两个 Main opener 默认参数：

- `timeoutMs: 0`：等待响应头期间不再使用通用 30 秒定时器；显式调用者 signal 和显式测试 timeout 参数仍生效。请求会等待响应或真实传输错误，不额外承诺一个后端未定义的最大准备时间。
- `streamIdleTimeoutMs: 120_000` 保持不变：收到响应后仍监测流空闲，每块字节（包括 SSE comment heartbeat）重置；EOF、错误、取消均释放 timer / reader。
- 通用 GET timeout、Workspace stale-read 取消、按会话隔离、frozen binding、client_msg_id 幂等与结果未知保护均未修改；没有自动重发、导航禁用或设置规避。

若异常发生在 start 前，`performFinalization` 继续用原 `(conversationId, clientMessageId)` 读取 send-result，再用 HTTP history 的 assistant 身份核对。只有 user、空 receipt、查询失败、无对应 assistant、无关 assistant 都保持未知。同会话继续禁止重复提交；B 会话可独立使用。持久化证据到达后安全收敛，不新增 POST。

## 验证

自动化：`npm test` **166 个文件、2175 项通过**；`npm run build`（含 TypeScript）通过；`git diff --check` 通过。

| 测试 | 结果 |
| --- | --- |
| 旧 30 秒 header 配置，执行 caller 不取消 | 精确 30 秒，api timeout abort，TIMEOUT |
| send / regenerate 默认等待头 300 秒 | 不 timeout；显式 caller abort 仍有效 |
| 延迟头后 SSE、慢 start、90 秒间隔数据 | 正常读取，无固定总时长中断 |
| 119 秒间隔 SSE comment heartbeat | 重置 idle deadline，不冒充业务事件 |
| 收到头后持续空闲 120 秒 | TIMEOUT，reader/timer 清理 |
| 协议错误 / 网络错误 / 显式 dispose | 分别为 reader cancel / 无主动 abort / caller abort |
| timeout 后原 client_msg_id receipt + HTTP history | 暂存未知、后续收敛、无第二次 POST |
| rerender、history/list refetch、A/B、cleanup/remount | send 信号不取消；过期 conversations GET 可取消 |
| 真实 Vite → 隔离 HTTP SSE | POST 抵达、延迟头/首块行为复现、修复后通过 |

浏览器使用 `tests/browser/chat-send-abort.html`：真实 ChatView + ToastProvider + React.StrictMode，仅合成 HTTP/WS。A 在无 start 时等待约 38 秒，期间 rerender、history refetch、列表失效通知、切 B 并发送、回首页真实卸载、重入 StrictMode；两条 send fetch signal 均保持未取消，最终 POST 总数 2、send abort 0、send reader cancel 0。A 在 B 选中时完成没有污染 B；A/B 各自通过 HTTP history 收敛。自动化 hook 测试另验证了重叠列表读取确实取消 stale GET。

浏览器夹具复现：启动独立 Vite 后打开上述 HTML；在 A 输入合成消息并发送，依次点击 `StrictMode rerender`、`History refetch A`、`并发刷新列表`；切 B 并发送，点返回桌面和 `重新进入聊天`；点 `检查 send signals`，再 `完成 A` / `完成 B`。trace 仅记录合成请求 ID、owner、原因名称和调用栈，不记录正文/headers/Cookie。

本轮日志和证据（仅合成内容）在 `/private/tmp/penumbra-send-abort-{tests.log,build.log,browser-trace.json,browser.jpg}`。未重启用户现有 3000 端口或 SSH 转发进程；验证用的独立 Vite 在结束后关闭。实际使用时需让开发服务和页面载入修复后的代码；不得对之前结果未知的提交自动重发。
