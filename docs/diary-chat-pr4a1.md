# Diary Chat PR4-A.1：配置审计与文案精简

2026-10-30，Asia/Shanghai。Phase 3 / Diary Chat PR4-A.1。

按本轮追加指示：完成不依赖模型选择的前端错误提示、Diary 文案精简和只读配置审计；**不指定连接或模型，不修改真实配置，不让 regenerate 跟随 Main，不改后端模型选择规则**。重新生成恢复所需的绑定方式等待人工决定，不能把前端提示改进视为真实模型调用已经恢复。

## 基线和本轮边界

Penumbra HEAD 仍为 `99ea5aa`，开工时 PR4-A 的 14 个文件已由人工暂存；本轮保留原暂存内容，修改留在工作区。AionHome HEAD 为 `7105f94`，开工和交付均干净，本轮未修改后端文件。未 commit、push、deploy。

复核当前 Diary send/regenerate、Model Registry、独立模型解析、Runtime Binding、旧 Diary 模型设置和 PR4-A 交付；以源码和当前服务的只读响应为准。没有修改消息/后缀保存语义、Prompt、召回、命令、WS/SSE wire、请求/确认/取消/历史回读时序，也没有扩展正文提取或首次归档。

## 只读配置审计

审计对象为浏览器当前 Diary Entry。未请求其消息历史或展示日记正文，也未调用真实 send、regenerate、模型探测、获取模型列表或配置写接口。运行配置只保留以下四类事实，不记录地址内容、密钥、Token、凭据引用或完整配置。

| 路径 | 连接名 | 协议 | 模型名 | base_url 是否配置 |
| --- | --- | --- | --- | --- |
| 当前 Entry 的独立模型设置 | 未绑定 | 未设置 | 未设置 | 不适用 |
| 普通 Diary send，按审计时配置解析 | 55 | Anthropic Messages | 逆[Ag4-量-0.6x]claude-opus-4-6-thinking | 是 |
| Diary regenerate，按审计时配置解析 | Gemini | Gemini Stream Generate Content | gemini-3-flash-preview（目录标识 gemini-3-flash） | 否 |

证据和范围：

- `GET /api/registry/selections/diary/{entryId}`：当前 Entry 的 `stored_model:null`、`selection:null`，来源为 `legacy_unselected`，diagnostic 为 `independent_selection_required`。没有保存独立连接、协议或模型。
- `GET /api/conversations`：只投影最近一条记录的旧 `model` 字段，值为「自定义」；未展示标题或正文。当前普通 Diary send 读取的是这个旧字段，并不直接使用 Main 的 `main_selection`。
- `GET /api/settings/api-configs/active`、`GET /api/settings/chat-format`：只投影上表的连接名、模型、协议和地址存在性；当前为连接「55」和 Anthropic。
- `GET /api/registry/connections`：当前配置权威为 `persisted_v2`。对应连接的 `base_url` 是 Registry v2 中的权威值，不通过前端字段或默认 URL 覆盖。
- 当前服务的 OpenAPI Schema：`routes__chat__ConvCreate.properties.model.default` 为 `gemini-3-flash`。本地 `routes/chat.py` 中该字段默认值直接使用同一个 `config.DEFAULT_MODEL`，因此核实了运行进程的 bootstrap 目录标识；没有直接读取服务器环境变量或凭据。
- `GET /api/registry/connections/{connectionId}`：Gemini 连接名称和地址为空已确认；只输出存在性。当前 `model_registry.py` 将该目录标识映射为 `gemini-3-flash-preview` / `gemini_stream_generate_content`。

表格表示审计时配置和当前源码共同确定的解析结果，未向 Provider 发送请求，不是历史生成时的执行追踪。不同客户端之后改变设置或最近 Main 记录，普通 send 的兼容解析结果可能变化。

### 现有 Diary 模型设置能否明确独立绑定

可以。旧 Diary 页提供「此日记模型设置」，调用 `LLMSettings.openStored('diary', entryId)`；当前配置项为：**连接、协议、模型 ID**。连接从已有连接中选择，协议提供 OpenAI Chat Completions / Anthropic Messages，模型 ID 可手动输入；「获取模型」是另外的主动请求，本轮没有触发。

其 GET/PUT 契约为 `/api/registry/selections/diary/{entryId}`。保存时先通过真实独立解析器校验，再把完整 `{connection_id,protocol,model}` 存入原 Entry 的 `model` TEXT 字段；无数据库迁移。保存后的 JSON 选择同时被 send 和 regenerate 尊重。Gemini 属于旧格式读取兼容能力，不在此编辑器的新协议选择中。

**Penumbra Diary Chat 目前没有模型设置入口**；不能把旧页已有能力误报为新界面已接线。全局设置页的连接编辑表单有「API 地址（基础地址）」字段，负责连接的 `base_url`；Entry 模型设置负责选择连接/协议/模型，两者不是同一个字段。本轮没有新增设置入口，也没有保存任何选择。

## missing_base_url 的根因与解析链路

当前 Entry 未绑定模型，send 和 regenerate 原本就采用不同的兼容选择顺序：

| 步骤 | 普通 Diary send | Diary regenerate |
| --- | --- | --- |
| 选模型 | `post_message` → `_legacy_diary_model(entryId, body.model)`：显式请求 → Entry 的显式 JSON → 最近 Main 的旧目录字段 → Entry 旧字段/bootstrap | `regenerate_diary_message`：Entry.model 非 null 则直接采用，否则使用 `DEFAULT_MODEL` |
| 当前选择结果 | 「自定义」目录项，使用当前选定连接「55」及其模型/Anthropic 协议 | Entry.model 为 null，采用已核实的 `gemini-3-flash` bootstrap |
| 共享解析 | `_resolve_diary_request` → `resolve_independent_request` → `_catalog_selection` 或显式 JSON → `resolve_main_request` | 相同 |
| 地址来源 | Registry v2 Connection 的 `base_url` → `connection_profile_facts` 生成的 profile.base_url | 相同；当前 Gemini 连接该字段为空 |
| Runtime/Provider | 地址有效后构造冻结的 RuntimeLLMBinding，传入 `stream_ai(...binding=...,generation_options=...)` | 地址校验失败，尚未构造可执行 binding，也没有进入 Provider 参数构建或调用 |

`main_configuration.py::resolve_main_request` 对 profile.base_url 去空白后检查，空字符串抛 `MainConfigurationError('missing_base_url')`。Diary 的 `_resolve_diary_request` 将它转换为 HTTP 422 `detail.code`。前端 POST 本来就只提交 Entry/message 身份，不承担 base_url；**没有发现调用链漏传 base_url、Runtime Binding 字段丢失或目录映射失败**。

这次已确认的问题是：**未独立绑定的 Entry 触发原 regenerate bootstrap 分支，而该分支所用 Gemini 连接的地址未配置**。普通 send 正常可用不等于该 Gemini 连接有效，因为它使用另一条已配置的连接。

在当前 v2 配置权威下，不应硬编码地址、借用连接「55」的地址/密钥，或把 regenerate 改成跟随 Main；这些做法会掩盖配置缺失或改变实际模型。可供之后人工决定的方式是：显式绑定本 Entry，或补齐原连接的必要配置。本轮均未执行。

## 前端修改文件与职责

| 文件 | 本轮变化 |
| --- | --- |
| `src/application/diary-chat/diary-chat-send.ts` | 只识别 HTTP 422 且 `detail.code === 'missing_base_url'`，显示「当前模型配置缺少 API 地址，请检查模型设置。」；其余错误保留原安全处理；已知前置配置拒绝时撤下尚未保存的本次临时占位，不触碰旧消息，继续原有收尾历史读取 |
| `src/application/diary-chat/diary-chat-actions.test.ts`、`diary-chat-send.test.ts` | 新增缺地址的 send/regenerate 反馈、旧后缀保留、一次读取、其他 422/500 不误翻译及不暴露原始错误测试 |
| `src/components/diary/DiaryChatView.tsx` | 简化重新生成/删除确认，保留动态 N 与提交时范围和命令风险；预览最多 240 字符并保留原三行截断；Diary 编辑消息不展示解释段落 |
| `src/components/chat/MessageEditDialog.tsx` | 增加可选 `description`，Diary 传 null 隐藏段落；Main 默认内容、行为和保存交互完全保留；没有重做 Dialog |
| `src/components/diary/DiaryEditor.tsx` | 精简放弃未保存修改的提示，保留未知保存不可撤销请求和备份提醒 |
| `src/components/diary/DiaryFeedAction.tsx`、`DiaryAutoFeed.tsx` | 精简草稿替换与全局投喂说明，去除重复核对提示，保留替换不可恢复和重要草稿备份信息 |
| `src/application/diary-chat/diary-feed-controller.ts` | 投喂成功、已有草稿、拒绝、结果未知分别使用简短反馈；未知结果仍要求刷新、禁止重复投喂 |
| `src/application/diary-reader/diary-actions-controller.ts` | 保存成功仅反馈「日记已保存」，移除向量处理实现说明；精简保存/冲突/核对/设置错误，保留明确失败、未提交与未知结果的区别；所有条件、请求与状态转换不变 |
| `src/application/diary-reader/diary-actions-controller.test.ts`、`src/components/diary/DiaryFeedAction.test.tsx` | 更新文案断言，继续核对原有保存和确认时序 |
| `tests/backend/test_diary_model_resolution.py` | 使用后端已有源码白名单和隔离 runner，执行实际路由选择/独立解析/Runtime Binding 逻辑；后端仓库零修改，临时 SQLite 和 fake stream |
| `tests/browser/diary-chat-pr4a-smoke.cjs` | 增加已知/未知 422、0 条后缀、长预览、取消及精简编辑/删除交互验收 |
| `tests/browser/diary-chat-pr3-smoke.cjs` | 仅更新投喂/替换文案断言，保持原回归流程 |
| `docs/diary-chat-pr4a1.md` | 本审计和交付记录 |

### Diary 文案调整清单

- 重新生成：「重新生成后将替换这条回复，并删除提交时其后的消息（当前 N 条）。此操作无法撤回。」补充「回复中的记忆、日程等命令可能再次执行；已执行的操作不会撤回。」N 继续由当前历史动态计算，0 条也保留提交时范围说明。
- 删除：「删除这条消息？此操作无法撤回。」保留目标预览。
- 编辑消息：仅标题、正文编辑区、状态/失败提示和操作按钮，无说明段落；失败仍保留草稿。
- 放弃 Entry 编辑：「未保存的修改将丢失。若保存结果未知，请先核对或备份；离开不会撤销保存请求。」
- 替换投喂：显示日期，说明旧草稿/对话将被替换、重新投喂及无法撤回，取消和确认按钮不变。
- 投喂成功：「已开始投喂，可进入对话查看。」不宣称整次任务或归档完成；未知结果单独保留核对/勿重复提交提示。
- Entry 已归档正文编辑保存成功：「日记已保存」。首次归档/提取 UI 尚未实现，本轮没有新增。
- Entry 保存冲突、保存失败、结果未知、核对失败与自动投喂开关反馈保留各自语义，删除重复的实现说明。已简洁的字段校验、关键词操作与阅读状态保留。

## 验证结果

| 验证 | 结果 |
| --- | --- |
| 前端全量 `npm test` | **204 文件、2722 项通过**，比 PR4-A 新增 5 项配置错误测试 |
| 类型检查和生产构建 | 隔离源码副本 `npm run build`（含 `tsc -b`）通过 |
| 后端实际解析链路隔离测试 | **4 项通过**：未绑定 send 使用已配连接但 regenerate 因 bootstrap 空地址拒绝；有效显式绑定下两者 Runtime 一致且 regenerate 返回新 ID 保存回执；缺地址显式绑定下两者均写入前拒绝；配置有效的 bootstrap 仍按原分支成功，不回退到 send 连接 |
| Diary 消息操作浏览器 | **八组通过**：Classic / Editorial × 320/390/1280px，另各 390px 深色；覆盖 0/>0 后缀数、长回复截断、已知/未知 422、旧历史保留、取消/失败、SSE/WS/HTTP 新 ID 对账和跨 Entry 隔离 |
| Diary PR3 浏览器 | **六组通过**：两布局三种宽度；包括新投喂文案、草稿替换确认、归档阅读/编辑入口、发送和未知结果处理 |
| Main Chat 既有浏览器 | **三组通过**：320/390/1280px，原编辑说明/交互、取消/失败、再生成、发送/去重、IME 和短屏；脚本未改 |
| 差异检查 | `git diff --check` 通过；最终应用源码与已测试/构建的副本逐项一致；原暂存内容保留，AionHome 干净，两仓 HEAD 不变 |

可重复的解析测试命令（仅传源码位置，不传真实配置）：

```sh
/Users/remix/Desktop/AionsHome-main/.venv/bin/python -B tests/backend/test_diary_model_resolution.py /Users/remix/Desktop/AionsHome-main/aion-chat
```

前端测试/构建副本：`/private/tmp/penumbra-pr4a1-0d5odf16`。后端测试动态复制现有 runner 的源码白名单，禁止 socket 外连，不导入生产应用/config，不加载真实数据或凭据。浏览器独立 Chrome profile，只使用本地合成 HTTP/SSE/WS；UI 回归与真实配置审计相互独立，自动测试不依赖真实服务。

已目视检查 320px 精简确认弹框与 Editorial 深色页面；截图在 `/Users/remix/.codex/visualizations/2026/10/30/01a18c04-c0c1-71c1-a1a0-419ba625da4a/diary-pr4a1`。日志为 `/private/tmp/penumbra-pr4a1-{tests,build,model-contracts,browser,feed-browser,main-browser}.log`。

## 保留问题和未覆盖边界

- 按追加指示，真实 Entry 的模型绑定与 Gemini 地址缺口仍保留，**真实 regenerate 仍会被当前配置拒绝**；绑定方式留待审计后决定。没有增加 Provider/模型回退或悄悄修改运行设置。
- 本轮只读审计未调用真实模型，不能证明连接「55」的 Provider 运行状态或未来生成成功；表格只确认当前配置解析及地址存在性。
- 旧兼容 send 仍可能随最近 Main 的旧目录字段/活跃连接变化，regenerate 仍取 Entry/原 bootstrap；明确 JSON Entry 绑定可同时约束两者，但本轮没有代用户选择。
- 已知 422 是生成前配置拒绝，与断流等未知结果区分；其他未知错误不统一翻译为地址缺失，不暴露原始异常。旧命令副作用不可回滚、后缀快照和后台并发限制继续遵循 PR4-A。
- 未做 Safari、iOS/Android 真机键盘、真实 Provider 或生产写入端到端验收；前端全量和浏览器使用合成数据，后端使用实际源码加 fake integrations。
