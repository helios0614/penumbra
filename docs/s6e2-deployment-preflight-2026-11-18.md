# S6E2 部署前只读检查（2026-11-18）

**结论：有条件可部署。** 已实测当前服务器满足单 owner 进程条件，目标源码已提交并推送，现有备份和静态安装器状态正常。尚不能直接切换：需补齐下面的恢复依据、发布操作条件，并在维护窗口按后端优先顺序完成阶段检查。没有发现必须重新设计 S6E2 或修改业务代码才能部署的问题。

本次通过已解锁的本机 SSH agent 连接 `aion-prod`，只读检查主机、进程、配置白名单、文件元数据、现有备份报告及安装器状态；最终服务复核为北京时间 **2026-11-18 17:23**。未部署、构建、上传、重启、迁移、创建备份、恢复数据或调用 send/regenerate/cancel；未读取聊天正文或输出凭据。唯一工作区写入是本报告。

依据：[部署入口](deploy-runbook.md)、[静态安装器](ubuntu-deployment.md)、[发布制品](deploy-artifacts.md)、[S6E2 审计 §13–17](chat-b2-cancellation-audit.md)、[后端公开契约 §14](/Users/remix/Desktop/AionsHome-main/docs/regenerate-contract.md)、[现有备份与恢复流程](/Users/remix/Desktop/AionsHome-main/docs/operations/restic-r2-backup.md)。已阅读两仓 AGENTS、工程原则及相关部署源码；本报告不替代原生命周期审计。

## 1. 源码和线上版本

| 项目 | 本地准备部署版本 | 实测线上版本 |
| --- | --- | --- |
| AionHome | `refactor-code-main` / `e3c6b17f4a2433a2b32f3bf8974eaf7622c11ee0` | 同分支 / `ee130a95b64af3a8aaff0604459075fc05e5cdd9` |
| Penumbra | `main` / `abc0e62277a0b097d8aee489f457bfba6b091c3f` | Source `c0956e152ea3e995bfef2715bd35d8fe028f8c18`；Artifact 见下表 |

- 开工时两仓工作区均干净；实时 `ls-remote` 确认 Gitee 后端分支、GitHub 前端 main 与上述目标 HEAD 一致，未依赖旧审计 HEAD。
- 后端目标包含 A `f6a15de8598a8e2bc2f7396259a4e0ce380aed18`、B `3f2023ef39dc8619567346863b82428a40cdfdf1` 和结果发现补充 `e3c6b17…`，已核对祖先关系。前端 `abc0e62…` 包含 C、`/executions/results` 接入及合同测试。
- 目标前端的 [Build validation / 44267484813](https://github.com/helios0614/penumbra/actions/runs/44267484813) 已完成且成功；Ubuntu validation、macOS/Windows release entrypoint、Ubuntu installer Job 全部成功。**目标 deploy 制品尚未发布**，远端 deploy 仍为旧 Artifact，不能把源码 SHA 当成 Artifact SHA。
- 线上后端 7 个抽查运行源码的哈希与 `ee130a9…` 一致，文件时间早于当前进程启动。没有运行时 build ID，故以磁盘身份、源码哈希和启动时间交叉取证。
- 后端从线上到目标无 requirements/config.py 变化；运行代码差异限于 `ai_providers.py`、`chat_execution_runtime.py`、`chat_execution_receipts.py`、`database.py`、`main.py`、`regenerate_contract.py`、`routes/chat.py`。前端目标相对线上还包含此前消息删除、音乐/记忆编辑和 B1 改动；批准完整制品时须一并知悉，不能视为只包含本次 Stop 按钮。

当前可用的前端回滚身份（来自安装器实测记录）：

| 字段 | 固定值 |
| --- | --- |
| Artifact SHA | `587a17f0acc11fd2808377d7dcbbd11ec6d35b24` |
| Source SHA | `c0956e152ea3e995bfef2715bd35d8fe028f8c18` |
| Workflow SHA | `c0956e152ea3e995bfef2715bd35d8fe028f8c18` |
| Build ID | `actions-43840518768-1` |
| 实测 index SHA-256 | `6d7091e1ce1f7c50ec11649b1c1a011d2d9de3101b2667a9b60a6d6d6a29accd` |

## 2. 实际运行架构与单 owner 结论

| 项目 | 只读实测 |
| --- | --- |
| 主机 / 后端仓库 | `VM-0-11-ubuntu` / `/home/ubuntu/AionHome` |
| 服务 / 用户 / 工作目录 | `aion-chat.service` / `ubuntu` / `/home/ubuntu/AionHome/aion-chat` |
| unit / drop-in / 环境文件 | `/etc/systemd/system/aion-chat.service`；`/etc/systemd/system/aion-chat.service.d/override.conf`；`/etc/aion-chat.env` |
| 实际进程命令 | `/home/ubuntu/AionHome/.venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8080` |
| 进程证据 | MainPID `3474811`；服务 cgroup 仅此 PID；全主机 `/proc` 未发现另一份 Uvicorn/Gunicorn/Main app；8080 监听归此 PID |
| worker / 启动环境 | 无 `--workers`、`--reload` 或 `WEB_CONCURRENCY`；未发现 Gunicorn worker 参数；`AION_STARTUP_MODE=normal` |
| 服务状态 | active/running，2026-11-17 10:59:58 CST 启动，`NRestarts=0`；`Restart=always`、`KillMode=control-group`、停止限时 90 秒 |
| 运行时 | venv 使用 Python 3.12.3 / SQLite 3.45.1；实际包含 Uvicorn 0.44.0、HTTPX 0.28.1、aiosqlite 0.22.1、psutil 7.2.2 |
| 容器 / 本机代理 | Docker 无运行容器；未发现 Nginx 服务；应用由 systemd 直接管理 |

**所检查主机和现有上游满足单 owner 进程要求**，结论来自进程、cgroup、监听与启动环境，不只是 main.py。没有核验 Cloudflare 账户侧是否另有 connector/origin；发布前须由运维确认没有其他同库 Main Chat 实例。新增多 worker、多实例或滚动重叠运行会使精确取消失去保证，属于阻塞条件。

`cloudflared.service` 使用 `/home/ubuntu/.cloudflared/config.yml`：`chat.remixyx.xyz → http://localhost:8080`，另一个 `st.remixyx.xyz → localhost:8000` 是独立服务，末项为 404。Penumbra、API、WS 默认同源，由上述同一 AionHome 提供；没有单独的新后端或数据库。未修改 Tunnel、`cloudflared.service` 或 `trojan.service`。

后端现有 `deploy.sh` 是首次安装流程，不是本次增量升级器；`start.sh` 也不是实际 systemd 启动入口。未找到专用的后端增量发布/回滚脚本，不能照搬前端安装器管理后端。

## 3. SQLite 升级与回滚兼容

- 正式库为 **`/home/ubuntu/AionHome/aion-chat/data/chat.db`**，由实际 config.py、工作目录和文件元数据交叉确认；大小 `4,864,671,744` 字节。仅以文件只读 fd 读取 SQLite 头：WAL 格式（读写版本 2/2），页大小 4096。检查时 `-wal/-shm` 均不存在。
- **正式库实际 sqlite_master/table/index 结构未核验。** 普通 SQLite `mode=ro` 打开 WAL 库仍可能创建/管理 sidecar；严格零写入边界下本轮没有打开 SQL 连接，也未用 `immutable=1` 忽略 WAL。旧源码没有新表不能证明正式库一定没有该表。
- 源码确认：`main.lifespan → await init_db() → initialize_executions()`，在提供请求服务前创建 `chat_executions` 与唯一部分索引 `chat_execution_active ON chat_executions(conv_id) WHERE outcome IS NULL`。复合主键 `(conv_id, execution_id)`，无消息外键；删除消息不会删除 execution 身份、原 user/target 锚点及停止结果。
- S6E2 对既有数据库初始化仅追加上述建表/索引调用，不改既有 messages、receipt 列或历史消息。`CREATE … IF NOT EXISTS` 可重复执行，但不验证/修复已存在的错误结构；多个进程启动不能作为可接受的初始化方式。
- 建表/索引异常会使 lifespan 启动失败，尚未 ready；此前初始化步骤可能已经提交，不能假设全启动过程原子回滚。`Restart=always` 可能反复失败，后续应停服务保留诊断，不循环尝试迁移。正常启动还会运行既有配置迁移和后台业务，`main_migration_only` 也有写入，均不能用于本轮只读预演。
- 回滚 `ee130a9…` 后，多出的表和索引可以保留，旧代码不引用它们；无需 DROP、恢复旧库或删除新消息。旧代码同时也不遵守新 execution 门禁/身份墓碑，故回滚须先停止接收新请求、排空执行，不能让旧版继续处理未确认的原请求。
- 新版启动恢复只将**确定失去 PID/进程启动身份 owner** 的非终态标为 `failed / service_restarted`，不伪装用户 cancelled，不重新生成。部署须先完全停止旧进程，避免两个版本 owner 重叠。

## 4. 每日备份与恢复证据

| 项目 | 实测 |
| --- | --- |
| 任务 | `aionhome-backup.timer` → `aionhome-backup.service`，root oneshot |
| 执行入口 | `/usr/bin/python3.12 /opt/aionhome-backup/aionhome_backup.py --config /etc/aionhome-backup/config.json run` |
| 配置 / 状态 / Restic | `/etc/aionhome-backup/config.json`；`/var/lib/aionhome-backup`；`/usr/bin/restic` |
| 定时 | 每日 03:15 + 最多 10 分钟随机延迟；`Persistent=no`；下次 11-19 03:16:08 CST |
| 最近成功 | 11-18 03:22:26 开始，**03:28:06 CST 完成**，339.7 秒；last-attempt 与 last-success 同为 success、无错误，service Result=success / ExecMainStatus=0 |
| 完整 snapshot ID | `ae766cef1eca21d8ab10b346779b2878767f5866b88a4055d53e981b4023e381` |
| 实际数据范围 | `/home/ubuntu/AionHome/aion-chat/data`，与正式库路径一致；含 Settings、认证及该目录内业务文件/附件 |
| data 外配置 | `extra_files` 明确包含 `/etc/aion-chat.env`、后端 unit、`override.conf`；只核对路径，未输出内容 |

安装脚本与当前仓库 `scripts/aionhome_backup.py` 哈希一致。其成功路径使用 SQLite Online Backup API 读取已提交 WAL，在**副本**切换 DELETE journal 并执行完整 integrity_check，然后加密上传；不靠直接复制运行中的主库和 WAL/SHM。线上 service 的有效权限为 `ProtectSystem=strict`、`ProtectHome=read-only`，data/state 可写、主 chat.db 单独只读；这与现有 WAL 备份方式一致，并非零写入检查沙箱。

**恢复可靠性有分层证据，尚未全部通过：**

- 今日成功报告及匹配源码证明按现有成功条件完成了备份流程；不是仅看到一个文件。现有文档记录 10 月 23 日快照曾隔离 restore/verify 成功。
- 未找到今日快照的隔离恢复验证证据，本轮未访问 R2 列表、解密读取或 restore/check，不能声明该 snapshot 已恢复验收。备份口令/仓库访问凭据的独立保管也未核验，不能只依赖服务器本身。
- Settings/附件等普通文件在在线采集窗口内读取，不是跨 SQLite/JSON/附件的冻结事务。03:28 后新增数据不属于该恢复点，恢复会有 RPO 损失；定时器不补跑停机漏备。
- 代码、venv、静态制品、Tunnel/Trojan 私有配置及备份凭据不由已列 extra_files 自动覆盖；需沿用各自版本/凭据保管方式，不能声称整机可一键恢复。根分区剩余约 16.6 GB，但仍须按实际选定恢复目标和校验副本另核对空间。

后续若需补恢复依据，应另行授权使用现有脚本恢复到**不存在的隔离目录**，完成自动 verify、必要业务抽样及私有凭据可用性确认，不能覆盖正式 data。普通代码发布失败优先回滚代码并保留当前库，不自动恢复每日备份。

## 5. 静态发布、缓存与版本组合

静态根为 `/home/ubuntu/AionHome/penumbra-web`，FastAPI 服务其中 `site/`。受信工具为 `/home/ubuntu/penumbra-tools/install.py`、`release_remote.py`，两者规范化 SHA-256 与当前仓库一致。本次真实只读 installer status 返回 **`consistent=true, ready=true, pending=[]`**，首页及活动资源全量哈希通过。只读远端 helper check 也通过代理前置条件；未启动临时代理，未验证实际 TLS/出口/下载链路。

沿用 `.github/workflows/deploy.yml` 和 `scripts/deploy/release.py`：Actions 在 Ubuntu/Node 22 测试构建，产物固定四项身份，再由服务器校验、安装，首页最后原子切换，保留旧 hashed 资源及 release。实际 helper 的 Trojan 路径是 `/usr/local/libexec/penumbra-release/trojan`，与旧文档示例不同，后续以受信工具为准，不改代理配置。

| 前端 / 后端 | 判断 |
| --- | --- |
| 线上旧 / 线上旧 | 当前运行基线。进程、静态制品一致性及匿名登录跳转已实测；本轮没有生成业务验收。 |
| 旧 / 新 | 原 send-results 四字段保留，新增 execution 被旧解析器忽略；regenerate 缺新头仍可由服务端分配尝试 UUID。但新同会话门禁返回 `409 chat_execution_active`，旧前端未识别该码，旧“返回编辑”后再发可能显示未知/冲突；当前 send user 编辑/删除也可能收到新约束。过渡窗口应短，要求刷新旧标签页。 |
| 新 / 新 | 目标组合。send 以 client_msg_id 定位，regenerate 以 `X-Chat-Execution-Id` 尝试 UUID 定位；只有持久 `terminal=true` 解锁。results 按 execution ID 去重、稳定游标遍历多个 cancelled 安全 partial，不恢复已删消息或覆盖编辑正文。 |
| 新 / 旧 | **不作为可用部署组合。** 进入会话时 active 404 导致 execution 发现未确认并阻止发送/再生成；results 404 不能补造停止结果，cancel 404 也不表示已停止。已经打开且先前解锁的新标签页仍可能在发现降级前发出用户 POST，因此不能靠前端失效保护替代维护窗口、排空和前端先回滚。 |

只读 GET 不自动 POST、cancel、重试生成；202、非终态 200、404、409、503 或网络错误都不能用于假解锁。Assistant 已提交、SSE 断开与 execution 终结仍是不同事件。旧版本切换期间不要盲目重发未知原请求，既有副作用不会因部署/回滚撤销。

前端默认同源 `/api`、`/ws` 且请求带既有 session Cookie；工作流没有另配 VITE_API 上游，新业务头不引入同源 CORS 问题。静态源码策略为 HTML no-store、hashed assets `private, max-age=31536000, immutable`、其他资源 `private, no-cache`；sw.js 无离线资源缓存。现有 CDN 匿名探测：`/api/session` 401，`/penumbra/` 和深链 HTML 正确 303 到 `/login?next=…`，CF 为 DYNAMIC。**已登录 HTML、chunk、Cookie、WS 和新 API 的真实缓存响应未核验**；源码策略不能替代浏览器验收，旧标签页也不会因首页切换自动升级。

## 6. 切换前必须落实的条件

1. 运维确认没有本次主机之外的同库 Main owner；维护窗口内排空现有生成/收尾，关闭入口或由用户停止操作。旧版无 execution API，不能用 SSE 断开或已见 Assistant 代替排空证明。
2. 明确选用哪份恢复点、可接受的备份年龄/RPO，补充可用恢复验证证据及独立凭据保管确认。今日 snapshot 的 restore 未核验；若无法提供足够依据，应先做另行授权的隔离验证再切换。
3. 准备能够运行既有前端发布入口的操作端：本机当前未找到 `gh`，其 GitHub 认证/dispatch 权限尚未核验。远端 helper check 通过不能代表完整 `release.py check` 已通过。目标静态 Artifact 要在正式发布阶段生成并记录四项身份。
4. 使用干净且与远端 main 一致的受信部署工作树。本报告新增后本地会有未提交文档；不要为此 reset/clean 或丢弃文件。若先提交文档推进 main，须重新固定 Source SHA、核对对应 CI；本轮不会提交。

其余为部署阶段门槛：实际建表成功、新 API 认证读取/no-store、缓存/浏览器条件只能在受控启动/切换后检验，本轮不将其写成已通过。若以后发现多 worker、多 origin、结构错误、恢复依据不足或版本身份不一致，停止对应阶段，不添加分布式调度或修改业务语义绕过。

## 7. 最小执行与回滚清单（后续授权后执行）

**下面是待审操作顺序，本轮均未执行。** 服务名、目录和固定版本均取自上述实测；没有现成后端发布器的步骤明确保留人工核验。

1. **保存基线与恢复依据。** 记录本报告中的旧/新源码 SHA、旧前端四身份、现有 unit/drop-in/env 的受保护副本和快照 ID；秘密只存既有私有渠道。保留 `/home/ubuntu/AionHome` 内所有 data、未跟踪运行文件、`penumbra-web` 及工具。确认恢复依据、维护窗口、单 owner、目标 CI 和远端版本未变。
2. **准备后端固定版本。** 在 `/home/ubuntu/AionHome` 核对分支、跟踪文件无改动、运行数据不冲突；获取并验证目标 `e3c6b17f4a2433a2b32f3bf8974eaf7622c11ee0`，此步只准备提交对象和差异。计划沿用现有 Git 仓库 fast-forward，工作树替换须等下一步旧服务退出；具体 Git 写命令留到部署授权时核对。不运行首次安装 `deploy.sh`，不替换 data/venv/env，不需新增依赖。
3. **先排空，再停旧后端，再替换代码。** 对 `aion-chat.service` 执行维护停机；拟用 `sudo systemctl stop aion-chat.service`，确认旧 PID/cgroup/8080 监听消失，之后才更新工作树并 `sudo systemctl start aion-chat.service`。不滚动重叠、不 restart Cloudflare/Trojan。停止限时是现有 90 秒，不能将强杀误报为正常取消完成。
4. **检查启动与结构。** 确认 active、日志启动完成、MainPID/监听及 cgroup 仍为单进程；在这次已授权结构初始化之后，以合适权限核对真实库 `sqlite_master`、`table_info(chat_executions)`、主键及 `chat_execution_active` 的唯一/部分索引定义。普通 SQL 读取可能管理 WAL/SHM，需包含在该阶段授权内；不再次调用 init_db，不改消息数据。若失败，停止 restart 循环并进入回滚。
5. **安全 API 健康检查。** 用户在本机正常登录后，只 GET `/api/session`；对已存在会话的 `/api/conversations/{conv}/executions` 前缀读取 `/active`、`/results?limit=1`、已知 `/{execution_id}`；检查 JSON 契约，execution 响应须 `Cache-Control: no-store`。无既有 execution 时，合法不存在 ID 的 404 只能验证错误契约；401 不能算结构/业务通过。确认无 Provider 调用、无新消息；本步骤不 POST cancel。
6. **再发布和安装前端。** 在干净 main 的受信操作端运行既有 `python scripts/deploy/release.py check`，通过后才按 runbook 进行 `deploy --dry-run` 和授权的 `deploy`。固定 Source `abc0e62…`（若 main 改变则重新审定），保存实际新 Artifact/Workflow/Build 身份、事务、before/after、proxyCleaned 和 servicesAfter。保留旧 release/resources；安装后 installer status 必须 ready/consistent、pending 空、活动资源校验通过。
7. **浏览器验收入口。** 后端 GET 和前端安装状态通过后，打开 `https://chat.remixyx.xyz/penumbra/`，正常登录、完整刷新旧标签页，核对 HTML/chunk 缓存、深链、同源 API/WS、实际新版本。随后另行授权真实 Chat 验收：preparing/生成/断流 Stop、终态前禁发、草稿/附件、IME/手机、消息编辑删除、跨会话，以及多次停止后完全刷新 partial。未做这些验收前，不宣称 S6E2 线上通过。

**回滚：**

1. 前端切换失败先读 `status`，保存 pending/事务，沿用既有 recover/rollback 规则；不能覆盖未知现场或自动重试安装。工具路径 `/home/ubuntu/penumbra-tools/install.py`、根 `/home/ubuntu/AionHome/penumbra-web`，rollback 必须传本报告固定的旧四身份。正常旧资源现已校验通过；执行时仍须重新校验。具体命令参数沿用 [安装器回滚合同](ubuntu-deployment.md#升级指定版本回滚与首次撤销)。
2. 若后端也要退至旧版，先维护排空；若新前端已发布，**先回滚前端并刷新标签页，再退后端**。停止 `aion-chat.service`，确认进程退出，恢复固定 `ee130a95b64af3a8aaff0604459075fc05e5cdd9` 的受信跟踪源码，再启动同一服务/venv/env。无专用后端回滚脚本，具体 Git 切换命令待部署授权时核验，不用 hard reset/clean；Cloudflare/Trojan 保持原配置。
3. 新表/索引留在原库；保留已提交消息、execution 事实及业务副作用。不 DROP、不回放未知请求、不以旧 DB 覆盖新 DB。检查旧版登录/历史/静态只读健康；已发生的执行中断如实记录。
4. 只有确定的数据故障才进入单独批准的数据恢复：使用 `/opt/aionhome-backup/aionhome_backup.py` 既有 restore/verify 流程到新的私有隔离目录，完成哈希、integrity_check 和业务抽样；再停止所有写入者、核对备份后新数据及账号权限，按原映射恢复。不能混入旧 WAL/SHM，也不能直接将 root 私有恢复目录当成已可用生产目录。本轮没有选择或创建恢复目标。

## 8. 仍需观察及本轮验证边界

- finalizing 仍可等待既有同步后处理，没有新 timeout；90 秒 systemd 停止上限不保证业务已收尾。资源关闭失败/终态持久化失败要保持真实未知，不能靠前端解除门禁。本次不扩展到 Provider 完成判定、空失败持久化或 append 专项。
- 本地断流/HTTP 202/Task.cancel 均不等于远端模型停算或停费；只有持久终态用于前端执行结算。
- 历史实现验收记录为前端 **3089 tests**、TypeScript/Vite 通过，后端相关隔离合同 **108 tests** 通过（见审计 §17）；本次另核对目标前端远端 CI 成功，**未重新跑测试、构建或生产生成**。CI/合同不能替代线上视觉与功能验收。
- 两仓 `git diff --check` 通过；新增报告另做 untracked 文件空白检查。本轮没有操作服务、DDL、备份任务或数据库数据；没有 commit/push/deploy。报告交付后停止，等待人工审查。

## 9. 11 月 19 日复核

**北京时间 2026-11-19 15:31 复核结论：有条件可部署，可以安排正式维护窗口，无需继续写代码。** 用户解锁密钥后，剩余服务器只读检查已完成：服务、单 owner、今日自动备份和前端回滚资源正常。开始切换前仍须确认独立凭据/恢复点、无其他同库实例，并在干净检出通过发布 check；本轮不执行部署。

### 已确认的变化与未变项

| 项目 | 今日只读结果 |
| --- | --- |
| AionHome | 本地及 Gitee `refactor-code-main` 均仍为 `e3c6b17…`，工作区干净。A/B/results 提交覆盖关系沿用 §1。 |
| Penumbra | 本地及 GitHub main 均仍为 `abc0e62…`；仅本预检报告未跟踪，无其他工作区改动。远端 deploy 仍为 `587a17f…`，目标发布工作流匹配运行数为 0，尚无新制品。 |
| 目标 CI | 重新读取 [44267484813](https://github.com/helios0614/penumbra/actions/runs/44267484813)：同一 SHA、attempt 1、completed/success，四个 Job 均成功；无需因过了一天重新构建。 |
| 本机发布工具 | **现在已有** `/Users/remix/.local/bin/gh`，版本 2.103.3；认证检查成功，仓库写权限及现有 classic repo/workflow scope 已确认，deploy.yml 为 active。Python 3.14.4、Git、OpenSSH 可用；不需要再安装 gh 或登录。未执行 dispatch 验证。 |
| 完整入口 check | 实际运行 `python3 -B scripts/deploy/release.py check`，因本报告使工作树非干净而退出 2，尚未进入远端检查；没有生产请求。不能把分项工具通过写成整体 check 通过。 |
| SSH / 今日线上版本 | 用户加载密钥后严格 BatchMode 连接成功。线上 HEAD 仍为 `ee130a9…`，跟踪文件无改动。没有执行更新。 |
| 服务 / 单 owner | `aion-chat.service` 仍 active/running，PID `3474811`、启动时间和 `NRestarts=0` 均未变；cgroup 仅此 PID，全主机 Main app 进程检查仅此一份，未发现 worker/reload 参数或 worker 环境变量。Cloudflare/Trojan 状态、PID/重启数也未变。账户侧其他 origin 的边界沿用 §2，仍须用户确认。 |
| 今日自动备份 | 11-19 **03:16:26–03:21:39 CST** 成功，耗时 313.039 秒；last-attempt/last-success 一致，service Result=success / ExecMainStatus=0。完整 snapshot：`2d8d04e64faf20508b80f41215c37563b1662631d9f1adfc7c0b10f8cfb5b7c7`。处理 1662 文件、约 5.44 GB。data 路径、三项 extra_files 及备份脚本哈希均与昨天一致；timer 正常，下次 11-20 03:19:31 CST。没有创建备份或读取库数据。 |
| 前端回滚材料 | 实际 `python3 -B scripts/deploy/release.py status` 退出 0；`ready=true, consistent=true, activeResourcesVerified=true, pending=[]`。旧四身份及实测首页哈希与 §1 完全一致。两份远端安装工具哈希仍与本地一致；本次只读 status 不启动代理、不切换版本。 |

### 收口三个未完成事项

**备份恢复依据：** 本地备份文档及现有状态目录没有更新的聊天库恢复验证记录；对 `/srv`、`/home/ubuntu`、`/opt/aionhome-backup` 的有界目录元数据检查也未发现新增证据。这不证明从未做过恢复。现有证据仍是“10 月 23 日曾隔离 restore/verify 成功”，仅证明当时的恢复链路可用；**未取得今日快照的恢复验证证据**，本轮也未访问 R2/执行 restore/check。独立保存的仓库访问凭据、Restic 口令是否仍可取得，须由用户确认，勿发送秘密内容。

**判断：本次无需强制再做一次最新快照恢复。** 今日备份成功、工具及覆盖范围未变；本次数据库结构变更仅追加表/索引，失败优先回滚代码并保留现库。用户确认历史恢复依据可信、独立凭据可用并接受该在线恢复点的 RPO 后，可不把最新快照 restore 设为必需前置，但不能将其记为已验证。若这些依据无法确认，或要求明确证明本次选定快照可恢复，则先另行授权一次现有工具的隔离 restore/verify。本轮不执行恢复或新增备份。

**前端发布工具：** 最简单方案是复用现有 `gh + release.py`，不另写发布脚本。为保留本报告、固定 `abc0e62…` 且满足入口的干净 main 要求，正式发布授权后使用**独立干净检出**；不要 reset/clean 当前工作区，也无需为了部署先提交报告而推进 main。可在授权阶段将仓库 clone 到不存在的 `/private/tmp/penumbra-s6e2-release-20261119`，核对 HEAD/远端 main，再运行该目录内的 `python3 -B scripts/deploy/release.py check`。clone/check/deploy 具体顺序沿用 §7，本轮没有创建检出、安装工具或登录。

观察项：一次重复 GitHub `ls-remote` 遇到 HTTP/2 framing 错误，随后读取成功且版本一致；未修改持久 Git 配置。正式发布时仍以完整 check 和具体发布结果为准，读取失败不绕过身份检查。

**后端更新步骤：** 本地/线上版本及单进程运行条件未变，没有发现新的部署阻塞；沿用 §2–3、§7 的 Git/systemd/原库保留回滚流程，不重做 SQLite 研究、不修改脚本。自动建表和新 API 健康检查仍是授权启动后的阶段门槛，本轮未打开正式库 SQL 连接。

### 下一步与维护窗口判断

1. **今日只读复核已完成：** SSH 障碍已解除；服务/进程、备份覆盖与最新成功报告、现有恢复证据、installer status 和线上版本已核对。相比昨天的实质变化是新增今日成功快照，以及本机 gh 已可用并认证；没有源码或线上版本变化。
2. **仅需用户确认：** 独立凭据可用性、接受选定恢复点及其未验证范围、没有额外同库 origin/实例，以及维护窗口内停止发送并排空旧执行。这些无需继续写代码；若选择最新快照隔离验证，需另外授权该具体写入操作。
3. **可以安排正式维护窗口。** 在上述用户确认落实、干净发布检出的完整 check 通过后开始切换，无需新增代码或新审计。当前工作树的报告仍保留；不将一次 status 成功冒充完整 check 通过。目标静态制品尚未发布，按既有入口在授权部署阶段生成，不构成新的开发任务。
4. **下一轮最小顺序：** 确认恢复依据与单 owner → 在干净检出完成只读发布 check、固定目标及旧回滚身份 → 排空旧执行 → 停 `aion-chat.service` 并确认旧进程退出 → 固定后端 `e3c6b17…` 后启动 → 检查结构及认证 GET/no-store → 发布安装固定前端并记录新四身份 → status/缓存/完整刷新 → 经授权浏览器功能验收。失败按 §7 回滚，保留现库，不自动恢复备份。

本节区分今日实测、历史记录和用户确认；未把最新快照写成恢复验证通过。今日仅更新本节文档，未改业务源码、配置、数据库、备份或服务；未 commit/push/deploy。

## 10. 11 月 19 日正式部署记录：后端完成，前端停止

**本轮未完成整组 S6E2 上线。** 后端已部署至 `e3c6b17f4a2433a2b32f3bf8974eaf7622c11ee0` 并通过健康检查；前端在既有发布工具的 Actions 身份校验处停止，生产仍是 §1 的旧 Artifact。未绕过校验、重复 deploy 或修改发布代码；没有执行恢复或回滚。

### 发布前门槛与留存材料

- 两仓 HEAD/目标未变，原工作区保留未提交预检报告。用户明确确认：独立恢复凭据可取得、接受最新成功快照未单独恢复验证的风险；维护窗口停止新 Main 请求，现有生成/必要后处理已结束，无其他同库实例/origin。**凭据可用性为用户确认，非本轮独立验证。**
- 最新成功快照仍为 `2d8d04e64faf20508b80f41215c37563b1662631d9f1adfc7c0b10f8cfb5b7c7`（11-19 03:21:39 CST），覆盖范围及工具哈希未变；恢复证据仍只有既有 10 月 23 日记录。本轮没有 restore/verify 该快照。
- 直接 GitHub clone 未成功后，从已核对 SHA 的本地已提交 main 创建无硬链接的独立干净检出，并将其 origin 设为既有 GitHub 仓库。**完整 `check` 及后端健康检查后的 `deploy --dry-run` 均退出 0**，GitHub 当前 main、认证、工作流、远端工具、代理前置条件和旧活动资源通过。
- 独立检出：`/private/tmp/penumbra-s6e2-release-20261119-pnyqfqr8/trusted-checkout`；相邻目录保留 `check.json`、`dry-run.json`、`deploy.json`、`status-after-stop.json`、`published-release-not-installed.json`。未在当前工作区构建或提交报告。
- 后端旧 SHA 为 `ee130a95b64af3a8aaff0604459075fc05e5cdd9`；旧前端四项回滚身份和首页哈希仍为 §1 所列值，停止后再次通过安装器完整资源验证。

### 后端正式切换与验证

- 15:52:41–15:52:42 CST，停止原 `aion-chat.service`：旧 PID `3474811` 消失、cgroup 为空且 8080 无监听后，才执行固定提交的 `git merge --ff-only` 并启动原服务。systemd 停止 Result=success（SIGTERM 状态 15），journal 确认旧应用 shutdown complete、新应用 startup complete，无 startup failed/Traceback。
- 新 PID **`55861`**，active/running、`NRestarts=0`；主机 Main 进程检查、cgroup 与 8080 监听均指向单一 owner，无 worker/reload 配置。没有新旧 owner 重叠。
- 正式库已存在 `chat_executions`（16 列），主键 `(conv_id, execution_id)`；`chat_execution_active` 是 `conv_id` 上的唯一部分索引，条件 `outcome IS NULL`；无消息外键。核验时非终态 Main 数量为 0。只用授权范围内的只读 SQL 检查，没有额外执行初始化、业务 DML 或恢复。
- 本机与公网使用现有 session 签名契约的短时内存会话，GET session=200、active=200/null、results=200/合法分页、合法不存在 execution 精确 GET=404 `chat_execution_not_found`；上述 execution 响应均 `Cache-Control: no-store`，无认证请求=401。没有真实 execution，故未验证终态精确读取或 POST cancel。
- 最初 Python 默认客户端的公网探测收到 Cloudflare 403 非 JSON；暂停推进并改用系统 curl（正常证书校验）后，公网认证 GET 全部通过。未修改 Cloudflare/Trojan/TLS 配置。Settings、auth、env、unit/drop-in 哈希未变，data/chat.db、venv 和静态目录身份未变。

### 前端停止位置与实际发布身份

15:59:37 CST 单次执行 `release.py deploy`，已成功 dispatch [Actions 44483904902 / attempt 1](https://github.com/helios0614/penumbra/actions/runs/44483904902)，15:59:52 以退出码 2 停止：

```text
Actions run does not match the pinned source, workflow or attempt
```

失败发生在 Actions 运行身份校验，**没有 productionRequestSent，没有启动安装代理或发出 verify/install 请求**。后续只读 GET 中 workflow ID、run ID/attempt、event、branch、head SHA、display title、head repository 已与预期一致；首次不匹配的原始响应未保留，不能断言具体字段或根因，也未把后续匹配当成原 deploy 成功。

该 Actions 随后自行完成并 success，按已授权的工作流发布到 deploy 分支，但未安装到生产。读取到的新制品身份为：

| 字段 | 已发布、未安装的值 |
| --- | --- |
| Source SHA | `abc0e62277a0b097d8aee489f457bfba6b091c3f` |
| Artifact SHA | `9d50bcab9dcd395006829edb9478a99e73070152` |
| Workflow SHA | `abc0e62277a0b097d8aee489f457bfba6b091c3f` |
| Build ID | `actions-44483904902-1` |

这些值来自成功运行及 release.json 的只读查询，**不等于安装器 verify/install 已通过**。本轮没有再次 dispatch 或 deploy，也没有 recover/rollback 事务。

### 停止后的生产状态与后续边界

- 生产是**新后端＋旧前端**这一已评估的过渡组合；后端健康，故保留已通过检查的后端，没有无故降级代码或恢复数据库。旧前端可能遇到新版同会话 execution 冲突，且不具备本次 Composer Stop 交互，不能宣称完整 S6E2 已上线。
- 停止后 installer status 退出 0：`ready=true, consistent=true, activeResourcesVerified=true, pending=[]`，仍为旧四身份。Cloudflare/Trojan PID 与重启数不变。公网已认证 HTML=200/no-store，旧 hashed JS=200/`private, max-age=31536000, immutable`，WS 鉴权握手=101，探针随后主动断开。
- 额外首页核验中的手抄哈希常量有误，已改用 `current.json` 的权威值；安装首页哈希和公网入口资源引用按该记录核对，不以 Cloudflare 返回的动态 HTML 全文哈希替代制品身份。未为此修改任何线上文件。
- 浏览器自动化连接超时，未完成真实浏览器密码登录、Chat 渲染/初始化或手机检查；HTTP session/静态检查不等同于这些项目通过。**暂不开始新版 S6E2 的人工功能验收**，需前端正式安装完成后再进行。
- 下一步先审查上述运行身份拒绝；后续经确认可核对并复用已成功的同一 run/固定制品，通过既有完整验证再安装，不盲目重发构建。本轮按阶段失败要求停止，没有修改业务源码/工具、生产业务配置，没有本地 commit/push，也没有实际 send/regenerate/cancel 或真实 Provider 联调。

## 11. 11 月 19 日前端安全续接结果

**续接安装成功，可以开始 S6E2 人工验收。** 本节更新 §10 的前端停止状态；没有重新部署后端、重新构建或新 dispatch，也没有修改业务代码、发布工具或工作流。

- 首次身份拒绝的原因仍未确认：原失败响应未留存。此次按工具实际使用的 API 版本，分别读取 run 与 attempt 1，核对 source/workflow、event=`workflow_dispatch`、branch=`main`、run_number=7、display_title、head_repository、attempt 与 completed/success，均与预期一致；固定 Artifact 的 release.json 也一致。不以此倒推第一次失败的具体原因。
- 在原独立干净检出完成 **`check → deploy --dry-run → deploy`**，三次均明确选择 `runId=44483904902, attempt=1, selection=reused`；dry-run 计划不含 dispatch。源码始终为固定 `abc0e62…`，原工作区与未提交报告保留。
- 正式发布于 **16:41:44–16:42:33 CST** 完成，工具退出 0，`deploymentOutcome=confirmed-success`、`productionStateConfirmed=true`。安装事务 **`776fbbbf663a4594a4e083cb6390b30e`** 为 committed/acknowledged，完整执行代理验证、verify/install/status 和清理，`proxyChecked=true, proxyCleaned=true`；没有 recover/rollback。

| 实际活动身份 | 固定值 |
| --- | --- |
| Source SHA | `abc0e62277a0b097d8aee489f457bfba6b091c3f` |
| Artifact SHA | `9d50bcab9dcd395006829edb9478a99e73070152` |
| Workflow SHA | `abc0e62277a0b097d8aee489f457bfba6b091c3f` |
| Build ID | `actions-44483904902-1` |
| 安装首页 SHA-256 | `22adceb39437cdb090b0a49acf6720a12c440e64d29bd43e4e55289fb9e5926c` |

- 安装器 `ready=true, consistent=true, activeResourcesVerified=true, pending=[]`；制品包含 85 个文件，完整资源校验通过。又用受信安装器的只读 session/catalogue/target_resources 检查旧 Artifact `587a17f…`：旧四身份、保留制品与回滚所需 site 资源均通过，不只是“记录还存在”。
- 前后端现为目标组合。后端仍为 `e3c6b17…`、单 owner **PID 55861**、`NRestarts=0`；Cloudflare/Trojan 的 PID、启动身份及重启数前后相同，未重启或修改这些生产服务。
- 公网短时内存认证会话：session、execution active/results GET 正常，execution 响应 no-store；HTML=200/no-store，JS/CSS=200、`private, max-age=31536000, immutable`，公网入口资源引用与新安装首页一致。没有把 HTML 动态全文哈希或旧标签页自动刷新作为上线证明。
- CUA 浏览器连接超时，改用本机现有 Chrome 的隔离隐私会话做只读初始化检查，未安装新依赖。页面正常进入 `/penumbra/app/chat`，一个可见 Composer 可编辑，状态稳定后按钮为“发送消息”（空草稿时禁用，未点击），execution active/results 查询成功、WS 握手 101，无页面运行异常或关键 HTTP 错误。探针曾误用短按钮标签/过早取初始化状态，已依据现有源码和稳定状态修正探针，未改产品。
- 浏览器探针拦截所有非 GET/HEAD/OPTIONS HTTP 请求，实际仅拦截 Cloudflare `/cdn-cgi/rum` 分析 POST；没有业务 POST，没有 send/regenerate/cancel 或真实模型调用。认证材料只在内存传递，未输出/保存 Cookie、凭据或消息正文；隐私上下文与临时 Chrome 已关闭。真实密码登录、旧客户端完整刷新、真实 Stop/partial 恢复、消息操作、手机视觉及 IME 仍由用户人工验收。
- 续接报告保存在原工作树之外：`resume-check.json`、`resume-dry-run.json`、`resume-deploy.json`、`resume-browser-health.json`、`resume-status-final.json`（同 §10 的临时操作目录）。恢复凭据/最新快照的事实沿用 §10，未新增恢复验证，也未将未验证快照标记为已验证。

本轮未 commit/push 本地报告。成功安装和无模型健康检查后停止，不继续 Provider 联调或业务操作测试。
