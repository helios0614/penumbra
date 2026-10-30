# Diary Chat PR3：同 Entry 收发与日历自动投喂

2026-10-30，Asia/Shanghai。属于 Phase 3 / Diary Chat PR3。交付仅修改 Penumbra，未 commit、暂存、push 或 deploy，等待人工验收。

## 基线与源码核对

| 仓库 | 分支 / HEAD | 开工状态 |
| --- | --- | --- |
| Penumbra | `main` / `2af1975037b579eced565100b8d1f9b429105c77` | 干净，PR2.1 共享气泡样式已提交 |
| AionHome | `refactor-code-main` / `7105f948d2965ead1f8023a691100112e0b4f5c3` | 干净，包含 PR1 `6589da3` 与父回复先保存的 `7105f94` |

Penumbra 根目录没有实体 AGENTS.md；遵守用户提供的 AGENTS 指令、CLAUDE.md、前端架构与 UI 规范，以及 AionHome 根 AGENTS、runtime model 和 master plan。核对 PR0 审计、PR1、PR2、PR2.1 文档后，以当前源码确认契约，未沿用旧审计的无身份 SSE、Query 默认参数和父回复晚保存等过期结论。

**[源码验证]** 当前 `aion-chat/routes/diary.py`：`MsgCreate` 位于 461 行；`post_message` 入口 653 行，使用传入 Entry 保存用户消息、读取同 Entry 的 `diary_messages`，沿用 `_legacy_diary_model`、现有 Diary Prompt/记忆召回及上下文限制。1002 行发 start；1061 行起构造可空保存对象并在 commit 后广播，1122 行发 done。1739 行为普通投喂入口，1965 行为历史入口。历史入口的 done 拒绝可能没有 code/Entry ID，前端通过只读索引核对，保留原归档入口。后端现有能力足够，无需重复实现或修改。

未改变数据库、Prompt/召回、ReadOriginalDialogue/NextGroup、批次策略、模型选择或后端 WS 契约。没有创建 Main conversation 或第二套上下文。手动消息只 POST 原 Entry 的 messages；新增消息继续参与后端原有的上下文构建，默认最近 30 条，不承诺全部早期材料永久进入每次 Prompt。

## 实际修改文件

以下路径均相对 Penumbra；AionHome 无修改。

| 文件 | 职责 |
| --- | --- |
| `src/domain/diary/diary-chat-send-client.ts` | MsgCreate POST、共享 SSE 解帧、Diary 事件校验、保存对象映射 |
| `src/domain/diary/diary-chat-send-client.test.ts` | 分片 UTF-8、实际 HTTP 参数、身份/回执/投喂返回契约 |
| `src/domain/diary/diary-feed-client.ts` | 历史投喂 POST、显式替换参数及成功/草稿/拒绝结果投影 |
| `src/application/diary-chat/diary-chat-send.ts` | 本地请求、临时 overlay、真实 ID 绑定、保存对账及失败释放 |
| `src/application/diary-chat/diary-chat-stream-text.ts` | 仅流式展示的 Thinking/DRIFT 分离和 Diary 命令标记过滤 |
| `src/application/diary-chat/diary-chat-send.test.ts` | SSE/WS/HTTP 竞态、未知身份、部分保存、请求隔离及原子发布 |
| `src/application/diary-chat/diary-chat-controller.ts` | 扩展原 PR2 读取控制器，协调局部发送与历史/overlay 原子快照 |
| `src/application/diary-chat/diary-feed-controller.ts` | 本页 POST 防重入、按业务日期保存启动回执、一次索引核对 |
| `src/application/diary-chat/diary-feed-controller.test.ts` | 任意日期、冲突/确认替换、未知结果及卸载隔离 |
| `src/application/diary-reader/diary-reader-controller.ts` | 增加一次强制索引回读入口，取消旧在途索引，保留选择与导航 |
| `src/components/diary/DiaryFeedAction.tsx` | 轻量启动入口、原 Entry 继续、回执入口、替换确认与局部焦点恢复 |
| `src/components/diary/DiaryFeedAction.test.tsx` | 真实回执导航、确认前零替换请求、焦点恢复且不抢用户焦点 |
| `src/components/diary/useDiaryFeed.ts` | 页面局部投喂控制器订阅与卸载 |
| `src/components/diary/DiaryCalendar.tsx` | 预览区域的操作槽；空索引文案只描述“日历中尚无记录” |
| `src/components/diary/DiaryChatView.tsx` | 接共享 Sender、局部发送反馈、已有 BubbleList 的发送跟随能力 |
| `src/components/diary/DiaryView.tsx` | 日历启动操作装配，仍保留原日历/Reader/Editor 挂载与导航 |
| `src/components/diary/diary-chat-presenter.ts` | 持久历史与 overlay 到共享展示 VM，按真实身份合并 |
| `src/components/diary/useDiaryChatNavigation.ts` | 增加直接使用启动回执 Entry ID 的导航入口 |
| `src/components/diary/DiaryEditing.test.tsx` | 更新索引事实文案断言 |
| `src/components/diary/DiaryPresentation.test.tsx` | 新 hook 替身、启动入口与索引事实文案断言 |
| `tests/browser/diary-chat-pr2-smoke.cjs` | PR2/2.1 回归仅将“无 Composer”更新为共享空 Composer 断言 |
| `tests/browser/diary-chat-pr3-smoke.cjs` | 生产构建 + 本地合成 HTTP/分段 SSE/WS 的完整 PR3 浏览器验收 |
| `docs/diary-chat-pr3.md` | 本交付记录 |

`useDiaryChat` 的原挂载/订阅/WS 清理机制直接承载扩展后的控制器，无需重写。共享 ChatShell、BubbleList、Bubble、MarkdownRenderer、Sender 及所有共享 Chat 样式源文件均未改动；Diary 暖白/暖深色背景与 6px 磨砂保持 PR2.1 状态。

## API 契约

| API | 实际请求 / 返回处理 |
| --- | --- |
| `POST /api/diary/entries/{entry_id}/messages` | ID 转义；只发送 `{content, role:"user"}`，保留原输入文本；其余 MsgCreate 字段省略，使用现有后端默认与模型选择；不依赖未实现幂等的 client_msg_id |
| SSE start | 校验 entry_id、assistant id、user_message_id；user 已保存，assistant 仅预留身份 |
| SSE chunk / error | 正文分片投影到临时 assistant；error 保留安全摘要，不把可能含配置的 provider 原始异常展示给用户，不把 error 当回滚 |
| SSE done | 校验可空 message，非空必须是同 Entry 的 assistant；保存对象为正文/Thinking/DRIFT 的权威值；null 只撤下本次尚未确认保存的 assistant 占位 |
| `GET /api/diary/entries/{entry_id}`、`GET .../messages` | 沿用 PR2；收尾、当前 Entry WS 失效、进入、重连、手动刷新时读取；全量历史不重排 |
| `POST /api/diary/auto-feed/history/{date}?replace_existing=false` | 使用当前日历选中业务日期；默认显式 false；不请求历史候选列表，不加今天或 90 天限制 |
| 相同路径 `replace_existing=true` | 仅用户先收到草稿冲突，再确认该日期/原草稿 ID 的替换警告后调用 |
| `GET /api/diary/reader/calendar?month=...` | 每次启动请求收尾后读取一次当前月份；旧在途索引失效，不因读取失败重发 POST |

发送使用公共 `openApiStream`、SSE parser 和统一 runtime URL；响应头超时 30 秒，body 空闲超时 120 秒，无整条生成 30 秒总时限。投喂 POST 使用公共请求超时。超时和中断进入待核对反馈，均没有应用层自动重发。

## 消息状态流转与竞态

持久事实保存在 `state.messages`，临时展示单独放在 `overlays`。本地 sending 只表达本页主动 SSE 请求，不表示后台是否忙碌。

| 观察到的事件 | 本地处理 |
| --- | --- |
| 用户发送 | 建本地 user/assistant；局部禁止重复发送，仍允许编辑下一条草稿；取消发送前在途读取的 owner |
| start | 将本次两个临时 ID 绑定到真实 ID；user 撤下未确认标签，assistant 继续流式状态 |
| chunk | 持续更新同一 assistant；Thinking/DRIFT 与正文分离，展示过滤不执行命令，不影响后端存储 |
| WS 先到 | 仅按当前 Entry 失效历史；GET 命中真实 ID 后合并、撤下对应 overlay，后续 raw chunk 不覆盖已保存对象 |
| done.message 先到 | 保留真实保存对象；可与已有 HTTP 消息按 ID 替换展示；后续快照确认后撤下 receipt overlay |
| error 后仍有保存 | 同时保留错误反馈、已保存 user 与部分 assistant，不撤销真实消息 |
| done.message=null | 不把 reserved assistant ID 当保存成功；不删已在历史中确认的真实消息或其他空白消息 |
| 断流/EOF 无完整回执 | 保留已绑定 user、未确认的 assistant 片段和警告；未收到 start 时不按正文/时间/“最后一条”猜 ID |
| 请求结束 | finally 释放本地 sending，并发起同 Entry GET；GET 不阻塞下一次发送。Sender 的 false 返回恢复提交草稿；若已编辑下一条，使用共享恢复草稿区 |
| GET 成功 | 用后端原数组顺序替换历史，并原子移除已按 ID 核对的 overlay；不先发布一个缺失用户消息的中间状态 |
| GET 失败 | 保留上次历史及本地内容，保留失败反馈和手动刷新入口；不循环重试 |
| 切换 Entry / 删除 / 卸载 | 取消本地流并使 owner 失效；晚到 SSE、旧读取和收尾不能污染其他 Entry |

合并身份限定 `(entryId,messageId)`，不同 ID 的同文消息保留。快照启动时记录 receipt revision，开始于较新回执之前的读取不得覆盖该回执。未知身份 overlay 保留“结果待确认”，即使 GET 中有相同正文也不自行关联。

WS 仍使用 PR2 的身份投影、150ms 固定窗口合并失效与重连补读，不把 WS assistant 直接 append 成第二条消息。没有新增永久轮询、任务注册表、后台逐字流恢复或跨页面 busy。`feeding`、`finished`、最后一批材料、SSE start/done/EOF 均不用于判断整次自动任务结束。

## 日历闭环

成功回执按日期留在当前 DiaryView 内存。页面不跳转，提示“已开始投喂”，刷新当前月份索引一次，不改月份、选中日期或滚动。索引暂时没有对应 Entry 时显示独立的回执入口，直接把真实 ID 交给原 Diary Chat 导航；索引收录同 ID 后不重复显示入口。

草稿冲突的“继续原日记”只导航返回 ID，没有第二次启动请求。“替换并重新投喂”先打开 AlertDialog，明确告知旧草稿及消息可能失去原有可访问性；取消零替换请求，确认才发 true。done Entry 继续由后端拒绝，原正式 Reader/Editor 保留。全局“自动投喂记忆”开关的现有设置链未改动。

未知结果只读刷新索引：找到对应记录可用原“查看对话”进入；没找到时保留待核对提示，允许页面手动刷新。不自动再 POST，不切换替换模式。按钮防重入仅覆盖 POST 在途时间，索引失败也不会永久锁住它。禁用启动按钮造成的焦点丢失已修正：仅在仍是同日期且用户没有转移焦点时，以 preventScroll 恢复原按钮。

## 验证结果与证据边界

| 检查 | 结果 |
| --- | --- |
| **合成测试：前端全量 `npm test`** | **201 个文件，2684 项通过**；含 Main Chat、Diary 归档阅读/编辑、Sender 草稿/IME、PR2 读取/导航/WS/请求隔离 |
| **类型/构建：`npm run build`** | TypeScript 与 Vite 生产构建通过 |
| **合成测试：当前后端隔离 runner** | `run_diary_pr1_isolated.py`：**149 项 Python、26 项旧页 Node 测试通过**；未修改后端测试或代码 |
| **浏览器：PR3 生产构建** | **Classic/Editorial × 320/390/1280px 六组通过**，640px 高；分段 SSE、WS/HTTP、错误/断流、同 Entry 连续发送、日历启动与确认替换/未知结果 |
| **浏览器：PR2/2.1 回归** | **十组通过**：两布局三种宽度浅色六组，390/1280px 深色四组；长历史、乱序时间下原数组顺序、导航/返回焦点、刷新/重连/删除、原 Reader/Editor、共享气泡计算样式一致 |
| **浏览器：Main Chat 既有脚本** | `chat-message-edit-smoke.cjs` 原样 **320/390/1280px 三组通过**；发送/去重、编辑、再生成、IME、A/B 请求归属、错误重试及短屏 |
| diff / 源码一致性 | `git diff --check` 通过；隔离验证源码逐文件比对；两仓 HEAD 不变，暂存区为空，后端工作区仍干净 |

新增应用测试覆盖 WS-before-done、done-before-WS、start 后 EOF、error 后部分保存、null 回执、GET 失败、发送前及发送中历史刷新、切 Entry 晚到、未知身份不得按同文合并、流式 Thinking/DRIFT、重入与再次发送。浏览器每组主动发送 5 次均进入同一回执 Entry；6 次投喂 POST 含一次明确替换，其余 false；索引共读取 9 次，包含初始月份、切月、各启动后一次与一次手动核对。没有 Main 创建写请求。

原子快照回归先在修改前复现“订阅者短暂丢失已确认 user”的失败，再合并历史/overlay 发布修复。浏览器实测发现禁用启动按钮会失焦，修正后六组验证滚动与焦点保留，并补合成用例保证不抢用户新焦点。测试替身最初缺新 hook、旧只读断言和一个未使用导入已校正，不计作产品基线缺陷。

前端全量测试、构建在 `/private/tmp/penumbra-pr3-s3qd852e` 的白名单源码副本运行，未复制 `.env`、个人配置、数据或真实数据库。后端 runner 只使用 AST/fake integrations/临时 SQLite 并禁止 Python 外连。Diary 浏览器使用本地隔离生产产物、合成 HTTP/可分段 SSE/WS，拒绝其他域请求；Main 浏览器使用隔离源码及独立 Vite cache。没有请求真实模型、投喂真实记忆或连接生产服务。

截图共 48 张：PR3 六组各“启动后日历 / 继续聊天 / 替换警告”三张；PR2 回归十组各三张。存放于 `/Users/remix/.codex/visualizations/2026/10/30/01a18bd8-c693-7f21-8603-1c02130e8c62/diary-pr3` 和 `diary-pr3-regression`。已目视检查 320px 聊天、390px 日历、桌面替换警告及暖色阅读/磨砂层的截图。

## 未覆盖及保留边界

- 未做真实设备、Safari、真实 provider、真实记忆数据或线上端到端验证。浏览器移动验收是 Chromium 的视口/触摸模拟；网络中断采用已开始返回 JSON 后断开，未在浏览器等待完整 30/120 秒超时，超时基础传输由既有测试覆盖。
- 后端测试为 Diary 相关隔离全切片，没有导入个人配置执行 AionHome 全仓集成测试；前端全量测试完整执行。
- 同 Entry 上下文连续性有当前后端源码与合成同 ID 收发证据，不承诺真实模型对所有历史细节的记忆效果。超出后端 context_limit 的早期历史仍可能不被送模。
- 后台没有可靠完成或全局 busy 信号；批次 user 并非全部广播，也没有后台 chunk 回放。只展示目前可观察的持久过程；不以本地 SSE 收尾宣称自动投喂完成。
- 无 start 且无可关联回执时，无法从历史判断哪条属于本次请求；保留待核对占位，不做正文去重。已保存的错误部分可能与恢复草稿同时存在，必须先核对，应用不会自动重发。
- 没有新增服务端幂等或全局锁，不能承诺跨客户端/后台并发串行，也不能控制浏览器或网络设施底层的重传。替换仍有后端既存竞争及旧任务未取消的边界，本轮不改造。
- 启动回执只在本次页面挂载保留。整页刷新通过原索引和 Chat URL 恢复已有 Entry；若空 Entry 暂未出现在索引且此前未进入 Chat，内存回执不会跨刷新保留。本轮未新增跨页任务存储。
- 消息编辑/删除/再生成、正文提取归档、日历快捷提取、模型设置 UI 等继续留给 PR4 或独立任务。没有触及既有正式归档保存流程或 Main Chat 业务逻辑。
