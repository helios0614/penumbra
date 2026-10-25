# Chat PR5-B — 附件、图片预览与真实音乐播放

日期：2026-10-25（Asia/Shanghai）。代码及自动回归完成，**等待人工视觉、设备与真实服务联调验收**。未 commit、push、部署或重启真实后端。

基线：Penumbra `d4d7104cec8eecb5ff34b62dd88126a653ad63c5`，AionHome `bc3cc6c94212d60a95f809c66725b3dd10ac5d14`；开工时两仓库无待处理业务修改。需求依据为 [PR5-A 审计](./chat-pr5-media-audit.md) 和本轮已确认范围。

用户后续明确“无需进行复杂的浏览器视觉验证，人工进行”。因此本轮提供独立可交互合成入口，完成组件/状态/协议自动测试与入口编译检查，**没有把自动断言当成 PC/手机视觉验收，也没有制作或宣称已查收截图**。

## 1. 附件生命周期

```text
Sender 的 + 菜单选择 / textarea 粘贴图片 / Composer 范围拖放
 → 页面按 conversationId 持有 AttachmentDraftStore
 → 立即创建本地 Object URL 预览；逐项上传状态
 → typed uploadMedia → POST /api/upload (FormData.file)
 → 验证成功 DTO 或识别旧 2xx {error}
 → 原 Sender 文本快照 + capture(owner) 的已上传 URL 快照
 → 原 Send Controller / client_msg_id / SSE / HTTP 确认
 → messages.attachments 仍为字符串 URL 数组
 → 公开 HTTP → media mapper → Bubble 的图片/视频/音乐/未知项
```

- 类型保持 JPEG、PNG、GIF、WebP、MP4、WebM、QuickTime，单文件 20 MiB。没有开放 PDF/文本/音频等，没有新增附件数量限制或假百分比。
- `src/domain/media/media-types.ts` 定义 MIME/字节限制，`media-client.ts::uploadMedia` 使用原 API client 的 FormData、Cookie、超时与 AbortSignal；`media-mappers.ts::mapUploadResponse` 不把 HTTP 200 当作必然成功，还验证 URL、MIME、文件名与本地类型。
- `src/application/chat-media/attachment-drafts.ts::createAttachmentDraftStore` 持有 owner、revision、requestId、File、本地预览、上传状态、错误与 server URL。A→B→A 保留页面内草稿；迟到/已移除/已取消的请求不能进入其他会话或复活项目。
- upload 自动开始，失败只允许显式重试；发送失败保留已取得 URL，**不会自动重传/重发，也不会删除服务端文件**。未完成/失败项仍在草稿时不允许悄悄遗漏后发送。
- capture 只接受全部已上传的项目，按 ID 固定本次集合；接受时只释放该集合，后来新选项目不被清空。Object URL 由草稿、提交快照和打开的查看器引用计数持有；移除、删会话、离页及最后一个引用释放时 revoke。
- 页面内存之外没有新增持久化；刷新后不承诺恢复本地 File。历史不编造原文件名或大小。
- `ChatView.tsx` 接入页面 store 与原发送回调，向执行入口带上 expectedOwner 并与实时 Workspace 身份复核：即使 B 已加载、React 仍显示 A 的一帧中触发旧回调，也不能把 A 附件发进 B。`Sender.tsx` 保留文本 revision/IME/恢复机制，仅增加通用附件插槽、选择回调与纯附件发送资格。模型入口仍在原 + 菜单内。
- `chat-send-controller.ts` 仅放开“有附件、无正文”的入口并保存乐观附件快照；`chat-execution-composer.ts` 呈现同一快照。原 UUID、opening/streaming/finalizing/unknown、HTTP receipt、导航保护和 canonical regenerate 均未改写。

## 2. 消息、图片与共享查看器

`src/domain/media/media-mappers.ts::mapMediaAttachments` 在 Domain/UI 边界归一化，组件不猜 raw system 内容。Main user/assistant 附件可展示；system/隐藏角色沿用 PR4 公开投影，不读取其私有附件或 att_json。

安全资源策略位于 `media-resources.ts`：

- 上传图片/视频仅识别旧时间戳文件名和新 UUID 文件名的受限 uploads 路径与已知扩展名；Camera 的 cam_check/core_wake/monitor 名称、screenshots、路径穿越、任意本地 endpoint、data/blob 输入均不从消息 DTO 开放。
- 未知格式仅显示轻量附件提示，不当图片、不生成任意下载/访问入口、不表示 AI 可读。
- Markdown 图片只允许受限 uploads 或通过校验的外部 HTTPS 图片；拒绝凭据、敏感 query、私有本地路径和内网地址。自己 origin 的绝对地址也受本地路径规则约束。
- 草稿 Blob URL 仅由页面资源所有者直接传给共享展示，不进入消息 wire/persistence。

图片展示由 `src/components/media/ChatAttachments.tsx`、`MediaImage.tsx`、`media.css` 完成：

- 单图自然比例、限制最大可视面积，横/竖/长图分别约束；2/4 图两列、3 图首张跨列、更多图片按容器宽度在两/三列之间变化。均使用 contain，**不以 cover 裁掉原图内容**。
- 用户单图靠右、AI 靠左，保留现有 Bubble 元信息、角色边界与正文顺序；图片有轻边缘与柔和圆角，不套厚文件框。
- `Bubble.tsx` 不为纯附件画空文字块；无正文的用户媒体承接原 Reaction 锚点。Thinking、DRIFT、HEART、MCP/系统展示不合并到媒体中。
- 图片加载/失败/重读仅影响对应媒体；`VideoMedia.tsx` 使用真正的 video controls、playsInline、metadata 与失败重读，不用图片代替视频。

`ImageViewer.tsx` / `ViewerStage.tsx` 基于现有 Base UI Dialog：

- 淡暗化遮罩、Paper/Mist 半透明外壳、适屏舞台、可见关闭/缩放/适屏/前后切图按钮；没有复制旧黑底 92% 或大白色表单弹窗。
- 1–8 倍缩放，放大后有界平移；双击放大/适屏，双指缩放、单指拖动、适屏下水平滑动切图。所有手势都有可见按钮替代。
- Escape 交给 Dialog，方向键切图；finalFocus 返回触发点。VisualViewport 高度/offsetTop、安全区、横屏与 Reduced Motion 沿用现有原语及补充几何。
- 查看前触发局部 `chat-media-preview`，复用 Chat 阅读锚点保护；图片动态高度和查看器开关不主动把阅读者拉到底。Dialog 负责 modal 滚动锁，舞台内只平移，不增加竞争滚动条。
- 同一 `MediaImage` 可用于已发送图片、草稿与安全 Markdown 图片；共享 viewer 不知道上传、模型或命令。

交互和几何已自动测试；真实字体、布局、焦点、锁定、iOS/Android 触摸与浏览器返回行为仍须人工验收。

## 3. MUSIC 卡片与真实 Audio

- 持久身份仅来自 HTTP assistant 附件：短 `{type:"music",name,artist,id}`，或已核对的旧 Activity 完整歌曲结构。**不从 system 文本提取 ID，不重搜历史候选**。
- `MusicCard.tsx` 延续旧版紧凑横向封面、歌名/歌手/专辑层级和小按钮，以 Penumbra token 重写。无封面/坏封面显示轻量音乐图标；有可靠 ID 才能播放或打开网易云。
- 点击播放同步调用 Audio.play()，随后才按需调用既有 detail API 补封面/专辑；也可显式读取歌曲信息。detail 的远端 audio_url 不用于播放器、不显示代理信息或 token。
- `src/application/chat-media/audio-controller.ts::createAudioController` 延迟创建真实 HTMLAudioElement，一个 Chat 页面一实例。初始历史/SSE/WS 不加载音频或自动播放。
- loading、waiting/stalled 缓冲、playing、pause、ended、error 和 play Promise 驱动状态。点击本身不产生“已播放”事实，无假波形。失败可显式重试，重新请求按 ID 取新地址的 `/api/music/stream/{id}`。
- 时长/进度来自媒体事件，服务端毫秒 duration 不冒充真实浏览器时长。只有实际 TimeRanges.seekable 有效时开放拖动，目标也必须落在真实可 seek 区间。
- 新歌先停旧歌；source sequence 与 play request 隔离旧 Promise/事件。会话切换、卡片 ID 被 HTTP 更新替换/删除、离开页面都会 pause/清 src/load/清监听。
- `ChatAudio.tsx` 仅提供页面音频 scope；不持有上传、消息生成或 MUSIC 命令状态，不是巨型 Media Provider。旧 `system-command/ResultCard.tsx` 的假播放实现已替换为同一真实卡片适配。
- PR4 的选曲结果继续独立展示；SSE/WS 完整 cards 当前不进入新的补充缓存，更不插入持久消息。canonical regenerate 仍不重放 MUSIC，其附件替换后播放器跟随 HTTP 身份失效。
- 沿用本设备既有音乐音量值；没有新增音量服务、列表、下载或后台播放器，也没有修改 Android 原生后台播放服务。网页状态不代表原生状态。

## 4. AionHome 小范围加固

仅修改两个既有路由，新增两个 helper 和一份合成 contract test；没有改 DB schema、消息保存、Prompt、Provider、命令语法/时序、WS 或认证 middleware。

| 文件（AionHome 根目录下） | 修改 |
| --- | --- |
| aion-chat/routes/files.py::upload_file | 委托 save_validated_upload，保留 multipart 字段、成功 {url,type,name} 与 2xx {error} 兼容 |
| aion-chat/upload_validation.py | UUID + exclusive 创建避免覆盖；64 KiB 有界读取，20 MiB+1 即拒绝；临时文件清理；图片 Pillow 格式核对/verify/首帧解码，MP4/MOV 盒结构/品牌/视频 handler，WebM EBML/DocType/视频轨道/Cluster 检查 |
| aion-chat/routes/music.py::music_stream | 原 GET 路径不变；接收 Request.Range，委托 proxy_music_stream；认证仍由原 middleware 控制 |
| aion-chat/music_stream_proxy.py | 线程池解析新 URL；请求/响应前核对上游状态、audio Content-Type、编码和单 Range；透传真实 200/206 及合法 Content-Range/Length；416、错误类型/状态安全降级；流式转发，结束/取消/错误关闭上游 response/client |
| aion-chat/tests/contract/test_chat_media_io.py | 真实 route 函数抽取 + multipart ASGI、合成图片/容器、MockTransport、取消/资源关闭验证；不导入真实 config/main |

seek 支持具有明确边界：**正确代理支持单 Range 的上游**，不能制造上游没有的能力。上游忽略 Range 就返回真实 200；不假造 206 或 Accept-Ranges。前端仍以真实媒体 seekable 判断。未全量缓存整首音频，未新建搜索或刷新 URL 服务。

容器校验不是完整视频解码/转码/病毒扫描，浏览器仍可能不支持具体编码。stream 只接受音频 Content-Type，未将 JSON/HTML/无明确音频类型的响应猜成可播放资源；真实服务兼容性须隔离联调确认。开始转发后的上游中断无法改写已发出的 HTTP 状态，由浏览器媒体错误反馈，finally 负责清理。

## 5. 验证记录

| 验证 | 结果 |
| --- | --- |
| 前端全量 npm test -- --reporter=dot | **142 文件、2009 项通过** |
| npx tsc --noEmit --pretty false | 通过 |
| npm run build | 通过（含 tsc -b）；保留 Vite 既有大 chunk 提示 |
| 新后端上传/stream contract | **38 项通过**，7 MIME、伪造/损坏/超限、唯一名/碰撞、2xx error、Range/206/416/200、错误类型与取消关闭 |
| 相关后端组合回归 | **173 项通过，包含上述 38 项**；MUSIC 保存/角色、Main/canonical 附件输入、原子 regenerate、frozen send、稳定性、公开投影、materializer、timeline |
| 合成入口编译/可达 | HTML、TSX、fixture 模块及 Viewer/草稿组件本地 HTTP 200；不是浏览器布局验收 |
| Git / 新文件检查 | 两仓库 diff 检查；生成的 tsbuildinfo 恢复，不混入产物；无 commit/push/部署 |

新增前端测试覆盖：MIME/字节/安全 URL、multipart 与 2xx error、草稿 owner/迟到/删除/租约/显式重试、纯附件和 opening unknown 不重发、乐观附件、图片/视频/未知项呈现、纯媒体无空块、viewer 失败/切图/缩放/平移、Audio 真实事件/旧 Promise/seekable/互斥/页面 scope。

后端在专用目录从 Git 导出 **401 个源码/合成 fixture 文件**并覆盖本轮五个文件，明确排除 data、uploads、screenshots、logs、环境配置；未 import 原工作树运行时。隔离安装测试依赖，既有测试仍以模拟模型/音乐运行。Windows GBK 导致的旧测试输出编码失败，使用 Python UTF-8 模式修正后全通过；没有为此修改业务或旧测试。

可复现后端组合文件：test_chat_media_io.py、test_music_result_provider_roles.py、test_main_regenerate_effective_input_characterization.py、test_canonical_regenerate_route.py、test_atomic_regenerate_persistence.py、test_send_frozen_llm_binding.py、test_chat_stability.py、test_chat_public_display.py、test_openai_attachment_materializer.py、test_main_input_timeline.py。不宣称整个 AionHome 测试集通过。

隔离测试源码/依赖位于 `C:/Users/Admin/.codex/visualizations/2026/10/25/01a1718e-e112-7152-bbb2-9f2399f0d009/pr5-regression`、`pr5-python`，与真实后端数据分离。

## 6. 人工验收入口

开发服务器当前入口：[PR5 合成验收](http://127.0.0.1:45345/tests/browser/chat-pr5-media.html)。服务器退出后可在 Penumbra 执行：

```powershell
npm run dev -- --host 127.0.0.1 --port 45345 --strictPort
```

入口源码：`tests/browser/chat-pr5-media.html`、`chat-pr5-media.tsx`、`pr5-synthetic-media.ts`、`media-fixtures/*.svg`。仅开发验收，不加入生产页面路由或构建入口。

320px/390px 可在本机浏览器响应式模式检查；此 localhost 入口只监听本机，不开放局域网。真机联调请使用现有受控测试环境及安全访问方式。

- 包含单横图、单竖图、长图、2/3/4/6 图、短/长正文、纯图片、两种角色、坏图和未知项。
- “添加合成 PNG”/“添加合成视频”或选择/粘贴/拖入测试文件，观察即时本地预览→上传中→已上传；可指定下次上传失败、显式重试、发送明确拒绝后 URL 保留、A/B 草稿恢复。
- 视频由 Canvas + MediaRecorder 生成，不使用摄像头/麦克风；不支持录制的浏览器会明确提示，可自行选择专用测试视频。
- 音频为内存生成的本地 WAV，由真实 Audio Controller/HTMLAudioElement 播放；第二首为故意 404，其他曲验证互斥/暂停/进度/seek/切会话释放。没有远程音频、真实上传、真实 Chat 数据或业务请求；fixture 阻止业务 fetch，歌曲详情因此只验失败兜底。

请人工核对：

1. 桌面、320px、390px、浅/深色及壁纸背景；单/多图构图与正文节奏，头像/动作/Reaction、无空块、视频控件。
2. Viewer 的适屏、长图放大/平移、双指/单指/横滑、前后/关闭、Escape/方向键/焦点、加载失败、软键盘/横屏/安全区；关闭后阅读位置与滚动锁。
3. 上传与发送快照、失败/重试、删除/离页、A/B 切换；在获准隔离后端验证 opening 超时、SSE canceled、HTTP/WS 回填，网络中不应自动重发。
4. 播放/暂停/缓冲/结束/失败、快速切曲、seekable 前后、切会话/离页清理；真实 iOS Safari/Android 的用户手势、编码、系统媒体音量、前后台行为。
5. 配套后端启动后在专用会话验证旧/新 URL 历史、原 user 附件入模型及 canonical 不带其他历史附件；不使用私人聊天或真实生产凭据做自动验收。

本轮未执行真实外部音乐、真实模型/生产后端、PC/手机视觉或真机验证；不能据此保证所有歌曲可播、所有编码可解码或所有设备手势已达标。

## 7. 保留的限制与风险

- **uploads 仍只有应用登录级访问控制，没有会话级附件 ACL。** 前端受限资源策略减少误公开，不是服务器权限隔离；未改附件 ID/所有者模型。
- 上传与 send 非原子；上传成功但未发送、响应丢失、显式重传或进程中断仍可能留孤立文件。未新增 TTL/孤立清理，也不自动删可能已被消息引用的文件。
- 原未知执行状态、同时间戳历史分页缺口、receipt 丢失的保守恢复保持；上传成功不是 AI 已读取，readiness 也不证明远端 Vision。没有静默换模型或重发。
- 历史没有的原名/大小/当时候选不补造；旧非标准资源名保留未知附件提示；Camera 隐藏角色/私有路径不开放。
- 基础播放已接真实 Audio；资源/版权/鉴权/编码/上游 Range 是否可用仍取决于实际环境。桌面其他 mock 音乐小组件不属于本轮 Main Chat 播放器迁移。

以上为本轮可供人工验收的实现；未创建额外 PR、未提交、未推送、未部署。
