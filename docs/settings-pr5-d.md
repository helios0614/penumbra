# Settings PR5-D · Music 服务

## 基线与入口

Penumbra 开工位于 `main`，HEAD 为 `b74c4d8`。AionHome PR5-D0 已提交为 `dbb55e2`，其中包含 PR5-B0 的普通凭据清除修复。两个工作区开工时均干净。本页运行依赖 PR5-D0 或兼容的后续版本。

「设置 → 服务集成」直接进入「Music 服务」。同一玻璃面板用细分割线分开 MUSIC_U 凭据和登录状态，沿用 Web／Speech 的 Settings 导航和系统弹窗。清除确认说明服务会尝试匿名登录。确认后的显示来自后端实际记录。

## API 契约

| 操作 | 接口及 DTO |
| --- | --- |
| 读取凭据 | `GET /api/settings`，仅使用 `credentials.netease_music_u` 下的 `{configured, masked, secret_ref}`。 |
| 替换凭据 | `PUT /api/settings`，仅提交 `{netease_music_u: "新值"}`，成功回执为 `{ok:true}`。 |
| 查看凭据 | `POST /api/settings/secrets/reveal`，提交 `{secret_ref}`，成功返回 `{secret}`。 |
| 清除凭据 | `POST /api/settings/secrets/clear`，独立确认后提交 `{secret_ref}`，成功回执为 `{ok:true}`。 |
| 读取登录状态 | `GET /api/music/auth-status`，只解析 `{mode, status, checked_at, error_code}`。 |

所有请求复用 Session 和 `no-store`。过期或无效的普通 Settings 引用按 422 处理，读回凭据状态并要求再次确认。页面不会自动重放旧操作。共享凭据组件使用空白密码输入，拒绝空白值和掩码。明文只在用户显式查看或填写时短暂保留，复制由用户触发，隐藏、关闭编辑或离开页面后清理。错误反馈使用固定文案。

## 登录与保存

- `mode` 分别显示「凭据登录」和「匿名模式」。`status` 分别显示「最近登录成功」「最近登录失败」或「尚未验证」。页面将 `checked_at` 转为浏览器本地时间显示，后端返回 `null` 时显示「—」。
- `login_failed`、`login_rejected` 和 `login_not_confirmed` 分别提示尝试失败、当前凭据未获认可、尝试无法确认。未知错误码被丢弃。读取失败显示「登录状态暂不可读取」，可单独重新读取。
- 初次进入时凭据与登录状态独立读取。凭据写入串行，收到回执后重新 GET Settings，再读登录状态。配置提交回执、凭据读回和登录结果分别处理，因此「MUSIC_U 已保存」或「MUSIC_U 已清除」可以与「最近登录失败」同时显示。读回无法确认时保留上次可确认状态，提示重新读取。
- 保存失败或回执丢失时也按相同顺序读回。替换弹窗保留尚未确认的草稿。清除后续操作需重新确认。新的写入会作废此前在途的登录状态读取，离开页面会取消等待并丢弃迟到响应。请求已经到达后端时仍可能完成。

登录结果仅表示当前 Worker 记录的最近一次尝试，无法证明会话持续有效。Settings 与登录状态来自两个独立快照，接口未暴露供前端关联的配置版本。在多 Worker 部署中，两次读取可能反映不同进程的观察。页面分别展示两次读取得到的信息。

## 文件与职责

| 文件 | 职责 |
| --- | --- |
| `src/components/settings/SettingsView.tsx` | 增加 Settings 首页直达入口。 |
| `src/components/settings/music/MusicSettingsPage.tsx` | 展示凭据、状态、尝试时间和独立错误反馈。 |
| `src/components/settings/music/useMusicSettings.ts` | 串行写入、按顺序读回、错误恢复及请求取消。 |
| `src/domain/music-settings/music-settings-client.ts` | 窄 DTO、替换请求和安全的状态投影。 |
| `src/components/settings/SettingsCredentialActions.tsx` | 复用凭据交互，支持 MUSIC_U 文案并让系统识别模态期间的 Toast 隐藏。 |
| `src/domain/music-settings/music-settings-client.test.ts`、`tests/browser/settings-pr5-d-smoke.cjs` | Fake API 契约、凭据生命周期、状态异常和浏览器布局回归。 |

## 验证与人工验收

- 定向 Vitest 33 条通过。全量 Vitest 222 个文件、3,002 条通过。TypeScript、生产构建和 `git diff --check` 通过。
- Music、Web、Speech 浏览器回归各 6 组通过，覆盖 Classic／Editorial 各 320px、390px、1440px。Music 回归覆盖凭据查看、复制、替换和确认清除，验证两种登录模式、独立失败提示、读回顺序、过期引用和迟到响应。窄屏在 460px 高度下检查了弹窗边界及 Toast 遮挡。全部回归均无外部请求或页面错误。
- 仅使用本地 Fake API、合成凭据与 Mock Clipboard。部署域名的剪贴板权限和真机软键盘待人工验收。
- 变更仅在 Penumbra 工作区。未调用真实网易云服务，未提交、推送或部署。
