# P0 · Embedding 与向量存储一致性审计

## 结论与范围

**当前系统可以混用不同向量空间，且可能静默改变召回。现有数据契约无法证明任何历史 BLOB 属于当前 Embedding 配置。** 普通 Settings 修改地址后，下一次请求立即使用新地址，SQL 仍从原有候选中取向量。相同维度的向量照常算分，维度不同时点积还会被 `zip` 截断。另有一个独立问题，日记更新标题或正文时可以成功提交，同时保留旧输入生成的向量。两项都需要修，增加 1024 维校验只能覆盖其中一类格式错误。 [Settings 写入](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py:193) · [生成和余弦](/Users/remix/Desktop/AionsHome-main/aion-chat/memory.py:110) · [Memory 候选](/Users/remix/Desktop/AionsHome-main/aion-chat/memory.py:233) · [Diary 更新](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/diary.py:553)

审计基于 AionHome `refactor-code-main` 的 `dbb55e2`，包含 PR5-C1 `84c6f3a`。Penumbra 开工时位于 PR5-D `15a92a7`，PR5-E 已暂存。期间 Penumbra HEAD 更新为 PR5-E `fb62689`，复核了该提交中的配置契约。此次属于 Phase 0 契约审计，后续实施接 Phase 2 的 Memory 写入与召回边界。保持消息持久化、Prompt 注入顺序、命令语法及副作用顺序、WS 事件类型和时序。本轮仅新增本报告。

下文的「已确认」指当前源码或 Git 可直接证明。「推断」指由调用路径导出的、取决于输入和运行状态的行为。「未知」指仓库无法证明的部署或逐行数据事实。搜索覆盖 Git 跟踪文件中的 Embedding API、序列化、相似度、表定义、SQL 写入和别名，也检查了间接调用点与相关 Git 历史。现有测试按源码盘点。另以 Python 标准库从 AST 提取少量现有函数，接入 Fake HTTP 和记录 SQL 的 Fake DB，未导入应用模块、运行项目测试、连接网络或打开数据库。

## 1. 从配置到持久化

1. **配置。** 正常启动先做 C1 一次性迁移，再初始化数据库和启动后续服务。运行时读取内存 `SETTINGS.embedding_key`、`embedding_url`、`embedding_model`。Key 为空就返回 `None`，无旧 Key 回退。URL 去首尾空白，空值回退 `https://api.siliconflow.cn/v1`。模型为保存值或 `BAAI/bge-large-zh-v1.5`，getter 使用 Python 真值判断。独立 getter 不解析 Registry。 [启动](/Users/remix/Desktop/AionsHome-main/aion-chat/main.py:70) · [迁移](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:150) · [getter](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:288) · [模型默认](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:59) · [地址默认](/Users/remix/Desktop/AionsHome-main/aion-chat/provider_defaults.py:2)
2. **输入与请求。** OpenAI 兼容 JSON。先将换行替换为空格、中文逗号替换为英文逗号，再取前 400 个字符。POST 到 `{base_url}/embeddings`，Bearer 鉴权，body 只有 `model` 与字符串 `input`，未传 `dimensions`、编码、任务角色或模型版本参数。普通 PUT 校验新地址为 HTTPS 基础地址并去末尾斜杠。C1 对历史 URL 按原值复制，运行时没有重新执行这套校验或规范化；带历史路径、斜杠、查询的记录需要人工核对。 [请求](/Users/remix/Desktop/AionsHome-main/aion-chat/memory.py:128) · [地址校验](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py:177)
3. **响应与失败。** 每次调用创建 `httpx.AsyncClient(timeout=30)`，执行一次 POST，检查 HTTP 状态，直接取 `resp.json()["data"][0]["embedding"]`，调用 `len` 打日志后原样返回。没有检查顶层响应模型、索引、条数、向量容器、长度或元素。HTTP/超时、JSON 解析、缺字段、空 `data`、`len` 失败等进入同一个 `except Exception` 并返回 `None`。调用取消没有专门转换为业务结果。异常日志直接拼接异常字符串，可能携带 URL 等请求上下文，尤其是历史地址，应改用安全分类。无自动重试、重试预算或跨调用幂等键。 [响应与异常](/Users/remix/Desktop/AionsHome-main/aion-chat/memory.py:139) · [C1 Fake HTTP 断言](/Users/remix/Desktop/AionsHome-main/aion-chat/tests/contract/test_siliconflow_service_settings.py:188)
4. **实际生效的检查。** `EMBEDDING_DIMS = 1024` 只出现在配置常量、Memory 的未使用导入和注释，以及 C1 的 1024 元素正例夹具。HTTP、编码、DB、解码及相似度均无 1024 断言。增量摘要与 requeue 共用的 `_generate_digest_group` 额外检查真值、逐项 `math.isfinite` 并试打包。它仍接受非 1024 维、全零和布尔数值。普通 CRUD、日记和查询没有这层检查。 [常量](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:61) · [导入](/Users/remix/Desktop/AionsHome-main/aion-chat/memory.py:12) · [摘要检查](/Users/remix/Desktop/AionsHome-main/aion-chat/memory.py:1078) · [1024 夹具](/Users/remix/Desktop/AionsHome-main/aion-chat/tests/contract/test_siliconflow_service_settings.py:199)

### 异常输入的现行结果

| 输入 | 代码行为与后果 |
| --- | --- |
| 缺值、解析失败、HTTP 失败 | 生成返回 `None`。不同写入方可保存 NULL、保留旧 BLOB 或终止摘要批次，见第 2 节。 |
| `[]` 或空字符串 | 生成可以原样返回；普通写入将其视作缺失，Diary 不写向量，摘要报 `embedding_failure`，常规向量查询跳过。 |
| 非空字符串、对象、混有字符串或 null 的数组 | 若通过 `len` 可离开生成函数。常见形状会在 pack 或点积/范数报错。对象迭代键也可能使写入和查询失败。 |
| 整数、布尔、过大或极小的数 | `struct` 可将布尔写成 0/1。有限数也可能在 float32 转换时溢出，极小量可能舍入为零。摘要试打包能拦截抛出的溢出。 |
| NaN、Infinity、非空零向量 | pack 可以存储 NaN/Infinity。摘要排除非有限值，其他写入无统一检查。全零向量通过真值检查。余弦可产出 NaN 或因零范数直接给 0。 |
| 非空、可打包的短或超长向量 | 生成与全部写入路径都可接受。读回按 BLOB 自身长度解码，与查询维度不一致仍会算分。 |

离线复现使用原函数验证了 1 维、1025 维、布尔、空数组、NaN、非空字符串及对象均从生成函数返回，模拟超时与空 `data` 返回 `None`。本机 `1e100` 打包抛 `OverflowError`，`1e-50` 打包后为 0，`b"abc"` 解包抛 `struct.error`。这些结果来自合成输入。 [生成、编解码和余弦](/Users/remix/Desktop/AionsHome-main/aion-chat/memory.py:110)

## 2. 存储、生产者与事务

当前分支在 SQLite 持久化 Embedding 的位置有两处。Core、Flash、背景和低频是 `memories` 的选择策略。Diary 的聊天消息、日记与 Memory 的关联、摘要来源清单、requeue 任务、速记、Game sticky 和文本导出未发现独立向量写入。Game 使用 Memory 召回结果维持会话上下文。静态文档里的 FAISS 描述没有对应当前实现。 [Memory DDL](/Users/remix/Desktop/AionsHome-main/aion-chat/database.py:107) · [Diary DDL](/Users/remix/Desktop/AionsHome-main/aion-chat/database.py:351) · [Game 召回](/Users/remix/Desktop/AionsHome-main/aion-chat/game/memory_context.py:32) · [导出](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/files.py:80)

| 存储 | 现行契约 |
| --- | --- |
| `memories.embedding` | 可空 BLOB。初始建表即有该字段，后续迁移附加关键词、重要度、来源、激活与回忆时间等业务字段。普通、Core、Flash、digest 使用同一列。 |
| `diary_entries.embedding` | 可空 BLOB。建表带该字段，兼容迁移尝试 `ALTER TABLE … ADD COLUMN embedding BLOB`，不补算旧行。当前读接口剔除 BLOB。日记 `model` 是日记生成模型选择，与 Embedding 无关。 |

两个写入点使用 `struct.pack(f'{len(vec)}f', *vec)`，Diary 在路由内重复实现。格式为原生字节序的 4 字节 float32，无头部、空间 ID、维度字段、输入摘要、生成时间、校验和或格式版本。1024 元素对应 4096 字节，3072 元素对应 12288 字节。长度只能证明可能的元素数，不能证明模型、字节序或正文一致性。SQLite 列声明没有类型/长度 CHECK。解包用 `len(blob)//4` 推断元素数，再要求整块能按该格式解包。0 字节可解出空列表，非 4 倍数会抛错，4 的倍数只提供结构上的可解码性。 [Memory codec](/Users/remix/Desktop/AionsHome-main/aion-chat/memory.py:110) · [Diary codec](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/diary.py:576) · [日记模型选择](/Users/remix/Desktop/AionsHome-main/aion-chat/diary_model_selection.py:7) · [Diary DTO](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/diary.py:455)

| 生产者 / 操作 | 输入、提交边界与失败语义 |
| --- | --- |
| `add_memory` | `content` 先请求向量，单次 INSERT 提交正文和 BLOB/NULL，随后广播。调用点包括 Chat `perform_memory_write`、Diary `perform_memory_write_diary`、Activity `perform_memory_write_activity` 和 Schedule `execute_schedule_commands`。POST 成功但通知失败或客户端丢回执时，重复创建没有业务幂等键，毫秒 ID 也可能碰撞。 [Memory 写入](/Users/remix/Desktop/AionsHome-main/aion-chat/memory.py:154) · [Chat](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:5016) · [Diary](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/diary.py:55) · [Activity](/Users/remix/Desktop/AionsHome-main/aion-chat/activity.py:69) · [Schedule](/Users/remix/Desktop/AionsHome-main/aion-chat/schedule.py:2044) |
| 手工创建 / 编辑 Memory | 向量输入是提交的 `content`。创建提交后广播；编辑单条 UPDATE 同时改正文与向量。生成返回 `None`/空值时存 NULL，旧向量被清除；真值坏数据如果 pack 抛错，整条 SQL 未执行。编辑无 revision/CAS，较早发起但较晚完成的请求可覆盖更新后的整对正文和向量。目标已删除时 UPDATE 可影响零行但仍返回成功。 [创建](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/memories.py:169) · [编辑](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/memories.py:187) |
| 单条 Memory 重新总结 | 先查旧正文/来源，调用摘要模型，再对新摘要生成向量。摘要失败或过短保留原记录；Embedding 返回空时提交新摘要并清为 NULL。正文、向量、关键词、重要度、unresolved 和来源清单在同一事务更新。等待远端时未锁定原行或来源版本，可能覆盖并发编辑。更新影响零行时不写来源，但仍可返回成功。 [重新总结](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/memories.py:318) · [提交](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/memories.py:386) |
| 手动 / 自动增量摘要 | 两者共用 `_generate_digest_group`，向量输入是摘要。生成/打包失败终止当前组，当前组不写入、不推锚点，之前已成功组保留。Memory、精确来源和 SQLite checkpoint 同一事务；JSON 锚点在其后推进。锚点写失败且实际未推进时尝试补偿本批，残留 checkpoint 可由下次执行恢复。进程内锁、跨进程 guard 与 checkpoint 防止已提交组被普通重试重建。通知在提交后。自动摘要并不消费历史 requeue。 [执行锁](/Users/remix/Desktop/AionsHome-main/aion-chat/memory.py:887) · [提交与恢复](/Users/remix/Desktop/AionsHome-main/aion-chat/memory.py:951) · [增量批次](/Users/remix/Desktop/AionsHome-main/aion-chat/memory.py:1217) · [手动队列](/Users/remix/Desktop/AionsHome-main/aion-chat/memory.py:1017) |
| 删除与历史 requeue | 普通删除清日记关联、来源和 Memory 行。delete-and-requeue 用 `BEGIN IMMEDIATE` 同时保存任务并删除原行及旧向量，重复请求按原 Memory ID 返回任务。消费时在远端生成前后核对来源 manifest；短事务重查已有同源记录、写新摘要与向量及来源、完成任务。失败保留 pending 和错误，可重试，原行在入队时已经删除。复用条件是业务来源，不校验已有向量是否可检索。此队列会改变摘要，不能代替向量回填。 [删除与入队](/Users/remix/Desktop/AionsHome-main/aion-chat/memory_requeue.py:156) · [消费](/Users/remix/Desktop/AionsHome-main/aion-chat/memory.py:1088) |
| Diary 完成 / 编辑 / 重开 | 新条目无向量。仅请求同时含 `status="done"` 和非 null 的 `content` 时尝试生成，输入是本次请求的 `title or ""`、空格、`content or ""`，未读取已存标题补齐。若返回真值才将向量加到同一条 UPDATE。只改正文、只改标题、仅切到 done、生成返回 `None`/空值都可提交正文/状态而保留旧 BLOB。即使成功，省略标题也可能得到与最终行标题不匹配的向量。没有 revision/CAS，旧请求的向量也可能跟并发更新后的标题错配。 [创建](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/diary.py:477) · [更新](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/diary.py:553) |
| Diary 消息 / 删除 / 自动投喂替换 | 消息发送、编辑、再生成和投喂更新消息或元数据，不把消息历史当成条目正文重算。删条目同事务移除内嵌 BLOB。显式替换未完成草稿时先删旧条目提交及广播，再建新条目提交，完成条目受保护，后续失败不恢复旧草稿。现有 DDL 声明 Diary 子表级联，但普通 `get_db()` 直接创建连接，不显式开启连接级 `foreign_keys`，不能将声明当作所有运行连接的级联保证。 [消息写入](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/diary.py:627) · [删除条目](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/diary.py:599) · [自动投喂](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/diary.py:1721) · [子表 FK](/Users/remix/Desktop/AionsHome-main/aion-chat/database.py:387) · [连接](/Users/remix/Desktop/AionsHome-main/aion-chat/database.py:485) |

**已复现 Diary 的旧向量保留条件。** Fake DB 捕获到 content-only 写 `content,updated_at`，title-only + done 写 `title,status,updated_at`，done + content + 生成失败写 `content,status,updated_at`，仅 done 写 `status,updated_at`。只有 done + content + 合成成功时 SQL 包含 `embedding`。已存在 BLOB 的行因此可在正文变化后继续参加 `status='done'` 召回。即使不改正文，先前写作状态下的旧 BLOB 也可能因仅切回 done 而重新进入候选。Memory 的纯 unresolved 和回忆时间/激活更新只改元数据，未改变向量输入。 [Diary 更新](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/diary.py:553) · [Diary 候选](/Users/remix/Desktop/AionsHome-main/aion-chat/memory.py:680) · [Memory 元数据更新](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/memories.py:219) · [激活](/Users/remix/Desktop/AionsHome-main/aion-chat/memory.py:1486)

## 3. 召回消费者、过滤与错误表现

所有向量比较走同一个余弦函数。写入前和读取后均无 L2 归一化；打分时现场计算范数。点积只计算较短长度，两个范数分别覆盖各自全量元素。合成输入 `[1]` 对 `[1,1]` 得约 0.707，`[1]` 对 `[1,0]` 得 1.0。长度错误可以给出看似可信的高分。若一边范数为零，返回 0；非有限值通常传播到相似度。坏 BLOB 的 `struct.error` 在这些循环内没有按行捕获，可能中止整批及上层 `asyncio.gather`。SQL 候选只有业务过滤，没有空间或字节长度过滤。 [余弦](/Users/remix/Desktop/AionsHome-main/aion-chat/memory.py:119) · [Chat gather](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:1744) · [Diary gather](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/diary.py:815)

| 比较入口 | 当前候选、打分及退化 |
| --- | --- |
| `recall_memories` | 有查询向量才进入。SQL `embedding IS NOT NULL`，按上下文可排除 Game 来源；Python 跳过 importance ≥ 0.8。普通分数为余弦 0.5、关键词 0.25、衰减 0.25，默认 ≥0.38、top 5，另返回未做阈值过滤的 debug top 6，部分上层再筛选。代码把显式 importance=0 用 `or 0.5` 替换后才判断 0，注释的 0 排除在这里并不可靠。 [常规召回](/Users/remix/Desktop/AionsHome-main/aion-chat/memory.py:220) |
| `recall_core_memories` | 有查询向量且 BLOB 非 NULL、importance ≥0.8，按上下文过滤来源；余弦 0.5、关键词 0.3、重要度 0.2，默认 ≥0.30、top 3。另有纯 SQL `get_top_core_memories`，按重要度和日期，无向量比较。 [Core](/Users/remix/Desktop/AionsHome-main/aion-chat/memory.py:278) · [无向量 Core](/Users/remix/Desktop/AionsHome-main/aion-chat/memory.py:323) |
| `recall_flash_memories` | BLOB 非 NULL、0<importance<0.5、事件时间为 0 或晚于代码的 2026-04-17 截点，排除已浮现项和上下文排除项。实际跳过条件 `vec_sim < 0.60`，取最高一条，注释的 0.72 已与代码不符。NaN 的小于比较为假，会进入候选。 [Flash](/Users/remix/Desktop/AionsHome-main/aion-chat/memory.py:337) |
| `build_surfacing_memories` | 先取最多 2 条 unresolved，再以 topic 余弦 ≥0.50 取最多 3 条，最后补最近三天。只有话题阶段需要向量，SQL 该阶段要求 BLOB 非 NULL、importance>0。unresolved、近期和来源过滤应保留。 [背景浮现](/Users/remix/Desktop/AionsHome-main/aion-chat/memory.py:511) |
| `pick_low_freq_memory` | 24 小时未召回、日期截点、正重要度或 NULL、BLOB 非 NULL。先按最久未召回取默认 20 条，再在池内按 topic 余弦排序，最高 >0.3 或 force 时可选中；force 跳过最低分。无 query/topic 向量时即随机选候选，不解码，连坏 BLOB 也可入池。 [低频](/Users/remix/Desktop/AionsHome-main/aion-chat/memory.py:1441) |
| `build_diary_memories` | 只读 `status='done'`，日期倒序。第一篇始终取最新。第二篇排除第一篇后取最高，分数为余弦 0.3、关键词 0.4、重要度 0.3，没有最低分。topic + 关键词形成查询。查询缺失、BLOB 为 NULL 或空字节时跳过向量项，仍按其他项排序。非空坏 BLOB 仍可中止整个函数。 [Diary 召回](/Users/remix/Desktop/AionsHome-main/aion-chat/memory.py:671) |

Memory 与 Diary 共用缺乏严格检查的余弦和解码函数，**缺失向量策略不同**。Memory 的 BLOB 非 NULL 查询会让空 BLOB 变成 0 分并进入综合候选；Diary 以真值跳过空 BLOB，但仍有纯文本分。Flash 的 NaN guard 已用离线代码验证。常规/Core 的正向阈值通常排除 NaN，但 NaN 已进入排序或 debug 候选，可干扰前 N 截断。Diary 无阈值以及低频 force 路径可能选中无效排序项。严格隔离需在候选排序之前发生，尤其在低频 `LIMIT 20` 之前。 [常规排序](/Users/remix/Desktop/AionsHome-main/aion-chat/memory.py:270) · [Flash guard](/Users/remix/Desktop/AionsHome-main/aion-chat/memory.py:365) · [Diary 排序](/Users/remix/Desktop/AionsHome-main/aion-chat/memory.py:704) · [低频池](/Users/remix/Desktop/AionsHome-main/aion-chat/memory.py:1448)

**上层调用清单。** Chat 发送、canonical regenerate 上下文和另一条 regenerate 路径调用 Core、常规、背景、Flash、Diary，并分别直接生成 topic 向量传给低频选择器。Diary 消息发送与再生成各调用 Core、常规、背景、Flash，并直接生成低频 topic 向量。Append-reply 上下文调用无向量 Core、常规和 Diary；Activity 问候、Camera 唤醒、Location 唤醒和 Schedule 触发调用常规召回；Game 只读召回调用 Core、常规、背景，可过滤 Game 来源。日历、日记按日期投喂、Memory 原文追溯与文本导出按业务字段读数据，不计算相似度。除这些入口和第 2 节写入方，当前跟踪源码未发现另一条 Embedding 生成链。 [Chat send](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:1728) · [canonical regenerate](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:3078) · [regenerate](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:5348) · [Diary send](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/diary.py:805) · [Diary regenerate](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/diary.py:1310) · [Append](/Users/remix/Desktop/AionsHome-main/aion-chat/ai_providers.py:2975) · [Activity](/Users/remix/Desktop/AionsHome-main/aion-chat/activity.py:1205) · [Camera](/Users/remix/Desktop/AionsHome-main/aion-chat/camera.py:731) · [Location](/Users/remix/Desktop/AionsHome-main/aion-chat/location.py:1177) · [Schedule](/Users/remix/Desktop/AionsHome-main/aion-chat/schedule.py:510) · [Game](/Users/remix/Desktop/AionsHome-main/aion-chat/game/memory_context.py:32)

## 4. 配置变更与历史可追溯性

### 当前配置和前端

- 普通 GET 仅投影 `embedding_custom_url`、`embedding_model` 和 `credentials.embedding_key`。URL 状态比较去掉末尾斜杠后的默认字符串。Key 的引用签名与当前字段值绑定，用于 reveal/clear，不能证明端点或模型身份。PUT 可以部分提交 URL 或 Key；`embedding_model` 只兼容省略、null 和原值回传，改变返回 422。更新 Settings 文件后发布进程内配置。未检查 Memory/Diary 的行或 BLOB，也未写空间、版本或重建状态。 [投影](/Users/remix/Desktop/AionsHome-main/aion-chat/settings_secret_projection.py:299) · [PUT](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py:209) · [提交与发布](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py:159)
- Penumbra PR5-E 仅发送 `embedding_url` 或 `embedding_key`，清除/查看走普通 secrets 接口，GET 使用 Session/no-store。模型只展示。回读比较地址布尔状态或安全掩码，不能证明连接通过或历史相容。前端会将全空白模型字符串显示为默认，后端 getter 对这种历史值仍按非空原值传给 Provider。旧静态 Settings 仍展示共享 URL 与可编辑模型字段，提交旧 `siliconflow_url` 并回传 `embedding_model`；C1 后前者指向旧 Chat/Registry 兼容配置，模型修改由后端拒绝。应在后续兼容测试覆盖这些旧入口，不能只依赖 Penumbra 的限制。 [PR5-E 客户端](/Users/remix/Desktop/Penumbra/src/domain/embedding-settings/embedding-settings-client.ts:18) · [共享 Settings 客户端](/Users/remix/Desktop/Penumbra/src/domain/service-settings/settings-client.ts:25) · [旧静态 Settings](/Users/remix/Desktop/AionsHome-main/aion-chat/static/settings.html:1074) · [后端模型 getter](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:343)
- **推断。** 地址修改、恢复默认、Key 轮换后都可能改变实际路由。Key 本身不是空间身份，轮换到同一已验证路由时可保持空间；跨租户路由可能变更，即使 URL 与模型名不变。远端别名重指、服务端预处理/权重更换、代理路由变化，在当前响应处理里均不可识别。旧查询在途可用旧配置完成，后续查询使用新配置；同一次 Chat/Diary 的多个召回调用也未固定共同的配置快照。当前所有这些向量都可能与相同候选比较。 [生成](/Users/remix/Desktop/AionsHome-main/aion-chat/memory.py:128) · [并发召回](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:1728) · [设置发布](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py:159)

### Git 历史能证明的范围

| 证据 | 可证明的事实 | 证明边界 |
| --- | --- | --- |
| 当前分支祖先 `3ed6e13:aion-chat/memory.py:15`、`a55626d:aion-chat/memory.py:36` | 早期直接使用 Gemini `gemini-embedding-001`，声明 3072 维，后来切为 SiliconFlow OpenAI 兼容请求。两代代码都按返回长度打包。 | 只能证明代码路径存在。无法证明某部署运行过哪些提交，或有 3072 维向量存留。 |
| `31134da:aion-chat/config.py`、`83ca828:aion-chat/memory.py`、`f299734^` 的 Settings 路由 | 默认名曾从 `Pro/BAAI/bge-large-zh-v1.5` 改成无前缀版本。历史版本还引入了输入替换和 400 字符截断，模型曾可由 Settings 修改，后来关闭。 | 名称变化和预处理变化均需纳入空间判断，不能由名字推导权重是否相同。 |
| `9efe6cb:aion-chat/routes/diary.py:145`、`bfd7ca6:aion-chat/database.py` | 日记逐步加入向量写入和兼容列迁移，曾按请求和旧行比较以决定重算。 | NULL 可能来自旧 schema、未完成、缺配置或失败，当前 BLOB 不含原因和版本。 |
| `84c6f3a` 的迁移实现和测试 | C1 前，Embedding 使用 `siliconflow_url/key` 的有效投影。v1 直接读根字段，v2 由导入 Connection 生成投影。C1 按字段存在性补齐独立 URL/Key，保留显式空串和原模型，不采用 Connection 的默认聊天模型。版本 1 后不重导，normal 启动生效，`main_migration_only` 跳过。 | 这是某次配置迁移，不能将当时配置贴到早期向量。迁移没有扫描、写标记或重算向量。 [配置迁移](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:150) · [Registry 投影](/Users/remix/Desktop/AionsHome-main/aion-chat/connection_registry.py:291) · [C1 测试](/Users/remix/Desktop/AionsHome-main/aion-chat/tests/contract/test_siliconflow_service_settings.py:40) |
| 其他可见分支 `736d862:aion-chat/memory.py:798` | 可见一套不同的 Gemini/OpenAI 选择与逐条覆盖 Memory、`chatroom_memories` 的历史重建实现。该提交不是 `dbb55e2` 的祖先。当前分支无该表或重建入口。 | 不能归入当前生产链。若日后发现从该分支导入过数据，需要独立审计来源。 |

**已确认**的持久化信息只有业务字段和字节。来源时间戳、摘要来源 manifest、日记 model 字段和 C1 配置版本均没有记录生成时的端点、权重、模型快照、租户、输入预处理或正文 revision。**未知**包括实际历史数量、NULL/坏 BLOB 分布、历史主机字节序、真实模型/路由变更时间、同维混合比例及是否有可靠的外部审计备份。即使未来查出 4096 字节或拿到当前配置，也不能倒推一条向量归属。仅独立可核验的逐条 provenance 才能授权历史归类。 [Memory schema](/Users/remix/Desktop/AionsHome-main/aion-chat/database.py:107) · [Diary schema](/Users/remix/Desktop/AionsHome-main/aion-chat/database.py:351) · [来源 manifest](/Users/remix/Desktop/AionsHome-main/aion-chat/memory_requeue.py:55)

## 5. 风险优先级

| 等级 | 问题 | 用户可见后果 |
| --- | --- | --- |
| P0，阻断端点变更开放 | 缺少空间身份和切换门禁。旧 BLOB 与新配置、同名不同权重、不同维度均可混用。 | 可静默召回无关记忆或漏掉相关记忆，结果进一步进入对话 Prompt。回滚 URL 也无法区分已经混入的新向量。 |
| P0，正文一致性 | Diary 部分编辑和生成失败保留旧向量。成功请求也可能漏用已存标题。 | 旧内容的语义会召回新正文，且当前元数据无法检测。 |
| P1，召回正确性与可用性 | 不严格验证类型、维度、数值、范数和 BLOB，单行坏数据无隔离。 | 错误排名或候选截断，也可能抛出异常而使同批有效候选和上层流程失败。 |
| P1，写入并发与重试 | 通用编辑无 CAS、创建无稳定幂等键，远端等待跨配置切换；摘要 checkpoint 只保护业务摘要进度。 | 迟到请求覆盖新版本、重复创建或持久化未知空间的结果。 |
| P1，迁移和回滚能力 | 现无空间、逐条回填进度或 active 指针。 | 无法量化完成度、恢复中断、隔离新旧或在原内容持续编辑时可靠回滚。 |
| P2，契约与观测 | 旧 Settings UI、README、阈值注释与运行行为有差异，生成日志缺少安全的错误分类。 | 误判当前配置或验收结果。 |

风险等级描述当前代码允许的行为，不代表已在生产观察到事故。源证据见第 1 至 4 节，现有测试与合成复现的范围见第 8 节。

## 6. 目标契约与空间身份

### 哪些向量可比较

必须同时满足空间身份经过验证、查询和文档角色属于该空间认可的配对、维度及数值合法、存储格式能正确解码，并且文档向量对应当前条目的输入版本。相同 URL、名称、向量长度甚至几个探针相似，都只提供部分证据。可确认同一权重版本、投影、服务端处理和请求参数的等价镜像，可以登记为同一空间下的不同绑定。任何未能确认的路由或行为变化默认进入新空间。若模型有独立 query/document 指令，记录配对规则并分别验证，而非要求两个角色使用相同输入模板。

| 对象 | 建议字段与约束 |
| --- | --- |
| `embedding_spaces` | 服务端生成的不可变 `space_id`。登记 Provider / 可验证的部署身份、请求模型名与解析后的不可变模型版本或制品标识、维度、输出投影、query/document 输入规范版本、归一化和距离度量。记录证据种类、审批、生命周期及失败状态。行为变更创建新空间。URL + model 字符串哈希可用于配置去重，不能作为身份。 |
| 空间与连接绑定 | 独立保存不可变绑定 revision、端点和凭据的受保护引用、租户/路由身份及验证证据。切换或轮换产生新的绑定 revision。端点路径可能含敏感信息，观测和读接口只用非敏感标识及脱敏结果。不要将 Key、掩码或 `secret_ref` 当作空间身份。 |
| 向量记录 | 每条记录显式记录 `space_id`，可追溯生成时的绑定 revision、编码、维度、条目类型/ID、正文 revision、精确有效输入的版本化摘要、生成时间和字节。状态至少能区分 ready、pending、失败、被新 revision 取代和未知 Legacy。记录来源证据与编码版本，避免凭 BLOB 外观推断。 |
| 查询上下文 | 请求入口解析一个不可变的 active space + 绑定 revision + generation 快照，传入同一请求的各召回分支，返回带 `space_id` 的查询向量。只查询对应空间且源 revision 匹配的行。切换时通过 generation 拒绝跨代提交；对已在途读取定义固定旧快照读完或丢弃向量结果的规则。 |
| 远端变化 | 优先使用固定部署与不可变版本，核对 Provider 支持且可信的返回版本或部署证据。可用合成探针监测维度、坐标漂移和相对排序，记录基线、容差及时间。探针相符无法证明对所有文本等价，响应里重复别名也不能证明版本。缺少可信版本且无法固定路由时，不自动承认为已有空间。若业务允许使用未证实的新 Provider，只能由人工批准到独立候选空间并接受漂移风险，监测到变化时暂停该绑定的向量读写。 |

### 验证边界与写入语义

1. **HTTP 入口。** 验证状态、受限响应大小、单输入响应结构及索引、模型/部署证据和数组长度。按已登记空间维度检查，默认 BGE 空间为 1024。拒绝 bool、字符串、null、NaN、Infinity、空或零范数。检查转换为目标 float32 后仍为有限且非零范数。仅在 Provider 合同明确支持时按空间配置发送 `dimensions`，始终验回包。超时、限流、暂时性网络故障有限重试，永久配置错误与无效响应分类，日志不写正文、向量、敏感 URL 或凭据。
2. **存储入口。** Memory 与 Diary 共用验证和编码，建议 `f32le-v1` 明确小端，1024 维时 4096 字节。建议在两个实体专用向量旁表使用相同契约和 repository，以便用真实 FK 关联业务行和空间。唯一键覆盖 `(entity_id, space_id, source_revision)`，回填和在线写入以此幂等。SQLite CHECK 检查 `typeof(blob)` 和 `length(blob)=dims*4`，空间维度与编码用组合外键或等效约束绑定。SQLite 不替代逐元素验证。逐连接确保 FK 生效，或显式同事务删除旁表数据，并在读取端复查业务行存在。
3. **正文边界。** 业务事务合并 Diary 部分更新后的最终标题与正文，再生成有效输入摘要。Memory 输入使用当前已保存正文或摘要。正文变化应增加独立 revision，现有 Diary `updated_at` 还会因消息和元数据变更，不能直接充当 revision。推荐普通 CRUD 允许正文提交，同时原子标记旧 revision 不可召回并写持久化待算项。只改与向量无关字段时保留匹配向量；转 done 需补算缺失向量，重开或删除立即失去候选资格。摘要/requeue 第一阶段保持现有「向量失败不提交该批、不推锚点」契约。业务创建的网络重试另有 mutation ID/回执需求，不能用向量幂等键代替。
4. **异步回填。** 读取正文 revision、有效输入摘要和绑定快照，在数据库事务外请求。提交前用短事务重查条目存在、revision/摘要、状态、空间和任务 lease/generation；不匹配就丢弃迟到结果并追赶新 revision。只在同一事务内写向量与更新任务项状态，避免 DB 提交成功、进度却落后时重复覆盖。读回只显示已验证提交的数据。
5. **解码和比较。** SQL 先按 active space、当前 source revision 和业务范围过滤，再做有界解码。单行坏数据按原因计数并跳过该向量，保留可用候选，禁止截断/填充补齐维度。比较前二次确认空间、角色、长度、有限非零范数，得到有限得分后才排序。Diary 保留最新篇以及关键词/重要度退化，背景保留 unresolved/近期。Memory 如需扩大纯文本退化，单独验收产品排序；Flash 和低频向量模式对未知空间不打分。保留已约定的无向量注入和来源过滤，不能将未知分数冒充有效余弦。

### 地址和凭据的变更门禁

有历史数据或 active 空间时，后台应拒绝把有效端点变更直接应用到活跃绑定，包括恢复默认；可返回稳定的 409 错误码，如 `embedding_space_change_required`，随后通过独立的候选、验证、重建和激活流程操作。规范化后确实无变化的保存可以保留。早期仍使用 Settings JSON 时，建议默认冻结有效地址变更，把确需空库首次配置的操作放到受控初始化窗口，避免先查询行数再写 JSON 的竞态。待 SQLite 成为空间与活跃绑定的权威后，再通过同一事务协调数据和切换。不能把 JSON 更新和 DB 指针更新视作原子操作。

Key 轮换到同一已证实租户/路由可保留空间，但应验证路由并保留可审计的绑定 revision。跨租户或无法确认的轮换进入候选流程。清除/停用凭据应停用对应的在线向量生成和查询，保留历史向量及正文。后端门禁覆盖普通 Settings、旧静态客户端和所有管理路径；Penumbra 只负责解释状态，不能承担门禁。

## 7. 历史方案与重建运行手册

| 方案 | 可行性与取舍 |
| --- | --- |
| 保留旧 BLOB，标记已兼容 | 仅适用于有逐条可靠的模型版本、有效输入和路由证据的数据。当前代码和 schema 无此证据，禁止批量将历史行标成当前空间。 |
| 放入 Legacy 隔离区 | 推荐作为第一步。保留原字节并统一标记 `legacy_unknown`，它是归档类别，可能包含多个真实空间，不参与可验证的向量召回。原文、日期查询和纯文本路径继续使用。 |
| 按当前业务正文就地覆盖 | 可以得到新向量，但批次中途会混合，覆盖也丢失回退资料。逐行覆盖在无版本旁表、无原子切换的现状下不适用。 |
| 旁表构建候选空间，再原子切换 | 推荐。使用当前 Memory 正文（含已保存摘要）和完成 Diary 的标题 + 正文重建派生索引，避免重新总结或更动业务实体。进行中的在线查询保持在既有已验证空间；首次迁移只有未知 Legacy 时，使用明确的文本/元数据退化。 |
| 按历史来源重新总结后生成 | 这是业务重写，可能改正文、来源锚点、激活和 Prompt。仅在确需恢复缺失正文且有明确来源时，另立业务流程，避免将其当作索引重建。 |

建议重建使用独立的 `embedding_rebuild_jobs` 与逐条项。任务记录目标空间、不可变绑定 revision、基线扫描水位、状态、计数和审计信息。任务项记录条目、revision、状态、attempt、下次重试时间、lease 与 fencing token、有限错误类别。用可重入 worker 消费，过期 lease 可接管，旧 worker 即使拿到响应也不能提交。扫描用稳定键分页并持续消费正文变更 outbox；新增、修改、删除和 Diary done 状态变化均纳入追赶。网络、批量和写锁设上限。单项失败持久化并隔离，暂停或取消保留检查点和候选数据，后续从未完成项恢复。

**切换门槛。** 在隔离环境验证合成基准、合法向量覆盖率、失效/失败分布、两类实体、既有业务过滤和延迟；阈值与允许例外由人工批准。切换前做增量追赶并复核对应当前 revision 的条目，删除或重开后不得残留可召回项。最终在一个 SQLite 事务用 CAS 切换 Memory 和 Diary 共用 active 指针与 generation，记录旧指针和绑定。冻结短窗口或使用同事务水位 barrier，避免切换同时遗漏最后一批正文。候选与旧空间可并存，但线上请求一次只使用一个已验证空间，禁止跨空间直接比较或合并原始余弦排序。

**回滚门槛。** 保留旧空间、绑定及凭据的有效性，预先验证退回时能生成旧查询向量。回滚期可选双空间增量维护，但两边独立打标，仍只读 active；如果旧端点无法服务或旧空间缺新 revision，先明确选择补齐或降级，不能让旧 BLOB 匹配新正文。回滚用同一 CAS 机制恢复上一个已验证指针并增加 generation，撤销在途发布权。首次迁移只有来源未知的历史 BLOB 时，回滚目标是文本/元数据模式，不能只把旧 BLOB 或旧 URL 设回去。旧 BLOB 清理是回滚窗口结束后的独立审批；保持备份和对应配置的恢复演练。应用旧版本不认识空间门禁，因此运行态回滚优先用指针，代码回退需停流/冻结后按备份与兼容部署计划执行。

## 8. 测试覆盖与缺口

以下是对现有测试源码的盘点。当前审计不执行项目测试，现有测试的存在和断言与本次运行结果分开记录。

| 项目 | 已有证据 | 后续应补 |
| --- | --- | --- |
| 正常 1024 维 / 请求协议 | C1 用 Fake HTTP 返回 1024 项，断言独立 URL、Bearer、模型、输入、timeout 和无 Registry 读取，另覆盖缺 Key。没有经过存储、解码和查询。 [C1 Runtime](/Users/remix/Desktop/AionsHome-main/aion-chat/tests/contract/test_siliconflow_service_settings.py:188) | 1024 全链路及跨表编码金样；同时保留小维数测试用的显式测试空间。 |
| 短/长向量、非法数值、空或零向量、坏 BLOB | 现有召回和摘要夹具使用合法二维向量。Diary 有缺失向量夹具；未找到直接验证这些异常的 Embedding 合同测试。审计离线复现了短/长向量、布尔、NaN、空、pack 溢出与坏 BLOB。 [Memory 召回夹具](/Users/remix/Desktop/AionsHome-main/aion-chat/tests/contract/test_main_memory_recall_direct.py:100) · [Diary 召回](/Users/remix/Desktop/AionsHome-main/aion-chat/tests/contract/test_main_diary_recall_direct.py:105) | 0/1023/1025 维、空数组、全零、NaN、正负 Infinity、类型、量化前后溢出/下溢、错字节序及非 4 倍数 BLOB。放入同一批，断言坏行只影响该行，兼测阈值、低频 LIMIT 和 force。 |
| 空间混用和路由漂移 | C1 覆盖 Embedding 与 TTS/Registry 的配置隔离。当前没有空间身份，因此无同维跨空间负例。 [C1 隔离](/Users/remix/Desktop/AionsHome-main/aion-chat/tests/contract/test_siliconflow_service_settings.py:118) | 相同维度、不同空间不得评分；同 URL/同别名返回不同版本；跨租户 Key 轮换；绑定变化、并发切换及在途查询/写入。 |
| Embedding 请求失败与持久化失败 | 摘要测试用 stub 返回 `None`、模拟持久化失败，断言无输出且锚点不推进；requeue 覆盖 pending 重试和 SQL 失败回滚；日界线测试覆盖摘要失败时已保存速记仍在。Fake HTTP 的常规用例只覆盖成功与无 Key。 [摘要失败](/Users/remix/Desktop/AionsHome-main/aion-chat/tests/contract/test_memory_auto_digest_recovery.py:332) · [requeue](/Users/remix/Desktop/AionsHome-main/aion-chat/tests/contract/test_memory_requeue.py:106) · [日界线](/Users/remix/Desktop/AionsHome-main/aion-chat/tests/contract/test_5am_day_boundary_recovery.py:819) | Fake HTTP timeout、HTTP 状态、错 JSON、错响应结构和重试预算。覆盖每个写入者的事务故障、提交丢回执及取消，断言正文、向量状态和任务一致。 |
| 编辑与旧向量 | Memory 手工创建测试检查业务 DTO 和写入，未覆盖正文编辑的 Embedding 失败。单条重新总结的失败测试失败点是摘要 LLM，Embedding stub 始终成功。Diary PR1 测试覆盖投喂替换、完成条目保护和消息回执，未覆盖条目编辑后保留旧向量。 [创建](/Users/remix/Desktop/AionsHome-main/aion-chat/tests/contract/test_memory_create_contract.py:139) · [重新总结](/Users/remix/Desktop/AionsHome-main/aion-chat/tests/contract/test_phase5c_auxiliary_runtime.py:409) · [Diary PR1](/Users/remix/Desktop/AionsHome-main/aion-chat/tests/contract/test_diary_pr1_contract.py:92) | 逐项覆盖 title-only/content-only/status-only、标题合并、失败置 pending、并发部分编辑、删除后迟到、重开/完成和 metadata-only。保持摘要失败不推进锚点，回填不调用摘要模型。 |
| 历史兼容和恢复 | C1 测配置 v1/v2、显式空串、启动顺序、重试、目录同步失败及独立清除。Memory requeue 覆盖旧来源拒绝、无历史回填、多 worker、杀进程与摘要 checkpoint 恢复。它们未给历史向量归因，也未覆盖空间重建。 [C1 迁移](/Users/remix/Desktop/AionsHome-main/aion-chat/tests/contract/test_siliconflow_service_settings.py:40) · [C1 启动](/Users/remix/Desktop/AionsHome-main/aion-chat/tests/contract/test_siliconflow_service_settings.py:240) · [checkpoint](/Users/remix/Desktop/AionsHome-main/aion-chat/tests/contract/test_memory_requeue.py:253) · [worker 中断](/Users/remix/Desktop/AionsHome-main/aion-chat/tests/contract/test_memory_requeue.py:323) | 混合旧 BLOB、NULL、未知字节序与未标记数据的隔离迁移；扫描中断、lease 接管、内容版本追赶、部分失败、切换故障和回滚。验收已完成任务重启后不重写，旧配置无法服务时能进入文本退化。 |
| 前端边界 | PR5-E Fake API 断言独立字段、模型只读、地址/Key 读回、无 Registry 或真实 Provider 请求。 [客户端测试](/Users/remix/Desktop/Penumbra/src/domain/embedding-settings/embedding-settings-client.test.ts:20) · [浏览器拦截](/Users/remix/Desktop/Penumbra/tests/browser/settings-pr5-e-smoke.cjs:103) | 新后端门禁 409 对新旧客户端的兼容、无效配置无部分写入、后台重建状态只读投影。 |

人工确认项包括部署版本历史、历史 BLOB 统计、可核验的 Provider 版本与租户路由、回滚所需端点和凭据是否仍可用、将历史正文发送到候选端点的授权，以及业务可接受的文本退化时间。经授权后优先在脱敏副本做只读聚合，统计 `typeof`、`length`、NULL、业务状态和可解码性，输出计数而非正文、向量、URL 或凭据。统计不能证明同维向量的来源。本轮没有访问这些数据或探测远端。

## 9. PR 拆分、依赖与部署顺序

| 顺序 | 后端 PR | 交付与验收 |
| --- | --- | --- |
| PR0 · 契约与发布门禁 | 先固化现有业务排序、空值、源过滤、命令及事件边界的 fixtures。紧急门禁独立提交，默认拦截有效端点变更和无法确认路由的 Key 替换，保留受控初始化与撤销能力。 | 在继续开放 PR5-E 地址变更前先发布门禁。涵盖默认恢复、无变化、旧客户端、配置失败原子性和并发。尚未引入向量空间时冻结端点只减少新增混用，历史风险仍需隔离。 |
| PR1 · Codec、HTTP 与读路径 | 共用数值/编码检查、按行解码保护、严格同维余弦和安全错误分类。接入所有比较入口，保持业务打分权重和已存在的退化。 | 在已知默认空间按 1024 验证。未知历史只按结构分类，别用统一 1024 覆盖当前存量。过渡期若仍使用旧读模式，需要明确接受同维未知风险并限时。加坏行隔离与各入口 golden tests。 |
| PR2 · 正文与向量写入一致性 | 优先修 Diary 部分编辑和失败语义，Memory/Diary 统一有效输入。加入 revision/CAS 与持久化待算契约。保持摘要/requeue 的锚点语义。 | 正文改变必须原子失效旧向量。并发编辑、删后迟到、状态切换和事务故障用合成夹具验证。可在 PR1 之后先发布正文一致性修复。 |
| PR3 · 空间与绑定 | 增量建空间注册表、两类向量旁表、active 指针及请求快照。后端全路径施加空间过滤，保留原 BLOB 为未知归档。 | 依赖 PR1/PR2。先部署能读新 schema 的所有 worker，再启用新写入与读取；避免旧 worker 绕过门禁。无已验证空间时走明确的文本退化。兼容期禁止在热配置中改活跃地址。 |
| PR4 · 可恢复重建 | 增加持久化 job/项、lease、幂等提交、增量追赶、受控暂停和继续。只构建候选，不自动激活。 | 依赖 PR3。隔离环境完成宕机、多 worker、重试、取消、并发编辑/删除、权限和成本上限验收。保留旧字节和运行状态。 |
| PR5 · 切换、回滚与运维 | 交付后台验证、事务切换与回滚、覆盖率门槛、脱敏指标和运行手册。设置页仅投影可用状态，前端改动可另立 PR。 | 依赖 PR4。在隔离环境和维护窗口演练切换及回滚，经人工批准再激活候选。待回滚窗口结束，另行决定历史 BLOB 清理。 |

## 10. 架构决策记录

1. **能否混用？** 当前能。改造后仅对同一已验证空间内、角色兼容、对应当前输入版本的合法向量评分。
2. **历史是否属于当前配置？** 现有 schema 和迁移不能证明，默认归档为 `legacy_unknown`。
3. **1024 在哪里校验？** 对注册为 1024 维的空间，在 HTTP、编码与持久化、解码与比较四道边界校验。字节数约束和逐元素/范数检查同时存在。
4. **是否需要独立空间 ID？** 需要。以服务端注册的不可变身份和版本证据管理，允许已验证的等价绑定。
5. **是否逐条记录空间？** 需要。同时绑定正文 revision、有效输入与生成时的绑定 revision。
6. **是否限制改地址？** 有历史数据或活跃空间时限制直接生效。端点恢复默认也经门禁。Key 可经验证在同空间轮换。
7. **是否需要独立重建进度？** 需要。摘要锚点与 requeue 是业务处理状态，向量索引任务独立持久化。
8. **如何安全切换与回滚？** 候选旁建、增量追赶、单 active 指针事务切换、generation 隔离在途结果、保留已验证旧空间。没有已验证旧空间时回滚到文本退化。
9. **Memory 与 Diary 是否统一？** 统一空间、输入版本、数值、序列化、读写与重建契约；保留两类实体的业务筛选和退化规则。
