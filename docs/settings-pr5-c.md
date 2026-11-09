# Settings PR5-C · 语音服务

## 基线与范围

Penumbra 从干净的 `main`、`afee2ccd3bae8d871fb4be406ce4634463c644f2` 开工，PR5-B 的 Web 页面与导航简化均已提交。AionHome 从干净的 `refactor-code-main` 核验，HEAD 为 **PR5-B0 `6a79a1251c2f9fea692843a8e5463943974b46c7`**。语音凭据清除依赖该提交或兼容后续版本的保存与发布顺序。

本轮以 PR5-A 审计、PR5-B Web 和现有 Connection 为基础。后端复核限于普通 Settings 投影和保存、Speech 地址消费、Registry alias。两套桌面的 Settings 首页均在「服务集成」下直达「语音服务」。主玻璃面板内用细分割线区分 TTS 与 ASR。Provider 由系统 Select 选择，当前配置和 Key 分开保存，ASR 有自己的保存操作。

## 字段与默认值

| 区域 | 普通 Settings 可写字段 | 代码默认值 |
| --- | --- | --- |
| TTS Provider | `tts_provider` | `minimax`，可选 `siliconflow`、`elevenlabs` |
| MiniMax TTS | `minimax_tts_url`、`minimax_tts_model`、`minimax_tts_key` | `https://api.minimax.chat/v1`、`MiniMaxAI/MiniMax-User` |
| SiliconFlow TTS | `siliconflow_tts_model` | `FunAudioLLM/CosyVoice2-0.5B` |
| ElevenLabs TTS | `elevenlabs_tts_url`、`elevenlabs_tts_model`、`elevenlabs_tts_key` | `https://api.elevenlabs.io`、`eleven_multilingual_v2` |
| MiniMax ASR | `minimax_asr_url`、`minimax_asr_model`、`minimax_asr_key` | `https://api.minimax.chat/v1`、`MiniMaxAI/Speech-01` |

`elevenlabs_tts_output_format` 只读，空值展示 `mp3_44100_128`。界面说明当前音频响应、缓存及分段合成都固定使用 MP3。默认地址和模型作为提示，只有用户编辑并保存时才写入。保存模型空串可回到服务端默认值。ASR 页面管理服务配置，录音、麦克风权限、唤醒词和通话仍由各自运行链路负责。

## API、地址和凭据

- **读取。** `GET /api/settings` 只投影上述服务字段、只读输出格式及三个 `credentials[field]:{configured,masked,secret_ref}`。未知或空的 Provider 值按后端 getter 的 MiniMax 回退显示。模型和地址的有效默认值来自当前后端代码。缺字段或不符合契约时提示重新读取。
- **配置保存。** `PUT /api/settings` 只提交一个操作需要的变化字段。Provider 请求仅有 `tts_provider`。TTS 的 MiniMax、SiliconFlow、ElevenLabs 配置草稿分别保留，ASR 独立。Key 替换发送对应单字段的新值，拒绝空白和掩码。所有写入要求 `{ok:true}`。
- **显式凭据操作。** `POST /api/settings/secrets/reveal`、`POST /api/settings/secrets/clear` 都提交该目标当前快照的 `{secret_ref}`。查看读 `{secret}`，清除要求 `{ok:true}` 并读回。普通 422 `Secret reference is invalid or stale` 触发重新读取，用户核对后再操作。一次清除确认最多提交一次。
- **地址投影。** `settings_secret_projection.py` 会把历史 Speech 地址原样放进 GET，`config.py` 的地址 getter 取保存值或默认值。路径可能含认证信息，仅靠 URL 解析无法识别。因此前端把历史地址转换成「使用默认地址」或「已配置自定义地址」，原始 URL 不进入页面 DTO、输入初始值、错误文案或 Toast。针对 userinfo、query 和路径 token 做了合成验证。
- **更换地址。** URL 输入留空时省略该字段。显式替换仅接受 HTTPS 基础地址，拒绝 userinfo、查询串、片段、反斜杠和空白／控制字符。支持用户主动填写代理路径，路径段是否包含凭据须由用户确认。地址更换有独立确认，显示新目标的 origin，并说明现有 Key 会随请求发往新地址。MiniMax TTS／ASR 通过 Bearer 发 Key，ElevenLabs 使用 `xi-api-key`。换地址的请求只包含编辑的配置字段，保留 Key。读回在丢弃原始地址前核对本次写入值。
- **临时值。** 普通请求复用 Session 与 `no-store`，仅固定错误分类进入页面。共用 Web 的系统凭据控件，Key 密码输入从空值开始，明文仅在主动查看后短暂展示。复制通过主动操作触发。隐藏、换 Provider 或离开页面时清理对应明文，编辑关闭或收到保存回执时清理 Key 草稿。失联时可在原弹窗核对安全元数据并保留未确认的新 Key。

## 保存与共享连接

页面内普通 Settings 请求共用一条执行通道。Provider 在读回后显示确认值，切换失败时仍显示可确认的旧值。普通配置收到成功回执且读回匹配后清理本区草稿。结果不明时读取当前状态、保留待核对草稿，下一次写入由用户发起。若读回失败，保留上次读取的快照并禁用写入直到重新读取成功。离开页面中止等待并丢弃迟到响应。

「管理共享连接」通过现有 Settings 返回栈打开 API 与连接。目的页从 Registry 安全列表读取 `profile_aliases["legacy:siliconflow"].connection_id`，只接受同一响应中存在的连接 ID，定位并展开该行。缺失、畸形或悬空引用时显示「尚未确认共享连接」并保留列表。名称、地址及 ID 形状均不参与推断。Speech 只保存 SiliconFlow TTS 模型。共享地址和 Key 由 Connection 管理，现行 TTS／Embedding 对共享 URL 和 Key 的消费独立于 Connection 的 enabled、transport 和默认模型。

## 文件与职责

| 文件 | 职责 |
| --- | --- |
| `src/components/settings/speech/SpeechSettingsPage.tsx`、`useSpeechSettings.ts` | 页面分区、Provider 草稿、地址确认和串行写入／读回。 |
| `src/domain/speech-settings/speech-settings.ts` | 字段映射、默认值、安全 URL 投影和窄写入体。 |
| `src/components/settings/SettingsCredentialActions.tsx`、`src/domain/service-settings/settings-client.ts` | 从 Web 提取的普通凭据操作与 Session/no-store 请求和脱敏。 |
| `src/components/settings/web/WebSettingsPage.tsx`、`src/domain/web-settings/web-settings-client.ts` | 改为使用上述共享部分，保留 Web 的独立业务状态。 |
| `src/components/settings/SettingsView.tsx`、`connections/ConnectionsList.tsx`、Registry client／DTO | 首页直达、真实 alias 投影与目的页定位。 |
| `src/domain/speech-settings/speech-settings.test.ts`、`tests/browser/settings-pr5-c-smoke.cjs` | 合成 DTO、地址安全、连接定位、配置与凭据生命周期回归。 |

## 验证与人工验收

- TypeScript 与生产构建通过。Speech／Web／Registry 定向 **55 条**通过。全量 Vitest **221 个文件、2,993 条**通过。
- Speech 浏览器矩阵 **6 组**通过，覆盖 Classic／Editorial 各 320、390、1440px。验证 Provider 切换与草稿、三组独立凭据生命周期、URL 脱敏与换址确认、串行写入、丢失响应与迟到 Reveal、共享连接定位和缺失回退。窄屏把视口压至 460px 并聚焦密码输入，检查弹窗与页面边界。六组均无页面错误、外部请求或横向溢出。
- 共享控件抽取后的 Web 浏览器回归 **6 组**及 Connection／MCP 资源页回归 **7 组**通过。
- 本页保存回执表示配置提交和可确认的读回结果。凭据元数据无法验证明文是否等于某份草稿，也不代表服务连通。当前普通 Settings API 无 CAS，另一个会话可在确认和写入之间更改配置。离开页面只取消客户端等待，已到达后端的请求可能完成。
- 真机 iOS／Android 软键盘、部署域名剪贴板权限和目标 HTTPS 代理的实际适配待人工验收。测试只使用 Fake API、合成凭据和 Mock Clipboard。既有 TTS 合成、音色列表和远端转写接口均未调用。Voice → Main 及语音完整闭环另行验收。
- AionHome 工作区保持干净。仅交付 Penumbra 工作区变更，未 commit、push 或 deploy。
