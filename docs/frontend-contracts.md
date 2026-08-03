# Penumbra 前端契约摘要

> 最后更新：2026-08-03

导航：[架构原则](./penumbra-architecture.md) · [迁移路线图](./frontend-migration-plan.md) · [前端契约](./frontend-contracts.md)

本文记录 Penumbra 接入现有 AionsHome 后端时必须遵守的契约和已知风险，只保留前端所需摘要。每节注明的 AionsHome 文档、实现和 contract tests 仍是权威来源；本文不得被当作完整后端规范。

## 1. Source of truth

- Conversation、message、schedule、activity、location 等业务事实来自后端。
- 本地 optimistic state 只能用于临时展示，不能成为持久事实。
- 客户端状态必须能通过服务端 ID、snapshot、重新加载结果或明确的 event 规则对账。
- WebSocket 连接状态只说明传输是否在线，不能代替业务状态。

### Conversation Domain（S3A）

当前 AionHome conversation HTTP 契约如下：

| Method | Path | Request | Response |
|---|---|---|---|
| `GET` | `/api/conversations` | 无 | 按后端 `updated_at DESC` 顺序返回裸数组；列表项含 `id/title/model/created_at/updated_at/message_count` |
| `POST` | `/api/conversations` | JSON object `{ title?: string, model?: string }`；`{}` 合法 | `id/title/model/created_at/updated_at`；不含 `message_count` |
| `PUT` | `/api/conversations/{conv_id}` | `{ title?: string|null, model?: string|null }` | `{ ok: true }` |
| `DELETE` | `/api/conversations/{conv_id}` | 无 | `{ ok: true }` |

后端没有单个 conversation 详情 endpoint。时间字段是 Unix 秒数；ID、标题和模型是非空数据库列，列表的 `message_count` 是非 carryover user/assistant message 数量。当前契约没有 pinned 或 archived 字段。创建时省略字段会使用服务端标题和模型默认值。PUT 中 null 与省略字段都不会更新持久化值；不存在 ID 的 PUT/DELETE 当前仍返回成功，不能由前端假设 404。conversation create/update/delete 还会触发既有 WebSocket 广播与 Markdown 导出维护，delete 会级联删除 messages；这些副作用仍由后端拥有，Conversation Domain client 不复制或消费它们。

Wire DTO 只存在于 `src/domain/conversation` 边界。mapper 将 snake_case 转换成 camelCase domain model：`model -> modelKey`、`created_at -> createdAt`、`updated_at -> updatedAt`，列表额外映射 `message_count -> messageCount`；raw DTO 不进入 React 组件。

`conversation.model` 是当前 conversation 模型的事实来源。conversation create/update 当前不按 model registry 校验 model；历史或未知 model key 必须忠实保留，前端不自动替换为默认模型。创建请求不提供 model 时，由后端拥有默认语义；前端不复制 `DEFAULT_MODEL`。

Conversation Domain 不拥有 available models、readiness、active API config、provider config、provider routing、fallback、message state、streaming 或 WebSocket 状态。Runtime Domain 拥有 available models 与按 `modelKey` 查询的 readiness；模型 registry、provider routing 和 fallback 继续由后端拥有。

### Chat Setup Application Layer（S3B）

Chat Setup 是 Conversation Domain 与 Runtime Domain 之上的 application composition，不定义新的后端 DTO，也不拥有任何一个领域的 wire contract。它只把 `Conversation`、`AvailableModel[]` 和 `ChatReadiness` 组合为 UI 可消费的安全 ViewModel。

- 有 conversation 时，当前模型的唯一事实来源是 `conversation.modelKey`；readiness 必须按该 key 请求，响应中的 `modelKey` 必须与它完全一致。
- conversation model 与 readiness model 不一致属于 application composition contract error。前端不得静默采用 readiness model、自动重新请求或改写 conversation。
- bootstrap 没有持久化 conversation；当前模型来自不传 `model` 参数的 readiness response `modelKey`，代表服务端默认启动模型。
- 禁止从 available models 第一项推断默认模型，也禁止在前端硬编码服务端默认模型。
- available models 保持 Runtime Domain 顺序，不排序、不去重；选中状态只按 key 精确匹配。
- 历史或 bootstrap model 不在 available models 时仍保留原始 key，并以该 key 作为安全 label fallback；未知 model 不自动替换，所有 model options 均不选中。
- readiness reason 与 `setupActionRequired` 直接进入最小 ViewModel；`ready=false` 是正常业务状态，不转为异常，也不在本层重新判断 endpoint、secret、auth mode、provider 或 provider health。
- 本层不读取 Settings 或 active API config，不拥有 provider routing、fallback、secret、endpoint、raw readiness 或 raw DTO，也不请求 messages。
- 本阶段只提供普通 TypeScript 纯组合函数和异步 load service，不接入现有 Chat mock、React hook、可见 UI 或全局状态。

模型变更 command 延后到真实 conversation selection 与 Chat Setup UI 接入阶段。后续边界固定为：

```text
updateConversation(id, { modelKey: nextModelKey })
  -> 获取 nextModelKey 的 readiness
  -> 重新组合 Chat Setup ViewModel
```

update 成功与 readiness refresh 之间不是原子操作；在出现真实调用方前不提前实现未使用的 mutation command。

**AionsHome 权威来源**：`docs/aionhome-runtime-model.md`、`docs/aionhome-refactor-master-plan.md` 及相关领域实现和 contract tests。

## 2. Message Domain（S4B）

Message Domain 只表示后端已经持久化、能够通过 HTTP history 再次读取的消息事实。它不表示当前请求中的 SSE chunk、正在生成的 assistant 内容、optimistic user message、loading/streaming 状态、WebSocket event、发送请求的 `client_msg_id`、分页 UI 状态或 conversation `message_count`。

```text
GET /api/conversations/{conv_id}/messages
  -> history wire DTO
  -> runtime validation / mapper
  -> persistent Message domain model
```

History endpoint 契约：

- Method/path 为 `GET /api/conversations/{conv_id}/messages`，conversation ID 作为单个 path segment URL encode。
- `limit` 是可省略的 integer；服务端默认 `50`，最小 `1`，最大 `500`。client 省略未提供的 limit，不复制默认值。
- `before` 是可省略的 finite Unix seconds number。显式 `before=0` 仍编码；client 不修复服务端当前 `if before` 的 truthy 行为。
- response 是裸 JSON 数组。SQL 先取最新消息，再在响应前 reverse，所以 wire 最终顺序为旧到新；client 不 reverse、不排序、不去重。
- response 没有 wrapper、`hasMore`、`has_more`、`nextCursor` 或 `next_cursor`。client 不推断下一页，也不发明 message-ID cursor。
- conversation 不存在与 conversation 存在但没有消息都会成功返回 `[]`；空数组不是 404。
- HTTP history 不包含尚未提交的 assistant 内容；send 过程中已经提交的 user message 可能被读到。

History wire item 的当前字段为：

```ts
type MessageDto = {
  id: string;
  conv_id: string;
  role: string;
  content: string;
  created_at: number;
  simple_think: string | null;
  is_carryover: 0 | 1 | null;
  attachments: JsonValue[];
  thinking: string | null;
  mcp_tool_calls: JsonValue[];
  cache_region: string | null;
  voice?: MessageVoiceDto;
};
```

`simple_think`、`thinking`、`cache_region` 和 `is_carryover` 所在数据库列没有 `NOT NULL` 约束，因此 domain 保留真实 null；carryover 只把 `0/1/null` 映射成 `false/true/null`，不对其他值做 truthy coercion。时间字段保持 Unix seconds，不转换单位。

后端 history route 对 DB 中的 attachments 与 `mcp_tool_calls` JSON string 执行 `json.loads`，并把 DB `NULL`、空串和空数组表示归一成 `[]`；当前持久化写入与 contract tests 将成功 shape 约束为数组，但 route 本身没有额外检查解析后的顶层类型。这两个字段只有数组顶层契约，没有稳定 item schema；domain 将 item 保留为递归 JSON value，不猜 attachment URL/music union，也不解释 MCP 工具语义。未知但合法的 JSON 字段必须保留，raw object 必须递归复制。坏 JSON 仍可能使当前后端 route 失败；成功响应中的错误顶层类型或非 JSON nested value 是前端 contract mismatch，不能静默变成空数组。

可选 voice 是已经持久化的 capability；无 voice 时 wire 完全省略该字段，domain 使用 `null`，不得制造空 voice。完整 projection 为 `audio_id/msg_id/provider/voice_id/url/duration/favorited/created_at/updated_at`；`duration` 可为 null，`favorited` 是 boolean，其余时间为 Unix seconds number。

后端对 message role 没有枚举约束。domain 必须保留 `rawRole`，并另提供稳定 `roleKind`：`user/assistant/system` 原样分类，`cam_trigger/cam_user/cam_log` 分类为 `hidden-runtime`，其余 role 分类为 `unknown`。未知 role 不拒绝、不改写成 assistant；最终 UI 展示策略不由本阶段决定。

raw snake_case DTO 只存在于 `src/domain/message` 内部边界，不由领域 barrel 导出，也不进入组件。mapper 只投影公开字段、递归复制 JSON capability、丢弃额外 secret/config/raw payload，并用不包含原始 payload 的 `MessageContractError` 报告 contract mismatch。HTTP 401/422/500 与 network/timeout/abort 继续保持共享 transport 的 `ApiError` 语义。

HTTP history、SSE 与 WebSocket 是三个不同时间边界：history 是可重读的持久化最终事实，SSE 是当前请求的原始增量，WebSocket 是持久化后的变化通知。SSE 拼接内容不保证等于最终持久化 Message，因此 `streamingContent/status/isStreaming` 等字段不得进入 Message Domain。WebSocket payload 与 HTTP history DTO 也不能共用未经验证的 wire mapper。

前端 Message mapper 与后端 Prompt History Projection 是两套独立边界：前者忠实读取持久化事实；后者决定下一轮如何向 AI provider 表达这些事实。本阶段不把 system role 改成 user/assistant，不处理系统通知格式，也不修改 command、MCP、Camera、Schedule 或其他 prompt 回注逻辑。

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

### Runtime 安全读取边界

- Penumbra 已通过 domain client 接入 `GET /api/session`、`GET /api/models` 和 `GET /api/chat/readiness`。
- `/api/session` 的 HTTP 401 表示后端可达但未认证；network/timeout 表示当前不可达，其他 HTTP 错误表示后端可达但服务异常。
- `/api/models` 仅消费 `key/provider`；后端尚无独立 label，因此 mapper 暂时使用 `label = key`。
- readiness 只表示当前后端规则下本地配置是否齐备，不代表 provider 在线、凭据有效、余额充足或 provider healthy。
- `/api/settings` 不再作为普通前端连接探针。raw wire DTO 必须先经过校验与 mapper，不能进入 React 组件。
- readiness reason 是 HTTP 200 下的业务状态，不得与 transport error、contract error 或认证状态混合。

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
| Message DTO mapper | `Completed (S4B)` | HTTP history wire DTO、runtime validation、persistent Message mapper 与 read client 已实施；history state/pagination 尚未实施。 |
| WebSocket event type/payload/timing | `Do not change` | 迁移期间保持现有契约。 |
