# Penumbra 前端契约摘要

> 最后更新：2026-07-31

导航：[架构原则](./penumbra-architecture.md) · [迁移路线图](./frontend-migration-plan.md) · [前端契约](./frontend-contracts.md)

本文记录 Penumbra 接入现有 AionsHome 后端时必须遵守的契约和已知风险，只保留前端所需摘要。每节注明的 AionsHome 文档、实现和 contract tests 仍是权威来源；本文不得被当作完整后端规范。

## 1. Source of truth

- Conversation、message、schedule、activity、location 等业务事实来自后端。
- 本地 optimistic state 只能用于临时展示，不能成为持久事实。
- 客户端状态必须能通过服务端 ID、snapshot、重新加载结果或明确的 event 规则对账。
- WebSocket 连接状态只说明传输是否在线，不能代替业务状态。

**AionsHome 权威来源**：`docs/aionhome-runtime-model.md`、`docs/aionhome-refactor-master-plan.md` 及相关领域实现和 contract tests。

## 2. Message DTO

- `role` 不限于 `user`、`assistant`、`system`；现有数据和内部链路还可能出现 `cam_user`、`cam_log`、`cam_trigger` 等扩展 role。
- `attachments`、`keywords`、`mcp_tool_calls` 可能是 JSON 字符串，也可能已经是数组。
- 历史消息 DTO 与 WebSocket `msg_updated` payload 可能不同。例如当前历史列表会解析 `mcp_tool_calls`，而 `msg_updated` 可能仍返回 DB string。
- mapper 必须容忍空字段、旧数据和不同返回形态；是否容忍坏 JSON 应按具体 endpoint 的后端事实处理，不能擅自统一语义。
- raw DTO 类型与 normalized domain type 必须区分。UI 只能依赖 normalized type 或 view model。
- normalized type 不得反向改变持久化字段、role、`cache_region`、`is_carryover` 或可选字段语义。

**AionsHome 权威来源**：`docs/chat-message-dto-contract.md`、`aion-chat/routes/chat.py`、`aion-chat/database.py` 及 `aion-chat/tests/contract/test_chat_message_dto_contract.py`。

## 3. Send stream

- 当前发送接口通过流式 HTTP response body 返回事件。
- stream adapter 必须使用增量 decoder 和缓冲区处理分片边界。
- 不得假设一个 network chunk、文本行或 `reader.read()` 结果就是完整 JSON。
- SSE/stream 事件顺序不得自行调整；同名 SSE 与 WebSocket event 也不得混为同一 payload。
- command marker 如需隐藏，只能在显示层过滤。
- 前端不得通过解析 command 文本执行业务命令或重新实现 command grammar。

**AionsHome 权威来源**：`aion-chat/routes/chat.py`、`aion-chat/static/chat.html`、`docs/command-parser-contract.md` 和相关 command contract tests。

## 4. SSE 与 WebSocket 对账

以下关系当前仍需后端契约确认：

- SSE 与 WebSocket 可能同时描述同一条 message。
- 客户端必须基于服务端 ID 和明确规则去重。
- 在权威关系确认前，不得凭时间、角色或文本内容去重。
- 重连后应以服务端 snapshot 或重新加载结果恢复，不以本地 event history 猜测。
- 不通过“收到下一条 assistant message”推断 camera、activity、location、MCP 或其他活动已完成。
- optimistic message、SSE placeholder、WebSocket persisted message 的替换关系应由 Chat adapter 集中处理。

**AionsHome 权威来源**：`docs/ws-event-contract.md`、`docs/chat-message-dto-contract.md`、`aion-chat/static/chat.html` 和 `aion-chat/routes/chat.py`。

## 5. Regenerate

- 当前旧前端行为是先删除旧 assistant message，再调用 regenerate。
- 该 side effect 顺序不得擅自修改。
- Regenerate 应独立于首个 send PR 实施。
- 实施前需要契约测试覆盖删除成功、删除或 regenerate 失败，以及重新生成后的持久化结果。
- UI 不能在 regenerate 失败时伪造旧消息仍存在或新消息已持久化。

**AionsHome 权威来源**：`aion-chat/static/chat.html` 的现有交互、`aion-chat/routes/chat.py` 的 delete/regenerate endpoints，以及 message persistence contract tests。

## 6. Stop/cancel

- 当前未确认真实的服务端停止生成接口。
- `AbortController` 只能证明前端停止等待或读取响应，不能证明后端停止生成、持久化或执行副作用。
- 在后端契约确认前，UI 不得显示“后端已停止生成”。
- 可以表达“已停止接收”等准确状态；具体产品文案后续决定。
- 停止读取后仍应允许 snapshot 或 WebSocket persisted event 校正本地状态。

**AionsHome 权威来源**：Chat send route、stream persistence 行为及后续新增的 stop/cancel contract；当前状态为待后端确认。

## 7. Carryover 和 prompt 顺序

- 旧前端存在 carryover 筛选与 `localStorage` 行为，并在新 conversation 首次发送时提交 `carryover_messages`。
- 这涉及 prompt 输入顺序、去重、持久化和上下文所有权。
- 未确认后端当前职责前，不得原样迁移、删除或重新设计 carryover。
- 相关改动必须先阅读 AionsHome runtime model 和 master plan。
- 前端不得以“只影响本地历史”为由改变 carryover 筛选或注入时机。

**AionsHome 权威来源**：`docs/aionhome-runtime-model.md`、`docs/aionhome-refactor-master-plan.md`、`docs/chat-message-dto-contract.md`、`aion-chat/static/chat.html` 和 `aion-chat/routes/chat.py`。

## 8. WebSocket

- 不改变 event type、payload 和 timing。
- transport 只负责连接、鉴权上下文、重连、订阅和分发。
- 业务 event 必须通过领域 adapter 转换后再进入状态层。
- Chat、Theater 等领域不可仅因共用 `/ws` 就合并业务状态机。
- Theater 发出的入站 `tts_state`，以及 `tts_chunk`、`tts_done` 等具有独立状态或副作用的事件，必须保持各自语义。
- 重连策略不得把“已连接”解释为业务数据已同步。

**AionsHome 权威来源**：`docs/ws-event-contract.md`、`aion-chat/ws.py`、`aion-chat/main.py` 及 WebSocket contract/snapshot tests。

## 9. Authentication 与部署

- 当前 web 前端请求使用 cookie/session。
- PR8A HTTP transport 使用 `credentials: "include"`。
- production 采用同源反代还是跨域部署尚待确认。
- 使用绝对 API、upload 或 WebSocket URL 时，必须确认 CORS、cookie、SameSite 和 WebSocket 鉴权。
- 在部署契约确认前，不增加由 Penumbra 自行维护的 Bearer token 方案。
- 401/403 应映射为认证状态，不能与网络不可达混为一类。

**AionsHome 权威来源**：`aion-chat/main.py`、`aion-chat/auth.py`、部署配置和未来部署契约；Penumbra transport 事实见 `src/lib/runtime-config.ts` 与 `src/lib/api.ts`。

## 10. Provider config 与 secret

- API provider 配置仍是有效业务能力。
- legacy `custom_*` 和 Gemini fallback 尚不能由 Penumbra 删除。
- 可以从新 UI 主流程隐藏到兼容或高级区域，但隐藏不等于移除后端能力。
- secret 不得直接展示，也不得进入普通展示组件、日志或通用 view model。
- UI 应只接收 masked value、尾部掩码或 `hasSecret` 等安全形态。
- 当前 `/api/settings` 同时存在原始值和 masked 字段；是否继续返回完整 secret 需要后端确认，前端不得将当前返回行为视为长期安全契约。

**AionsHome 权威来源**：`aion-chat/routes/settings.py`、`aion-chat/static/settings.html`、provider 配置实现和相关 contract tests。

## 11. Upload

- 当前上传 endpoint 为 `/api/upload`。
- 必须使用 PR8A 的 upload URL resolution，不在 Chat 组件或 upload client 中手拼 base URL。
- upload client 与 Chat send client 分开；前者负责文件传输和 upload response，后者只消费已确认的服务端 attachment 引用。
- 当前请求使用 `multipart/form-data` 的 `file` 字段；成功 shape 为 `{ url, type, name }`，失败也可能通过 `{ error }` 返回，client 必须验证响应而不能只看 HTTP 成功。
- 文件类型白名单和 20 MB 上限以后端为准；前端校验只用于提前反馈，不能替代服务端校验。
- 本地 object URL 或文件预览不是上传成功的业务事实。只有服务端响应中的 URL 才能进入 send request。
- 上传失败、发送失败和消息持久化失败是三个不同状态，不得合并为一个“已发送”状态。

**AionsHome 权威来源**：`aion-chat/routes/files.py`、`aion-chat/static/chat.html` 及未来 upload contract tests；Penumbra URL 解析事实见 `src/lib/runtime-config.ts`。

## 12. 待确认事项的处理

SSE/WS 权威关系、stop/cancel、carryover 所有权、production 部署、secret response 和其他未确认项，在后端给出实现或 contract test 前都保持“待确认”。后续任务应记录确认结果及其 AionsHome 来源，不得把临时前端行为升级为默认契约。

## 13. 未决契约状态

| 契约 | 状态 | 说明 |
|---|---|---|
| Send 使用流式 HTTP response body | `Confirmed` | 当前实现已确认。 |
| SSE/WS 权威关系 | `Pending backend confirmation` | 去重与最终权威规则待确认。 |
| Stop/cancel | `Pending backend confirmation` | 尚无已确认的服务端停止契约。 |
| Carryover 所有权 | `Pending backend confirmation` | 前后端职责与迁移方式待确认。 |
| Production 部署方式 | `Pending backend confirmation` | 同源反代或跨域部署待确认。 |
| Message DTO mapper | `Pending migration` | raw DTO 差异已知，Penumbra mapper 尚未实施。 |
| WebSocket event type/payload/timing | `Do not change` | 迁移期间保持现有契约。 |
