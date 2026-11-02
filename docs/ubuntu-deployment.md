# Ubuntu 静态部署（Phase 6E-B1）

本工具只管理 Penumbra 静态文件，不导入 AionHome 模块，不更新 AionHome 工作树，不访问数据库，不更改认证、systemd 或 Tunnel。已有后端会按请求读取静态文件，因此该方案**不需要重启 `aion-chat.service`**。

以下生产命令是后续阶段的操作说明，本阶段没有执行。运行前仍须重新核对服务器分支、工作区、服务状态、静态目录和权限。静态安装不会替换旧 `/` 入口；新旧前端继续共享 Cookie、API、业务数据及 `/ws`。

## 环境与目录

- Ubuntu，Python **3.12 或更新版本**、Git **2.43 或更新版本**，同一台机器上的普通本地文件系统。无需 pip、npm 或后端依赖。
- 使用运行服务的 `ubuntu` 用户操作。父目录必须已存在；工具仅按显式 `--root` 创建最后一级根目录。
- `--root` 必须是绝对路径，任何父路径和内部路径都不得经过软链接；托管目录归执行用户所有，不允许组或其他用户写入。
- 工具创建目录 `0750`、普通文件 `0640`（受更严格的 umask 约束）。服务用户必须具备目录执行权限及文件读取权限。不自动 chmod/chown 既有文件。
- 整个根目录必须位于同一文件系统，不支持子目录挂载、NFS、跨机器并发。`flock` 只协调本工具；不得同时由其他同用户进程编辑部署文件。
- 为新产物、完整保留版本、待安装资源、首页备份和事务记录预留空间。资源和历史版本不会自动回收。

```text
/home/ubuntu/AionHome/penumbra-web/
├── repository.git/              独立 bare 对象库，绝不 checkout 后端
├── staging/                     获取暂存、首页备份、原子写入临时文件
│   └── <operation-id>/
├── releases/<artifact-sha>/
│   ├── dist/
│   ├── release.json
│   └── SHA256SUMS
├── records/<operation-id>.json   获取/切换事务、前后版本、阶段和 UTC 时间
├── current.json                 活动版本；active:null 表示未部署
├── deploy.lock
└── site/                        唯一对外提供文件的目录
```

`site` 只包含 `dist` 中的静态文件。Git、发布元数据、校验文件、旧首页备份和事务记录均在其外。暂存和已安装的旧资源永久保留；工具不提供清理命令。

## 发布身份与校验

来源固定为 `https://github.com/helios0614/penumbra.git`。CLI 不接受任意远端地址，也不接受 `latest`、分支、Tag、短 SHA 或大写 SHA。每次版本操作必须显式提供 Artifact SHA、Source SHA、Workflow SHA 和 Build ID；回滚也不能只相信本机元数据。

第一版身份额外内置固定检查：

| 字段 | 值 |
|---|---|
| artifactSha | `90cb2398612947ac0793c363d9ea29dee7e1306a` |
| sourceSha / workflowSha | `6a40bceaf8f659652409108e88f4176cf0476c5c` |
| buildId | `actions-41391367799-1` |
| basePath | `/penumbra/` |
| fileCount / sizeBytes | `71` / `55916553` |
| distSha256 | `09b9b7b063a2de53dd7728e8cdfea08ae183450d8ea5cb865943036a1e72fcad` |

真实 `release.json` schemaVersion 为 1，包含 `repository`、`sourceSha`、`workflowSha`、`buildId`、`runId`、`runNumber`、`runAttempt`、`runUrl`、`builtAt`、`nodeVersion`、`basePath`、`fileCount`、`sizeBytes`、`distSha256`、`productionValidation`、`excludedFiles` 和 `files`。`files` 按路径排序，每项为 `{path, sizeBytes, sha256}`，路径含 `dist/` 前缀。Artifact SHA 不写进自身元数据，部署记录另行绑定它。

校验算法直接对齐现有 `scripts/deploy/artifact.cjs`：

1. 获取指定完整 SHA，确认类型是 commit，重新计算 commit、根 tree、各级 tree 和文件 blob 的 Git 对象哈希。禁止符号链接、gitlink、可执行模式和未知路径；不解压归档、不执行下载内容。
2. 从 Git blob 导出到独立暂存区，逐文件 fsync；拒绝多余/缺失文件、异常目录及发布允许列表之外的文件。
3. 实算全部静态文件大小及 SHA-256，与 `files` 精确比较，包括顺序和字段。检查总数和总大小。
4. 对每项生成 UTF-8 文本 `sha256 + 两个空格 + path + LF`，依文件路径排序。该文本的 SHA-256 就是 `distSha256`，不是归档、目录或文件哈希拼接串的哈希。
5. `SHA256SUMS` 必须精确等于上述文本再追加 `release.json` 的同格式哈希行，保留末尾 LF。
6. 核对预期来源、源码、工作流、构建标识、Actions URL、生产校验记录和 base。拒绝重复 JSON key。

所有保留版本再次使用时，都会重新与固定 Git tree 和完整校验材料核对。即使有人修改文件后重新生成一套自洽的 `SHA256SUMS`，也会因 Git blob 不匹配而失败。Git 对象库也必须保留；它是本地完整性复核所需材料。

对象库使用 `refs/penumbra/artifacts/<完整 SHA>` 保留每个取得的 Commit，防止其成为无引用对象；不会移动已有不同内容的保留引用，也不会跟随 deploy 分支推进。Git 开启传输对象检查和对象/引用 fsync。

## CLI 与首次部署

先将经过审查的 `scripts/deploy/install.py` 放到独立工具路径，例如 `/home/ubuntu/penumbra-tools/install.py`。该步骤在后续授权阶段完成；不必把工具放进 AionHome 工作树或静态目录。

以下使用 Bash 变量和参数数组，防止丢失或混淆身份参数：

```bash
INSTALLER=/home/ubuntu/penumbra-tools/install.py
DEPLOY_ROOT=/home/ubuntu/AionHome/penumbra-web
FIRST_RELEASE=(
  --root "$DEPLOY_ROOT"
  --artifact-sha 90cb2398612947ac0793c363d9ea29dee7e1306a
  --source-sha 6a40bceaf8f659652409108e88f4176cf0476c5c
  --workflow-sha 6a40bceaf8f659652409108e88f4176cf0476c5c
  --build-id actions-41391367799-1
)

# 获取、导出并全量校验；写暂存/版本/记录，不切首页
python3.12 "$INSTALLER" verify "${FIRST_RELEASE[@]}"

# 资源就绪后原子切换首页
python3.12 "$INSTALLER" install "${FIRST_RELEASE[@]}"

# 只读复核，无网络、无文件创建或写入
python3.12 "$INSTALLER" status --root "$DEPLOY_ROOT"
```

`status` 返回活动身份、实测首页哈希、`consistent`、待恢复事务阶段和 `ready`。只有 `ready:true` 才是完整可用的部署记录状态。不存在/未初始化的根目录、权限错误、锁冲突、不一致或未完成事务均返回非零（2），不会静默初始化。

## 升级、指定版本回滚与首次撤销

从受审查的发布记录取得新版本四个身份值，不能从正在变化的 deploy 分支推断本次批准版本：

```bash
python3.12 "$INSTALLER" verify --root "$DEPLOY_ROOT" \
  --artifact-sha "$ARTIFACT_SHA" --source-sha "$SOURCE_SHA" \
  --workflow-sha "$WORKFLOW_SHA" --build-id "$BUILD_ID"

python3.12 "$INSTALLER" install --root "$DEPLOY_ROOT" \
  --artifact-sha "$ARTIFACT_SHA" --source-sha "$SOURCE_SHA" \
  --workflow-sha "$WORKFLOW_SHA" --build-id "$BUILD_ID"

# 示例：升级后回滚到首个正式产物的完全相同字节
python3.12 "$INSTALLER" rollback "${FIRST_RELEASE[@]}"

# 撤销到未部署状态（首次上线没有旧版本时也适用）
python3.12 "$INSTALLER" rollback --root "$DEPLOY_ROOT" --undeploy
```

同路径同内容资源复用，缺失资源允许在 install 时原子新增。同路径不同内容一律停止，包括固定字体、许可证及其他固定路径。未来更新固定资源须在源码构建阶段生成新 URL，再发布新产物。不会在服务器修改产物来绕过冲突。

新 URL 仍须符合发布器及安装器的共同允许列表，例如使用 `assets/` 下的新文件名；新增字体目录或文件类型时须同步审查两处允许列表。

发现未知 site 文件、空目录或已知资源内容损坏时停止，保留现场。新资源安装前完成全部冲突预检，安装后再次核对，首页最后切换。不会删除旧 chunk、旧字体或旧 release。

rollback 重新校验目标 release；若 release 丢失，会按指定 SHA 重新获取。但目标所需的 site 资源必须仍存在且内容一致，否则拒绝回滚。正常升级后的回滚不会删除新版本资源。`--undeploy` 原子移出活动首页并记录 `active:null`，让现有后端恢复原本的 503 未部署响应；资源继续保留。

## 事务、异常与恢复

全程非阻塞 `flock`；锁忙时失败，不排队执行。Git 所有调用均为 subprocess 参数数组，禁用全局/系统 Git 配置、凭据交互、hooks 和 URL 重定向；生产 CLI 只允许 HTTPS 协议，只操作独立 bare 库。获取失败、校验失败均不触碰活动首页。

事务阶段分为：

- 获取：`fetching → exporting → validated → verified`。
- 切换：`prepared → resources_ready → switching → index_switched → committed`。
- 放弃/恢复完成：`aborted`。

获取事务的持久化 `kind` 仍是 `acquire`，兼容 B1 正常生成的记录，不改名为 `fetch`。获取和切换有各自独立的合法阶段集合，`aborted` 是共同终态；`verified` 仅属于获取，`committed` 仅属于切换。每次读取（包括终态）或写入都会校验完整字段集合、类型、ID、UTC 时间、预期 Artifact/Source/Workflow SHA、Build ID、首页哈希、`before`/`target` 和 action 一致性。损坏记录使 status 返回 `ready:false`，并阻止 verify/install/rollback/recover；不会猜测或自动补全字段。

切换前持久保存旧首页和前后完整版本身份。资源先写到同文件系统暂存文件并 fsync，再使用不会覆盖目标的原子 hard link 发布；随后的暂存 unlink 若被中断，也只留下同一完整文件的两个链接，不会暴露半个资源。

首页用同文件系统 `os.replace` 原子替换，文件及相关父目录执行 fsync。`current.json` 和每次事务更新也按“写临时文件、fsync、原子替换、fsync 父目录”完成。不会直接截断活动首页或记录文件。

遇到普通异常会尝试立即恢复事务前状态，并以非零退出。若恢复写入也失败，则保留未完成事务并阻止进一步版本操作。SIGKILL/断电不会执行异常处理，须运行：

```bash
python3.12 "$INSTALLER" status --root "$DEPLOY_ROOT"
python3.12 "$INSTALLER" recover --root "$DEPLOY_ROOT"
python3.12 "$INSTALLER" status --root "$DEPLOY_ROOT"
```

恢复策略是确定的：未完成获取标记放弃并保留暂存；未完成切换统一恢复到事务前的首页和版本记录，即使新首页已切换、甚至 current 已写入，也不把未提交事务自动算作成功。首次部署恢复到无活动首页。恢复可以重试，已完成的恢复不会重复切换。

### Git 目录绑定与初始化（B1.2）

Git 不再接收调用者原始 root 的字符串路径。每次调用先以 `O_NOFOLLOW`/`dir_fd` 打开仓库目录：

- Ubuntu/Linux 使用 `/proc/self/fd/<仓库fd>` 作为显式 bare Git 目录及 subprocess cwd，并通过 `pass_fds` 继承仓库和部署锁句柄。procfs 不可用时直接失败，不退回原始路径。
- macOS 的 `/dev/fd` 不支持目录遍历；本地测试使用隔离 Python launcher，先对继承句柄执行 `fchdir`，再 exec 绝对路径的 Git，仓库路径为 `.`。不使用 shell、`preexec_fn` 或父进程 chdir。
- 清除继承的 `GIT_*`、PWD 等路径影响，再显式设置必要安全变量；临时路径绑定仓库目录。正式仓库不接受 `commondir`、alternates、配置 include、URL 重写或未知配置段。

`git init` 会在内部将目录规范化为字符串路径，不能仅靠把其参数改为 procfs 就认定初始化安全。因此初始化通过 fd 相对写入，在 `staging/<operation-id>/repository.git` 建立 [Git 文档规定的 bare SHA-1 v0 最小结构](https://git-scm.com/docs/gitrepository-layout)：HEAD、core 配置、objects 和 refs。它不生成对象、不复制 Git 模板、不执行钩子。文件及目录 fsync 后，以真实 Git 检查 bare 状态和 SHA-1 格式，再原子发布为 `repository.git`。当前协议固定 40 位 SHA，因此明确使用 v0/SHA-1，不跟随机器的默认初始化格式。

初始化全程仍属于原有 `fetching` 阶段，没有重做部署状态机。部分或完整的初始化暂存若中断，recover 结束合法的获取事务并原样保留暂存；下一次操作使用新的 operation ID 重新初始化。正式发布后、fetch 前中断时，恢复后复用已验证的正式仓库。有效仓库不重新初始化，发布时也不会覆盖已存在仓库。

旧版留下的异常正式 `repository.git` 不能仅凭目录名称推断所有权。工具明确报告人工调查需求，不自动删除、覆盖或隔离未知目录；recover 不再虚报成功。Git 子进程被杀后若留下 `.lock` 或 Git 临时文件，也停止并保留现场。须先确认没有仍在运行的 Git 进程，并调查残留的来源，再人工处理；工具不会自动删除所谓“过期锁”。Git 子进程继承部署锁，以减少父进程被杀后立刻并发恢复的窗口。

若首页既不匹配旧版本也不匹配事务目标，或者恢复备份、保留版本、资源、权限或记录已损坏，工具拒绝覆盖并报告错误。不要手工修改 `current.json` 来掩盖差异，也不要清空 site。先排查磁盘、权限或外部改动，恢复可信材料后重试。多条未完成切换事务也需人工调查。

在首页替换后、事务最终提交前被强杀时，新 Penumbra 页面可能短暂可见，直到 recover 执行；这是两个文件无法作为一次文件系统事务提交的实际窗口。旧站入口和后端服务不参与切换，不受该窗口影响。

## 上线验收

1. `status` 必须退出 0，显示预期 Artifact SHA、`ready:true` 和一致的首页哈希。它会重算保留文件、site 中全部已知资源及活动版本所需资源。
2. 使用正常浏览器和现有账号访问 `/penumbra/`、`/penumbra/index.html`、`/penumbra/app/chat`、`/penumbra/editorial/app/chat`；深链接刷新保持页面可用。
3. 检查实际首页引用的 JS/CSS、懒加载 chunk 和字体请求均成功，类型正确。HTML 为 `no-store`，哈希 JS/CSS 为 private immutable，其他静态资源为 private no-cache；同时检查 Cloudflare 实际响应头，不能只相信源站策略。
4. 未登录页面仍进入旧登录流程，脚本/API 仍拒绝匿名请求；确认旧 `/`、`/chat`、`/static`、`/sw.js` 行为保持原样。
5. 在后续明确允许的业务验收范围内检查同源 `/api/*` 和 `/ws`。工具本身不登录、不携带 Cookie、不发送业务请求。

## 隔离测试

```bash
python3.12 -B -m unittest discover -s tests/deploy -p 'test_install.py' -v
node --test tests/deploy/*.node.cjs
```

Python 测试仅使用标准库、临时目录和本地 Git 仓库。Node 是开发/CI 中调用真实发布器创建夹具所需，生产安装器不依赖 Node。测试包括错误身份/校验/路径/链接、资源冲突、并发锁、写入失败、首页原子切换、指定版本回滚、撤销、恢复，以及子进程真实 SIGKILL。CI 单独在 Ubuntu 24.04 / Python 3.12 上运行该套测试，无需安装 Python 包。

### 本阶段验证记录（2026-11-02）

- macOS arm64 / Python 3.14.4：37 项隔离测试全部通过，0 skipped；含参数化负例和真实 SIGKILL 子进程。
- 现有 Node 发布回归：43 项通过，1 项真实 Vite 构建用例因本地缺少 `.vite/manifest.json` 跳过。本轮未重建前端。
- Python 3.12 语法解析、Workflow YAML 解析及 diff 空白检查通过。
- 本机没有 Python 3.12，临时获取解释器遇到网络失败；Ubuntu 24.04 / Python 3.12 CI Job 已加入，但本轮未 Commit、Push 或触发远端执行。**生产部署前必须取得该 Job 实际通过的结果**，本记录不代表该平台已实跑通过。
- 未连接生产服务器，未安装正式产物，未执行生产 install/rollback，未更改 AionHome。

### B1.2 修复回归记录（2026-11-02）

- macOS arm64 / Python 3.14.4：**48 项完整隔离测试通过，0 skipped**（192.762 秒），包含原有 37 项和新增 11 项。
- 真实 Git 验证：初始化写入中、初始化验证前、fetch 前、对象读取前替换原 root 路径；另在真实 fetch 已启动、等待 upload-pack 时替换 root。操作继续绑定可信目录或明确失败，外部目录不产生文件。
- 事务负例：23 组损坏记录分别经过 status、verify、install、rollback、recover 和撤销检查；原始非法终态样例不再返回 ready。各类型合法阶段及现有正常记录保持兼容。
- 初始化故障注入：部分结构、完整但未发布、发布后未 fetch 三个中断点均能保留证据、recover 后安全重试；未恢复事务阻止重复获取。已有有效仓库复用，发布不会覆盖后来出现的正式仓库。
- 真实 Git 子进程被 SIGKILL 后留下引用锁：status 不就绪，recover 明确要求人工调查，保留锁和旧首页。旧版异常正式仓库同样停止，不虚报恢复成功。
- 原有 Node 发布回归：43 项通过，1 项真实 Vite 构建用例因缺少本地 Manifest 跳过。Python 3.12 语法、Workflow YAML、空白检查通过。
- **Ubuntu/Linux 的 procfs Git 分支及 Python 3.12 尚未在本机实跑**；没有下载解释器或安装全局依赖。现有 Ubuntu 24.04 / Python 3.12 CI Job 保持原样，提交后必须验证其实际结果，再考虑生产操作。
- 本轮只修改安装器、测试及本文；保留原有 build.yml 未提交修改，未 Commit、Push、连接生产或部署。
