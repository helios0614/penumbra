# Diary Chat：Entry 独立模型配置与 send / regenerate 统一

日期：2026-10-30。前端仓库 `/Users/remix/Desktop/Penumbra`；后端仓库 `/Users/remix/Desktop/AionsHome-main/aion-chat`。

## 开工检查与范围

- 当前前端基线为 `53e7e1f`，PR3 已独立提交为 `99ea5aa`；后端基线为 `7105f94`。此前 PR4-A / A.1 内容保留。
- 重新检查当前 `routes/diary.py`、`main_configuration.py`、`model_registry.py`、`independent_llm.py`、Runtime Binding 和 Registry selections 实现。PR0、PR1、PR3、PR4-A / A.1 作为历史材料，接口结论以本轮源码和隔离测试为准。
- Main 的模型选择原本自动应用，Diary 本轮要求显式保存。因此只抽取展示层，Main 原 hook、控制器、保存回调及文案保留；Diary 使用自己的 Entry 草稿控制器。
- 旧 send 的请求级 `body.model` 可以绕过 Entry。统一后不再用该字段选择模型；旧字段及原有输入校验仍兼容保留。旧客户端需要先通过 Entry selection 接口保存绑定，不能靠单次发送覆盖模型。
- 没有修改运行环境配置，没有读取或修改真实 Key / Token，没有发送真实模型请求。没有 commit、push 或 deploy。

## 修改文件与职责

前端路径均相对 Penumbra：

| 文件 | 职责 |
| --- | --- |
| `src/components/chat/ModelSelectionPanel.tsx`（新增） | 从 Main 原组件抽取相同卡片、连接 / 协议 / 模型输入、折叠区、ScrollArea 和样式；可选择自动应用或显式保存。没有新增 CSS / Dialog / 全局文案层 |
| `src/components/chat/MainModelSelection.tsx` | 保留原 Main 策略，仅连接共享展示层 |
| `src/components/diary/DiaryModelSelection.tsx`（新增） | Entry 级模型设置适配器；展示独立 / 兼容来源，使用显式保存及规定的作用范围说明 |
| `src/components/diary/DiaryChatView.tsx` | Composer 加号菜单入口；配置保存期间局部阻止发送 / 重新生成，与现有请求互斥 |
| `src/domain/diary/diary-model-client.ts`（新增） | 现有 Diary selection GET / PUT、身份校验、安全 DTO 投影和保存回执核对；只复用 Main 的 DTO mapper，不使用 Main Runtime |
| `src/application/diary-chat/diary-model-controller.ts`（新增） | 加载、显式保存、取消、保留失败草稿、结果未知核对、Entry 请求隔离 |
| `src/components/chat/MainModelSelection.test.tsx` | 原 Main 14 项测试保留，适配抽取后的展示层 |
| `src/components/chat/ModelSelectionPanel.test.tsx`（新增） | Diary 快选 / 展开 / 输入失焦 / 协议改变均不隐式写入 |
| `src/domain/diary/diary-model-client.test.ts`（新增） | 读取契约、来源区别、不可用绑定保留、安全投影、写入与回执身份 |
| `src/application/diary-chat/diary-model-controller.test.ts`（新增） | 保存 / 取消 / 失败恢复、直接保存当前兼容选择、迟到读写隔离 |
| `tests/backend/test_diary_model_resolution.py` | 运行当前后端真实解析函数和路由的隔离契约，更新先前审计中的预期，补两 Entry 读写 / Runtime 隔离 |
| `tests/browser/diary-models-smoke.cjs`（新增） | 真实生产前端 + 合成 Registry / Diary HTTP / SSE，覆盖八组尺寸、主题及配置交互 |
| `docs/diary-chat-model-settings.md`（新增） | 本交付记录；旧文档描述的 send / regenerate 分歧由本轮统一规则取代 |

后端路径均相对 aion-chat：

| 文件 | 职责 |
| --- | --- |
| `diary_model_selection.py`（新增） | send、regenerate、配置 GET 共用的只读 Entry / 兼容目录选择入口 |
| `routes/diary.py` | 两条路径都先选择同一模型，再调用原 `_resolve_diary_request`；不改各自生成、上下文、命令和保存流程 |
| `registry_selection_settings.py` | Diary 读取结果增加实际兼容解析结果、安全连接列表及可选协议；保留原存储 / 写入校验契约 |
| `tests/contract/run_diary_pr1_isolated.py` | 白名单加入新选择模块 |
| `tests/contract/test_diary_manual_regenerate_contract.py`、`test_diary_message_order.py` | 临时 DB 补全真实选择路径使用的 conversations 表；regenerate 注入共享选择入口 |
| `tests/contract/test_phase5c_auxiliary_runtime.py` | 预期改为 send / regenerate 使用同一兼容模型，继续验证自动投喂原流程 |
| `tests/contract/test_phase5d_settings_contract.py` | 合成 conversations 表补齐真实表已有的 `updated_at`，保持只读设置与引用保护回归 |

`main_configuration.py`、`model_registry.py`、Runtime Binding、数据库 schema / migration 均未修改。

## 解析流程：统一前后

统一前：

| 路径 | 模型来源 |
| --- | --- |
| send | 请求级 model → Entry 显式 JSON → 最近 Main 的旧目录 model → Entry 旧目录 model → bootstrap `DEFAULT_MODEL` |
| regenerate | Entry model → bootstrap `DEFAULT_MODEL`；不采用 send 的最近 Main 旧目录兼容分支 |

这使未独立配置的 Entry 可能在 send 使用已配置的连接，而 regenerate 解析到缺 API 地址的另一 bootstrap 连接，产生 `422 missing_base_url`。这是选择路径分歧；并非前端应该补传地址。

统一后，两条路径均为：

1. `select_diary_model` 读取当前 Entry 的 `model`；显式 JSON 绑定优先。
2. 未显式绑定时沿用普通 send 原有兼容顺序：最近 Main 的**旧目录 model 字段** → Entry 旧目录 model → bootstrap。不会读取 Main 的新 `main_selection`，不会写入 Main。
3. 共同调用 `_resolve_diary_request` → `resolve_independent_request` → `resolve_main_request`，由现有 Registry / Runtime 解析连接、协议、模型字面值、API 地址和凭据，捕获本次请求的 Binding。
4. 配置无效直接返回现有安全的 `422 {detail:{code}}`，在模型调用与消息写入之前失败；不会尝试其他连接。旧目录标识无效同样拒绝，不能用其他 Provider 掩盖配置错误。
5. 原 send / regenerate 流程分别继续处理各自上下文、SSE、WS、命令和持久化。regenerate 仍在生成成功后按原快照替换旧后缀并保存新 ID；未提前删除旧消息。

原有自动投喂经 `trigger_diary_ai_reply` 调用普通 send。其批次、调度、Prompt、Recall、命令和保存逻辑未改；独立绑定由同一 send 解析自然生效。

## 存储与读取契约

继续复用：

```http
GET /api/registry/selections/diary/{entryId}
PUT /api/registry/selections/diary/{entryId}
```

PUT body：

```json
{"connection_id":"<existing-connection>","protocol":"anthropic_messages","model":"<literal-model>"}
```

写入前使用原独立绑定解析器验证，成功后存为 `diary_entries.model` 的 JSON TEXT，提交后返回该 Entry 的读取结果。没有新表 / 新字段 / 数据库迁移，不更改其他 Entry、连接默认模型或 Main 的全局配置。

原 GET 的 `scope`、`id`、`editable`、`source`、`selection`、`stored_model`、`diagnostic` 保留。Diary 补充：

| 字段 | 含义 |
| --- | --- |
| `effective_selection` | 经统一入口和 Runtime 实际解析成功的 `{connection_id,protocol,model}`；配置错误为 null |
| `effective_diagnostic` | 安全错误码或 null；不包含异常堆栈或敏感配置 |
| `connections` | 仅 `id,name,enabled,transport,default_model,credential_configured`；不返回 URL、Key、Token、credential 或 secret_ref |
| `allowed_protocols` | 沿用当前独立绑定支持的 OpenAI / Anthropic 两种协议 |
| `legacy_send_precedence` | 非显式绑定时说明既有兼容顺序 |

兼容配置的 `effective_selection` 只用于显示和初始化草稿，前端 `saved` 仍为 null，标签为「兼容配置（尚未独立保存）」。显式绑定才显示「当前日记的独立配置」。不可用的显式绑定保留其身份和错误，不展示成另一个成功连接。

## UI 状态与请求时序

- Composer 加号菜单使用 Main 原模型卡片、名称、连接与手动调整样式。唯一作用范围说明为「仅影响当前日记的回复与重新生成。」
- 打开当前 Entry 的配置 → GET；选择、展开 / 收起、输入失焦或 Enter 均只编辑草稿。可以直接显式保存当前兼容配置，无需先改成其他模型。
- 保存 → 一次 PUT → 校验回执 scope / Entry 身份及保存的三元组 → 展示已确认独立配置。保存中本页发送、重新生成及重复保存被局部阻止，没有全局 busy。
- 明确拒绝保留草稿并提示配置问题；网络 / 服务 / 回执未知提示「结果待核对」，不自动重试 PUT，提供刷新核对。刷新保留尚未确认的草稿，若读回正是草稿绑定才清除 dirty。
- 取消恢复最后确认的配置，不写服务器；未知结果下取消仍保留待核对提醒。关闭 / 重开菜单依靠现有 keepMounted 保留编辑状态。
- Entry 切换时配置组件按 Entry 键重建，旧请求 Abort + epoch 隔离；旧保存可能已经到达服务器，但不会把晚到结果发布到新 Entry。没有声称撤销服务端已完成的保存。
- 配置 GET 暂时不可用不会要求用户先设置才能聊天；发送时由后端按相同规则解析并安全返回错误。
- 原消息 controller、历史回读、SSE / WS 身份和顺序对账机制保持不变。

## 验证结果

所有自动化均使用源码临时副本、临时 SQLite、合成配置 / HTTP / SSE / WS；未导入真实服务 lifespan、运行数据或真实凭据，后端隔离测试禁止出站连接。

| 检查 | 结果 |
| --- | --- |
| 前端全量 `npm test` | **207 文件、2735 项通过** |
| 类型检查和生产构建 `npm run build` | **通过**（含 `tsc -b`） |
| 新后端模型契约 | **6 项通过**：显式绑定相同、未绑定 fallback 相同、bootstrap 相同、两类缺地址在调用 / 写入前失败且不换 Provider、两个 Entry 独立读写 / Runtime 一致 |
| 后端原 Diary 隔离回归 | **149 Python + 26 Node 项通过** |
| 既有 phase5c / phase5d 模型与设置契约 | **52 项通过**，在完整 Python 源码临时副本中运行，未复制 data / .env |
| 新 Diary 模型浏览器 | **8 组通过**：Classic / Editorial 各 320、390、1280px 及 390px 深色；覆盖来源、手动修改、显式保存 / 取消、失败草稿、刷新、迟到读写、同 Entry send / regenerate；菜单无横向 / 纵向视口越界 |
| 既有 Diary 消息操作浏览器 | **8 组通过**，覆盖编辑 / 删除 / 新 ID regenerate、失败与未知结果、SSE / WS / HTTP 对账、切 Entry |
| 既有 Diary 投喂 / 继续聊天浏览器 | **6 组通过**，Classic / Editorial 各 320、390、1280px |
| Main 模型 / 设置浏览器 | **3 组通过**：320、390、1280px，原自动应用、键盘、刷新及 send / regenerate |
| Main 交互浏览器 | **2 组通过**：1280、390px，流式期间模型 / 设置、失败重生及回执恢复 |
| Main 消息编辑浏览器 | **3 组通过**：320、390、1280px，编辑、失败重试、切换身份、重新生成和回执去重 |
| 两仓库 `git diff --check` | **通过** |

修改前使用相同目标模型用例可复现旧分歧（3 项失败、2 项通过）；修改后以上 6 项全部通过。Main 原 14 项模型选择组件断言保留并通过。

可复现后端检查：

```sh
/Users/remix/Desktop/AionsHome-main/.venv/bin/python -B tests/backend/test_diary_model_resolution.py /Users/remix/Desktop/AionsHome-main/aion-chat
/Users/remix/Desktop/AionsHome-main/.venv/bin/python -B /Users/remix/Desktop/AionsHome-main/aion-chat/tests/contract/run_diary_pr1_isolated.py
```

浏览器脚本需指向隔离生产构建的 `DIARY_MODELS_DIST`；由脚本启动本机合成接口，不指向真实服务。日志为 `/private/tmp/diary-models-*.log`。截图位于 `/Users/remix/.codex/visualizations/2026/10/30/01a18c04-c0c1-71c1-a1a0-419ba625da4a/diary-models`；目视检查了 320px 手动调整和 Editorial 深色模型卡片。

## 兼容边界与未覆盖项

- 未独立绑定时，保留的旧兼容来源仍可能随最近 Main 的旧目录字段、旧活跃连接设置或 bootstrap 配置变化；统一的是两条路径的解析规则，不是把旧历史模型永久冻结。保存 Entry 独立绑定后不再取该兼容来源。
- 配置错误不会被本轮代码填成默认 URL，也没有替用户绑定某个真实连接；现有环境中的无效连接仍需在模型设置中修正。
- 新独立选择仍只提供现有 OpenAI / Anthropic 契约；旧 Gemini 目录兼容解析继续可读 / 可执行（配置有效时），没有新增 Gemini 独立保存协议。
- 旧请求 `model` 覆盖不再生效；非法旧目录请求值仍被原参数校验拒绝。需要覆盖的客户端应改用 Entry selection PUT。
- 复用现有 PUT，没有跨客户端 compare-and-swap / 配置变更 WS；并发修改按原服务端最后提交结果生效，面板提供手动刷新。本页对配置保存和生成做局部互斥，不引入后台锁或永久轮询。
- 没有新增解除独立绑定 / 清空模型的接口或 UI；现有契约仅 GET / PUT。
- 浏览器自动化不等同于真实手机软键盘与所有 WebView 的验收；本轮检查桌面 Chrome 合成视口和深色主题，未调用真实 Provider。
- Prompt、记忆召回、命令副作用、regenerate 成功后替换后缀、新 ID / 保存回执及自动投喂业务语义保持原样；正文提取 / 归档不在本轮范围。
