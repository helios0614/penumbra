# Main Chat PR4 能力清单：PR4-B 实施补记

日期：2026-10-24。前端基线 `beb7876`，AionHome 基线 `0678ad1`。本轮不 commit、push、部署。

开工时两个工作树中均不存在用户引用的 PR4-A 同名审计文件。本文件记录本轮实际接入情况，以用户已确认的 PR4-B 设计为依据；不声称重建了缺失的原审计全文，也没有重新审计全部命令。

## 展示与事实来源

下表描述新版结构化生产者；缺少新版投影的旧 system 文本采用本文件末尾的兼容优先策略，包含旧前端已可读的提示说明。

| 能力 | 默认展示 | 可信来源与公开内容 | 历史恢复与限制 |
| --- | --- | --- | --- |
| 白天/夜间 keepalive | 触发注解 | `activity.py` 判断时捕获的 Assistant 上次回复、检查时间、配置阈值、用户上次回复；区分自由活动/夜间自由活动 | 新消息持久化 `public_display`。阈值基于 Assistant，用户时间仅为上下文，不新增用户沉默规则 |
| Activity 位置问候 | 触发注解 | `check_inactivity_and_greet` 的离家/回家状态、实际事件时间、已验证的 Wi-Fi 场景；历史采样保留年龄 | 不公开 SSID、设备/绑定标识；不将旧 Wi-Fi 样本当作当前联网状态 |
| Location Sentinel | 触发注解 | 实际 old/new 状态及正常决策/分析失败 fallback 分支 | 与 Activity 分开；原 sentinel/core Prompt 不变，不公开动态 `core_reason` 或完整日志 |
| Camera Sentinel | 触发注解 | 摄像头哨兵分析后请求主动联系的事实 | 不公开截图、sentinel Prompt、画面原文；没有更细的已批准公开原因时不编造 |
| MEMORY_WRITE | 紧凑操作行 | 实际保存正文（含已有日期补全）、重要度、消费的关键词、`add_memory` 真正返回的 ID | Main、Activity 与 schedule 写入路径均接入；失败保留安全类别/异常类型，原 provider 异常仅留私有记录 |
| ALARM / REMINDER / Monitor | 紧凑操作行 | 实际消费的日期与内容 | 新创建通知没有可证明的 schedule ID，因此不生成跳转；不把 TODO 创建时间当截止时间 |
| TODO / TODO_DONE / SCHEDULE_DEL | 紧凑操作行 | 正文；完成/删除使用真实查询到的 ID 与原日程信息 | 只展示后端已有消息；不为仅日志中的失败创建新 system 行 |
| 日程唤醒/定时监控触发 | 触发注解，已有失败为操作状态 | 真实计划内容与时间、监控未开/无画面的原因 | 原全局提醒保留；Chat 不增加提醒弹窗 |
| ACTIVITY_CHECK | 紧凑操作行 | 原摘要事实块、请求条数、实际读取条数上限；摘要自带覆盖区间及预算省略说明 | 不公开 `result.prompt` 包装；无观测不等于没有活动 |
| 模型主动 Location | 紧凑操作行 | 捕获的位置状态、地址、距家距离、天气、记录时间 | 不用内部 location follow-up Prompt，不声称是 UI 读取时的实时定位 |
| CAM_CHECK | 紧凑操作行 | 取得画面/跳过/失败与原因、模型续写准备情况 | 不公开截图路径或内部 Prompt，不假称用户已看到画面 |
| TOY | 紧凑操作行 | 现有 `_toy_sys_msg` 路径中的已发出档位/停止指令 | 无硬件 ACK，结果明确未知；只有 WS 且未持久化的旧/其他路径不补造历史 |
| MCP | 折叠结果容器 | 真实 server/tool、安全调用/执行参数、安全已保存结果、错误、独立 AI 有界结果、截断/未交付说明 | 复用既有 `mcp_tool_calls` 消息身份与顺序；旧 Assistant 携带的 calls 也投影；不虚构统一调用生命周期 ID |
| POI_SEARCH / ROUTE_PLAN | 折叠结果容器 | 既有真实候选地点、地址、距离、目的地、路线、失败原因及安全参数 | 与 MCP 共用结果阅读原语；不生成地图链接、导航完成或实时定位事实 |
| MUSIC | 折叠选曲结果 | `music_commands` 实际关键词、歌曲、歌手与取得播放地址/失败结果 | 新既有 system 结果行增加投影；没有播放器，也不消费占位播放按钮 |
| Web Search | 附着于发起 Assistant 的折叠结果 | `web_search_feedback`：查询、状态、候选/读取/可用来源数、title/domain、安全失败与 follow-up 失败 | 保留 receipt ID 和 source_message_id；不读取 `web_context_events` Evidence 作为正文 |
| URL Reader | 附着于原用户消息的折叠结果 | 已有 `url_read_results`：持久化 event ID、domain、实际读取状态/原因 | 与 Search 锚点独立；未保存尝试不补全、不重新请求网络 |
| REACTION | 目标用户气泡右下角贴纸 | 已有 reaction ID、target/source message ID 与 conversation ID；使用真实 emoji 与既有 AI 雾蓝表面 | 多段消息附着最后一段气泡；WS 仅失效通知，HTTP 回读；不挂到最后一条用户消息 |
| HEART | Assistant 旁按需入口 | `has_heart` 与 whisper ID 集合 revision 来自同会话真实 Assistant；点击使用既有 by-msg endpoint | Activity 新消息统一 ID；重生成替换心声时关闭旧全文；旧孤立记录不按时间修复、不附着 |
| DRIFT / THINKING | 原独立展示 | 原合约 | 保留原实现，不归入系统操作 |

## 公开边界

- Main Chat 请求 `GET /api/conversations/{id}/messages?...&public_view=true`。
- 新投影附加在原 `messages.public_display` nullable JSON 列；MCP 仍使用现有数组，Web/Reaction/HEART 仍各用原存储，没有全局事件表。
- 原消息 `content`、隐藏 trigger 行、Prompt builder、AI Token Budget、命令顺序和业务副作用保持原契约。
- 公开 HTTP 对 system/隐藏角色清空原内容、附件与内部推理字段；从字段 allowlist 构造响应，不透传新增内部列。
- 已配置凭据与常见 credential 字段脱敏；新版 MCP 参数仍过滤 Prompt/context/Evidence/截图等私有结构。旧 system 已可读文本单独走凭据脱敏，不因包含给 AI 的说明而整条关闭，也不因此开放其他私有列或附件。
- 可信 `public_display` 优先；缺少新列时，由后端只读兼容已核对生产者的完整旧通知格式：记忆写入及失败、待办添加/完成、闹铃/日程/查岗设置、日程取消与封闭 MUSIC 结果。保留原正文、错误详情、重要度、时间，不推断旧记忆/日程 ID。
- 不能分类的旧 system 文本使用“旧版系统内容”轻量折叠行，默认带 1–2 行安全原文预览，展开为可复制的脱敏纯文本，隐藏执行状态标签；不按 emoji、ID、模糊关键词或时间猜业务成功。旧 Activity/Location/Camera 提示、后台问候亦可阅读。
- `cam_trigger/cam_user/cam_log` 仍隐藏；无可用文本/结果才占位。旧孤立 HEART、未持久化 loading/URL/TOY 不补造事实。超长旧文本字段最多展示 256,000 字符并明确说明展示截断，原持久化与 AI 上下文不变。

实现、共享组件、验证记录和人工清单见 [chat-pr4-implementation.md](./chat-pr4-implementation.md)。

## PR4-B Follow-up：版本配套与旧记录

2026-10-24 人工验收后实查：本机 Penumbra 代理指向 `127.0.0.1:18080`，运行中的后端不识别单条公开读取接口；带 `public_view=true` 的历史仍返回原始旧 DTO。抽样最近 100 条中 11 条 system 均没有 `public_display`，其中存在结构化 MCP carrier。此现象与本地投影缺少旧文本兼容、前端未消费独立旧 carrier 是三个不同原因。

本次后端公开响应增加 `public_view_version: 1`，以区分已投影的未知记录与未更新的后端。读取旧记忆/日程/MUSIC 不要求回填或新增旧消息 metadata；不会写库、补 ID、恢复已丢失结果或重新执行命令。新的触发条件仍依赖 PR4-B 正常初始化公开列并保存。

新前端面对仍返回原文的旧后端：独立 MCP/POI/Route carrier 走已有安全详情；system 文本走浏览器凭据脱敏的折叠原文兜底，不在浏览器推断命令业务。**如果旧公开后端已经清空 content 且只返回占位，前端无法恢复丢失内容，仍需配套后端；服务端配置秘密的完整过滤也依赖配套投影。** 本轮未重启或部署后端。

## 旧历史阅读兼容矩阵（本次策略修正）

对照实际 `static/chat.html::renderMessages` 和 `mcp-result-ui.js`：旧前端跳过三个 Camera 隐藏角色；system 有 calls 时显示工具详情，否则仅移除开头 `[delayed]` 并 `escHtml` 展示全文。后端现在在清空 HTTP 的 raw content **之前**，把该安全文本装入 `public_display.fields`，不再把“不能分类”当作“不能阅读”。

共 25 个合成样本：23 条旧前端可读记录全部保留有意义内容，Penumbra 仅剩占位 **0/23**；另 1 条空内容保留占位、1 条隐藏角色两边均隐藏。覆盖新版投影、旧记忆及失败、日程/待办、MCP/POI/Route、Activity/Location/Camera、主动问候、MUSIC、自定义说明、HTML/Markdown、凭据和 JSON Prompt/context。此统计针对同组合成矩阵，不代表扫描了所有用户数据库。

矩阵生成器直接运行实际旧渲染函数，并记录其 SHA-256；后端验证原记录未改写，前端验证相同安全正文与旧 HTML 对照。详见 [实施记录](./chat-pr4-implementation.md#旧历史兼容优先修正与专门矩阵)。

## 旧通知语义与折叠预览补记

后端读取层新增有限 `chat_legacy_observation.py`，沿用 `chat_legacy_display.py` 的凭据脱敏、字段长度保护和完整安全文本回退。原 `messages.content`、AI 历史投影、Prompt、命令执行与持久化均不修改。

| 已知模板 | 默认可辨识内容 | 不能从旧通知补造的事实 |
| --- | --- | --- |
| 记忆写入 / 写入失败 | “已写入记忆 · 重要度 X”与两行正文；失败为真实安全错误预览 | memory ID、未记载关键词、日期补全 |
| 闹铃/日程/查岗设置、取消，TODO 添加/完成 | 操作、原时间（存在时）和正文预览 | 日程跳转 ID、TODO 截止日 |
| Activity 完整摘要包装 | 查看动态、覆盖区间、动态摘要；展开保留全文 | 不从摘要条数猜覆盖时间 |
| Location 完整位置包装 | 查询位置、原位置结果预览；展开保留全文 | 当前实时位置、地图链接 |
| CAM_CHECK 完整画面附上回执 | 查看监控及原文字说明 | 不请求或恢复图片 |
| Activity/Location/CAM_CHECK 固定失败包装 | 失败或显式“已跳过”的原因 | 不猜调用 ID 或模型续写结果 |
| 监控旧短句、Location Sentinel 旧警报句 | 查看监控记录 / 位置变化记录及原文预览；状态保留未知 | 不推断设备 ACK、计划身份或位置 old/new |
| 日程提醒触发、监控固定失败句 | 提醒内容、计划内容与固定失败原因 | 不补旧计划时间或 ID |
| MUSIC 封闭结果 | 真实歌名/歌手预览，展开保留关键词与完整选曲结果 | 不声称已经播放 |

未知、变体或不完整包装继续显示“旧版系统内容”及两行安全原文预览。业务解析由后端完成；旧版后端返回的 raw 文本只做浏览器脱敏预览，不复制后端 parser。共享 UI 仅扩展原折叠操作行的预览布局，没有新增历史卡片。本轮不做浏览器视觉验证，由人工查收。
