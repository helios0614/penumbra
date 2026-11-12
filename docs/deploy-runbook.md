# Penumbra 日常生产部署

本入口用于已有线上版本的增量升级。GitHub Actions 测试、构建并把静态产物提交到 `deploy`。Ubuntu 使用现有安装器校验和切换静态文件。目录、事务和安装器规范见 [Ubuntu 静态部署](ubuntu-deployment.md)，发布流程见 [Deploy 产物](deploy-artifacts.md)。

## 一次性准备

- Windows 和 macOS 均需 Python 3.12+、Git、GitHub CLI 和 OpenSSH 客户端。执行 `gh auth login --hostname github.com`。账号需能读取目标仓库内容和 Actions，并有触发 `deploy.yml` 的权限。认证留在 GitHub CLI。
- 在 OpenSSH 配置中准备现有 `aion-prod` 别名，使用部署账号 `ubuntu`，通过可信渠道核对主机指纹并录入 `known_hosts`。日常命令要求严格主机密钥检查和非交互认证。将已解锁的密钥加载到相应平台的 SSH agent，或使用现有非交互密钥方案。Windows OpenSSH 通常读取 `%USERPROFILE%\.ssh\config`，macOS 读取 `~/.ssh/config`。自定义别名可用 `--ssh-host`。
- 在 Ubuntu 独立工具目录放置审查过的 `release_remote.py` 和 `install.py`，默认分别为 `/home/ubuntu/penumbra-tools/release_remote.py` 与 `/home/ubuntu/penumbra-tools/install.py`。本地入口按 LF 换行核对两份源码的 SHA-256，兼容 Windows 的 CRLF 工作树。升级工具后同步这两份文件。部署根目录是 `/home/ubuntu/AionHome/penumbra-web`。
- 在 Ubuntu 为 `ubuntu` 准备 `~/.config/penumbra-release/`（`0700`）和其中的 `proxy.json`（`0600`）。通过运维的私有凭据交付渠道准备文件，避免把凭据放进 shell 历史、聊天、仓库或本机环境。准备一个经审核、支持严格入口 TLS 的节点，以及经独立核实的固定出口 IP。服务器需要现有 `/usr/src/trojan/trojan`、系统 CA、`curl`、`ss`、`systemctl` 和 Python 3.12。

`proxy.json` 字段如下。示例值只展示格式，实际值由运维配置。

```json
{
  "host": "entry.example.invalid",
  "port": 443,
  "sni": "entry.example.invalid",
  "password": "<由私有渠道配置>",
  "alpn": ["http/1.1"],
  "expectedEgressIp": "<已审核的公网 IP>"
}
```

隔离方式沿用 AionHome watchdog 的严格测试做法，包括系统 CA、主机名验证、回环监听和 PID 核对。过去成功的 Penumbra 增量部署也用过 SSH 转发本机代理。该记录不能证明当前 Ubuntu 上有可直接使用的严格 Trojan 节点。宽松 TLS 候选和生产 `1080` 不适用于此入口。一次性提供严格节点和出口 IP 仍需运维确认。

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
- Ubuntu 启动独立的严格 TLS 代理，通过受保护的匿名内存文件传递临时配置。先核对实际监听进程，再比对 Cloudflare 返回的出口 IP，并验证 GitHub Smart HTTP。安装器和 Git 子进程继承该回环 SOCKS5H 地址及空的 `NO_PROXY`。`verify`、`install`、`status` 连续执行，临时代理随会话结束回收。
- `status` 单独读取现有安装器状态和服务。查看活动 Artifact、Source、Workflow SHA、Build ID、`consistent`、`ready`、`pending` 和 `activeResourcesVerified`。它可在工作树有改动或 GitHub 无法访问时独立运行。

`activeResourcesVerified:true` 表示安装器的完整 `status` 确认活动版本存在，实测首页哈希与活动记录一致，且活动版本要求的文件均已通过逐文件哈希校验。它是从安装器 `consistent` 和状态快照推导的字段。待处理事务会使 `ready:false`，即使当时的活动资源已通过校验。详见 [Ubuntu 状态契约](ubuntu-deployment.md#上线验收)。

stdout 是 JSON 报告。可将输出重定向到工作树外，例如 PowerShell 的 `> "$env:TEMP/penumbra-deploy-report.json"`，或 macOS 的 `> /tmp/penumbra-deploy-report.json`。退出码 `0` 表示成功，`2` 表示拒绝或未能确认，`130` 表示本地中断。以 `release`、`deployment.after`、`installResult`、`proxyCleaned` 和 `servicesAfter` 核对部署结果。`operationId` 对应现有安装器切换事务。服务检查覆盖 `aion-chat.service`、`cloudflared.service` 和 `trojan.service` 的活动状态、PID、启动时间和重启次数。首次真实部署仍需浏览器验收静态资源与现有登录流程。

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
| `proxy-policy`、`entry-tls`、`proxy-start`、`probe-tls`、`proxy-exit`、`probe-format` | 核对私有配置权限、节点 SNI、证书链、出口 IP 和 Ubuntu 依赖。任何 TLS 或实际出口校验失败都停止。 |
| `verify`、`install`、`post-status`、`git-process`、`git-residue` 或 `lock-busy` | 先读 `status`，保留现场。出现 fetch 失败、Git 锁或临时 pack 时，按 Ubuntu 部署文档检查进程、文件占用、锁、临时 pack 和事务来源。确认安全前禁止重试、删除未知文件或强制覆盖资源。 |
| SSH 断开、超时或中断 | 查看对账结果。若状态未知或 `ready:false`，重新运行 `status`，确认代理清理和安装器事务后再决定下一步。 |

短暂的只读 HTTP 请求和 Actions 轮询错误有有限重试。安装器失败不自动重试。`recover` 和 `rollback` 由运维按 [现有安装器命令及恢复规则](ubuntu-deployment.md#事务异常与恢复) 显式执行。回滚须从可信记录取得目标的四项固定发布身份。人工恢复或回滚期间，应停止使用统一入口，避免和同一部署目录上的操作并发。服务、watchdog、持久代理、DNS 和 AionHome 的变更应由各自的运维流程处理。

首次试运行先验证 Windows、macOS、Ubuntu 的隔离 CI，再配置工具和严格节点。依次运行 `status`、`check` 和 `deploy --dry-run`，确认目标源码与生产基线。选维护窗口执行首次 `deploy`，保存报告并按 Ubuntu 部署文档完成浏览器验收。
