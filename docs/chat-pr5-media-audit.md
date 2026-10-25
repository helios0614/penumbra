# Chat PR5-A — 附件、图片与音乐媒体链路审计

日期：2026-10-25（Asia/Shanghai）。状态：**只读审计完成，等待确认 PR5-B 实施方案**。

本轮仅新增本文。未修改业务文件，未 commit、push、部署、启动后端、调用业务 HTTP/WS、上传文件、远程搜索或播放音乐。未读取真实聊天数据库、上传目录内容、截图、运行日志、`.env` 或生产凭据。以下是源码结论，不是在线资源或真机可用性证明。

## 0. 基线与不可变契约

| 仓库 | 当前 HEAD | 开始时状态 |
| --- | --- | --- |
| Penumbra，`D:/Desktop/zhi/penumbra` | `6a1ec7f6b4d9e7dbd45d5cb648c8bdd7106757fa`，`style(chat): simplify capability result details` | main，工作树与暂存区干净 |
| AionHome，`D:/Desktop/zhi/AionHome` | `bc3cc6c94212d60a95f809c66725b3dd10ac5d14`，`fix(chat): improve legacy system notification recognition` | 工作树与暂存区干净 |

Git 所有权检查使用单次命令配置，未修改全局配置；AionHome status 在沙箱内失败，随后通过获准的只读命令完成。下文 **P:** 指 Penumbra 根目录，**A:** 指 AionHome 根目录，行号对应以上工作树。

已对照 PR0 审计、`chat-pr1-contracts.md`、`chat-pr2-ui.md`、`chat-daily-ui-followup.md`、`chat-pr3-conversations.md`、PR4 capability/implementation/visual-polish 文档、`chat-stability-audit-and-fix.md`，以及 AionHome 的 AGENTS、runtime-model 和 refactor-master-plan。旧文档的旧机器绝对路径不作为当前源码位置。

本轮关联 PR5-A，不改变运行时行为。PR5-B 必须保持：

- HTTP history 是持久化权威，Main 使用 `public_view=true`；SSE 仅临时展示，WS 仅失效通知。
- send 先保存 user，再准备上下文并返回 SSE；响应头前失败也可能已写入。客户端 canceled/abort 不证明后端取消。
- PR2 的 onSend 返回 true 表示打开执行响应或收到 duplicate acknowledgement，**不是生成完成或最终保存确认**。接受前保留提交快照，接受后不因断流自动复活待重发草稿。
- canonical regenerate 使用原目标 endpoint，保留 ID/created_at、目标快照/冲突、start/persisted receipt/HTTP 比对；不用旧页面 DELETE + legacy regenerate。
- 未知只读恢复、发送/导航保护、不自动重试 send/regenerate；进程内短时 client_msg_id 去重不等于持久幂等。
- DRIFT/Thinking、分页 `created_at < before`、owner/sequence/AbortSignal、近底部跟随/阅读锚点保持。PR4 系统能力、MCP/JsonViewer、Camera 公开边界保持。Main/Diary 不合并控制器或存储。

依据：`P:src/application/chat-send/chat-send-controller.ts:145,326,370`、`chat-regenerate-persistence.ts`；`P:src/domain/message/message-client.ts:18`；`A:aion-chat/routes/chat.py:1050,1154,2688,3719`、`regenerate_contract.py:163`、`chat_public_display.py:146`。

## 1. 附件端到端调用链与真实 API

### 1.1 旧页面已有链路

```text
fileInput / paste
 → handleFileSelect / paste handler：FormData(file)
 → POST /api/upload
 → {url,type,name} 放入全局 pendingAttachments
 → renderPreview：上传后的服务器 URL
 → send：pendingAttachments.map(a => a.url)
 → POST /api/conversations/{conv_id}/send，attachments:string[]
 → messages.attachments JSON 字符串
 → AI 输入：选定用户附件，从 UPLOADS_DIR 读字节并编码
 → GET history：attachments JSON 数组
 → renderAttachments：图片 / 视频 / MUSIC capsule
```

旧页面不是“先本地预览再上传”：选择文件后顺序上传全部，最后刷新预览；粘贴逐个上传后刷新。没有附件 FileReader/Blob/Object URL 预览。input 为 `accept="image/*,video/*" multiple`，无 capture。删除预览只移除内存引用。

来源：`A:aion-chat/static/chat.html:1411,1440,4050,4844,4950,4966,4985` 的 handleFileSelect、send、renderAttachments、renderPreview、removeAttachment。

### 1.2 Penumbra：字段已有，端到端用户链未接通

| 环节 | 状态 | 源码事实 |
| --- | --- | --- |
| 选择/粘贴/拖放/拍照 | **缺失** | Sender 无 file input、附件按钮/回调或文件状态；+ 是会话工具，目前装 MainModelSelection。不是完整上传逻辑仅禁用 |
| 本地预览 | **缺失** | 无 Chat File/Blob/Object URL 生命周期 |
| 上传基础 | **部分完成** | UPLOAD_URL 默认 /api/upload；api.ts 支持 FormData、credentials、timeout/abort；无 Chat upload client/DTO/controller |
| send 字段 | **部分完成** | SendMessageInput.attachments、request mapper、generation 透传已有；ChatView.sendMessage 实际只传 conversationId/content |
| 纯附件发送 | **缺失** | Sender handleSubmit/canSend 和 Send Controller 均要求非空 trim 文本；旧页面/后端可空正文配附件 |
| 历史读取 | **已有** | Message Domain 保留 attachments:JsonValue[] |
| 附件展示 | **缺失** | Main presenter 每项映射 unsupported；Bubble 仅 Paperclip + 附件暂不支持 |
| 会话草稿 | **部分完成** | 页面内按会话 ID 的 Map 已有；SenderDraft 只有 value/recoveryDrafts |
| AI/历史/regenerate | **部分完成** | 后端已有路径，新前端尚无完整可用链 |

证据：`P:src/components/chat/Sender.tsx:21,145,201`、`composer-draft.ts:1`、`ChatView.tsx:77,210,380`、`chat-ui-types.ts:2`、`Bubble.tsx:243`；`P:src/application/chat-execution/chat-execution-types.ts:4`、`chat-execution-request.ts:14`；`P:src/application/chat-send/chat-send-request.ts:11`、`chat-send-controller.ts:326`；`P:src/lib/api.ts:10,171,391`、`runtime-config.ts:1`；`P:src/components/chat-workspace/presentation/chat-message-presenter.ts:87`。

补充呈现缺口：`Bubble.tsx:29::splitIntoChunks` 对空正文返回单个空字符串，因此只解除纯附件发送 guard 仍可能画出空文字气泡。实施时须同时处理纯图片/音乐消息的空正文、媒体和 Reaction 锚点，保留真正的生成等待气泡。现有正文在 Markdown 解析前分块，不应借媒体迁移整体重写分块契约。

### 1.3 草稿与资源生命周期

- 旧 pendingAttachments 是全局数组，selectConv:3943 不隔离附件；上传完成无 owner 校验，A 的文件可能带到 B。send:4050 在请求前清空数组，失败无完整附件恢复。
- 新 ChatView 按 ID 存文本草稿、Sender 按会话 key 挂载、删除会话清草稿，但附件未建模，不能称已正确隔离。离页/刷新不保存 Map。
- 推荐页面持有按 conversationId 的附件草稿，每项区分 File、preview Object URL、upload 状态、server URL、错误、提交快照；回调核对 owner/item/revision。切换期间取消客户端等待或使旧响应失效，不能放进新会话，不建后台队列。
- File/Blob 是本机字节，Object URL 是浏览器临时句柄，上传 URL 是服务器定位符，已发送 attachment 是消息中的持久引用；不能把 blob: URL 写进 send/history。
- 移除/替换/删会话/页面卸载释放 Object URL；A→B→A 仍保留的草稿不能因 Sender 子组件卸载误 revoke。预览/提交快照还持有时不能提前释放。
- 推荐沿用页面内恢复；刷新后恢复本地 File 需要另定持久化与隐私契约，不能把 File/blob: 字符串存 localStorage 冒充完成。

## 2. 文件类型、大小、权限与存储契约

### 2.1 POST /api/upload

`A:aion-chat/routes/files.py:199::upload_file`：multipart 字段 file；按 UploadFile.content_type 对照 `config.py:444::ALLOWED_TYPES`。

| 项目 | 真实行为 |
| --- | --- |
| 图片 MIME，**已有** | image/jpeg、image/png、image/gif、image/webp |
| 视频 MIME，**已有** | video/mp4、video/webm、video/quicktime |
| 其他文件，**缺失/需后端** | PDF、文本、Word、压缩包、音频、SVG、HEIC/HEIF 不在白名单；改 accept/扩展名不能开通 |
| 大小 | 最大 20*1024*1024 bytes，等于上限允许；先 await file.read 全读内存，再判定 |
| 数量/合计大小，**缺失** | 单文件 upload；MsgCreate.attachments 无数量/合计字节上限 |
| 成功 DTO | {url:"/uploads/<server-name>",type:<声明 MIME>,name:<原 filename>}；无 id/size/conv_id/owner/expiry |
| 拒绝 DTO | 类型/超限返回 {error:...}，未显式非 2xx；不能只看 HTTP ok |
| 命名/保存 | 毫秒时间戳 + mimetypes.guess_extension，.jpe 特判 .jpg；DATA_DIR/uploads，直接 write_bytes；无图片转码/缩略图/EXIF 处理 |
| 内容校验，**缺失** | 信任声明 MIME，无签名/解码验证；服务器扩展名不证明实际内容 |
| 上传提交/清理，**缺失** | 无临时状态、消息绑定事务、TTL、孤立回收、附件删除 API |

毫秒名并发同类型上传有覆盖风险；全读后判断也不是可靠内存上限。推荐开通真实入口前评估小范围后端加固。

`GET /api/files`、`GET/PUT /api/files/{conv_id}` 管理 Chat Markdown 导出，不是附件 registry。export_conversation/parse_chat_file 只导出/重建正文等文本，不恢复附件 metadata，不能作为附件备份恢复。

### 2.2 资源读取和权限

- `A:aion-chat/main.py:255::auth_middleware` 保护 upload 和 uploads；uploads 不在 auth exempt，`:300` 挂载 StaticFiles。是登录下静态资源，非匿名/预签名链接。
- upload 不接收 conv_id；send 仅收字符串列表，未验证上传来源/文件归属/存在性/会话绑定。现有是应用登录级权限，**没有会话附件 ACL**。
- 同源 img/video/audio 使用现有 Cookie；登录 Cookie HttpOnly、SameSite=lax（main.py:356）。API fetch credentials=include 不自动解决媒体元素的跨 origin Cookie/部署问题。
- `P:src/config/dev-proxy-config.ts::createDevProxyConfig` 已代理 /api、/uploads。需统一资源 URL adapter；不能把相对路径误指向另一前端 host，不能接受未知 scheme/任意远程对象。
- 无附件专用下载接口、原文件名 Content-Disposition 或刷新访问 URL 接口。稳定路径在磁盘存在且登录有效时可重新 GET；文件丢失不能刷新签名恢复。
- 删除草稿引用、消息、会话不删除上传文件。`routes/chat.py:1038,1109` 只删 DB/导出等记录；send 失败时不得自动删文件，消息可能已接受或文件仍被引用。

### 2.3 现有文档与实现冲突

`P:docs/chat-ui-reference.md:143` 的文本/PDF、最多 5 个、视频后续是设计意向，**不符合当前白名单/数量行为**。20 MiB 是真实限制，5 个不是服务端已有契约。

实施前需确认：推荐 PR5-B 迁移现有图片/视频，普通未知历史项轻量兜底。若要求 PDF/文本上传并供 AI 读取，需后端提取/输入/校验/元数据支持，不能默认为纯前端迁移。新的 UI 数量限制也需作为产品决定确认。

## 3. Penumbra 现有媒体组件清单

| P: 源码 | 已有能力 / 推荐复用 |
| --- | --- |
| src/components/chat/Sender.tsx、ComposerToolsMenu.tsx | 文本/IME、提交快照、工具插槽、响应式；扩展通用选择回调/预览插槽，上传业务仍归 Main |
| ChatView.tsx、composer-draft.ts | 页面内会话草稿基础，尚无附件 |
| Bubble.tsx、BubbleSegment.tsx、bubble-surface.ts | 用户右/AI 左、正文动作/Reaction、85% 宽度约束与 Paper/Mist；保留骨架，图片不重复套文件框 |
| chat-ui-types.ts、Main presenter | 当前只有 unsupported VM；需在适配边界归一化，不能把 raw JSON 直接给媒体组件 |
| MarkdownRenderer.tsx:165 | AI Markdown/GFM 原生 img，仅宽度/圆角/间距；可复用渲染管线，无预览/加载/失败管理 |
| src/components/ui/dialog.tsx、dialog-styles.ts、dialog-layout.css | Base UI modal/focus、Mist、柔和遮罩、28px 圆角、dvh/safe-area、44px 关闭与 Reduced Motion；图片预览基于它组合 |
| ui/button.tsx、popover.tsx、scroll-area.tsx、toast.tsx | 直接复用；持续错误留对应项，Toast 不替代上传/播放状态 |
| src/lib/api.ts、runtime-config.ts、config/dev-proxy-config.ts | typed upload/music/resource adapter 基础；不在 Bubble 散落 fetch |
| chat/system-command/ResultCard.tsx:16 | MusicResultCard 紧凑布局/文字/aria-label；播放只 setPlaying，必须替换 |
| chat/types.ts:19、system-command/message-capabilities.ts | 旧 MusicAttachment/guard；缺 cover/duration/candidates，不是完整音乐 Domain |
| widgets/MusicWidget.tsx、desktop-v2/EditorialPanels.tsx::NowPlaying | mock 或本地布尔状态，无真实音频控制可复用 |
| components/settings/SettingsView.tsx | 壁纸 Object URL 释放可参考；不是通用图片 viewer，不能借其存储保存聊天草稿 |

**没有成熟独立附件/媒体模块、通用 ImageViewer 或公共 Audio Controller。** 音乐卡片仍归 system-command，仅导出，当前 Main 无消费者；getMusicAttachments 无 Main 接线。旧 useChat.ts 使用 MOCK_MESSAGES，不是实际 Main 控制器。

图片直接复用 Bubble/Markdown、Dialog、Button/ScrollArea/Toast 和 token；适屏、放大、平移、切换/手势需小型共享组合补齐。Main/未来 Diary 可复用展示，不合并消息控制器。

## 4. 旧前端与新前端能力差异矩阵

| 能力 | AionHome 旧前端 | Penumbra Main | 判定 |
| --- | --- | --- | --- |
| 选择/多选 | input 接 upload；Android WebView chooser 桥 | 无入口 | 新版 **缺失** |
| 粘贴图片 | 上传后预览 | 无 | **缺失** |
| 拖放/专用拍照 | Chat 未见处理，无 capture | 无 | **缺失**，系统 chooser 不保证拍照 |
| 草稿预览 | 上传后 80x80 cover，无进度 | 无 | **缺失**，本地即时预览两边均未完成 |
| 纯附件发送 | 已有 | 双重非空文本 guard | **缺失** |
| 会话附件草稿 | 全局数组，有串会话风险 | 只有文本隔离 | **部分完成** |
| 历史图片/视频 | URL 展示，视频依扩展名判断 | 不支持提示 | 新版 **缺失** |
| 单图/多图 | 单图保比例；两列 4:5 cover | 无附件图片 | **缺失**，需重新设计 |
| 点击预览 | 黑底适屏、关闭/Escape/Back、焦点/滚动恢复 | 无 | **缺失**，复用 Dialog 补齐 |
| 放大/平移/切图/手势 | 未见应用级实现 | 无 | **缺失** |
| 图片加载/失败/下载 | 缩略图 lazy，无完整失败/下载交互 | Markdown 原生 img | **部分完成** |
| Markdown 图片 | formatMsg 转义纯文本，不渲染 Markdown 图片 | AI img 已有，用户纯文本 | **已有基础**，无统一预览 |
| MUSIC 结果 | capsule + system 文本；临时完整卡片 | PR4 折叠结果，attachment 不支持 | **部分完成** |
| 在线真实播放 | 全局 audio + stream | 旧卡片布尔状态，无 Main 接线 | 新版 **缺失** |
| 候选项 | 可展开；点击打开网易云 | 无 | **缺失**，旧版非站内换曲 |
| 进度/音量 | 顶部 range；MusicVolume；无可见时长/错误 | 无真实音频 | **缺失**，可靠 seek 需后端 |
| 普通文件 | 后端不接收；旧 renderer 易误当图片 | 不支持提示 | **需要后端配合** |

Android 源码：`A:AionApp/app/src/main/java/com/aion/chat/WebViewActivity.java:227::onShowFileChooser` 使用 params.createIntent/EXTRA_ALLOW_MULTIPLE，ActivityResult 处理多 URI/取消，异常 Toast；无专用拍照 Intent。旧 HTML 无 iOS 专用附件适配。Penumbra 的 Safari IME 保护不等于附件适配。

## 5. 图片显示、预览与专门视觉交互对照

### 5.1 五种来源分别处理

| 来源 | 已有事实 / 实施边界 |
| --- | --- |
| 用户已发送图片 | DB string[]，public user history 保留；typed adapter 确认可展示资源，不把任意 string 当图片 |
| 草稿本地图片 | Penumbra 缺失；File/Object URL 仅本地；预览失败与上传失败分开 |
| 历史图片 | 通常只有 URL，无持久 MIME/name/size；受限历史格式适配仅作呈现提示，扩展名不证明内容安全或 AI 支持 |
| 后端/系统图片 | 未见 Main 公开 DTO 中独立通用生成图片结果；Camera 有内部采集素材，不从 raw tool/system/截图路径构造图库 |
| Markdown 图片 | AI 默认 img，用户纯文本；未启用 raw HTML。使用同一呈现/预览原语，保留正文位置和 URL 限制，不为隐藏字段启用图片 |

Camera：`A:aion-chat/reply_result_execution.py:49::execute_camera` 同时写 uploads/screenshots 并返回内部 tool attachments；`camera.py:680`、`schedule.py:796` 也用 uploads。**仅凭 /uploads/ 前缀不能判定公开授权。** `chat_public_display.py:146::project_message` 清空 system/隐藏角色附件，att_json 等私有列不在公开 allowlist。现有静态读取仍是登录级权限，非逐图 ACL；前端不能扩大素材可发现性或猜链接。

### 5.2 旧图片 UI 仅作功能参考

已核对 `A:aion-chat/static/chat.html:550–575,1419,4844–4947` 的 HTML/CSS/事件：

- 草稿 80x80 cover、删除目标仅 20px；多图两列 4:5 cover，可能裁掉横图/长图重要内容。
- 单图 max 260x260、宽高 auto；附件放在正文/语音之后，不支持段落锚定混排。
- 预览黑色 92% 背景、图片 contain；手机 dvh/safe-area；点击背景/关闭、Escape、浏览器 Back；保存 scrollTop 并还原焦点。
- 无应用级放大/平移、组内切图、触摸手势、加载/失败/下载。浏览器本身缩放不算 viewer 已实现手势。

保留关闭/焦点/滚动行为契约，**不照搬旧图片视觉**。

### 5.3 PR5-B 必须遵守的设计方向（非最终 UI 稿）

1. **重新设计图片气泡。** 沿用用户右/AI 左、头像元信息和正文节奏。单图自然比例并限视口；横/竖/长图分别验证。多图响应式布局，不为同一卡片比例强行 cover；必要缩略图裁切须与完整原图查看区分，不套厚文件框。
2. **正文与图片关系。** 当前只有 content + attachments，无段落锚点。先保持稳定正文/附件组顺序，覆盖空正文、长文、多图和两种角色；Markdown 图片保留正文位置，不发明富文本存储契约。
3. **共享预览基于 Dialog。** 暖背景、雾蓝/角色 token、半透明 Mist、柔和圆角/过渡；不用旧黑底或大白表单弹窗。图片舞台 fit/contain，工具轻量浮置；长图提供放大阅读空间。
4. **完整操作。** 适屏、放大/还原、放大后平移、同组切图、关闭；PC Escape/方向键/可见按钮、焦点圈与返回；手机切图/放大/平移手势及不依赖手势的等价操作。与页面缩放、纵向滚动的冲突须真机检查。
5. **真实状态。** 缩略图与原图分别加载/失败；轻量占位、alt、失败/显式重试。资源不可访问不删消息、不重传。原图/下载用同一认证资源边界，无可靠原名/大小不编造。
6. **滚动/视口。** Base UI modal/focus，关闭恢复阅读位置，卸载释放锁；VisualViewport、安全区、横屏、键盘、浏览器返回验收。图片迟到加载不能破坏 PR3 锚点或强制跳底。
7. **共享原语，分开业务。** 图片展示/viewer 不拥有上传或生成；复用 Toast/Dialog/ScrollArea/Button；语义色、触控目标和 Reduced Motion 沿用现有规范。

依据：`P:docs/ui-development.md`、`ui-guidelines.md`、`design-spec.md`、`ui-patterns.md`；`P:src/index.css:53` 的 chat-ai surface/border、`src/components/chat/bubble-surface.ts`、`ui/dialog-styles.ts`、`ui/dialog-layout.css`。成熟原语可复用，成熟图片 viewer 尚不存在。

## 6. MUSIC 命令、资源、持久化和旧播放器调用链

### 6.1 命令与四种成功状态

```text
AI [MUSIC:关键词]
 → routes/chat.py / command_parser.py 提取
 → music_commands.execute_music_commands(search_songs,get_audio_url)
 → 搜索最多5首，选第一首，取URL，临时cards含最多3个候选
 → Assistant短music attachment + 独立system结果/public_display
 → SSE {type:"music",msg_id,cards} / WS {type:"music",data:...}
 → 旧页 msgMusicCards / renderMusicCards / buildMusicCardHtml
 → playMusicOnline(songId)
 → 全局audio.src=/api/music/stream/{song_id}
 → 后端重新取URL，带上游Referer/UA拉取转发
```

语法：`A:aion-chat/routes/music.py:16`、`command_parser.py:20,241` 的 `\[MUSIC:(.+?)\]`。普通 send 在 `routes/chat.py:2234` 执行，结果后续回复在 :4682。历史恢复不重搜，React 不解析命令触发点歌。

`music_commands.py:14::execute_music_commands` 的 success 是 bool(audio_url)。有候选无 URL 时仍有选中卡片，但 system 为失败；无结果/异常分别保存安全原因。必须分开 **搜到候选 → 已选曲 → 已取 URL → 浏览器实际播放**。PR4 success 不是音频 ACK。

### 6.2 真实 DTO 和 endpoint

`A:aion-chat/music.py:62::search_songs / :83::get_song_detail`：

```ts
{id:number,name:string,artists:string[],artist:string,album:string,
 cover:string,duration:number /* 毫秒 */}
```

cover 来自网易云专辑 picUrl + ?param=200y200；歌名/歌手/时长来自搜索/详情，不是 AI 补造。

| API | 实际返回 / 行为 |
| --- | --- |
| GET /api/music/search?q=...&limit=... | q 1–200 字符，limit 1–20 默认5；{songs:[...]}，访问远端 |
| GET /api/music/detail/{song_id} | 详情 + audio_url:string或null；不存在 {error:歌曲不存在}；取新URL，无 candidates |
| POST /api/music/play，{keyword} | 第一首 + audio_url + 最多4个候选；不是浏览器播放，不保存消息 |
| GET /api/music/stream/{song_id} | 每次重新取URL；无URL则404 JSON；否则代理 StreamingResponse |

`get_audio_url:104` 从 GetTrackAudio 取 URL，空时强制重新登录再试一次。2小时 TTL 是 pyncm **登录缓存**，不是音频 URL 有效期；无 expires_at/有效期保证。应视远端 URL 为可失效资源，使用现有 detail/stream 重取，无需新增刷新地址接口。

浏览器用登录 Cookie；`main.py:166,201,278` 允许 stream 使用既有 push token（Header/Query）给原生客户端。Penumbra 不把 token/Cookie 放进卡片。上游 Referer/UA 由代理处理，不直接绕过代理请求 CDN。

无结果/无地址/服务异常已有分支；VIP/登录文案存在，未提供完整地区/版权错误分类，不能自行推断原因。API 成功、URL 存在、转发成功、浏览器能解码播放仍独立。

### 6.3 历史到底保存什么

| 路径 | 保存内容 / 限制 |
| --- | --- |
| 普通 send，routes/chat.py:2329 | Assistant {type:music,name,artist,id}；无 cover/album/duration/candidates/持久 audio_url |
| music_commands.py:40::persist_music_result | system 关键词/歌名/歌手/获取地址或失败说明 + public_display；无结构化歌曲ID/候选/播放状态，不能解析文字补造身份 |
| Activity/特定后续回复 | activity.py:1370、routes/chat.py:4692 某些分支存完整song，无统一type；需已核对schema的受限兼容，不猜所有id对象 |
| Camera-only follow-up | routes/chat.py:4705 存 att_json；其他Camera Core有短music_atts。att_json不在public allowlist，不能为音乐开放整列 |
| SSE/WS cards | 完整song + audio_url + candidates；旧msgMusicCards内存，不是完整持久消息 |

旧 selectConv 只读历史，renderMessages 仅在内存 cache 命中时恢复完整卡片；刷新后普通 Main 只有 capsule，点它打开网易云。detail 可补查当前封面/专辑/时长，**不能恢复当时搜索候选和排序**；加载历史不得自动重搜。

canonical 特殊事实：`routes/chat.py:3431::_prepare_canonical_regenerate_output` 明确 music_cards=[]（regenerate 不重放 MUSIC）；`regenerate_contract.py:214` 以新 attachments_json 替换目标，成功可能清掉旧音乐附件，失败不覆盖。独立 system 结果不被该 UPDATE 删除。卡片应跟随 HTTP 失效/停止，不擅自保留旧曲或重搜；改变此行为需另定契约。

### 6.4 旧音乐 HTML/CSS 和真实播放

源码：`A:aion-chat/static/chat.html:305–326` CSS，`:3810::buildMusicCardHtml`、`:3850::playMusicOnline`、`:4306` SSE、`:2591` WS，`static/music-volume.js`。

- **值得继承的视觉**：横向紧凑布局；PC max360px，padding10x14/gap12，12px圆角；封面56x56（手机48x48）/8px圆角；歌名14px/600、歌手12px、专辑11px与省略层级；按钮与候选在文字下。保留信息结构，以 Penumbra token 重建，不复制旧红渐变/边框/按钮 CSS。
- 网易云按钮/候选真实打开外站；在线播放真实走 stream。候选可查看和手动在外站打开，**没有站内替换选曲/写回消息**。
- 单个 globalMusicAudio，换歌覆盖src，非每卡独立；顶部固定36px条有播放/暂停、range进度、关闭；timeupdate更新，range写currentTime，ended隐藏。
- 无 elapsed/duration 文本、loading/buffering 或用户可读onerror；首次play().catch吞错且提前画暂停图标，可能假显示播放。range UI不证明资源可seek。
- MusicVolume 真实应用音量：浏览器localStorage、Android AionMusic/SharedPreferences；设置页slider，卡片无音量滑块。空封面有音符占位，无图片onerror兜底。
- 切会话不停止同页面播放器；关闭条pause/清src。无显式页面音频清理；离开文档随文档结束，不代表后台播放保证。
- send的SSE music自动播首曲；WS在autoplay=true时播。PR5-B按本任务要求 **点击才加载/播放**，保留事件格式，不迁移旧网页自动播放。

Android另有既有原生路径：`A:AionApp/app/src/main/java/com/aion/chat/WebViewActivity.java:139` 放宽WebView自动播放；`AionPushService.java:658,695::playMusicStream` 在后台music事件使用token stream/MediaPlayer，处理准备/完成/错误释放，读MusicVolumeBridge音量。不是Penumbra公共播放器，本轮不改原生服务/事件/后台策略；浏览器互斥仅覆盖本页面实例。

## 7. 当前音乐卡片复用与播放器可行性

`P:src/components/chat/system-command/ResultCard.tsx:16` 只有 useState(false)/setPlaying，装饰唱片代替 cover，playing 时画 animate-pulse 波形；无 audio/src、play Promise、媒体事件、进度、互斥、卸载清理/失败，audio_url 未消费。Main 没有渲染该卡片；PR4 折叠选曲事实必须与播放状态分开。

可复用紧凑容器、文字层级、按钮命名和 token。需要重建封面/候选、真实控制、加载/失败、时间/进度和音频生命周期；不能保留假波形/假暂停状态作为已播放反馈。

| 预期 | 可行性与最小处理 |
| --- | --- |
| 播放/暂停 | **已有后端，缺前端**：点击才指定stream并play；UI基于play/playing/pause/ended/error及Promise |
| 加载/缓冲/失败 | **缺前端**：resolving/loading/buffering/playing/paused/ended/error分开；连续点击和迟到事件隔离 |
| 多卡互斥 | **缺前端**：Chat生命周期内小Audio Controller管理单audio、当前卡片/owner/序列，换曲先停旧曲 |
| 时间/进度 | **部分可行**：loadedmetadata/durationchange/timeupdate；API毫秒时长仅参考，实际媒体秒数非有限时显示未知 |
| 拖动 | **需后端配合才能可靠承诺**：stream没有Range转发、206/Content-Range/Content-Length；Accept-Ranges声明不够。仅seekable支持时开放，完整支持改原endpoint |
| 无/失效audio_url | **已有恢复路径**：合法song ID可显式stream重取，即使历史没URL；无ID不猜/不重搜。失败就地提示，显式重试或外站入口 |
| 无/坏封面 | **缺前端fallback**：轻量音乐占位，覆盖onerror |
| 切会话/离页 | **待确认行为**：推荐切会话pause、清src/owner，离开Chat清理；不建后台播放。旧同文档切会话继续播，差异必须明确 |
| iOS/Android | **需真机验收**：play拒绝、鉴权、编码、前后台、系统音量/触摸range；不依赖旧WebView设置 |
| 其他场景复用 | 展示接normalized result与播放状态/回调；Audio Controller不负责MUSIC、上传/发消息，宿主选择scope |

推流证据：`A:aion-chat/routes/music.py:54::music_stream` 不接 Request/Range；上游GET只加Referer/UA，不检查status/content-type，按URL后缀猜类型。上游错误可能被包成成功音频或中途断流。**基础整曲播放无需新增后端接口**；建议原endpoint补状态/类型/异常处理，可靠seek再补Range。未实际验证任何歌曲在线可播。

## 8. 前后端最小必要修改与实施前确认

### 8.1 建议的完整语义边界

一个 PR5 可完成“**现有 Chat 媒体的选择、发送、恢复与真实呈现**”：现白名单图片/视频、共享图片预览、按已保存歌曲ID真实播放。内部小步验证，不迁移存储、不新建命令架构，不统一四类业务controller。

| 范围 | 最小前端工作 | 后端配合 |
| --- | --- | --- |
| 上传 | typed DTO/client检查error形状；会话草稿/本地预览、取消/迟到隔离 | API已有；建议先补唯一名、有界读取、内容校验，保持旧字段兼容 |
| 发送 | Sender通用插槽/回调，Main传generation.attachments；正文或有效附件之一；提交快照/optimistic附件 | string[]已有，不改SSE/WS/receipt |
| 历史 | Domain/presentation归一已知URL/music；未知项兜底，局部失败不拖垮history | URL/歌曲ID已有；原名/size不可编造，要求完整metadata才兼容扩展 |
| 图片 | 基于Dialog的共享viewer/呈现，接Bubble/Markdown/草稿，失败与锚点 | 无需新图片接口或开放截图 |
| 视频/普通文件 | 现有视频受鉴权展示/失败兜底，未知文件轻量显示 | 普通文件上传/AI读取缺失，不能假装与图片一样 |
| 音乐 | normalized result/card + 独立Audio Controller；历史ID可播，详情显式按需补 | 基础播放无新接口；建议加固stream，可靠seek需原接口配合 |
| 候选 | 仅可靠结构展示，手选不改原命令事实 | 原候选历史恢复缺失；若必须刷新保留，需安全可选metadata，不能重搜还原 |

PR4选曲结果继续保留，不改成播放成功。SSE music虽由chat-execution-events读取，`chat-send-accumulator.ts:69` 未消费cards；WS music在`P:src/application/realtime/realtime-events.ts`走unknown。建议先以 **HTTP附件为卡片身份权威**；临时完整卡片若接入，只作已知消息的补充缓存，不从WS插入持久Message、不自动播、不覆盖新HTTP/跨会话。

### 8.2 实施前必须确认

1. **类型范围**：推荐现图片/视频迁移；PDF/文本上传及AI读取是后端实质扩展，不能静默纳入。
2. **播放生命周期/seek**：推荐页面内单实例、点击加载、切会话停止；接受“资源支持才拖动”，或要求本轮同步Range加固与实际seek验收。
3. **存储承诺**：推荐保留URL/string[]和页面内草稿、按需补查详情；不承诺刷新恢复本地File、原名/大小、原搜索候选。若必需，先定兼容metadata/持久化契约。
4. **权限目标**：当前无会话文件ACL。若要求服务端强会话归属，先定文件身份/绑定/读取鉴权，属于重大设计方向；前端owner不能替代。Camera边界无论如何保持。

本轮只记录方案，未选择新存储/执行模型。上传附件、图片呈现、MUSIC结果、浏览器音频各自建模，不建巨大Media Provider。Diary `A:aion-chat/routes/diary.py:466::MsgCreate` 不接attachments，虽有部分history附件列读取，生成前仍清空；不能把Main能力直接用于Diary发送。

## 9. 关键风险、异常恢复与已有安全边界

| 场景 | 现状 / PR5要求 |
| --- | --- |
| 取消选择/无效文件/空MIME | 前端可预检，后端真实白名单/内容校验权威；不改扩展名绕过，不把取消当成功 |
| 上传超时/断网/取消 | 可能已写文件无响应，无upload receipt/查询；保留File/预览与状态，不自动重试。显式重传可能产生孤立副本，与send未知分开 |
| 上传成功send明确失败 | 文件和消息非原子；保留URL草稿供明确操作，不自动再上传/发送/远程删除 |
| send响应头前失败/结果未知 | user可能已存，无执行终态查询；PR1只读恢复/未知锁不变，附件不能绕开锁重发 |
| 已接受后生成失败 | 已释放提交稿，不自动回待重发；用HTTP恢复消息/失败Assistant，执行快照另持有 |
| 提交时新编辑 | 保留revision保护，只释放已接受那组附件，不能清后来新选文件；Object URL按持有者释放 |
| 历史404/401/坏图 | 局部失败、显式读取重试/鉴权恢复，正文可读，不触发upload/send/regenerate |
| 草稿删除/已发送附件删除 | 草稿仅移本地引用；无单附件远程删除API，不隐式改写已发送消息 |
| 身份/跨会话 | 后端无附件归属，UI需owner/item/revision；强ACL要后端，不能宣称已有 |
| 内容/路径/内存 | 信任MIME、毫秒名、全读后限额、无总量；建议小范围加固，basename不等于ownership/内容验证，不新增任意本地路径/远程读取 |
| 模型不支持 | 可能省略或upstream错误；不宣称AI已读取，不自动换模型/去附件/再发送 |
| 音乐资源故障 | URL不等于可播；媒体事件驱动，显式重试取新地址，不再执行MUSIC，不猜版权/地区 |
| 多卡/迟到事件 | 单实例/序列隔离，换曲换会话pause/清src/清监听；旧Promise不能点亮新卡 |
| Camera素材 | 私图也在uploads；不扫描/猜路径，不用raw system/att_json/隐藏角色；仅公开DTO授权范围 |
| 分页/高度 | 现同时间戳游标缺口保留，图片/viewer不破坏锚点，不把当前页恢复说成全历史完整 |

### 9.1 上传成功不等于 AI 能读取

- `A:aion-chat/routes/chat.py:1417` 普通send清旧历史附件，仅保留当前轮；canonical `:2856` 只保留目标前最后user附件。历史能展示，不代表每轮重送图片。
- `ai_providers.py:632::build_multimodal_messages` 从UPLOADS_DIR/Path(att).name读真实文件、猜MIME、base64为OpenAI image_url/video_url data URL，非直接发登录URL给模型。
- `ai_providers.py:671::build_gemini_contents` 转inline_data；同文件 `:699::build_anthropic_messages`、`anthropic_adapter.py:71`、`prompts/builder.py:463::_build_content_with_attachments` 转base64 image，仅图片，视频不能据此视为可读。
- Main-direct normal OpenAI可按配置进入`routes/chat.py:2041`/`openai_main_direct_cutover.py`/`openai_attachment_materializer.py:681::materialize_openai_wire_messages`：消费冻结owner/ordinal/source，缺源/不支持来源或MIME进入omitted ledger，读取/编码失败在provider前失败。不能把所有请求描述成同一legacy builder。
- `anthropic_main_direct_cutover.py:40::select_anthropic_production_path` 有selected附件时以attachment_not_migrated选既有legacy路径，不表示Anthropic完全不支持图片；canonical regenerate业务endpoint也不等于Main-direct provider cutover。
- `openai_main_direct_cutover.py:59` 明确缺每endpoint可靠视频能力事实，保留legacy video_url。Readiness只核对配置，不证明Vision。没有统一可靠附件能力gate：upstream可能拒绝；builder可能省略；legacy缺文件通常跳过，不可显示AI读取成功。
- PDF/文本提取、OCR/解析、通用audio upload输入链缺失。不改上下文截断/选择、缓存、Provider、Prompt顺序。沿用稳定性专项的安全真实错误与未知保护。

## 10. PR5实施建议与人工验收清单

### 10.1 实施顺序

1. 确认第8节范围；用合成fixture固化upload成功/错误、URL历史、音乐短/完整变体、canonical图片选择/MUSIC不重放。
2. 在既有API/Domain/presentation接adapter，完成已确认的小后端加固，保持旧DTO/客户端兼容。
3. 接选择→本地预览→上传→send→HTTP→canonical；支持纯附件但保留未知锁，验证owner/revision/资源释放。
4. 图片重点重新设计；音乐继承旧成熟信息层级并真实播放；普通文件轻量兜底。
5. 必要契约/控制器回归 + PC/手机真实布局 + 获授权隔离环境联调；回归PR1–PR4的SSE/receipt、WS、分页、MCP、Reaction、DRIFT/Thinking、模型保存和未知恢复。

### 10.2 PR5-B必须执行，本轮均未执行

| 维度 | 人工验收条件 |
| --- | --- |
| PC实际布局 | 宽/窄/短窗口、键盘；单/2/3/多图、横/竖/超长图、无正文/长正文、两种角色；不撑破消息区、不裁关键内容 |
| 手机实际布局 | 真机iOS Safari/Android Chrome，必要时现WebView；横竖/安全区/键盘；相册/文件选择/取消、系统提供拍照时返回、IME、HEIC拒绝；手机尺寸模拟不足以替代 |
| 图片预览 | 适屏/放大/还原/平移/切图/关闭、Escape/方向键/背景/返回、触摸与按钮等价；焦点返回/滚动锁释放/阅读位置 |
| 图片质量/故障 | 长图文字、透明PNG/GIF/旋转照片、多图；缩略图/原图区分；加载/坏图/断网/404/401；历史仍可读 |
| Paper/Mist | 暖背景、雾蓝/角色token、半透明、柔角/轻过渡；浅深/壁纸对比度、Reduced Motion；无厚文件框/大白弹窗，不照搬旧图片UI |
| 附件生命周期 | 同文件重复选择、空MIME/超限、混合有效无效、移除、上传取消、A→B→A/迟到、删会话/离页；File/Object URL无错owner/泄漏 |
| 上传/send边界 | 上传后明确拒绝、响应头前超时/断网、SSE canceled/断流；恢复只GET，无自动第二次upload/send/regenerate；接受快照不复活，新稿不丢 |
| history/regenerate | URL恢复、仅原目标user附件入AI、ID/时间/receipt保持、缺文件不假成功、MUSIC不重放/卡片跟随HTTP失效 |
| 真播放 | 点击才请求、播放/暂停/缓冲/结束、双击/切曲/互斥、切会话/离页；无封面/无ID/无audio_url/过期/401/404/坏编码/播放拒绝 |
| 时间/候选/音量 | duration有限才显示，seekable才拖动；若承诺Range则验请求/206/实际跳转；候选来源准确、无重搜补造；音量边界不误控TTS/原生服务 |
| 安全/共享 | 无匿名读取受保护资源、隐藏Camera/raw system/att_json泄露；Main/Diary独立；复制/插入不带附件URL/内部字段，普通文件不误当图 |

验收至少留PC/手机布局截图或录屏与场景结果；单元测试/API通过不能代替。远端音乐/模型联调须另获允许，使用专用测试会话；本轮无这些操作。文档交付只做源码/引用/差异检查，不运行会初始化后端的测试或真实应用。

### 10.3 简洁结论

| 问题 | 结论 |
| --- | --- |
| 附件完成多少 | **部分完成**：后端图片/视频上传、保存、HTTP恢复、当前轮AI转换已有；Penumbra字段/原始读取已有，入口/草稿/真实显示与恢复交互缺失，尚无端到端体验 |
| 后端完整支持上传/历史吗 | **部分完成**：7个MIME、20MiB、稳定URL恢复；无通用文件、持久原名/size/ID、会话ACL、提交原子性/孤立清理；AI可读另有条件 |
| 图片复用什么 | **已有原语**：Bubble/Markdown、Dialog、Button/ScrollArea/Toast、token；**缺失**成熟viewer，基于原语重新设计组合 |
| 音乐能否真播 | **已有后端路径、缺前端接线**：song ID→stream可发起真实播放；未在线验证歌曲，不保证远端/编码/鉴权可用 |
| 要新音乐后端API吗 | 基础播放 **不需要**；detail/stream能重取地址。可靠seek/错误传播 **需原接口配合**；原候选持久恢复才需metadata扩展 |
| 一个PR5能否完成 | **可以，先确认范围**：现图片/视频+共享预览+轻播放器为完整语义边界。通用文件AI、强会话ACL、刷新草稿/原候选持久化若必需，先确认后端契约，不扩成媒体中心 |

本文为PR5-A交付。**PR5-B尚未开始，暂停等待确认。**

交付复核：两仓库 HEAD 未变，AionHome 工作树仍干净，Penumbra 仅新增本文；核心引用路径已核对，Markdown 代码围栏成对，无行尾空白。未运行业务测试/构建或真实 UI 验证，本次不声称 PR5 功能已通过验收。
