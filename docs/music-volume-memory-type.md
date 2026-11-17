# E43 音乐音量 / E06 记忆类型编辑交付

日期：2026-11-17。范围仅 E43、E06；未修改 Final Inventory、单条消息删除或其他确认缺口。未 commit、push、deploy。

## E43：设备音量

- 控件位于 Chat 既有 MusicCard 内，独立一行复用 Slider，不占用歌曲名称和播放按钮所在行。
- 取值 0–100，默认 100；保留既有小数存量读取行为，滑块写入整数百分比。实际 Web 音量为 `HTMLAudioElement.volume = percent / 100`，拖动期间立即应用，不重启音频。
- 浏览器存储沿用 `localStorage.aion_music_volume`，播放、恢复播放及新页面读取偏好；切歌、暂停、播放源逻辑沿用原实现。
- Android 优先读取 `window.AionMusic.getMusicVolume()`，写入 `setMusicVolume(int)` 并镜像到同名 localStorage。真实桥实现位于 AionHome 的 `AionApp/app/src/main/java/com/aion/chat/MusicVolumeBridge.java`：SharedPreferences 文件 `aion_music_prefs`，键 `music_volume_percent`。后台播放器已有偏好监听；不修改系统音量或 Android 源码。
- 桥缺失、方法缺失或抛错时回退 Web 存储；写桥失败后当前 controller 使用 Web 偏好。两种存储均不可写时，当前音频仍能调节，并显示简短的保存失败提示；无法承诺刷新恢复。
- controller 响应既有 `musicvolumechange`、相关 `storage`、`pageshow` 和可见性事件，卸载时解除监听。
- 音量不上传 AionHome；无新增音量 API 或 Settings 表单。

## E06：真实契约与持久化

- 已有 `PUT /api/memories/{id}` 的 `MemoryUpdate` 接受 `type: Optional[str]`，`content` 仍必填；原 SQL 已支持更新 `memories.type`，无需扩展 DTO、API 或数据库结构。
- 编辑弹窗与创建弹窗共用 `MEMORY_TYPE_OPTIONS`：

| 值 | 标签 |
| --- | --- |
| `shared_moment` | 共同经历 |
| `emotion` | 情感时刻 |
| `life_event` | 重要事件 |
| `preference` | 喜好 / 雷区 |
| `promise` | 约定承诺 |
| `milestone` | 关系里程碑 |
| `event` | 事件 |
| `digest` | 总结 |

- 后端类型字段实际为自由字符串，未新增枚举限制。旧名字总结、未知类型、空字符串和 NULL 原值在编辑时保留，用户可以主动选择上表中的类型；未改类型不发送 `type`。
- 链路：MemoryEditDialog → MemoryEditInput → buildMemoryEditDto → PUT → SQLite UPDATE/commit → 既有 `runWrite` 触发 `GET /api/memories?page=…` → 列表和展开正文使用服务端结果。PUT 回执不作为本地数据替换来源。
- PUT 失败保持弹窗与草稿，编辑错误显示实际 HTTP 状态、JSON 字符串 detail（如有）或网络错误类别；认证、校验等沿用现有安全错误映射。PUT 已成功但 GET 失败时沿用既有“列表暂时无法刷新”提示，可仅重试读取。
- 正文保持原字符串，不 trim 后提交；未编辑的重要度和完整关键词不发回，避免用列表截断投影覆盖数据。其他来源、时间、Pin/unresolved、ID、历史关联字段不发送、不改写。
- E06 的后端业务调整：先读取现存正文；正文逐字符一致时不请求 Embedding、不写 embedding 列，保留原向量（包括 NULL/旧异常向量）。正文变化时沿用原 `get_embedding(content)` / `_pack_embedding` 路径及不可用时写 NULL 的既有行为。不存在 ID 保留原成功回执，但不再无效请求 Embedding。
- `type` 不是现有向量输入，没有更新时自动分类或总结的规则。类型展示、搜索、召回及类型对应的来源操作可用性，均沿用既有后端与前端规则；未改召回算法、来源记录、总结锚点或向量治理。

## 实际修改文件

Penumbra：

- `src/application/chat-media/audio-controller.ts`
- `src/application/chat-media/music-volume.ts`（新增）
- `src/application/chat-media/music-volume.test.ts`（新增）
- `src/components/media/MusicCard.tsx`
- `src/components/memory/MemoryEditDialog.tsx`
- `src/components/memory/MemoryManagement.test.tsx`
- `src/domain/memory/memory-management-types.ts`
- `src/domain/memory/memory-management-mappers.ts`
- `src/domain/memory/memory-management.test.ts`
- `src/application/memory-management/memory-management-controller.ts`
- `src/application/memory-management/memory-management-service.ts`
- `src/application/memory-management/memory-management.test.ts`
- `tests/browser/music-volume-memory-type-smoke.py`（新增）
- `docs/music-volume-memory-type.md`（本文）

AionHome（`/Users/remix/Desktop/AionsHome-main`）：

- `aion-chat/routes/memories.py`
- `aion-chat/tests/contract/test_memory_type_update.py`（新增）

## E43 / E06 原轮验证结果

- Penumbra 相关测试通过；最终 `npm test`：225 个文件、3025 项全部通过。
- TypeScript：`npx tsc -b` 通过；最终 `npm run build` 通过（包含 TypeScript 检查）。存在既有大 chunk 提示，本轮未做打包优化。
- AionHome 相关合同测试 145 项通过：type update、create、unresolved、requeue、main memory recall、embedding vector integrity、music volume。新增 type update 测试使用真实 FastAPI 路由和临时 SQLite，外部 Embedding 为桩；验证类型持久化、重复 GET、所有无关列原样保留、旧类型/向量兼容、正文变化才生成向量及失败无部分更新。
- 生产构建浏览器回归：Classic / Editorial × 320、390、1280 像素 × Web、Native 模拟、桥抛错回退，共 18 组。真实浏览器 Audio 播放本机 PCM 音频，检查时间推进、拖动未松手时 volume 已更新、播放不中断、暂停重播及刷新恢复；没有音量写 API。
- 六组 Web 布局同时验证 Memory 类型回填、失败草稿/真实错误、成功后的 GET、刷新保持、未改类型省略、未知/旧名字/空类型保留、40 个关键词和精确重要度/正文保持，以及 360 像素短视口滚动。
- 已目视检查窄屏播放器、桌面/移动编辑弹窗截图；两仓 `git diff --check` 通过。
- 浏览器截图与失败诊断产物：`/private/tmp/penumbra-volume-memory-browser/`。最终成功组覆盖的截图可供人工复核；合成测试不代表真机或生产数据库验收。

复现浏览器测试：先构建，再以空 API/proxy 环境变量启动 `npm run preview -- --host 127.0.0.1 --port 45443 --strictPort`，使用已安装 Playwright 的 Python 运行 `tests/browser/music-volume-memory-type-smoke.py`。脚本使用隔离 Chrome profile 并拦截所有业务请求和外部请求。

## 人工验收与部署

1. Android 真机 WebView：确认真实桥读写、刷新/重进后的偏好、后台播放器对同一 SharedPreferences 的响应及实际听感。
2. 实际使用的浏览器/设备：实际歌曲播放中的触摸拖动、切歌、刷新后的音量与听感。本轮为桌面 Chrome 的移动视口/触摸能力模拟，未验证真实移动设备。
3. 测试环境真实 AionHome 数据库：选现有记忆修改类型，核对刷新及详情、关键词/重要度/来源/Pin/时间/ID 保留；复核真实持久化失败时输入和错误。未访问生产数据库或请求真实 Embedding 服务。
4. 完整交付需要部署 AionHome 的本轮路由改动，才能保证元数据编辑不重复生成 Embedding。原服务器已支持 type 字段，前端类型选择本身无需新 API；无需数据库迁移或 Android 构建。本轮仅准备代码，未执行部署。

完成后停止，等待人工验收。

## 追加：Music 播放链路与音量 UI（2026-11-17）

### 审计结论和真实 API

- 没有发现“Penumbra 必须配置 MUSIC_U 才允许播放”的前置检查。旧 `static/chat.html::playMusicOnline` 与 Penumbra 都把歌曲 ID 交给 `GET /api/music/stream/{id}`，不消费历史中可能过期的 `audio_url`。AionHome 自身的站点会话认证与网易云登录是两套概念，前者继续保留。
- stream 通过 `get_audio_url(id)` → `_ensure_login()` → pyncm `GetTrackAudio([id])` 获取新 URL。未配置 MUSIC_U 使用 `LoginViaAnonymousAccount()`（游客初始化，不要求用户账号）；配置时使用 `LoginViaCookie(MUSIC_U=…)`。本地 pyncm 1.8.1 的实际接口为 `/eapi/song/enhance/player/url`，默认 `br=320000`、`encodeType=aac`。本轮未改 Provider、接口或这些参数。
- MUSIC_U 用于沿用已有账户权限，不保证每首歌曲可播放。配置的 Cookie 登录抛错时，既有链路会失败，并不会转成匿名跨接口回退；这是新旧共同契约，本轮没有新增登录流程。`/api/music/auth-status` 只报告最近登录结果，播放器不以它的 success/failed/unverified 决定 URL 是否有效。
- 新旧差异之一：Penumbra 点击播放会并行请求详情补全；原详情接口也调用 `get_audio_url`，造成重复取链。现在 Penumbra 调用 `GET /api/music/detail/{id}?include_audio_url=false`，仅补充封面/专辑，正常播放不再因此重复取链。后端默认仍为 true，旧调用方仍获得原来的 `audio_url`；详情 Provider 调用放在线程池，避免阻塞异步事件循环。
- 另一差异：旧代理猜测音频格式，新代理此前只接受 `audio/*`。现在仅对 `application/octet-stream` / `binary/octet-stream` 且最终 URL path 明确以 mp3、m4a、aac、flac、ogg、wav 结尾时补充对应音频 MIME。HTML/JSON、无格式路径、仅 query 含 `.mp3` 的响应仍拒绝；保留状态码、单 Range、编码、流式传输和资源关闭校验。
- 用户原反馈的唯一根因没有在真实环境复现。重复取链是确定的调用差异，二进制 MIME 是确定的兼容差异；不能据此断言所有失败都由它们造成。

### 失败、过期链接与手动重试

stream 的失败响应保留原 `error` 字段和 HTTP 状态，新增稳定 `code`，并设置 `Cache-Control: no-store`：

| 错误码 | 含义 |
| --- | --- |
| `music_url_unavailable` | Provider 没有提供 URL；可能涉及版权、地区或歌曲权限，不推断为未登录 |
| `music_url_invalid` / `music_url_request_failed` | URL 地址无效 / Provider 请求失败 |
| `music_resource_forbidden` | 已获取 URL，CDN 返回 401/403；可能权限不足或 URL 过期 |
| `music_resource_unavailable` | 已获取 URL，但 CDN 资源不可用 |
| `music_resource_invalid` / `music_resource_connection_failed` | 非有效音频/编码/长度响应，或音频连接失败 |
| `music_range_invalid` / `music_range_unavailable` | 范围请求或范围响应不可用 |

- `Audio.play()` 仍在用户点击中同步调用，不把异步取链设为首次播放手势的前置步骤。正常播放不新增预检请求。
- 浏览器媒体错误事件无法读取服务器 JSON。发生媒体失败后，每次播放尝试最多诊断一次：同一 `/api/music/stream/{id}`，`Range: bytes=0-0`，15 秒超时；收到成功响应头后取消响应体，即使上游忽略 Range 也不主动下载整首歌曲。无循环、轮询、跨接口回退或自动重播。
- 诊断是失败后重新获取当前链接的检查，不冒充原失败请求的完整追踪。诊断成功显示“音频播放失败；当前链接检查可用”；失败则按链接获取、资源连接/权限等错误分别提示。无法检查时明确显示“暂时无法确认链接状态”。
- 歌名、歌手、专辑和歌曲 ID 保留，仍由用户点击“重试播放”重新播放。重试会走 stream 重新解析 URL，不复用旧 CDN URL；切歌、离页和重试会取消旧诊断，迟到结果不能覆盖新歌曲。
- `get_audio_url` 中既有“空 URL 后重新登录重试一次”保留，没有新增 Provider 重试次数；诊断不代表播放成功，也不改写登录状态。

### 音量样式

仅 `.music-result-volume` 内覆盖：轨道从 6px 调为 3px，视觉圆点从 16px 调为 10px、边框从 2px 调为 1px；主色填充由 65% 降为 45%、圆点边框由 80% 降为 55%，去掉圆点阴影。图标/轨道/百分比居中对齐，保留原 Slider 的 44px 控制高度。设备偏好、0–100 范围、写入、恢复、Bridge 与 Web 回退代码均未改。

### 本次追加修改文件

Penumbra：`src/application/chat-media/audio-controller.ts`、同目录 `audio-controller.test.ts`、`src/domain/media/media-client.ts`、同目录新增 `music-playback.test.ts`、`src/components/media/MusicCard.tsx`、同目录 `media.css`、新增 `tests/browser/music-playback-stability-smoke.py`、本文。

AionHome：`aion-chat/routes/music.py`、`aion-chat/music_stream_proxy.py`、新增 `aion-chat/tests/contract/test_music_playback_stability.py`。未改 `music.py`、`music_auth.py`、数据库、Android 或 E06 业务代码。

### 追加验证与验收边界

- 前端相关测试 59 项通过；全量 `npm test` 为 **226 个文件、3036 项通过**；最终生产构建及其中的 TypeScript 检查通过（仍有既有大 chunk 提示）。两仓 diff 检查通过。
- 后端相关合同测试 **91 项通过**：music playback stability、chat media IO、music auth status、music volume、music result provider roles。覆盖真实 route 的游客/Cookie 分支、原 GetTrackAudio 参数、成功登录但 URL 为空、详情参数默认兼容、受限二进制 MIME、资源错误与清理。初次因环境缺少 `mcp` 无法加载主程序；按仓库要求的 `mcp==1.29.1` 安装到 `/private/tmp/music-stability-backend-deps` 后复跑通过，未修改仓库依赖或既有虚拟环境。
- 新浏览器脚本：生产 Classic / Editorial × 320/1280，共 **4 组通过**。使用合成 HTTP/CDN 和真实 HTMLAudioElement，验证取链失败/Provider 失败/403/解码失败、无自动重播、手动重试、信息保留、metadata-only 参数、音量即时生效及桥抛错回退；检查 3px/10px/44px 尺寸与垂直对齐。截图位于 `/private/tmp/music-playback-stability-browser/`，已目视核对。
- 原 E43 浏览器矩阵复跑 **18 组通过**，覆盖普通浏览器、Native 模拟及异常回退，刷新/重播恢复，并回归既有 Memory 编辑功能。Native 模拟不代表 Android 真机。
- **真实匿名联调**：独立进程、全新 pyncm Session，未读取 AionHome 配置或使用 MUSIC_U。歌曲 ID `33894312`、`347230` 均返回 code 200 和非空 URL；随后 CDN 的 `bytes=0-0` 请求均返回 206，Content-Type 分别为 `audio/mpeg`、`audio/mpeg;charset=UTF-8`。只检查响应头即关闭，未保存音频、Cookie 或原始 URL。该结果仅代表本次、这两首歌和当前网络；没有复现它们的 MIME 拒绝问题。
- **尚待人工验收**：真实 MUSIC_U 对应账号/权限下的取链与失效凭据、用户原先失败的具体歌曲、真实 Android WebView 的前后台播放与触摸/听感。带凭据分支仅做合同测试，未使用真实账户凭据；未进行生产服务端到端或真实 Android 验收。
- 要获得 metadata-only、结构化错误与 MIME 兼容，需一并部署本次 AionHome 改动；旧后端仍可播放，但会忽略详情参数且只能给出通用诊断错误。无需数据库迁移或新登录流程。

本次未 commit、push、deploy；完成后停止，等待人工验收。

### 20 秒试听验收口径补充

- 用户确认：Provider 返回的 20 秒试听也是可接受的播放结果。现有 `get_audio_url` 只取非空 URL，不过滤 `fee`、`payed` 或 `freeTrialInfo`，无需新增试听播放逻辑。播放器使用实际音频 duration，片段正常结束显示“播放完成”，不自动重试或尝试获取试听之外的音频。
- 针对截图歌曲 `Seve (Radio Edit)` / `36390008` 的隔离匿名检查：Provider 返回 code 200、非空 URL，`freeTrialInfo.start=0`、`end=20`；CDN 范围请求返回 206 和 `audio/mpeg;charset=UTF-8`。这里只核对了 URL、试听元信息和 CDN 响应头，未宣称已在远端 AionHome 或真机播放验收。
- 新增合同测试覆盖游客/Cookie 两种模式下直接转发带付费标记的有效试听 URL，且不额外重新登录；前端测试覆盖实际 20 秒 duration 和正常结束，不将试听结束误判为失败。追加相关后端测试为 93 项通过；前端相关测试为 60 项通过，TypeScript 检查通过。
- 本次只补测试与文档，不新增业务分支。远端仍须部署此前准备的 AionHome 改动；用户接受试听不代表授权部署。本次未部署、commit 或 push。

### SSH 只读复查（2026-11-17）

- 用户提供的新响应已有 `music_url_unavailable`，远端运行文件指纹也与本地 `music.py`、`music_stream_proxy.py`、`music_auth.py`、`routes/music.py` 一致；本轮音乐后端改动已由用户侧部署生效，不再属于旧版本缺失错误码的情况。
- SSH 查询确认 `aion-chat.service` 正常运行，Python 3.12.3、pyncm 1.8.1。用户通过已登录页面提供的运行状态为 credential / success，检查时间为 `2026-11-17T03:00:49.227225Z`；登录成功与歌曲 URL 可用性继续独立判断。
- 服务进程有 HTTPS SOCKS 代理，而普通 SSH shell 没有代理环境。使用远端独立进程、与业务相同的 pyncm 全局 Session 方式，对比直连/服务代理 × 匿名/现有 MUSIC_U 四种组合：全部登录成功；`36390008` 均返回 code 200、非空 URL，匿名为 20 秒试听，Cookie 为 30 秒试听。记录的代理请求确实经过代理；本次未复现代理导致的取链失败，不能把代理差异认定为根因。
- 用户随后在实际页面重新获取也已成功。历史消息只提供歌曲 ID，每次点击重新取链；消息日期本身不会令播放器复用前天的 URL。
- 本次只能确认失败是间歇性的：失败当时 `get_audio_url` 没有解析到 URL，但没有保留当时 Provider 响应结构，因此尚不能区分临时无 URL、运行中会话差异或响应格式变化。pyncm 存在返回 `abroad/result` 包装的分支，当前成功对照均为顶层 `code/data`；未捕获原失败响应，不能将包装差异认定为本次原因。
- 远端排查没有修改文件/配置、没有重启或部署服务，凭据及完整 URL 未输出。未新增自动重试或跨接口回退。若后续复现，应采集脱敏的 Provider 顶层字段、状态码及 URL 是否存在，避免记录 Cookie、MUSIC_U、账号资料或完整 URL。
