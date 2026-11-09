# Settings PR5-C2 · SiliconFlow TTS 独立配置

## 基线与运行依赖

Penumbra 开工位于 `main`，PR5-C 已独立提交为 `c0fde17132d9e2942c982242fb3b9700e93bad6c`。AionHome 开工位于 `refactor-code-main`，PR5-C1 已提交为 `84c6f3a45d90411894d3b61d0b4dc3a1aee73890`。开工时两个工作区均干净。

本页依赖 PR5-C1 或兼容后续版本提供独立字段。上线时先让后端完成 C1 的启动迁移，再开放新入口。PR5-A 审计和 PR5-C 记录的是解耦前契约，当前映射以 C1 的 `routes/settings.py` 和 `settings_secret_projection.py` 为准。

## 字段与界面

| 操作 | 普通 Settings GET | 写入 | 默认值 |
| --- | --- | --- | --- |
| API 地址 | `siliconflow_tts_custom_url` 布尔状态 | `PUT /api/settings`，仅提交 `siliconflow_tts_url` | `https://api.siliconflow.cn/v1` |
| 模型名称 | `siliconflow_tts_model` | `PUT /api/settings`，仅提交 `siliconflow_tts_model` | `FunAudioLLM/CosyVoice2-0.5B` |
| API Key | `credentials.siliconflow_tts_key`，含 `configured`、`masked`、`secret_ref` | PUT 仅替换 `siliconflow_tts_key`。显式查看和清除使用普通 Settings Secret 路由 | 未配置 |

- 地址区显示「使用默认地址」或「已配置自定义地址」。修改用系统 Dialog 和 Input，首次打开为空，且只保留用户在本次页面会话填写的草稿。GET 缺少 C1 投影时显示读取错误和重试入口。
- 新地址必须是带主机的 HTTPS 基础地址，拒绝 userinfo、查询参数、片段、非法端口、反斜杠以及中间的空白或控制字符。确认按钮上方说明现有 Key 会用于新目标。输入框留空不能提交，填写地址后仍须明确点击确认。
- 自定义状态提供单独的「恢复默认地址」确认弹窗。仅此操作提交地址空字符串，保留 Key 和模型。地址字段省略或 null 在后端都表示保留。默认状态下隐藏恢复操作。
- Provider 选择器、模型保存和 TTS／ASR 分区沿用 PR5-C。地址草稿和模型草稿分别清理，切换 Provider 保留草稿，离开语音页后释放。地址、模型、Key 分次提交，共用页面内的串行写入通道。

## 凭据与读回

查看与清除分别调用 `POST /api/settings/secrets/reveal` 和 `POST /api/settings/secrets/clear`，请求体为对应 Key 当前引用的 `{secret_ref}`。查看读取 `{secret}`，清除需独立确认并读取 `{ok:true}`。普通 Settings 的 422 无效或过期引用触发 GET，用户重新确认后才能再次操作。替换仅提交非空、非掩码的新 Key。

沿用 Session 鉴权和 `no-store`，初始化仅获取凭据元数据。明文只在显式查看后短暂显示，复制由用户触发。隐藏、切换 Provider、打开凭据或地址编辑、离开页面时清理对应明文。凭据编辑使用初始为空的密码输入框，关闭后清理草稿。组件只保留窄 DTO 与临时编辑或查看状态，错误反馈使用固定文案。

写入成功后重新 GET。地址读回只能核对默认或自定义状态，不能核验自定义地址的实际内容。缺少回执或读回不匹配时保留草稿并提示核对。读回失败时先重新读取，期间禁用写入。离开页面会取消客户端等待并丢弃迟到结果，已到达后端的请求仍可能完成。保存回执只反映配置提交。

## Embedding 与 Registry 边界

Speech 仅使用 `siliconflow_tts_url`、`siliconflow_tts_key`、`siliconflow_tts_model`，以及该 Key 独立签发的引用。Embedding 的地址、Key、模型和引用由 C1 独立维护，本页的读取 DTO 和写入体均排除这些字段。原「与 Embedding 共用连接」说明、「管理共享连接」按钮、alias 解析和定位分支均已移除。「API 与连接」继续通过 Settings 首页进入，旧 LLM Connection 仍由原入口管理。

## 文件与职责

| 文件 | 职责 |
| --- | --- |
| `src/components/settings/speech/SpeechSettingsPage.tsx` | 将 SiliconFlow 的地址、模型、Key 分开保存，保留 Provider 草稿及现有凭据组件。 |
| `src/components/settings/speech/SiliconFlowAddress.tsx` | 展示安全地址状态，管理地址修改及恢复默认的系统弹窗。 |
| `src/components/settings/speech/useSpeechSettings.ts` | 将独立地址和 Key 操作接入现有串行请求、读回和反馈。 |
| `src/domain/speech-settings/speech-settings.ts` | C1 DTO 映射、地址校验与读回状态核对。 |
| `src/components/settings/SettingsView.tsx`、`connections/ConnectionsList.tsx`、Registry client／DTO | 移除 Speech 专用跳转和 alias 定位。 |
| `src/domain/speech-settings/speech-settings.test.ts`、`tests/browser/settings-pr5-c-smoke.cjs` | 合成契约、故障注入、凭据生命周期和布局回归。 |

## 验证与人工验收

- 定向 Vitest 72 条通过。全量 Vitest 221 个文件、2,992 条通过。TypeScript、生产构建和 `git diff --check` 通过。
- Speech 浏览器回归 6 组通过，覆盖 Classic／Editorial 各 320px、390px、1440px。验证地址替换及恢复默认、Key 生命周期、过期引用、保存失败与读回失败、Provider 草稿和 Embedding 隔离。窄屏将视口缩至 460px 高并聚焦输入，检查弹窗边界、Toast 遮挡及横向溢出。六组均无外部请求或页面错误。
- Web 浏览器回归 6 组、Connection／MCP 浏览器回归 7 组通过，覆盖两种布局及普通连接管理。
- 手工验收覆盖真机 iOS／Android 软键盘和部署域名的剪贴板权限。浏览器使用本地 Fake API、合成 Key 和 Mock Clipboard。
- 本轮仅交付 Penumbra 工作区变更。未调用真实 Provider，未读取生产配置或凭据，未提交、推送或部署。
