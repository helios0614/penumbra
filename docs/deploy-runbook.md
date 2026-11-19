# Penumbra 日常生产部署

本入口用于已有线上版本的增量升级。GitHub Actions 测试、构建并把静态产物提交到 `deploy`。Ubuntu 使用现有安装器校验和切换静态文件。目录、事务和安装器规范见 [Ubuntu 静态部署](ubuntu-deployment.md)，发布流程见 [Deploy 产物](deploy-artifacts.md)。

## 一次性准备

- Windows 和 macOS 均需 Python 3.12+、Git、GitHub CLI 和 OpenSSH 客户端。执行 `gh auth login --hostname github.com`。账号需能读取目标仓库内容和 Actions，并有触发 `deploy.yml` 的权限。认证留在 GitHub CLI。
- 在 OpenSSH 配置中准备现有 `aion-prod` 别名，使用部署账号 `ubuntu`，通过可信渠道核对主机指纹并录入 `known_hosts`。日常命令要求严格主机密钥检查和非交互认证。将已解锁的密钥加载到相应平台的 SSH agent，或使用现有非交互密钥方案。Windows OpenSSH 通常读取 `%USERPROFILE%\.ssh\config`，macOS 读取 `~/.ssh/config`。自定义别名可用 `--ssh-host`。
- 在 Ubuntu 独立工具目录放置审查过的 `release_remote.py` 和 `install.py`，默认分别为 `/home/ubuntu/penumbra-tools/release_remote.py` 与 `/home/ubuntu/penumbra-tools/install.py`。本地入口按 LF 换行核对两份源码的 SHA-256，兼容 Windows 的 CRLF 工作树。升级工具后同步这两份文件。部署根目录是 `/home/ubuntu/AionHome/penumbra-web`。
- 在 Ubuntu 为 `ubuntu` 保留 `~/.config/penumbra-release/`（`0700`），继续使用该目录上的既有部署锁。旧 `proxy.json` 原样保留但不再读取；节点字段和 `expectedEgressIp` 均不再使用，不维护出口 IP 白名单。
- **生产使用新版入口前必须先准备读取器和精确 sudo 规则**。将审查过的 `scripts/deploy/read_node.py` 以 LF 换行安装到 `/usr/local/libexec/penumbra-release/read-node.py`，root 所有、`0644`；该路径的所有父目录必须 root 所有且组/其他用户不可写。服务器仍需 root 管理的 Trojan 二进制、系统 CA、`curl`、`ss`、`systemctl`、`sudo` 和 Python 3.12。同步本地与服务器 `release_remote.py`、`install.py`、读取器版本；入口按 LF 规范化 SHA-256 绑定三份源码，版本不符停止。
- 读取器只读固定 `/usr/src/trojan/config.json`，要求文件 root 所有、无组/其他用户权限、无执行位，且父目录 root 所有、组/其他用户不可写。文件及路径不能是符号链接；大小不超过 64 KiB。若现有路径权限不符合要求，停止并另行审查运维准备，不在发布期间自动 chmod/chown 或移动正式配置。

由运维在独立授权的准备阶段，用 `visudo` 审核类似以下精确规则（本仓库不自动安装或修改 sudoers）：

```sudoers
ubuntu ALL=(root) NOPASSWD: /usr/bin/python3.12 -I -B /usr/local/libexec/penumbra-release/read-node.py
```

不得使用参数通配符、任意 Python/脚本授权或允许发布账号编辑读取器。发布工具只调用 `/usr/bin/sudo -n -- /usr/bin/python3.12 -I -B /usr/local/libexec/penumbra-release/read-node.py`；读取器拒绝额外参数，不执行配置内容，不联网，不导入部署账号目录中的模块。生产准备时须验证 sudo 规则拒绝额外参数和其他脚本，并确认该精确命令没有 sudo I/O 会话录制或其他管道输出采集，防止凭据被外部日志系统记录。

读取器拒绝重复 JSON key，要求 `run_type=client`、单元素非空密码数组、合法节点地址/端口/SNI，以及显式的 ALPN 数组（空数组允许；元素仅 `h2` 或 `http/1.1`）。它只导出规范化的 `host`、`port`、`sni`、`alpn`、`password`。凭据仅沿子进程管道进入普通用户发布进程内存，再写入 sealed memfd；不能手工把读取器输出粘贴到终端或报告，也不能开启子进程输出追踪。缺少读取器、无 sudo 权限、配置不合法或哈希不符都停止，不回退旧配置。

每个 check 或部署会话读取一次磁盘配置快照；单独 status 不需要读取节点。**磁盘配置不证明正在运行的正式 Trojan 已加载相同内容**。本入口不 reload、不重启正式服务，也不自动切节点。

Ubuntu 到 Trojan 节点继续使用 TLS 加密并发送 SNI，临时实例固定使用 `verify:false` 和 `verify_hostname:false`，不继承正式配置的 TLS 开关、监听地址或日志设置。GitHub 和 Cloudflare 请求仍使用系统 CA 验证证书链和主机名。临时实例监听回环地址、核对监听进程，并避开生产端口 `1080`。

## 日常命令

从已推送到 GitHub 的干净 `main` 工作树运行。以下命令在 Windows 和 macOS 相同。Windows 若只装了 Python Launcher，可用 `py -3.12` 代替 `python`。

```text
python scripts/deploy/release.py check
python scripts/deploy/release.py deploy --dry-run
python scripts/deploy/release.py deploy
python scripts/deploy/release.py status
```

- `check` 检查本地 Git、远端 `main`、GitHub 认证与发布工作流、SSH、服务、安装器状态和代理前置条件。`deploy --dry-run` 额外列出计划。两者只读，不启动代理或发布。代理 TLS 和实际出口在真正 `deploy` 时验证。
- `deploy` 复用与当前 `main` 对应的成功发布，或等待已有匹配运行。需要新构建时，使用 `2022-11-28` API 单次 dispatch，并显式发送 `return_run_details: true`。只有 HTTP 200 且运行 ID 和 URL 有效才会继续。204、空响应、超时或身份缺失均报告 `dispatch-outcome-unknown`。先在 Actions 确认是否已创建运行，再决定是否重新发起。其余读取使用 `2026-03-10` API。
- 入口按 run ID 和 attempt 定位成功的 `publish` Job，优先读取 API 返回编号的发布 Step 日志。仅当 Step 请求明确返回 HTTP 404 时，才读取同一 Job 的完整日志。每次请求限 30 秒、4 MiB。遇到 GitHub CLI 明确拒绝日志中的终端转义字符时，可把同一份日志重新读入内存，报告只保留通过校验的字段。摘要必须唯一且完整，并与固定提交的 `release.json` 和 `deploy` 历史一致。日志截断、过期、摘要缺失或身份冲突时停止。若 `main` 在准备期间推进，本次停止。
- Ubuntu 启动隔离的 Trojan 代理，通过受保护的匿名内存文件传递临时配置。入口 TLS、监听 PID、回环地址及 GitHub Smart HTTP 为必需检查；GitHub 继续要求严格 HTTPS、HTTP 200 和响应格式正确。GitHub 通过后最多执行一次 Cloudflare 辅助诊断，curl 最大 15 秒、外层命令 18 秒，无重试。Cloudflare 超时、证书错误、HTTP 异常、缺少 IP 或 trace 主机字段异常只记诊断，不阻断发布。响应未通过严格 HTTPS 检查时不信任其中的出口 IP。代理归属异常、会话中断和子进程清理失败仍阻断。安装器和 Git 子进程继承回环 SOCKS5H 地址及空的 `NO_PROXY`；不允许直连回退或 `--insecure`。`verify`、`install`、`status` 连续执行，临时代理随会话结束回收。
- `status` 单独读取现有安装器状态和服务。查看活动 Artifact、Source、Workflow SHA、Build ID、`consistent`、`ready`、`pending` 和 `activeResourcesVerified`。它可在工作树有改动或 GitHub 无法访问时独立运行。

`activeResourcesVerified:true` 表示安装器的完整 `status` 确认活动版本存在，实测首页哈希与活动记录一致，且活动版本要求的文件均已通过逐文件哈希校验。它是从安装器 `consistent` 和状态快照推导的字段。待处理事务会使 `ready:false`，即使当时的活动资源已通过校验。详见 [Ubuntu 状态契约](ubuntu-deployment.md#上线验收)。

stdout 是 JSON 报告。可将输出重定向到工作树外，例如 PowerShell 的 `> "$env:TEMP/penumbra-deploy-report.json"`，或 macOS 的 `> /tmp/penumbra-deploy-report.json`。退出码 `0` 表示成功，`2` 表示拒绝或未能确认，`130` 表示本地中断。以 `release`、`deployment.after`、`installResult`、`proxyCleaned` 和 `servicesAfter` 核对部署结果。`operationId` 对应现有安装器切换事务。服务检查覆盖 `aion-chat.service`、`cloudflared.service` 和 `trojan.service` 的活动状态、PID、启动时间和重启次数。首次真实部署仍需浏览器验收静态资源与现有登录流程。

`proxyChecked:true` 表示入口 TLS、受控代理归属和 GitHub 必需检查已通过，不要求 Cloudflare 成功，也不代表安装已完成。`egressDiagnostic.status` 为 `observed`、`unavailable` 或 `invalid-response`；可包含 `curlExit`、`httpStatus`、`tlsVerifyResult`、`hostMatches` 和合法 IP。报告不包含原始响应、stderr 或凭据。实际出口变化不影响发布，工具不再证明经过某个固定公网出口。GitHub 探测也不替代后续固定 SHA 获取、Git 对象和逐文件哈希验证。

部署请求发出后，如果缺少可信的最终安装器状态或服务快照，入口只补查一次只读 `status`，请求限时 360 秒。原失败分类保留在 `deployment.error`，补查结果单独写入 `statusAfterUncertainExit`。查看 `deploymentOutcome` 判断下一步。

| 结果 | 含义 |
| --- | --- |
| `confirmed-success` | 安装与全部部署后检查已确认。 |
| `failed-state-confirmed` | 部署失败，最终状态已读取。用 `installState` 和 `installResult` 区分安装器拒绝、未开始安装，以及已安装但后续检查失败。 |
| `unknown-result-status-obtained` | 安装结果仍不明，但已读到可信的状态快照。即使活动 SHA 是目标版本，也需要核对事务和部署后检查。 |
| `unknown-result-state-unknown` | 仍缺少可信的最终状态。先人工检查 `status`、事务和服务，再决定是否继续。 |

## 阻断与人工恢复

| 报告或现象 | 处理 |
| --- | --- |
| CI 失败、发布身份或 GitHub `main` 不匹配 | 检查对应 Actions run 和四项发布身份。dispatch 返回不明确时先在 Actions 查看是否已创建运行。 |
| `node-reader-version`、`node-config` | 核对读取器源码哈希、root 所有权、可信父目录、精确 sudo 规则及正式配置结构；不打印凭据，不回退旧文件。 |
| `proxy-policy`、`entry-tls`、`proxy-start`、`probe-tls`、`proxy-exit`、`probe-format` | 核对锁目录权限、节点 SNI 和 TLS 握手、GitHub HTTPS/响应格式、监听 PID 和 Ubuntu 依赖。Cloudflare 的普通请求失败只出现在辅助诊断中。 |
| `verify`、`install`、`post-status`、`git-process`、`git-residue` 或 `lock-busy` | 先读 `status`，保留现场。出现 fetch 失败、Git 锁或临时 pack 时，按 Ubuntu 部署文档检查进程、文件占用、锁、临时 pack 和事务来源。确认安全前禁止重试、删除未知文件或强制覆盖资源。 |
| SSH 断开、超时或中断 | 查看对账结果。若状态未知或 `ready:false`，重新运行 `status`，确认代理清理和安装器事务后再决定下一步。 |

短暂的只读 HTTP 请求和 Actions 轮询错误有有限重试。安装器失败不自动重试。`recover` 和 `rollback` 由运维按 [现有安装器命令及恢复规则](ubuntu-deployment.md#事务异常与恢复) 显式执行。回滚须从可信记录取得目标的四项固定发布身份。人工恢复或回滚期间，应停止使用统一入口，避免和同一部署目录上的操作并发。服务、watchdog、持久代理、DNS 和 AionHome 的变更应由各自的运维流程处理。

首次试运行先验证 Windows、macOS、Ubuntu 的隔离 CI，再配置工具和节点。依次运行 `status`、`check` 和 `deploy --dry-run`，确认目标源码与生产基线。选维护窗口执行首次 `deploy`，保存报告并按 Ubuntu 部署文档完成浏览器验收。
