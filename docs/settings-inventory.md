# Settings Foundation · 全系统配置盘点与存储审计

审计日期：2026-10-23（Asia/Shanghai）。本轮只新增本文档，不实现Settings，不修改业务代码、测试、CSS、配置或资源。

## 1. 执行摘要

本轮总表记录 **159个逻辑配置/管理单元**：外观与桌面A 16项、API/连接/模型B 26项、Chat/生成/缓存/语音C 27项、Persona/Prompt/能力D 22项、业务App与集成E 54项、系统/部署F 14项。Penumbra状态分布为：**已实现29、部分实现5、旧前端独有78、后端已有18、仅内部配置29、待确认0**。“旧前端独有”是明确待迁移的能力；部分实现仍有缺口。生产现状未验证单列第10节。

计数口径：按总表ID统计**逻辑配置/管理单元**，复合字段在行内展开，数量不是原子字段数或产品完成率。包括连接测试等管理动作、明确有配置意义的记录元数据；不按每个模型/服务器实例重复计数。不包含纯导航、查询筛选、草稿、CRUD正文和未接通占位控件。内部策略不等于普通Settings待迁移工作量。

**[现状]** Penumbra已有真实外观设置，以及Diary自动投喂、Activity手机AI可见性/Wi-Fi标记、Location详细配置、Memory置顶/新增元数据和四类日程管理。Settings运行概览是安全只读；日历设置仍为占位。自定义壁纸和贴纸的图片本体在浏览器IndexedDB，localStorage只存外观参数；尚无服务器图片副本。

**[现状]** AionHome后端已存在Registry v2连接、9种实际迁移的功能绑定、Main会话显式选择和独立Runtime选择。旧前端已经使用这些接口，不能把Model Registry整体当作规划；也不能把KNOWN_USAGES全部当作可编辑的已迁移功能。Prompt snapshot、shadow和受控canonical路径已存在，但没有面向用户的Prompt架构编辑器。

**[问题]** 最重要的缺口是Penumbra旧model/readiness契约与后端main_selection权威不一致、Worldbook整文件保存可能清掉Diary自动投喂开关、Main会话模型被部分后台任务复用，以及本地外观图片仍可能只有一个浏览器副本。AionHome已有通用文件上传，可复用基础，但未找到旧自定义壁纸管理链路；仍需补外观记录与资产引用、替换删除、权限和部署持久性。

### 1.1 实际范围与Git保护

| 范围 | 实际位置与快照 | 审计结果 |
|---|---|---|
| Penumbra | /Users/remix/Desktop/Penumbra；main @ d105c1e；worktree list仅本工作树 | 已审计src、public、相关docs；开始git status --short为空 |
| AionHome后端 | /Users/remix/Desktop/AionsHome-main/aion-chat；父仓库refactor-code-main @ fc9c4f3 | 已审计路由、配置定义、保存与实际消费者；工作树干净 |
| AionHome旧前端 | 同仓库aion-chat/static（HTML/JS）、仓库根public（固定资源） | 已审计，可访问；不是另一个缺失仓库 |
| 生产服务器/运行DB/真实配置、浏览器实际存储、Native权限 | 未访问 | **未审计**，不推断部署成功或个人图片实际存在 |
| 未定位的历史工作树/未提供分支 | 不在本轮快照 | **未审计**，不根据印象补齐 |

Diary保护：当前最近提交包括2f875e6（entry editing and auto-feed controls）和d105c1e（editor layout and keyword editing）。本轮保护这些已在当前快照中的成果；开始没有未提交diff。未查询远端PR状态，不把“PR1.2.1”名称当作已核验PR状态。未checkout/reset/stash/add/commit/push。

本轮属于Settings Foundation事实盘点/契约准备，不改变运行时行为。遵守AionHome AGENTS约束：不改message persistence、prompt输入顺序、WS事件或command语法/副作用，不在Penumbra复制后端业务状态机。

### 1.2 状态与证据口径

- **已实现**：存在可到达入口，静态追踪到有效读写与消费者；设备本地持久化也算，但不称服务器配置。本轮没有生产运行验收。
- **部分实现**：只接读取、部分字段或旧契约，尚缺编辑/当前契约；行内明确边界。
- **旧前端独有**：旧入口和有效链路存在，Penumbra无对应入口。
- **后端已有**：有效后端能力存在，前端无编辑器、仅传固定值或仅保留兼容接口。
- **仅内部配置**：env、部署文件、代码策略或固定兼容字段，不进入普通UI。
- **待确认**：证据不足；服务器现值未知另列第10节，不用它掩盖源码可确认的缺失。

所有默认值均指代码初始化/schema/getter fallback/UI默认，**不是当前服务器值**。未读真实settings.json/worldbook/auth/.env/DB或图片内容，未import后端（import可能初始化文件），未启动服务或调用API。历史审计docs保留，仅作为线索，现状重新核对。

## 2. 配置总表

### 2.0 存储与链路说明

| 缩写 | 真实来源与读写 |
|---|---|
| S | AionHome aion-chat/data/settings.json，进程SETTINGS；load_settings/save_settings → canonical_settings_write → atomic_save_settings。v2 model_api_registry为连接凭据权威，旧字段可能只是legacy_settings_view。原子替换不是跨DB/文件事务。 |
| W | data/worldbook.json；load_worldbook/save_worldbook，整文件JSON。Persona和diary_auto_feed目前共存。 |
| L | data/location_config.json；加载补DEFAULT_LOCATION_CONFIG，保存写JSON。location_status.json是采样事实，不是用户配置。 |
| K | data/cam_config.json；启动加载，运行cam.cfg；设置及monitor启停保存。camera running和crop为另一类进程状态。 |
| M | data/mcp_config.json；保存后reconcile真实MCP连接并失效工具缓存；mcp_tools_cache.json是派生缓存。 |
| DB | data/chat.db；各行注明SQLite表。只审计schema/SQL，未打开实际DB。 |
| LS / IDB | 当前浏览器origin的localStorage/IndexedDB，不随AionHome账号跨设备同步；IDB Blob是文件本体，blob: URL只是临时引用。 |

后端“全局”指一个服务实例；这些存储未按用户ID划分偏好，不能假设已有多租户设置系统。
证据：[config路径](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:25)、[配置保存](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:135)、[原子落盘](/Users/remix/Desktop/AionsHome-main/aion-chat/settings_persistence.py:9)。


### 2.1 A. 外观与桌面

| ID | 分类/名称与真实字段 | 代码默认 | 旧前端入口 | Penumbra状态 | Penumbra入口/边界 | AionHome支持/真实读写链 | 存储与作用域 | 问题/建议 | 代码证据 |
|---|---|---|---|---|---|---|---|---|---|
| A01 | 明暗 / penumbra-theme-mode | system | 无动态设置 | **已实现** | Settings界面外观 | LS读取→applyThemeMode→dark class；系统及storage事件同步 | 设备/origin持久 | 不是后端全局主题 | [src/lib/theme.ts:38](/Users/remix/Desktop/Penumbra/src/lib/theme.ts:38)；[src/lib/theme.ts:68](/Users/remix/Desktop/Penumbra/src/lib/theme.ts:68) |
| A02 | 主题色 / penumbra-theme-color | #F4845F | 固定CSS | **已实现** | Settings主题色 | LS→getStoredThemeColor/applyThemeColor→CSS变量 | 设备/origin持久 | 未有与模式相同的完整跨页签同步 | [src/lib/theme.ts:177](/Users/remix/Desktop/Penumbra/src/lib/theme.ts:177)；[src/components/settings/SettingsView.tsx:66](/Users/remix/Desktop/Penumbra/src/components/settings/SettingsView.tsx:66) |
| A03 | AI色 / penumbra-ai-color | #7BA7BC | 固定气泡色 | **已实现** | Settings AI主题色 | LS→applyAiColor→--ai-theme-color | 设备/origin持久 | 有气泡颜色预览，不等于形状配置 | [src/lib/theme.ts:195](/Users/remix/Desktop/Penumbra/src/lib/theme.ts:195)；[src/components/settings/SettingsView.tsx:420](/Users/remix/Desktop/Penumbra/src/components/settings/SettingsView.tsx:420) |
| A04 | 壁纸 / penumbra-wallpaper-settings.mode | ambient | 主页固定图 | **已实现** | Settings桌面背景 | LS JSON→saveWallpaperSettings→CustomEvent→Desktop重读 | 设备/origin持久 | ambient/custom；Editorial未消费壁纸 | [src/lib/wallpaper.ts:15](/Users/remix/Desktop/Penumbra/src/lib/wallpaper.ts:15)；[src/widgets/Desktop.tsx:389](/Users/remix/Desktop/Penumbra/src/widgets/Desktop.tsx:389) |
| A05 | 壁纸适配 / .fit | cover | 无 | **已实现** | Settings桌面背景 | 同A04，Desktop backgroundSize消费 | LS设备持久 | cover/contain | [src/lib/wallpaper.ts:23](/Users/remix/Desktop/Penumbra/src/lib/wallpaper.ts:23)；[src/widgets/Desktop.tsx:531](/Users/remix/Desktop/Penumbra/src/widgets/Desktop.tsx:531) |
| A06 | 壁纸位置 / .position | center | 无 | **已实现** | Settings桌面背景 | 同A04，Desktop backgroundPosition消费 | LS设备持久 | top/center/bottom | [src/lib/wallpaper.ts:23](/Users/remix/Desktop/Penumbra/src/lib/wallpaper.ts:23)；[src/widgets/Desktop.tsx:531](/Users/remix/Desktop/Penumbra/src/widgets/Desktop.tsx:531) |
| A07 | 壁纸遮罩 / .shade | balanced | 无 | **已实现** | Settings桌面背景 | 同A04→data-wallpaper-shade→CSS | LS设备持久 | clear/balanced/soft；不是全局透明度 | [src/lib/wallpaper.ts:23](/Users/remix/Desktop/Penumbra/src/lib/wallpaper.ts:23)；[src/widgets/Desktop.tsx:523](/Users/remix/Desktop/Penumbra/src/widgets/Desktop.tsx:523) |
| A08 | 壁纸文字明暗 / .textTone | auto | 无 | **已实现** | Settings；桌面快捷明暗 | LS读写+CustomEvent；auto解析当前dark | LS设备持久 | auto/dark/light；另一入口复用同一键 | [src/lib/wallpaper.ts:51](/Users/remix/Desktop/Penumbra/src/lib/wallpaper.ts:51)；[src/widgets/Desktop.tsx:509](/Users/remix/Desktop/Penumbra/src/widgets/Desktop.tsx:509) |
| A09 | 自定义壁纸文件 / wallpapers[desktop] | 无 | 未发现自定义壁纸UI | **已实现** | Settings选择/替换/移除 | File→saveCustomWallpaper→IDB；读取Blob→blob URL→CSS | IDB penumbra-preferences/wallpapers；图片本体 | 前端image/*、20MiB；没有后端副本 | [src/lib/wallpaper.ts:88](/Users/remix/Desktop/Penumbra/src/lib/wallpaper.ts:88)；[src/components/settings/SettingsView.tsx:113](/Users/remix/Desktop/Penumbra/src/components/settings/SettingsView.tsx:113) |
| A10 | 贴纸图片 / images[desktop-sticker] | 内置花朵 | 无 | **已实现** | 经典桌面贴纸换图 | File→saveStickerImage→IDB；Blob URL展示 | IDB penumbra-widget-assets/images | 实例共用一个key；失败仍本次预览，无错误反馈 | [src/widgets/sticker-storage.ts:1](/Users/remix/Desktop/Penumbra/src/widgets/sticker-storage.ts:1)；[src/widgets/StickerWidget.tsx:34](/Users/remix/Desktop/Penumbra/src/widgets/StickerWidget.tsx:34) |
| A11 | 布局 / penumbra-desktop-layout、-version | DEFAULT_LAYOUT，version=2 | 主页apps固定 | **已实现** | 经典桌面编辑/增删移动组件 | loadDesktopLayout/normalizeLayout→saveDesktopLayout→LS | 设备；instanceId/widgetId/page/position/size | minimized类型字段不证明完整窗口管理已实现 | [src/widgets/storage.ts:15](/Users/remix/Desktop/Penumbra/src/widgets/storage.ts:15)；[src/widgets/storage.ts:125](/Users/remix/Desktop/Penumbra/src/widgets/storage.ts:125)；[src/widgets/types.ts:40](/Users/remix/Desktop/Penumbra/src/widgets/types.ts:40) |
| A12 | 经典签名 / penumbra-desktop-signature | 慢一点，也是在向前。 | 无 | **已实现** | 经典桌面个性签名 | input→updateSignature→LS；初始化读取 | 设备/origin持久 | 最多64字；写失败只留内存 | [src/widgets/SignatureWidget.tsx:4](/Users/remix/Desktop/Penumbra/src/widgets/SignatureWidget.tsx:4) |
| A13 | Editorial签名 / penumbra-editorial-signature | 慢一点，也是在向前。 | 无 | **已实现** | /editorial签名 | EditorialSignature读写LS | 设备/origin持久 | 与经典桌面两份不同偏好 | [src/components/desktop-v2/EditorialSignature.tsx:4](/Users/remix/Desktop/Penumbra/src/components/desktop-v2/EditorialSignature.tsx:4) |
| A14 | 字体/字号 / --font-heading、--font-sans、text classes | Geist/霞鹜文楷等固定CSS | 固定CSS | **仅内部配置** | 无编辑器 | 构建字体资源/CSS→页面 | 代码/发布资源 | 没有可配置字体/字号功能 | [src/index.css:4](/Users/remix/Desktop/Penumbra/src/index.css:4)；[src/index.css:175](/Users/remix/Desktop/Penumbra/src/index.css:175)；[aion-chat/static/chat.html:186](/Users/remix/Desktop/AionsHome-main/aion-chat/static/chat.html:186) |
| A15 | Mist/Paper/透明度 / mist-glass、mist-solid、Diary paper样式 | 固定CSS | 固定CSS | **仅内部配置** | 无材质切换UI | CSS/class→渲染 | 代码/构建 | 壁纸shade不等于全局材质配置 | [src/index.css:101](/Users/remix/Desktop/Penumbra/src/index.css:101)；[src/index.css:263](/Users/remix/Desktop/Penumbra/src/index.css:263)；[src/components/diary/DiaryReaderDetails.tsx:58](/Users/remix/Desktop/Penumbra/src/components/diary/DiaryReaderDetails.tsx:58) |
| A16 | 头像/气泡几何 / avatar placeholder、Bubble classes | 仓库固定图/样式 | /public/icon_user.png、icon_ai.png | **仅内部配置** | 无头像/气泡形状编辑 | 静态import/URL/CSS→Bubble | 代码/发布资源 | 已配置的只是颜色；未接自定义头像 | [src/components/chat/Bubble.tsx:5](/Users/remix/Desktop/Penumbra/src/components/chat/Bubble.tsx:5)；[aion-chat/static/chat.html:2976](/Users/remix/Desktop/AionsHome-main/aion-chat/static/chat.html:2976) |

### 2.2 B. API、连接、模型与任务分配

| ID | 分类/名称与真实字段 | 代码默认 | 旧前端入口 | Penumbra状态 | Penumbra入口/边界 | AionHome支持/真实读写链 | 存储与作用域 | 问题/建议 | 代码证据 |
|---|---|---|---|---|---|---|---|---|---|
| B01 | Connection名称 / name | 必填 | Settings AI→API配置 | **旧前端独有** | 无管理UI | GET/POST /api/registry/connections、PATCH/DELETE /{id}→RegistryConfigurationService→save_settings | S:model_api_registry.connections全局 | 连接与功能选择分离 | [aion-chat/connection_registry.py:44](/Users/remix/Desktop/AionsHome-main/aion-chat/connection_registry.py:44)；[aion-chat/routes/registry.py:111](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/registry.py:111)；[aion-chat/static/settings-registry-ui.js:22](/Users/remix/Desktop/AionsHome-main/aion-chat/static/settings-registry-ui.js:22) |
| B02 | 连接Base URL / base_url | 必填，禁止凭据/query/fragment | 同B01 | **旧前端独有** | 无 | 同B01→URL校验→ConnectionState | S全局 | 不是Penumbra后端服务URL | [aion-chat/connection_registry.py:44](/Users/remix/Desktop/AionsHome-main/aion-chat/connection_registry.py:44)；[aion-chat/main_configuration.py:144](/Users/remix/Desktop/AionsHome-main/aion-chat/main_configuration.py:144) |
| B03 | API Key / credential（落盘key） | 空，可未配置 | Settings连接密钥管理 | **旧前端独有** | 无 | POST/PATCH connection；GET只credential metadata；reveal/clear校验secret_ref | S全局，服务器JSON保存 | SecretStr不是磁盘加密；替换/清除与留空保留不同 | [aion-chat/connection_registry.py:60](/Users/remix/Desktop/AionsHome-main/aion-chat/connection_registry.py:60)；[aion-chat/connection_registry.py:513](/Users/remix/Desktop/AionsHome-main/aion-chat/connection_registry.py:513) |
| B04 | 连接启用 / enabled | true | Settings连接启禁用 | **旧前端独有** | 无 | PATCH connection→S；resolver检查disabled_profile | 全局，后续Runtime | 禁用不会自动选择另一连接 | [aion-chat/connection_registry.py:44](/Users/remix/Desktop/AionsHome-main/aion-chat/connection_registry.py:44)；[aion-chat/main_configuration.py:142](/Users/remix/Desktop/AionsHome-main/aion-chat/main_configuration.py:142) |
| B05 | 传输 / transport | direct | Settings连接传输 | **旧前端独有** | 无 | 同B01；direct/cloudflare_rest/cloudflare_anthropic | S全局 | 普通连接不绑定协议；Cloudflare有Anthropic约束 | [aion-chat/connection_registry.py:44](/Users/remix/Desktop/AionsHome-main/aion-chat/connection_registry.py:44)；[aion-chat/static/settings.html:240](/Users/remix/Desktop/AionsHome-main/aion-chat/static/settings.html:240) |
| B06 | 网关 / gateway_id | null | Settings连接网关 | **旧前端独有** | 无 | 同B01；resolver构建endpoint | S全局 | 是传输元数据 | [aion-chat/connection_registry.py:44](/Users/remix/Desktop/AionsHome-main/aion-chat/connection_registry.py:44)；[aion-chat/main_configuration.py:158](/Users/remix/Desktop/AionsHome-main/aion-chat/main_configuration.py:158) |
| B07 | 连接模型提示 / default_model | null | Settings连接默认模型 | **旧前端独有** | 无 | 同B01；GET /{id}/prefill→选择器预填 | S全局提示 | 仅预填，不是Main默认，也不覆盖现有选择 | [aion-chat/static/settings-registry-ui.js:51](/Users/remix/Desktop/AionsHome-main/aion-chat/static/settings-registry-ui.js:51)；[aion-chat/routes/registry.py:149](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/registry.py:149) |
| B08 | Main新会话默认 / usage_bindings.main_chat {connection_id,protocol,model} | 显式/迁移选择；无效有diagnostic | Settings AI功能配置 | **旧前端独有** | 无默认编辑UI | GET /api/registry/feature-bindings；PUT/DELETE /{usage}→校验→S；创建会话复制 | S全局默认→DB会话独立 | 已有会话不随默认改变 | [aion-chat/registry_configuration.py:43](/Users/remix/Desktop/AionsHome-main/aion-chat/registry_configuration.py:43)；[aion-chat/connection_registry.py:546](/Users/remix/Desktop/AionsHome-main/aion-chat/connection_registry.py:546)；[aion-chat/main_configuration.py:94](/Users/remix/Desktop/AionsHome-main/aion-chat/main_configuration.py:94) |
| B09 | Memory Sentinel绑定 / .memory_sentinel | 兼容导入sentinel_model或MiniMax-M2.7/AiPro OpenAI | Settings AI功能配置 | **旧前端独有** | 无 | 同B08；memory resolve_usage消费 | S全局→任务冻结 | 不是Camera/Location Sentinel同一个模型字段 | [aion-chat/connection_registry.py:223](/Users/remix/Desktop/AionsHome-main/aion-chat/connection_registry.py:223)；[aion-chat/memory.py:652](/Users/remix/Desktop/AionsHome-main/aion-chat/memory.py:652) |
| B10 | Web压缩绑定 / .web_compression | 兼容导入sentinel_model或MiniMax-M2.7/AiPro OpenAI | 同B08 | **旧前端独有** | 无 | 同B08；resolve_feature_request | S全局→任务 | 导入捕获后独立，不能继续改旧sentinel_model | [aion-chat/connection_registry.py:223](/Users/remix/Desktop/AionsHome-main/aion-chat/connection_registry.py:223)；[aion-chat/registry_configuration.py:49](/Users/remix/Desktop/AionsHome-main/aion-chat/registry_configuration.py:49) |
| B11 | Memory Digest绑定 / .memory_digest | 仅导入显式aux_model_memory；缺失需配置 | 同B08 | **旧前端独有** | 无 | 同B08；memory辅助任务消费 | S全局→任务 | 没有历史候选失败自动切换链 | [aion-chat/connection_registry.py:236](/Users/remix/Desktop/AionsHome-main/aion-chat/connection_registry.py:236)；[aion-chat/memory.py:831](/Users/remix/Desktop/AionsHome-main/aion-chat/memory.py:831) |
| B12 | Quick Note Step1绑定 / .quick_note_compression | 仅导入显式aux_model_status；缺失需配置 | 同B08 | **旧前端独有** | 无 | 同B08；压缩阶段消费 | S全局→任务 | 不等于速记Step2主模型分配 | [aion-chat/connection_registry.py:236](/Users/remix/Desktop/AionsHome-main/aion-chat/connection_registry.py:236)；[aion-chat/schedule.py:1292](/Users/remix/Desktop/AionsHome-main/aion-chat/schedule.py:1292) |
| B13 | Camera Sentinel绑定 / .camera_sentinel | 兼容导入AiPro/MiniMax-M2.7/native协议 | 同B08 | **旧前端独有** | 无 | 同B08；resolve_feature_request，支持minimax_chatcompletion_v2 | S全局→任务 | 与Camera Core不同 | [aion-chat/connection_registry.py:269](/Users/remix/Desktop/AionsHome-main/aion-chat/connection_registry.py:269)；[aion-chat/connection_registry.py:581](/Users/remix/Desktop/AionsHome-main/aion-chat/connection_registry.py:581) |
| B14 | Location Sentinel绑定 / .location_sentinel | 同B13 | 同B08 | **旧前端独有** | 无 | 同B13；location_sentinel消费者 | S全局→任务 | 与Location Core不同 | [aion-chat/connection_registry.py:269](/Users/remix/Desktop/AionsHome-main/aion-chat/connection_registry.py:269)；[aion-chat/location.py:1017](/Users/remix/Desktop/AionsHome-main/aion-chat/location.py:1017) |
| B15 | Book批注默认 / .book_annotation | v2缺失报feature_binding_required；v1 bootstrap兼容 | 同B08 | **旧前端独有** | 无 | 同B08；independent_default_model→批注请求 | S全局；新请求默认 | 已有请求不变 | [aion-chat/independent_llm.py:19](/Users/remix/Desktop/AionsHome-main/aion-chat/independent_llm.py:19)；[aion-chat/static/settings-registry-ui.js:5](/Users/remix/Desktop/AionsHome-main/aion-chat/static/settings-registry-ui.js:5) |
| B16 | Game新Session默认 / .game_decision | 同B15 | 同B08 | **旧前端独有** | 无 | 同B08；Game创建时捕获→session model_key | S全局→Session持久 | 已有Session不变，恢复要核指纹 | [aion-chat/game/binding.py:23](/Users/remix/Desktop/AionsHome-main/aion-chat/game/binding.py:23)；[aion-chat/game/service.py:41](/Users/remix/Desktop/AionsHome-main/aion-chat/game/service.py:41) |
| B17 | 旧API Config / api_configs[].id/name/url/key/model/enabled/auth_mode/gateway_id/reusable_protocols | 历史anthropic/true等 | 当前Settings仅兼容说明，旧API保留 | **后端已有** | 无兼容CRUD | /api/settings/api-configs CRUD/test/fetch；v2兼容写投射至Connection | S；v2唯一连接权威 | 不能重新建设第二套Provider存储；/registry/profiles写入拒绝use_connection_api | [aion-chat/routes/settings.py:525](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py:525)；[aion-chat/connection_registry.py:290](/Users/remix/Desktop/AionsHome-main/aion-chat/connection_registry.py:290)；[aion-chat/routes/registry.py:62](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/registry.py:62) |
| B18 | 旧激活API / selected_api_config_id | 无/历史值 | 当前无active编辑UI | **后端已有** | 无 | GET api-configs/active；PUT /api/settings/api-configs/select→setter | S全局兼容独立Runtime | 不是Main默认/当前Chat选择；部分catalog仍消费 | [aion-chat/routes/settings.py:557](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py:557)；[aion-chat/independent_llm.py:71](/Users/remix/Desktop/AionsHome-main/aion-chat/independent_llm.py:71) |
| B19 | 旧provider字段 / aipro_*、custom_*、aux_*、gemini_*、siliconflow_*、custom_model | 空；URL getter用provider_defaults | 由Connection替代；Embedding仍编辑sf字段 | **后端已有** | 无兼容字段UI | GET/PUT /api/settings→canonical_settings_write/legacy_settings_view→Connection | S或内存兼容投影 | sentinel_model/aux_model_status/aux_model_memory/gemini_free_*更新返回409；不迁旧长表单 | [aion-chat/routes/settings.py:129](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py:129)；[aion-chat/connection_registry.py:290](/Users/remix/Desktop/AionsHome-main/aion-chat/connection_registry.py:290)；[aion-chat/connection_registry.py:316](/Users/remix/Desktop/AionsHome-main/aion-chat/connection_registry.py:316) |
| B20 | 静态模型定义 / RAW_MODEL_DECLARATIONS、aliases、key/display_name/provider/model | 代码声明 | Chat建议/兼容目录 | **仅内部配置** | Settings Available Models只读 | immutable MODEL_REGISTRY→GET /api/models（key/provider）；registry有更丰富投影 | 代码/启动 | 没有模型档案CRUD；Main可填catalog外literal | [aion-chat/model_registry.py:58](/Users/remix/Desktop/AionsHome-main/aion-chat/model_registry.py:58)；[aion-chat/model_registry.py:210](/Users/remix/Desktop/AionsHome-main/aion-chat/model_registry.py:210)；[src/components/settings/SettingsSafeBasics.tsx:122](/Users/remix/Desktop/Penumbra/src/components/settings/SettingsSafeBasics.tsx:122) |
| B21 | 模型能力 / api_formats、capabilities | 静态chat等声明 | 无能力编辑器 | **仅内部配置** | 无 | descriptor→generation_options/协议校验 | 代码/Runtime | 无用户可编辑vision/tools/context-window档案；不能假设远端能力已验证 | [aion-chat/model_registry.py:62](/Users/remix/Desktop/AionsHome-main/aion-chat/model_registry.py:62)；[aion-chat/generation_options.py:136](/Users/remix/Desktop/AionsHome-main/aion-chat/generation_options.py:136) |
| B22 | Bootstrap默认 / AION_DEFAULT_MODEL、DEFAULT_MODEL | gemini-3-flash | 无 | **仅内部配置** | 无 | configured/resolve_default_model_key→兼容消费者、conversations.model | env/代码启动默认 | 不等于B08 Main新会话默认 | [aion-chat/model_registry.py:19](/Users/remix/Desktop/AionsHome-main/aion-chat/model_registry.py:19)；[aion-chat/routes/chat.py:910](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:910) |
| B23 | 连接测试 / connection_id、protocol、model | 单次显式，可预填 | Settings测试连接 | **旧前端独有** | 无 | POST connections/{id}/test→complete_text；/api/main/test亦存在 | 单次探测，不保存结果 | 只basic_nonstream，不证明thinking/cache/stream/vision/tools | [aion-chat/connection_registry.py:614](/Users/remix/Desktop/AionsHome-main/aion-chat/connection_registry.py:614)；[aion-chat/static/settings.html:268](/Users/remix/Desktop/AionsHome-main/aion-chat/static/settings.html:268) |
| B24 | 远端模型发现 / protocol、after_id | OpenAI，无游标 | Chat/共享选择器获取模型 | **旧前端独有** | Available Models不是远端发现 | POST connections/{id}/fetch-models→probe；候选临时 | 请求/配置过程 | 只direct OpenAI/Anthropic；不自动修改模型绑定 | [aion-chat/connection_registry.py:601](/Users/remix/Desktop/AionsHome-main/aion-chat/connection_registry.py:601)；[aion-chat/static/chat.html:1291](/Users/remix/Desktop/AionsHome-main/aion-chat/static/chat.html:1291) |
| B25 | 失败策略 / disabled_profile、feature_binding_required、deferred诊断 | 显式失败，无自动换连接 | 旧UI诊断 | **仅内部配置** | 无fallback策略编辑 | _resolve_feature/resolve_main_request→typed错误 | 代码+S迁移诊断 | 历史迁移候选不等于运行时fallback；无用户重试/备用模型策略 | [aion-chat/connection_registry.py:564](/Users/remix/Desktop/AionsHome-main/aion-chat/connection_registry.py:564)；[aion-chat/main_configuration.py:122](/Users/remix/Desktop/AionsHome-main/aion-chat/main_configuration.py:122) |
| B26 | 输出/context上限 / max_tokens、TEMPERATURE_RANGES、MAX_CONTEXT_LIMIT | 部分Anthropic max_tokens=16384，context1–100 | 仅上下文条数滑块 | **仅内部配置** | 无token窗口档案 | generation_options/provider payload常量 | 代码/请求 | 条数不是模型token窗口；未见可编辑top_p/max_tokens档案 | [aion-chat/generation_options.py:20](/Users/remix/Desktop/AionsHome-main/aion-chat/generation_options.py:20)；[aion-chat/routes/chat.py:1145](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:1145) |

### 2.3 C. Chat、生成、缓存与语音快捷设置

| ID | 分类/名称与真实字段 | 代码默认 | 旧前端入口 | Penumbra状态 | Penumbra入口/边界 | AionHome支持/真实读写链 | 存储与作用域 | 问题/建议 | 代码证据 |
|---|---|---|---|---|---|---|---|---|---|
| C01 | 会话模型 / conversations.main_selection；旧model另存 | 创建复制B08；已有会话自身值 | Chat API/协议/模型弹层 | **部分实现** | Chat真实收发；无模型编辑，mapper只读旧model | GET /api/main/configuration?conv_id；PUT /api/conversations/{id} main_selection→DB；send读取resolve_main_request | DB会话持久→请求冻结 | 旧model可与执行模型不一致；优先对齐契约 | [aion-chat/routes/chat.py:940](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:940)；[src/domain/conversation/conversation-mappers.ts:50](/Users/remix/Desktop/Penumbra/src/domain/conversation/conversation-mappers.ts:50)；[src/components/chat/ChatView.tsx:59](/Users/remix/Desktop/Penumbra/src/components/chat/ChatView.tsx:59) |
| C02 | 请求温度 / temperature | 1.0，null也回1.0 | Chat温度滑块 | **后端已有** | 适配器支持，ChatView无控件 | send body/regenerate query→resolve_generation_options→provider | 单次请求；不写S | 不是自动继承S.temperature | [aion-chat/generation_options.py:86](/Users/remix/Desktop/AionsHome-main/aion-chat/generation_options.py:86)；[src/application/chat-send/chat-send-request.ts:10](/Users/remix/Desktop/Penumbra/src/application/chat-send/chat-send-request.ts:10)；[src/components/chat/ChatView.tsx:66](/Users/remix/Desktop/Penumbra/src/components/chat/ChatView.tsx:66) |
| C03 | 请求上下文 / context_limit | 30，范围1–100 | Chat上下文；LS aion_context_limit | **后端已有** | 适配器支持，无UI | 同C02→history selection | 设备默认转单次请求 | 不持久为会话参数；不是消息分页大小 | [aion-chat/generation_options.py:104](/Users/remix/Desktop/AionsHome-main/aion-chat/generation_options.py:104)；[aion-chat/static/chat.html:1300](/Users/remix/Desktop/AionsHome-main/aion-chat/static/chat.html:1300)；[src/application/chat-execution/chat-execution-request.ts:14](/Users/remix/Desktop/Penumbra/src/application/chat-execution/chat-execution-request.ts:14) |
| C04 | 请求thinking / thinking_effort | 不传/null=无request thinking | Chat强度，受thinking toggle控制 | **后端已有** | 适配器支持，无UI | 同C02；Anthropic支持low/medium/high/xhigh/max | 单次请求 | OpenAI medium仅兼容no-op，其它effort拒绝；不修改全局 | [aion-chat/generation_options.py:122](/Users/remix/Desktop/AionsHome-main/aion-chat/generation_options.py:122)；[aion-chat/static/chat.html:1469](/Users/remix/Desktop/AionsHome-main/aion-chat/static/chat.html:1469) |
| C05 | 请求快速模式 / fast_mode | false | 未发现显式控件 | **后端已有** | 适配器支持，无UI | 同C02→fast分支跳过RAG/即时摘要 | 单次请求 | 不是Provider能力开关 | [aion-chat/generation_options.py:20](/Users/remix/Desktop/AionsHome-main/aion-chat/generation_options.py:20)；[src/application/chat-send/chat-send-request.ts:24](/Users/remix/Desktop/Penumbra/src/application/chat-send/chat-send-request.ts:24) |
| C06 | 请求密语模式 / whisper_mode | false | /chat?whisper=1 | **后端已有** | 适配器支持，无UI | 同C02→prompt能力上下文 | 单次请求/独立模式 | 不是全局Persona；协议旧路径差异需保留 | [aion-chat/generation_options.py:20](/Users/remix/Desktop/AionsHome-main/aion-chat/generation_options.py:20)；[aion-chat/static/home.html:201](/Users/remix/Desktop/AionsHome-main/aion-chat/static/home.html:201)；[src/application/chat-send/chat-send-request.ts:25](/Users/remix/Desktop/Penumbra/src/application/chat-send/chat-send-request.ts:25) |
| C07 | 新会话携带历史 / aion_carryover_count；carryover.source_conv_id/message_ids | 0 | Chat携带条数0–50 | **旧前端独有** | 无UI，request mapper未带carryover | LS计数→选消息ID→首次send；后端读source rows核验并持久注入 | 设备默认+首次请求→DB消息 | 旧carryover_messages非空被拒；不是全局历史窗口 | [aion-chat/static/chat.html:3903](/Users/remix/Desktop/AionsHome-main/aion-chat/static/chat.html:3903)；[aion-chat/routes/chat.py:697](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:697)；[aion-chat/routes/chat.py:676](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:676) |
| C08 | 全局兼容温度 / temperature | 无持久值None；旧UI默认1 | Chat滑块双写aion_temperature | **旧前端独有** | 无 | PUT /api/settings/temperature→S；独立/optionless路径读取 | S全局跨业务 | safe GET未投影此字段；Main默认不走这里 | [aion-chat/routes/settings.py:249](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py:249)；[aion-chat/main_configuration.py:176](/Users/remix/Desktop/AionsHome-main/aion-chat/main_configuration.py:176)；[aion-chat/settings_secret_projection.py:47](/Users/remix/Desktop/AionsHome-main/aion-chat/settings_secret_projection.py:47) |
| C09 | 全局thinking开关 / enable_thinking | true | Chat扩展思考 | **旧前端独有** | 无 | GET /api/settings；PUT context_toggle→S；legacy optionless读取 | S全局 | Main request thinking由C04决定，不是同一覆盖层 | [aion-chat/routes/settings.py:268](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py:268)；[aion-chat/main_configuration.py:176](/Users/remix/Desktop/AionsHome-main/aion-chat/main_configuration.py:176) |
| C10 | 全局thinking强度 / thinking_effort | medium | Chat强度；LS镜像 | **旧前端独有** | 无 | GET settings/PUT context_toggle→set_thinking_effort→S | 全局兼容+设备镜像 | 与C04请求覆盖分离，send不再持久写强度 | [aion-chat/config.py:459](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:459)；[aion-chat/static/chat.html:1482](/Users/remix/Desktop/AionsHome-main/aion-chat/static/chat.html:1482)；[aion-chat/generation_options.py:141](/Users/remix/Desktop/AionsHome-main/aion-chat/generation_options.py:141) |
| C11 | 浮现间隔 / float_interval | 12 | Chat间隔；LS aion_float_interval | **旧前端独有** | 无 | PUT /api/settings/float_interval→S；Chat/Diary消费者读取 | 全局兼容跨会话 | safe GET未含float；本地镜像可能失步 | [aion-chat/routes/settings.py:259](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py:259)；[aion-chat/routes/diary.py:968](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/diary.py:968)；[aion-chat/static/chat.html:1315](/Users/remix/Desktop/AionsHome-main/aion-chat/static/chat.html:1315) |
| C12 | 旧HEART上下文 / include_heart | true且须hidden gate | Chat弹层 | **旧前端独有** | 无 | GET settings/PUT context_toggle→S→include_hidden_heart | 全局 | D10关闭时不因这里开启而注入 | [aion-chat/routes/settings.py:268](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py:268)；[aion-chat/config.py:177](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:177) |
| C13 | 旧DRIFT上下文 / include_drift（旧include_simplethink兼容） | true且须hidden gate | Chat弹层 | **旧前端独有** | 无 | 同C12→include_hidden_drift；旧键迁移 | 全局 | 应用隐藏状态与原生thinking分开 | [aion-chat/config.py:165](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:165)；[aion-chat/routes/settings.py:268](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py:268) |
| C14 | 缓存开关 / cache_enabled | true | Settings缓存 | **旧前端独有** | 无 | GET settings/PUT cache-toggle→setter→S→缓存消费者 | 全局 | 不能当本次请求普通开关 | [aion-chat/routes/settings.py:297](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py:297)；[aion-chat/config.py:505](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:505) |
| C15 | 冻结区 / cache_freeze_size（API freeze_size） | 20 | Settings冻结区 | **旧前端独有** | 无 | GET/PUT /api/settings/cache-config→S；全库UPDATE messages.cache_region | 全局+DB副作用 | 保存会清空freeze/slide区域，不仅影响前端显示 | [aion-chat/routes/settings.py:486](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py:486) |
| C16 | 滑动区 / cache_slide_max（API slide_max） | 10 | Settings滑动区 | **旧前端独有** | 无 | 同C15；非负校验 | 全局+DB副作用 | 属于高级行为设置 | [aion-chat/routes/settings.py:486](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py:486) |
| C17 | System缓存TTL / anthropic_system_cache_ttl（API ttl） | 1h，可5m | Settings TTL | **旧前端独有** | 无 | GET settings/PUT anthropic-system-cache-ttl→S→Anthropic | 全局 | 不改变冻结历史5m TTL | [aion-chat/config.py:516](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:516)；[aion-chat/static/settings.html:63](/Users/remix/Desktop/AionsHome-main/aion-chat/static/settings.html:63) |
| C18 | 保活 / cache_keepalive_enabled | true | 无已发现控件 | **后端已有** | 无 | GET/PUT /api/settings/keepalive→S→activity loop | 服务全局 | 不同于浏览器音频保活 | [aion-chat/routes/settings.py:335](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py:335)；[aion-chat/activity.py:846](/Users/remix/Desktop/AionsHome-main/aion-chat/activity.py:846) |
| C19 | 保活阈值 / cache_keepalive_threshold_min | 50，写入clamp1–55 | 无已发现控件 | **后端已有** | 无 | 同C18 | 服务全局 | 不应直接放Chat快捷面板 | [aion-chat/routes/settings.py:335](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py:335)；[aion-chat/activity.py:855](/Users/remix/Desktop/AionsHome-main/aion-chat/activity.py:855) |
| C20 | 兼容格式 / chat_format | openai | Settings基础与聊天 | **旧前端独有** | 无 | GET/PUT /api/settings/chat-format→S；independent catalog读取 | 全局兼容 | Main protocol在显式selection中，不由此选择 | [aion-chat/routes/settings.py:467](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py:467)；[aion-chat/independent_llm.py:71](/Users/remix/Desktop/AionsHome-main/aion-chat/independent_llm.py:71) |
| C21 | Anthropic日程分层 / anthropic_schedule_in_system | 固定true | 无有效关闭控件 | **仅内部配置** | 无 | 兼容setter忽略false写true，getter恒true | 代码固定策略/S兼容 | 不要再造可关闭UI | [aion-chat/config.py:531](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:531) |
| C22 | 自动播放 / aion_tts_enabled | false | Chat顶部TTS | **旧前端独有** | 无语音UI | LS→ttsEnabled→WS tts_state/HTTP fallback→manager | 设备持久；WS后端临时 | 任一WS启用可能影响主动回复，不是纯UI | [aion-chat/static/chat.html:2151](/Users/remix/Desktop/AionsHome-main/aion-chat/static/chat.html:2151)；[aion-chat/ws.py:30](/Users/remix/Desktop/AionsHome-main/aion-chat/ws.py:30) |
| C23 | 音色 / aion_tts_voice | 空，列表选择 | Chat音色 | **旧前端独有** | 无 | LS→GET /api/tts/voices→请求/WS voice | 设备偏好+Runtime | 不是服务全局统一音色 | [aion-chat/static/chat.html:2151](/Users/remix/Desktop/AionsHome-main/aion-chat/static/chat.html:2151)；[aion-chat/routes/settings.py:455](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py:455) |
| C24 | 自动语音条 / aion_voice_auto_generate | false | Chat弹层 | **旧前端独有** | 无 | LS→voiceAutoGenerate→TTS合成调用 | 设备持久/消息操作 | 不等于自动播放 | [aion-chat/static/chat.html:2151](/Users/remix/Desktop/AionsHome-main/aion-chat/static/chat.html:2151) |
| C25 | 语音监听 / aion_voice_enabled、voice.enabled | false | Chat语音监听 | **旧前端独有** | 无 | LS + POST /api/voice/toggle→voice.start/stop | 设备偏好；服务进程状态临时 | 启动文件不保存voice.enabled | [aion-chat/static/chat.html:1619](/Users/remix/Desktop/AionsHome-main/aion-chat/static/chat.html:1619)；[aion-chat/routes/voice.py:25](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/voice.py:25)；[aion-chat/voice.py:40](/Users/remix/Desktop/AionsHome-main/aion-chat/voice.py:40) |
| C26 | 唤醒词 / aion_voice_wakeword、wake_word | 老公 | Chat唤醒词 | **旧前端独有** | 无 | LS + voice/toggle wake_word→Voice实例 | 设备持久+进程临时 | 与Persona规则不同 | [aion-chat/static/chat.html:1628](/Users/remix/Desktop/AionsHome-main/aion-chat/static/chat.html:1628)；[aion-chat/routes/voice.py:16](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/voice.py:16) |
| C27 | 麦克风来源 / aion_voice_mic_source | local（local/remote） | Chat本机/手机 | **旧前端独有** | 无 | LS→本机后端监听或远端MediaRecorder/remote-asr | 设备持久 | OS麦克风权限不是后端设置 | [aion-chat/static/chat.html:1619](/Users/remix/Desktop/AionsHome-main/aion-chat/static/chat.html:1619)；[aion-chat/routes/voice.py:59](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/voice.py:59) |

### 2.4 D. Persona、Prompt、记忆与能力

| ID | 分类/名称与真实字段 | 代码默认 | 旧前端入口 | Penumbra状态 | Penumbra入口/边界 | AionHome支持/真实读写链 | 存储与作用域 | 问题/建议 | 代码证据 |
|---|---|---|---|---|---|---|---|---|---|
| D01 | AI人设 / ai_persona | 空 | /worldbook AI人设 | **旧前端独有** | 无Persona编辑器 | GET/PUT /api/worldbook→load/save_worldbook→prompt snapshot/builders | W全局持久 | PUT整文件重建5字段，会丢Diary开关等额外键 | [aion-chat/routes/settings.py:356](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py:356)；[aion-chat/static/worldbook.html:53](/Users/remix/Desktop/AionsHome-main/aion-chat/static/worldbook.html:53) |
| D02 | 用户人设/规则 / user_persona | 空 | /worldbook用户人设 | **旧前端独有** | 无 | 同D01 | W全局，多Runtime | 有文本规则，不是独立用户规则管理系统 | [aion-chat/config.py:340](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:340)；[aion-chat/static/worldbook.html:29](/Users/remix/Desktop/AionsHome-main/aion-chat/static/worldbook.html:29) |
| D03 | AI背景记忆 / ai_about | 空 | /worldbook“记住的” | **旧前端独有** | 无 | 同D01→多Runtime prompt | W全局 | 与memories RAG库不同 | [aion-chat/routes/settings.py:356](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py:356)；[aion-chat/static/worldbook.html:26](/Users/remix/Desktop/AionsHome-main/aion-chat/static/worldbook.html:26) |
| D04 | AI名称 / ai_name | AI | 世界书AI名字 | **旧前端独有** | 无 | 同D01 | W全局 | 影响多业务称呼，非仅Chat显示 | [aion-chat/config.py:346](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:346)；[aion-chat/static/worldbook.html:19](/Users/remix/Desktop/AionsHome-main/aion-chat/static/worldbook.html:19) |
| D05 | 用户名 / user_name | 你 | 世界书用户名字 | **旧前端独有** | 无 | 同D01 | W全局 | 不是登录账户名 | [aion-chat/config.py:346](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:346)；[aion-chat/static/worldbook.html:21](/Users/remix/Desktop/AionsHome-main/aion-chat/static/worldbook.html:21) |
| D06 | 遗留Prompt字段 / system_prompt | load_worldbook默认空 | 无 | **仅内部配置** | 无 | 仅见默认dict；WorldBookUpdate无字段，未找到字段实际消费者 | W遗留/未证实生效 | 不能认定已有可编辑系统Prompt架构 | [aion-chat/config.py:346](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:346)；[aion-chat/routes/settings.py:356](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py:356) |
| D07 | Provider metadata前缀 / user_prefix | 空 | Settings用户标识 | **旧前端独有** | 无 | GET user-info/PUT /api/settings/user-prefix→set_user_prefix→get_user_metadata | S全局 | 只影响后续metadata，不是Persona或设备名 | [aion-chat/routes/settings.py:777](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py:777)；[aion-chat/config.py:744](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:744) |
| D08 | Provider metadata身份 / user_id | 首次UUID | Settings只读 | **仅内部配置** | 无 | get_or_create_user_id→data/user_id.json；拼前缀 | 服务实例身份文件持久 | 不是普通可编辑项，不代表多用户账户系统 | [aion-chat/config.py:719](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:719) |
| D09 | 隐藏DRIFT生成gate / enable_hidden_drift（旧simplethink兼容） | false | Settings高级调试 | **旧前端独有** | 无 | GET/PUT settings→S→hidden_drift_enabled/include_hidden_drift/命令清理 | 全局，后续prompt | 与原生thinking不同 | [aion-chat/config.py:152](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:152)；[aion-chat/static/settings.html:219](/Users/remix/Desktop/AionsHome-main/aion-chat/static/settings.html:219) |
| D10 | 隐藏HEART生成gate / enable_hidden_heart | false | Settings高级调试 | **旧前端独有** | 无 | 同D09→hidden_heart_enabled | S全局 | include_heart不能绕过此gate | [aion-chat/config.py:161](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:161)；[aion-chat/routes/settings.py:225](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py:225) |
| D11 | 联网总许可 / web_access_enabled | false，严格true才允许 | Settings Web Access | **旧前端独有** | 无 | GET/PUT settings→S；Chat新消息捕获web_permission→URL Reader/WebSearch | 全局许可/单次捕获 | 历史证据仍可读；不是会话工具开关；regenerate不新执行联网 | [aion-chat/config.py:147](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:147)；[aion-chat/routes/chat.py:1215](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:1215)；[aion-chat/static/settings.html:88](/Users/remix/Desktop/AionsHome-main/aion-chat/static/settings.html:88) |
| D12 | Brave凭据 / brave_search_key | 空 | Settings Web Access | **旧前端独有** | 无 | safe GET/PUT settings、secret reveal/clear→S→web_search读取 | 全局凭据 | 不属于LLM Connection，不向Chat传秘密 | [aion-chat/routes/settings.py:219](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py:219)；[aion-chat/web_search.py:137](/Users/remix/Desktop/AionsHome-main/aion-chat/web_search.py:137) |
| D13 | MCP总开关 / enabled | false | /mcp启用MCP | **旧前端独有** | 无 | GET/PUT /api/mcp/config→M→client.reconcile、工具缓存失效 | 全局，真实连接副作用 | 前端不复制MCP状态机 | [aion-chat/config.py:544](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:544)；[aion-chat/routes/mcp.py:109](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/mcp.py:109)；[aion-chat/static/mcp.html:20](/Users/remix/Desktop/AionsHome-main/aion-chat/static/mcp.html:20) |
| D14 | MCP标识 / servers[name].name | 必填唯一 | MCP添加/编辑 | **旧前端独有** | 无 | GET/POST /api/mcp/servers；PUT/DELETE /{name}→M/reconcile | 全局持久 | 工具列表是派生信息，不是任意工具开关 | [aion-chat/routes/mcp.py:72](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/mcp.py:72)；[aion-chat/static/mcp.html:65](/Users/remix/Desktop/AionsHome-main/aion-chat/static/mcp.html:65) |
| D15 | MCP显示名 / display_name | 必填 | 同D14 | **旧前端独有** | 无 | 同D14 | M全局 | 展示名与标识不同 | [aion-chat/routes/mcp.py:72](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/mcp.py:72)；[aion-chat/static/mcp.html:69](/Users/remix/Desktop/AionsHome-main/aion-chat/static/mcp.html:69) |
| D16 | MCP地址 / url | 必填 | 同D14 | **旧前端独有** | 无 | 同D14→endpoint校验→连接 | M全局 | test为单次连接测试 | [aion-chat/routes/mcp.py:145](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/mcp.py:145)；[aion-chat/static/mcp.html:72](/Users/remix/Desktop/AionsHome-main/aion-chat/static/mcp.html:72) |
| D17 | MCP凭据 / token | 空 | MCP替换/查看/清除 | **旧前端独有** | 无 | 同D14；secret_ref→reveal/clear；安全GET | M全局凭据 | 留空保留与显式清除不同 | [aion-chat/routes/mcp.py:195](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/mcp.py:195)；[aion-chat/static/mcp.html:76](/Users/remix/Desktop/AionsHome-main/aion-chat/static/mcp.html:76) |
| D18 | MCP服务器启用 / enabled | API false；旧新增表单勾选true | MCP服务器开关 | **旧前端独有** | 无 | 同D14→reconcile；还须全局enabled | M全局 | 区别全局开关 | [aion-chat/routes/mcp.py:72](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/mcp.py:72)；[aion-chat/static/mcp.html:86](/Users/remix/Desktop/AionsHome-main/aion-chat/static/mcp.html:86) |
| D19 | MCP鉴权模式 / credential_mode | query_token | 未发现对应控件 | **后端已有** | 无 | MCP create/update/test schema→resolve_mcp_credential_mode→endpoint | M全局 | 后端支持不等于旧表单可编辑；其它模式见endpoint契约 | [aion-chat/routes/mcp.py:72](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/mcp.py:72)；[aion-chat/mcp_endpoint.py:1](/Users/remix/Desktop/AionsHome-main/aion-chat/mcp_endpoint.py:1) |
| D20 | MCP链深 / mcp_max_chain_depth | 5，clamp0–20 | Settings基础与聊天 | **旧前端独有** | 无 | GET/PUT settings→clamp→S→chain执行 | 全局 | 0只执行初始，不追加；不是tools总开关 | [aion-chat/config.py:485](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:485)；[aion-chat/static/settings.html:70](/Users/remix/Desktop/AionsHome-main/aion-chat/static/settings.html:70) |
| D21 | Capability/Command策略 / CAPABILITY_REGISTRY、default_enabled、effective policy | 静态声明+runtime facts | 无通用能力编辑器 | **仅内部配置** | 无 | registry→shadow/受控canonical prompt catalog；真正gate来自业务/请求 | 代码/请求快照 | 没有持久任意能力编辑器，不能按声明直接造开关 | [aion-chat/capability_registry.py:24](/Users/remix/Desktop/AionsHome-main/aion-chat/capability_registry.py:24)；[aion-chat/capability_registry.py:73](/Users/remix/Desktop/AionsHome-main/aion-chat/capability_registry.py:73)；[aion-chat/routes/chat.py:1204](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:1204) |
| D22 | 自动总结阈值 / _AUTO_DIGEST_MIN | 10条未总结消息 | 无 | **仅内部配置** | 无 | memory内部计数→异步digest | 代码/自动任务 | 没有用户可调阈值或统一memory总开关 | [aion-chat/memory.py:869](/Users/remix/Desktop/AionsHome-main/aion-chat/memory.py:869) |

### 2.5 E. 业务App内配置与集成

| ID | 分类/名称与真实字段 | 代码默认 | 旧前端入口 | Penumbra状态 | Penumbra入口/边界 | AionHome支持/真实读写链 | 存储与作用域 | 问题/建议 | 代码证据 |
|---|---|---|---|---|---|---|---|---|---|
| E01 | Diary自动投喂 / diary_auto_feed | false | /diary侧栏开关 | **已实现** | /app/diary月历下；Editorial同业务页 | GET auto-feed-status/POST /api/diary/auto-feed-toggle→W→广播auto_feed_status_changed；schedule读取 | W全局，与月/日期无关 | 写后GET核验；未消费该WS；Worldbook保存可丢键 | [src/components/diary/DiaryAutoFeed.tsx:8](/Users/remix/Desktop/Penumbra/src/components/diary/DiaryAutoFeed.tsx:8)；[src/domain/diary/diary-write-client.ts:35](/Users/remix/Desktop/Penumbra/src/domain/diary/diary-write-client.ts:35)；[aion-chat/routes/diary.py:1712](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/diary.py:1712)；[aion-chat/schedule.py:1887](/Users/remix/Desktop/AionsHome-main/aion-chat/schedule.py:1887) |
| E02 | Diary模型 / diary_entries.model、请求model | 旧catalog优先级，见§5 | Diary模型及Connection配置 | **旧前端独有** | 归档阅读/编辑不含Diary Chat配置 | GET/PUT /api/registry/selections/diary/{id}→DB JSON；send→_legacy_diary_model→independent | Entry持久/请求覆盖，独立Runtime | 显式Entry优先；旧路径latest Main catalog→entry→bootstrap | [aion-chat/registry_selection_settings.py:14](/Users/remix/Desktop/AionsHome-main/aion-chat/registry_selection_settings.py:14)；[aion-chat/routes/diary.py:288](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/diary.py:288) |
| E03 | Diary缓存断点 / diary_cache_breakpoint、diary_cache_msg_id | false，首批标记 | Diary自动投喂/消息流程 | **后端已有** | 无 | send字段→entry.auto_feed_config→后续生成 | 单次控制+DB运行元数据 | 内部流程，不是普通Settings开关 | [aion-chat/routes/diary.py:466](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/diary.py:466)；[aion-chat/routes/diary.py:691](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/diary.py:691) |
| E04 | Diary元数据 / importance、keywords、tags | 现存值；importance0–1约束 | Diary编辑 | **已实现** | 单篇编辑/关键词 | PUT /api/diary/entries/{id}→DB；Penumbra写后重读 | 单篇业务数据 | 保留Diary，不归全局偏好 | [src/domain/diary/diary-write-client.ts:6](/Users/remix/Desktop/Penumbra/src/domain/diary/diary-write-client.ts:6)；[src/components/diary/DiaryEditor.tsx:20](/Users/remix/Desktop/Penumbra/src/components/diary/DiaryEditor.tsx:20)；[aion-chat/routes/diary.py:585](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/diary.py:585) |
| E05 | Memory置顶待解决 / memories.unresolved | 新建通常0；切换bool | Memory置顶 | **已实现** | /app/memory单条置顶 | PUT /api/memories/{id}/unresolved设置目标bool→DB→readback | 单条memory，参与召回 | 与pin_first查询排序不同；旧PATCH是切换值，不能当PUT目标设置替代 | [src/components/memory/MemoryView.tsx:22](/Users/remix/Desktop/Penumbra/src/components/memory/MemoryView.tsx:22)；[src/domain/memory/memory-client.ts:47](/Users/remix/Desktop/Penumbra/src/domain/memory/memory-client.ts:47)；[aion-chat/routes/memories.py:217](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/memories.py:217) |
| E06 | Memory元数据 / type、importance、keywords | event、0.5、空 | Memory新增/编辑 | **部分实现** | 新增已接；现存完整编辑未迁 | POST/PUT /api/memories→memory/DB/embedding | 单条业务数据 | 不能称所有Memory配置已迁移 | [src/components/memory/MemoryCreateDialog.tsx:26](/Users/remix/Desktop/Penumbra/src/components/memory/MemoryCreateDialog.tsx:26)；[aion-chat/routes/memories.py:38](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/memories.py:38) |
| E07 | 总结锚点 / last_digest_ts、last_digest_msg_id | 0、空 | Memory总结面板日期重置 | **旧前端独有** | 无锚点/手动digest入口 | GET/POST /api/memories/digest/anchor→load/save_digest_anchor | data/digest_anchor.json全局游标 | 改变重新总结范围，业务高级操作 | [aion-chat/routes/memories.py:248](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/memories.py:248)；[aion-chat/config.py:369](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:369) |
| E08 | Quick Note截止时刻 / qn_trigger_hours | [5,12,20] | Quick Note触发时间编辑 | **部分实现** | 读取时段/业务日期；无编辑 | GET/PUT trigger-config→quick_note_periods→S；schedule读取 | 全局，首小时为业务日界 | 影响速记/日记素材归属；不是纯时钟偏好 | [src/domain/quick-note/quick-note-client.ts:9](/Users/remix/Desktop/Penumbra/src/domain/quick-note/quick-note-client.ts:9)；[aion-chat/routes/quick_notes.py:502](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/quick_notes.py:502)；[aion-chat/quick_note_config.py:22](/Users/remix/Desktop/AionsHome-main/aion-chat/quick_note_config.py:22) |
| E09 | Quick Note名称 / qn_period_labels | 5夜晚/12上午/20下午 | 同E08 | **部分实现** | 只读消费 | 同E08，键须与hours一一对应 | S全局 | 可重名，截止小时是身份，不能仅按名称定位 | [aion-chat/quick_note_config.py:22](/Users/remix/Desktop/AionsHome-main/aion-chat/quick_note_config.py:22)；[aion-chat/static/quick-notes.html:685](/Users/remix/Desktop/AionsHome-main/aion-chat/static/quick-notes.html:685) |
| E10 | 活动AI联动 / activity_tracking_enabled | true | /activity-logs总开关 | **部分实现** | Activity更多→AI活动参考，只读 | GET/PUT /api/activity/config→setter→S→activity_config_changed | 全局AI联动 | 不等于采集权限或手机可见性；Penumbra无PUT | [src/components/activity/ActivityLinkageDetails.tsx:6](/Users/remix/Desktop/Penumbra/src/components/activity/ActivityLinkageDetails.tsx:6)；[aion-chat/routes/activity.py:134](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/activity.py:134)；[aion-chat/activity.py:710](/Users/remix/Desktop/AionsHome-main/aion-chat/activity.py:710) |
| E11 | AI手机上下文可见 / device_context_ai_visible | true | 旧活动日志手机状态 | **已实现** | Activity→允许AI查看手机状态 | safe GET/PUT settings→S；Chat开始capture_device_prompt_context | 全局，后续prompt | 不关闭手机采样/OS权限/活动日志 | [src/components/activity/PhoneStatusPanel.tsx:45](/Users/remix/Desktop/Penumbra/src/components/activity/PhoneStatusPanel.tsx:45)；[src/domain/device-context/device-context-client.ts:8](/Users/remix/Desktop/Penumbra/src/domain/device-context/device-context-client.ts:8)；[aion-chat/routes/chat.py:1196](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:1196) |
| E12 | Wi-Fi场景 / mappings[].ssid/scene、revision | []、0 | 活动手机面板，Native可读SSID | **已实现** | Activity Wi-Fi场景增改删 | GET/PUT wifi-config→WifiConfigUpdate→SQLite CAS事务revision+1 | DB wifi_scene_config，服务器供手机同步 | Penumbra手填SSID，家庭/公司；409需重读；不是家坐标 | [src/components/activity/WifiSceneSettings.tsx:8](/Users/remix/Desktop/Penumbra/src/components/activity/WifiSceneSettings.tsx:8)；[src/domain/device-context/device-context-client.ts:15](/Users/remix/Desktop/Penumbra/src/domain/device-context/device-context-client.ts:15)；[aion-chat/wifi_scene_config.py:31](/Users/remix/Desktop/AionsHome-main/aion-chat/wifi_scene_config.py:31) |
| E13 | 手机绑定 / device_id、binding_id、installation_id、revision | primary，未绑定 | WebView host+Android授权流程 | **后端已有** | 无绑定/重绑UI，Activity只状态 | binding/context、prepare、complete→device_binding/安装与grant表 | DB服务实例/设备绑定 | OS权限属Native，未完整审计；Penumbra无此状态机 | [aion-chat/routes/device_binding.py:66](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/device_binding.py:66)；[aion-chat/device_binding.py:42](/Users/remix/Desktop/AionsHome-main/aion-chat/device_binding.py:42)；[aion-chat/static/device-context-host.js:1](/Users/remix/Desktop/AionsHome-main/aion-chat/static/device-context-host.js:1) |
| E14 | Location总开关 / enabled | false | Location配置 | **已实现** | /app/location总开关 | GET/PUT /api/location/config→load/save→heartbeat消费 | L全局 | status不是配置；保存后重读 | [src/components/location/LocationOverview.tsx:21](/Users/remix/Desktop/Penumbra/src/components/location/LocationOverview.tsx:21)；[aion-chat/routes/location.py:220](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/location.py:220)；[aion-chat/location.py:54](/Users/remix/Desktop/AionsHome-main/aion-chat/location.py:54) |
| E15 | Location静默开关 / quiet_hours_enabled | false | Location静默 | **已实现** | Location静默时段 | 同E14→is_location_quiet_hours | L全局 | 不是Camera静默开关 | [src/components/location/LocationQuietHours.tsx:13](/Users/remix/Desktop/Penumbra/src/components/location/LocationQuietHours.tsx:13)；[aion-chat/location.py:598](/Users/remix/Desktop/AionsHome-main/aion-chat/location.py:598) |
| E16 | 统一静默 / quiet_hours_start/end | 00:00/08:00 | 同E15 | **已实现** | Location统一时段 | 同E14/15 | L全局 | 工作日/休息日非空值优先 | [src/domain/location/location-types.ts:1](/Users/remix/Desktop/Penumbra/src/domain/location/location-types.ts:1)；[aion-chat/location.py:617](/Users/remix/Desktop/AionsHome-main/aion-chat/location.py:617) |
| E17 | 工作日静默 / quiet_hours_weekday_start/end | 空→统一 | 同E15 | **已实现** | Location工作日时段 | 同E14/15 | L全局 | 不独立更改时区 | [src/components/location/LocationQuietHours.tsx:13](/Users/remix/Desktop/Penumbra/src/components/location/LocationQuietHours.tsx:13)；[aion-chat/location.py:617](/Users/remix/Desktop/AionsHome-main/aion-chat/location.py:617) |
| E18 | 休息日静默 / quiet_hours_weekend_start/end | 空→统一 | 同E15 | **已实现** | Location休息日时段 | 同E14/15 | L全局 | 继承统一值，不是缺省00:00 | [src/domain/location/location-types.ts:1](/Users/remix/Desktop/Penumbra/src/domain/location/location-types.ts:1)；[aion-chat/location.py:620](/Users/remix/Desktop/AionsHome-main/aion-chat/location.py:620) |
| E19 | 工作日 / weekday_days | 1,2,3,4,5 | Location工作日选择 | **已实现** | Location静默时段 | GET/PUT config→L→静默判定 | L全局 | 1周一至7周日 | [src/components/location/LocationQuietHours.tsx:13](/Users/remix/Desktop/Penumbra/src/components/location/LocationQuietHours.tsx:13)；[aion-chat/location.py:77](/Users/remix/Desktop/AionsHome-main/aion-chat/location.py:77) |
| E20 | 家庭坐标 / home_lng、home_lat | 0/0 | Location设家/坐标 | **已实现** | 高级位置配置，设为家 | GET/PUT config或POST /set-home→L；heartbeat算距离 | L全局GCJ-02 | 与Wi-Fi home场景独立；不是当前采样位置 | [src/components/location/LocationAdvanced.tsx:10](/Users/remix/Desktop/Penumbra/src/components/location/LocationAdvanced.tsx:10)；[src/domain/location/location-client.ts:15](/Users/remix/Desktop/Penumbra/src/domain/location/location-client.ts:15)；[aion-chat/routes/location.py:331](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/location.py:331) |
| E21 | 在家范围 / home_threshold | 500米，API最低50 | Location范围 | **已实现** | 高级位置配置 | GET/PUT config→clamp→L→状态判定 | L全局 | 新设置不直接创造采样事实 | [src/components/location/LocationAdvanced.tsx:10](/Users/remix/Desktop/Penumbra/src/components/location/LocationAdvanced.tsx:10)；[aion-chat/routes/location.py:236](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/location.py:236) |
| E22 | POI半径 / poi_radius | 3000米，500–10000 | Location POI | **已实现** | 高级位置配置 | GET/PUT config→L→POI搜索 | L全局默认；搜索可request覆盖 | 不是类别映射编辑 | [src/domain/location/location-types.ts:14](/Users/remix/Desktop/Penumbra/src/domain/location/location-types.ts:14)；[aion-chat/routes/location.py:242](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/location.py:242)；[aion-chat/location_commands.py:7](/Users/remix/Desktop/AionsHome-main/aion-chat/location_commands.py:7) |
| E23 | 高德凭据 / amap_key | 空 | Location Key管理 | **已实现** | 高级位置配置Key独立表单 | safe GET/PUT config、secrets/reveal/clear→L；高德API消费 | L全局凭据 | Key/位置/主设置分区保存；保留/替换/清除明确 | [src/components/location/LocationCredentials.tsx:14](/Users/remix/Desktop/Penumbra/src/components/location/LocationCredentials.tsx:14)；[src/domain/location/location-client.ts:22](/Users/remix/Desktop/Penumbra/src/domain/location/location-client.ts:22)；[aion-chat/routes/location.py:220](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/location.py:220) |
| E24 | 外出上报周期 / heartbeat_outdoor_min | 10分钟；API下限1 | 未发现旧Web心跳编辑控件 | **后端已有** | LocationValues未包含 | GET/PUT config→L；未发现字段的执行消费者 | L全局持久字段，未证实运行生效 | 当前APK代码固定10分钟，只读active，不消费此字段；存储API不等于有效周期设置 | [aion-chat/location.py:54](/Users/remix/Desktop/AionsHome-main/aion-chat/location.py:54)；[aion-chat/routes/location.py:195](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/location.py:195)；[src/domain/location/location-types.ts:1](/Users/remix/Desktop/Penumbra/src/domain/location/location-types.ts:1) |
| E25 | 在家上报周期 / heartbeat_home_min | 10分钟；API下限5 | 未发现旧Web心跳编辑控件 | **后端已有** | 未接 | 同E24 | L全局持久字段 | 同E24，当前APK不消费此字段；不应直接开放无效UI | [aion-chat/location.py:54](/Users/remix/Desktop/AionsHome-main/aion-chat/location.py:54)；[aion-chat/routes/location.py:239](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/location.py:239) |
| E26 | POI类别映射 / poi_types | 餐饮050000/风景110000/娱乐100000/购物060000 | 无编辑器 | **仅内部配置** | 仅类别/搜索展示 | load_location_config补默认→POI；PUT schema不开放 | L文件/代码策略 | GET出现不代表可编辑 | [aion-chat/location.py:54](/Users/remix/Desktop/AionsHome-main/aion-chat/location.py:54)；[aion-chat/routes/location.py:195](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/location.py:195) |
| E27 | 显著移动阈值 / movement_threshold | 300米 | 无 | **仅内部配置** | 无 | 加载L→heartbeat判断；PUT未开放 | 文件/代码策略 | 不直接暴露普通Settings | [aion-chat/location.py:68](/Users/remix/Desktop/AionsHome-main/aion-chat/location.py:68)；[aion-chat/routes/location.py:195](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/location.py:195) |
| E28 | Camera设备 / camera_index | 0 | /camera选择摄像头 | **旧前端独有** | 无Camera管理页；查岗只状态/旧链接 | GET status、POST open、PUT config→cam.cfg→save_cam_config | K全局；camera running另临时 | 选择硬件不是模型绑定 | [aion-chat/routes/cam.py:34](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/cam.py:34)；[aion-chat/config.py:412](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:412)；[src/components/schedule/ScheduleCameraStatus.tsx:1](/Users/remix/Desktop/Penumbra/src/components/schedule/ScheduleCameraStatus.tsx:1) |
| E29 | 随机截图周期 / auto_interval_min/max | 10/20分钟 | Camera配置 | **旧前端独有** | 无 | GET status/PUT config→K→monitor loop | 全局持久 | min>=1，max>=min | [aion-chat/routes/cam.py:89](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/cam.py:89)；[aion-chat/config.py:412](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:412) |
| E30 | 截图保留数量 / max_screenshots | 200 | Camera保留数量 | **旧前端独有** | 无 | GET status/PUT config→K→screenshot清理 | 全局文件策略 | 0关闭自动清理；只清screenshots监控cam_图，不含cam_check_；uploads副本不在该清理范围 | [aion-chat/routes/cam.py:89](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/cam.py:89)；[aion-chat/camera.py:365](/Users/remix/Desktop/AionsHome-main/aion-chat/camera.py:365) |
| E31 | 自动监控 / monitor_enabled | false | Camera启动/停止监控 | **旧前端独有** | 无 | POST /api/cam/monitor/start/stop→save_cam_config | K全局持久+进程状态 | camera open/monitoring状态不等于同一持久开关 | [aion-chat/camera.py:397](/Users/remix/Desktop/AionsHome-main/aion-chat/camera.py:397)；[aion-chat/routes/cam.py:70](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/cam.py:70) |
| E32 | Camera静默 / quiet_hours_enabled/start/end | false、00:00/09:00 | Camera静默配置 | **旧前端独有** | 无 | GET status/PUT config→K→_is_quiet_hours | 全局持久 | 独立于Location静默，不能只因同名合并 | [aion-chat/config.py:412](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:412)；[aion-chat/routes/cam.py:89](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/cam.py:89) |
| E33 | Camera裁剪 / zoom、cx、cy | 1、0.5、0.5 | Camera画面缩放/平移 | **旧前端独有** | 无 | GET/PUT /api/cam/crop→cam.set_crop实例属性 | 后端进程临时，重启不恢复 | zoom1–10，中心0–1；未写K | [aion-chat/routes/cam.py:118](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/cam.py:118)；[aion-chat/camera.py:171](/Users/remix/Desktop/AionsHome-main/aion-chat/camera.py:171) |
| E34 | 四类日程 / type、content、trigger_at、status | API type=alarm；按类型校验 | /schedule及AI命令 | **已实现** | 记挂/app/calendar、待办/todo、闹钟/clock；标题切查岗monitor | GET/POST schedules、done/restore/delete→DB→schedule loop/WS | 单条任务业务数据 | 已接四类；未见重复周期/全局暂停等；查岗需Camera/Main | [src/components/schedule/ScheduleView.tsx:95](/Users/remix/Desktop/Penumbra/src/components/schedule/ScheduleView.tsx:95)；[src/components/schedule/ScheduleCreateDialog.tsx:15](/Users/remix/Desktop/Penumbra/src/components/schedule/ScheduleCreateDialog.tsx:15)；[aion-chat/routes/schedule.py:19](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/schedule.py:19) |
| E35 | Theater角色 / name、persona、model、temperature、context_limit | 新角色、空、空、0.8、20 | Theater角色管理 | **旧前端独有** | 无Theater App | GET/POST/PUT personas；registry selections/theater_persona可显式JSON→角色文件→runtime | data/theater_personas.json角色持久 | 角色model覆盖会话；温度body优先；context由UI预填请求 | [aion-chat/routes/theater.py:54](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/theater.py:54)；[aion-chat/routes/theater.py:321](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/theater.py:321)；[aion-chat/static/theater.html:1127](/Users/remix/Desktop/AionsHome-main/aion-chat/static/theater.html:1127) |
| E36 | Theater会话 / model、persona_id | bootstrap、空角色 | Theater会话配置 | **旧前端独有** | 无 | theater conversations CRUD、registry selections/theater→DB→independent resolver | DB theater_conversations会话 | 显式模型独立于Main | [aion-chat/routes/theater.py:70](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/theater.py:70)；[aion-chat/registry_selection_settings.py:45](/Users/remix/Desktop/AionsHome-main/aion-chat/registry_selection_settings.py:45) |
| E37 | Theater请求偏好 / theater_context_limit、theater_temperature | 20、0.8 | Theater滑块 | **旧前端独有** | 无 | LS恢复→send body/regenerate query | 设备默认→单次请求 | 不混用Main LS键；角色可以预填UI | [aion-chat/static/theater.html:388](/Users/remix/Desktop/AionsHome-main/aion-chat/static/theater.html:388)；[aion-chat/routes/theater.py:82](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/theater.py:82) |
| E38 | Theater语音 / theater_tts_enabled、theater_tts_voice | false、空 | Theater TTS | **旧前端独有** | 无 | LS→send tts_enabled/voice→TTSStreamer | 设备默认/请求 | 与Main TTS键独立 | [aion-chat/static/theater.html:388](/Users/remix/Desktop/AionsHome-main/aion-chat/static/theater.html:388)；[aion-chat/routes/theater.py:82](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/theater.py:82) |
| E39 | Book批注覆盖 / model_key | null→B15；v1兼容bootstrap | Reading发null；无已证实override编辑器 | **后端已有** | 无Reading App | POST annotate/annotate-all→independent_default_model/resolve | 本次批注Runtime | 不是每本书持久模型配置；阅读进度是业务数据 | [aion-chat/routes/book.py:262](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/book.py:262)；[aion-chat/routes/book.py:393](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/book.py:393)；[aion-chat/static/reading.html:973](/Users/remix/Desktop/AionsHome-main/aion-chat/static/reading.html:973) |
| E40 | Game模型 / model_key、binding_fingerprint/metadata | 显式或B16，新Session捕获 | 无已发现Game静态页 | **后端已有** | 无Game App | POST games/{id}/sessions→binding.resolve→game_sessions；resume核指纹 | DB Session持久/冻结 | Session选择不可改；凭据漂移可能拒绝恢复 | [aion-chat/game/service.py:41](/Users/remix/Desktop/AionsHome-main/aion-chat/game/service.py:41)；[aion-chat/game/binding.py:23](/Users/remix/Desktop/AionsHome-main/aion-chat/game/binding.py:23)；[aion-chat/registry_selection_settings.py:70](/Users/remix/Desktop/AionsHome-main/aion-chat/registry_selection_settings.py:70) |
| E41 | Game局参数 / config.difficulty/chapter | casual、ch01_the_hostage | 无Game配置页 | **后端已有** | 无 | create config→DetroitAdapter.prepare_config→session.config | DB Session | 仅3种难度、第1章；memory policy是代码固定 | [aion-chat/game/detroit.py:105](/Users/remix/Desktop/AionsHome-main/aion-chat/game/detroit.py:105)；[aion-chat/game/domain.py:8](/Users/remix/Desktop/AionsHome-main/aion-chat/game/domain.py:8) |
| E42 | 音乐登录 / netease_music_u | 空 | Settings音乐MUSIC_U | **旧前端独有** | 音乐App/Widget为展示 | safe GET/PUT settings、secret→S→reload_login | 全局凭据 | 独立于LLM Key；不输出Cookie | [aion-chat/routes/settings.py:197](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py:197)；[aion-chat/music.py:32](/Users/remix/Desktop/AionsHome-main/aion-chat/music.py:32)；[src/widgets/MusicWidget.tsx:8](/Users/remix/Desktop/Penumbra/src/widgets/MusicWidget.tsx:8) |
| E43 | 音乐音量 / aion_music_volume | 100% | Settings音乐+Chat播放 | **旧前端独有** | 音量按钮未接通 | MusicVolume get/setPercent→LS→musicvolumechange/storage/iframe→audio.volume | 设备/origin持久 | 多个入口共用同键，适合本地偏好 | [aion-chat/static/music-volume.js:4](/Users/remix/Desktop/AionsHome-main/aion-chat/static/music-volume.js:4)；[src/widgets/MusicWidget.tsx:40](/Users/remix/Desktop/Penumbra/src/widgets/MusicWidget.tsx:40) |
| E44 | MiniMax TTS连接 / minimax_tts_url/key | 空→DEFAULT_API_URLS；key空 | Settings语音 | **旧前端独有** | 无 | GET/PUT settings→S→getters→speech TTS；secret另接口 | 全局服务集成 | 未全部归入LLM Connection Registry | [aion-chat/routes/settings.py:85](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py:85)；[aion-chat/config.py:279](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:279) |
| E45 | MiniMax TTS模型 / minimax_tts_model | 空→MiniMaxAI/MiniMax-User | 同E44 | **旧前端独有** | 无 | 同E44→get_minimax_tts_model | S全局 | 不同于本机音色C23 | [aion-chat/config.py:52](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:52)；[aion-chat/config.py:314](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:314) |
| E46 | TTS Provider / tts_provider | minimax，支持siliconflow/elevenlabs | Settings语音服务 | **旧前端独有** | 无 | GET/PUT settings→枚举回退→get_tts_provider | S全局 | 选服务不等于打开播放 | [aion-chat/routes/settings.py:179](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py:179)；[aion-chat/config.py:322](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:322) |
| E47 | SiliconFlow TTS模型 / siliconflow_tts_model | 空→FunAudioLLM/CosyVoice2-0.5B | Settings语音 | **旧前端独有** | 无 | 同E44；复用siliconflow URL/Key | S全局 | 会与Embedding共享连接凭据 | [aion-chat/config.py:54](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:54)；[aion-chat/config.py:327](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:327) |
| E48 | ElevenLabs连接 / elevenlabs_tts_url/key | 空→api.elevenlabs.io；key空 | Settings语音 | **旧前端独有** | 无 | GET/PUT settings→S→getters→speech；secret另接口 | 全局凭据 | 留空不等于清除 | [aion-chat/routes/settings.py:90](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py:90)；[aion-chat/config.py:302](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:302) |
| E49 | ElevenLabs模型/格式 / elevenlabs_tts_model/output_format | eleven_multilingual_v2、mp3_44100_128 | Settings语音 | **旧前端独有** | 无 | 同E48→相应getters | S全局 | UI允许空，getter回默认 | [aion-chat/config.py:55](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:55)；[aion-chat/config.py:331](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:331) |
| E50 | ASR连接 / minimax_asr_url/key | 空→DEFAULT_API_URLS；key空 | Settings语音识别 | **旧前端独有** | 无 | GET/PUT settings→S→getters→voice ASR | 全局凭据 | 与麦克风OS权限不同 | [aion-chat/routes/settings.py:94](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py:94)；[aion-chat/voice.py:16](/Users/remix/Desktop/AionsHome-main/aion-chat/voice.py:16) |
| E51 | ASR模型 / minimax_asr_model | 空→MiniMaxAI/Speech-01 | Settings语音识别 | **旧前端独有** | 无 | 同E50→get_minimax_asr_model | S全局 | 独立服务模型，不是Main默认 | [aion-chat/config.py:53](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:53)；[aion-chat/config.py:318](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:318) |
| E52 | Embedding共享连接 / siliconflow_url/key | 空→DEFAULT_API_URLS；key空 | Settings向量API | **旧前端独有** | 无 | GET/PUT settings→v2 Connection兼容映射→memory/speech读取 | S；连接统一权威 | 改它可能同时影响SF TTS/兼容LLM连接 | [aion-chat/connection_registry.py:290](/Users/remix/Desktop/AionsHome-main/aion-chat/connection_registry.py:290)；[aion-chat/routes/settings.py:165](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py:165)；[aion-chat/static/settings.html:131](/Users/remix/Desktop/AionsHome-main/aion-chat/static/settings.html:131) |
| E53 | Embedding模型 / embedding_model | 空→BAAI/bge-large-zh-v1.5；1024维 | Settings向量模型 | **旧前端独有** | 无 | GET/PUT settings→get_embedding_model→向量生成 | S全局+DB向量兼容性 | 旧UI提示带Pro/，代码默认不带；模型/维度改变需数据迁移评估 | [aion-chat/config.py:59](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:59)；[aion-chat/config.py:310](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:310)；[aion-chat/static/settings.html:139](/Users/remix/Desktop/AionsHome-main/aion-chat/static/settings.html:139) |
| E54 | 旧Whisper设备预设 / sosexy_presets_v3[].motors[].on/mode/speed | 9组TOY_DEF_PRESETS模板，具体值见代码 | /chat?whisper=1预设编辑 | **旧前端独有** | 无设备预设UI | toyLoadPresets读LS，编辑后toySavePresets写LS；运行发送设备指令 | 设备/origin持久；AionHome无服务端预设存储 | 保留独立业务/设备控制页；不并入普通模型设置；BLE连接本身是临时状态 | [预设:5143](/Users/remix/Desktop/AionsHome-main/aion-chat/static/chat.html:5143)；[保存:5155](/Users/remix/Desktop/AionsHome-main/aion-chat/static/chat.html:5155) |

### 2.6 F. 系统、部署与内部策略

| ID | 分类/名称与真实字段 | 代码默认 | 旧前端入口 | Penumbra状态 | Penumbra入口/边界 | AionHome支持/真实读写链 | 存储与作用域 | 问题/建议 | 代码证据 |
|---|---|---|---|---|---|---|---|---|---|
| F01 | 数据路径 / DATA_DIR、DB_PATH、UPLOADS_DIR、CHATS_DIR、SCREENSHOTS_DIR、TTS_CACHE_DIR | aion-chat/data及子目录 | 无普通UI | **仅内部配置** | 无 | 代码路径→SQLite/JSON/文件读写 | 服务实例/部署目录 | 需稳定data目录或卷与备份；没有用户改目录接口 | [aion-chat/config.py:25](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:25) |
| F02 | 上传策略 / ALLOWED_TYPES、20MiB、时间戳命名 | JPEG/PNG/GIF/WebP及MP4/WebM/QuickTime | 只选附件，不编辑策略 | **仅内部配置** | 无策略编辑 | /api/upload MIME白名单→完整读文件→尺寸→uploads | 代码服务策略 | 未见解码/像素/魔数检查；不是完整资产系统 | [aion-chat/config.py:444](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:444)；[aion-chat/routes/files.py:199](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/files.py:199) |
| F03 | 初始登录 / AION_AUTH_USERNAME/PASSWORD | admin；未给密码则随机 | 仅登录页 | **仅内部配置** | Session只读概览 | 首次ensure_auth_config→auth.json；已有文件不被env覆盖 | 管理员env+文件 | 没有普通改密/账户管理页 | [aion-chat/auth.py:114](/Users/remix/Desktop/AionsHome-main/aion-chat/auth.py:114) |
| F04 | 鉴权/Push / session_secret、push_token、ANDROID_PUSH_TOKEN、SESSION_SECONDS | 随机secret/token，Session30天 | 无凭据编辑器 | **仅内部配置** | 无 | auth.json或Push env覆盖→cookie/请求鉴权 | 管理员凭据/进程鉴权 | 不公开原始凭据；不要导入普通Settings | [aion-chat/auth.py:17](/Users/remix/Desktop/AionsHome-main/aion-chat/auth.py:17)；[aion-chat/auth.py:201](/Users/remix/Desktop/AionsHome-main/aion-chat/auth.py:201) |
| F05 | 设备有效期env / AION_DEVICE_CONTEXT_BATTERY_TTL_SECONDS、WIFI_TTL_SECONDS、MAX_SAMPLE_AGE_SECONDS、FUTURE_SKEW_SECONDS | 7200、7200、300、60秒 | 无 | **仅内部配置** | 无 | load_device_context_settings→freshness判定 | 部署env服务全局 | 不是Activity UI刷新频率 | [aion-chat/device_context.py:104](/Users/remix/Desktop/AionsHome-main/aion-chat/device_context.py:104)；[aion-chat/device_context.py:125](/Users/remix/Desktop/AionsHome-main/aion-chat/device_context.py:125) |
| F06 | 旧绑定env / AION_DEVICE_CONTEXT_DEVICE_ID、BINDING_ID | 空，仅一次兼容导入 | 无 | **仅内部配置** | 无 | initialize_binding_schema→DB device_binding | env迁移输入→DB权威 | 不能作为请求期绑定来源 | [aion-chat/device_binding.py:42](/Users/remix/Desktop/AionsHome-main/aion-chat/device_binding.py:42) |
| F07 | 业务时区 / TZ或/etc/localtime IANA | 实际进程时区；代码不猜测 | 无UI，只读展示 | **仅内部配置** | 日程/速记读取 | business_time_zone→日期契约/定时任务 | 部署env/OS全局 | 服务器实际值未验证；本地时钟不是后端时区 | [aion-chat/quick_note_config.py:68](/Users/remix/Desktop/AionsHome-main/aion-chat/quick_note_config.py:68) |
| F08 | Penumbra端点 / VITE_API_BASE_URL(BASE)、VITE_UPLOAD_URL、VITE_WEBSOCKET_URL(WS_URL)、VITE_API_TIMEOUT_MS | 同源、/api/upload、/ws、30000ms | 不适用 | **仅内部配置** | 无编辑器 | 构建env→createRuntimeConfig→HTTP/WS/upload | 前端构建/部署 | 不是模型API Base URL，runtimeConfig冻结 | [src/lib/runtime-config.ts:1](/Users/remix/Desktop/Penumbra/src/lib/runtime-config.ts:1) |
| F09 | 开发反代 / PENUMBRA_DEV_PROXY_TARGET | 未设不代理 | 不适用 | **仅内部配置** | 无 | Vite createDevProxyConfig→/api、/uploads、/ws及明确旧Camera资源 | 开发env | origin校验，禁止凭据/path/query | [src/config/dev-proxy-config.ts:3](/Users/remix/Desktop/Penumbra/src/config/dev-proxy-config.ts:3) |
| F10 | 受控路径gate / canonical_path_enabled、force_legacy、anthropic_canonical_path_enabled、anthropic_force_legacy | 均false | 无普通UI | **仅内部配置** | 无 | PUT settings→S；请求capture policy→legacy/canonical | 管理员运行策略/请求捕获 | Prompt Architecture有shadow/受控执行，不是用户编排产品 | [aion-chat/config.py:108](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:108)；[aion-chat/routes/chat.py:1130](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:1130) |
| F11 | 诊断/启动/代理 / AION_STARTUP_MODE、AION_ANTHROPIC_PROVENANCE_DEBUG/HMAC_KEY/LOG、WEB_EVIDENCE_DIAGNOSTICS(_TARGET)、HTTPS_PROXY/https_proxy | normal；诊断关闭/空，代理由环境 | 无 | **仅内部配置** | 无 | 模块读env→启动/观测/Web传输 | 管理员/开发env | 未读取真实环境值；每字段解析见源码 | [aion-chat/main.py:70](/Users/remix/Desktop/AionsHome-main/aion-chat/main.py:70)；[aion-chat/anthropic_provenance.py:200](/Users/remix/Desktop/AionsHome-main/aion-chat/anthropic_provenance.py:200)；[aion-chat/web_evidence_diagnostics.py:71](/Users/remix/Desktop/AionsHome-main/aion-chat/web_evidence_diagnostics.py:71)；[aion-chat/web_search.py:117](/Users/remix/Desktop/AionsHome-main/aion-chat/web_search.py:117) |
| F12 | 备份 / data_dir、state_dir、credentials_file、restic_binary、expected_repository_id、historical_database_files、extra_files、reserve_bytes、run_timeout_seconds、sqlite_timeout_seconds；timer | 示例1GiB、10800/1800秒；03:15上海+随机10分钟 | 无 | **仅内部配置** | 无 | 配置→aionhome_backup.py；systemd timer/service | 部署文件/管理员 | 有工具/示例不证明生产部署；public资源不应默认在data备份 | [deploy/backup/config.example.json:1](/Users/remix/Desktop/AionsHome-main/deploy/backup/config.example.json:1)；[deploy/backup/aionhome-backup.timer:1](/Users/remix/Desktop/AionsHome-main/deploy/backup/aionhome-backup.timer:1) |
| F13 | Activity保留 / KEEP_HOURS、清理节流 | 3小时，最多每5分钟清理 | 无保留时长编辑器 | **仅内部配置** | 清空日志是业务动作 | activity cleanup→JSONL截断/删除 | 代码策略/data/activity_logs | 不把清空按钮计作持久偏好 | [aion-chat/activity.py:100](/Users/remix/Desktop/AionsHome-main/aion-chat/activity.py:100)；[aion-chat/activity.py:295](/Users/remix/Desktop/AionsHome-main/aion-chat/activity.py:295) |
| F14 | Memory算法 / DECAY_LAMBDA、FRESHNESS_HALF_LIFE_H、ARCHIVE_THRESHOLD、SQL top-k/阈值 | 0.05、36小时、0.3；各查询常量 | 无 | **仅内部配置** | 无 | decay_engine评分+memory查询 | 代码算法 | 内部函数参数不全部转用户设置 | [aion-chat/decay_engine.py:12](/Users/remix/Desktop/AionsHome-main/aion-chat/decay_engine.py:12)；[aion-chat/memory.py:328](/Users/remix/Desktop/AionsHome-main/aion-chat/memory.py:328) |

### 2.7 未计为已开放配置的项目

| 项目 | 已确认边界 |
|---|---|
| Chat独立背景 | Penumbra src/index.css:153仅有--chat-wallpaper:none，未找到用户设置写入/消费链；旧Chat body使用固定--bg。不能认定已有聊天壁纸配置。 |
| 日历Settings | SettingsView.tsx:471–485为PlaceholderSection，无读写；真实日程已在业务页，不能据占位认定业务功能缺失。 |
| Weather/Music/Notes App | DesktopAppView.tsx:133走AppPlaceholder；MusicWidget.tsx:9是模拟播放。静态城市、歌曲、音量按钮不算正式配置。Quick Note是另一独立真实App。 |
| 桌面页码/编辑态/Picker/Sheet/弹窗/滚动 | React state或history URL；无长期偏好保存。layout类型里minimized不证明完整窗口位置/尺寸管理。 |
| Memory筛选/排序 | 搜索、日期、importance filter、pinFirst是当前查询状态，不是修改重要度/召回算法；单条unresolved才是持久业务字段。 |
| Diary月份、Activity设备筛选、补写overwrite、日程active/history | 当前查询或单次业务操作，不统统转成Settings。书籍阅读进度、日记正文、日程内容也不是系统偏好。 |
| 旧导航/提醒状态 | aion_last_conv、diaryViewerLastId、aion_carryover_{conv}、aion_quick_note_reminder_dismissed为LS导航、待发送引用或已忽略提醒；C07已列真正携带数量偏好。 |
| BLE连接/当前设备状态 | 旧Whisper模式BLE连接状态、实时设备档位属运行态；可持久编辑的预设已列E54，不与运行态混计。 |
| KNOWN_USAGES未迁移标识 | camera_core/location_core/alarm/monitor/activity_greeting/quick_note_generation/diary_chat/theater_chat不等于8个可编辑独立绑定。实际MIGRATED_USAGES只有Main加8个辅助，共9个。 |
| Prompt Architecture | snapshot/PromptPlan/shadow/受控canonical路径已在源码，未找到用户可编辑Prompt分层、Command语法或通用Capability持久CRUD；不能将内部声明变成虚构设置能力。 |

证据：[App入口](/Users/remix/Desktop/Penumbra/src/components/apps/DesktopAppView.tsx:125)、[占位](/Users/remix/Desktop/Penumbra/src/components/settings/SettingsView.tsx:471)、[Memory查询](/Users/remix/Desktop/Penumbra/src/components/memory/MemoryView.tsx:85)、[旧LS状态](/Users/remix/Desktop/AionsHome-main/aion-chat/static/chat.html:1456)、[预设](/Users/remix/Desktop/AionsHome-main/aion-chat/static/chat.html:5157)、[usage清单](/Users/remix/Desktop/AionsHome-main/aion-chat/registry_configuration.py:43)。

## 3. Penumbra已实现配置索引

经典桌面/app/{id}和Editorial /editorial/app/{id}共用业务组件；桌面外观消费者不同。

| 真实入口 | 已实现配置 | 部分/只读边界 |
|---|---|---|
| 桌面Settings（两个桌面均可打开） | A01–A09模式、两类颜色、壁纸文件及五项参数 | 安全GET session/models/readiness仅运行概览；没有Provider CRUD；日历设置占位 |
| 经典桌面 | A10贴纸、A11布局、A12签名、A08文字明暗快捷切换 | App打开/桌面页码临时；无完整持久窗口管理 |
| /editorial | A13独立签名；复用Settings/业务页 | 不消费getCustomWallpaper；固定Editorial布局；Mode: Day文字静态，不能当实际明暗状态 |
| /app/diary | E01月历下自动投喂；E04单篇重要度/关键词/标签 | 不含旧Diary Chat模型/缓存断点 |
| /app/memory | E05单条置顶；E06新增类型/重要度/关键词 | E06整体部分：现存内容完整编辑、总结锚点未迁移；pinFirst仅查询 |
| /app/activity | E11允许AI看手机状态；E12 Wi-Fi场景增改删 | E10旧活动AI联动只读；不是采集权限开关 |
| /app/location | E14–E23总开关、三组静默时段、工作日、家庭坐标/范围、POI半径、Key | 心跳周期仅后端；类别映射/移动阈值仅内部 |
| /app/calendar、/app/todo、/app/clock | E34记挂/TODO/Alarm/查岗四种任务创建/状态管理；clock标题切查岗 | 单条任务是业务数据；未有重复周期/全局暂停等设置 |
| /app/chat | 真实收发/重生成、会话选择、读取目录和readiness | C01配置部分：模型只按旧字段；C02–C06有transport能力无UI，未实现真实模型切换入口 |

证据：[Settings挂载](/Users/remix/Desktop/Penumbra/src/widgets/Desktop.tsx:551)、[Editorial挂载](/Users/remix/Desktop/Penumbra/src/components/desktop-v2/EditorialDesktop.tsx:118)、[Diary月历](/Users/remix/Desktop/Penumbra/src/components/diary/DiaryAutoFeed.tsx:8)、[Activity](/Users/remix/Desktop/Penumbra/src/components/activity/PhoneStatusPanel.tsx:45)、[查岗入口](/Users/remix/Desktop/Penumbra/src/components/schedule/ScheduleView.tsx:95)、[Chat请求](/Users/remix/Desktop/Penumbra/src/components/chat/ChatView.tsx:59)。

## 4. 旧前端待迁移配置索引

| 旧入口 | 待迁移内容 | 推荐承接位置 |
|---|---|---|
| Settings AI配置 | B01–B16连接与9种任务绑定；B23测试/B24发现 | Settings连接、模型与任务；复用v2权威 |
| Settings基础与聊天 | C14–C17缓存，C20兼容format，D20 MCP链深，D07前缀 | Settings高级；cache-config有全库副作用 |
| Settings Web/能力/高级 | D09–D12调试/Web/Brave，E42音乐登录，E44–E53语音/Embedding | 功能与集成；调试仅高级/管理员 |
| Chat配置弹层 | C01会话Connection/协议/模型，C07携带；C08–C13全局兼容项；C22–C27语音 | Chat轻量入口，但scope不能混淆 |
| Worldbook | D01–D05人设、用户规则文本、名称 | 独立Persona/世界书页，Settings索引 |
| MCP | D13–D18总开关/Server；D19仅后端 | 独立工具管理页/Settings深层页 |
| Diary | E02模型和旧Diary聊天；E03内部缓存流程 | 保留Diary内；E01已经迁移，不能造第二份开关 |
| Memory | E07锚点，E06现存记录编辑 | Memory业务高级操作 |
| Quick Note | E08/E09时段编辑 | Quick Note高级配置；Penumbra已读但不能改 |
| Activity Logs | E10旧活动AI联动开关 | Activity内；手机可见性/Wi-Fi已迁 |
| Camera | E28–E33设备、自动截图、保留、监控、静默、裁剪 | 独立Camera；查岗仅状态/链接 |
| Theater | E35–E38角色、会话、生成/语音 | 独立Runtime/业务App |
| Reading | 批注默认B15在Settings，E39本次override仅API | 阅读业务页，不创造每本书的伪全局偏好 |
| 音乐Settings/Chat | E43本机音量 | 本地共享偏好服务 |
| 旧Whisper模式 | E54设备预设 | 独立业务/设备控制页，不放全局模型配置 |

Location主要Web配置已迁；E24/E25只有后端读写字段，当前APK固定10分钟、不消费它们，不应误列旧Web待迁控件或已有效的周期设置。B17–B19是兼容能力，不代表旧UI当前仍开放完整旧长表单。C18/C19 keepalive仅后端。Game有后端及新Session默认，未找到旧静态Game页面。

## 5. API、模型与Chat配置关系图/说明

### 5.1 [现状] 连接、模型定义、业务分配是三种语义

~~~text
Connection（S:model_api_registry.connections）
  id / base_url / credential / enabled / transport / default_model仅预填
          │ 被显式引用；普通连接自身不拥有协议
          ├── FeatureBinding {usage, connection_id, protocol, model literal}
          │     ├── main_chat：新会话创建时复制
          │     │     → DB conversations.main_selection
          │     │     → send/regenerate resolve_main_request
          │     │     → frozen RuntimeLLMBinding + GenerationOptions
          │     ├── memory_sentinel / memory_digest / web_compression
          │     ├── quick_note_compression / camera_sentinel / location_sentinel
          │     └── book_annotation（新请求默认）/game_decision（新Session默认）
          └── Diary Entry / Theater会话或角色 / Game Session显式选择
                → 独立DB/TEXT或角色JSON → independent_llm → frozen Runtime

静态MODEL_REGISTRY（代码）→ 兼容catalog key与建议，不是任意模型档案CRUD
conversations.model（DB）→ 旧catalog事实，不再决定Main连接/协议
selected_api_config_id / chat_format → 部分独立catalog兼容路径
request options → 本次temperature/context_limit/thinking_effort/fast/whisper
global compatibility settings → optionless/独立/proactive特定消费者
~~~

v2 Connection是凭据权威；服务器JSON保存secret，GET仅投影metadata。SecretStr不是磁盘加密。atomic_save_settings默认新文件0600并保留既有权限；这不提供多文件/DB事务。旧profiles写路由409 use_connection_api，不要在新UI继续接。
证据：[Connection契约](/Users/remix/Desktop/AionsHome-main/aion-chat/connection_registry.py:18)、[持久secret](/Users/remix/Desktop/AionsHome-main/aion-chat/connection_registry.py:123)、[替换/清除](/Users/remix/Desktop/AionsHome-main/aion-chat/connection_registry.py:513)、[旧路由](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/registry.py:62)、[落盘](/Users/remix/Desktop/AionsHome-main/aion-chat/settings_persistence.py:9)。

### 5.2 [现状] 默认/覆盖不是现成统一继承树

| 配置域 | 当前优先级/生命周期 |
|---|---|
| Main模型 | 创建时显式main_selection优先，否则复制main_chat全局默认；已有会话读自身main_selection。legacy model输入只改已选连接上的literal，不切换连接。 |
| Connection.default_model | 用户选连接时预填；不覆盖已保存的会话/任务，不等于Main默认。 |
| Main生成参数 | 本次请求字段→generation_options自身默认（1.0/30/false/false/无thinking）；不写S，不保存为会话偏好，也不自动读全局温度/强度。 |
| 全局兼容生成参数 | 独立/optionless消费者可读取S temperature/enable_thinking/thinking_effort；具体调用是否传use_global_temperature或显式温度决定。 |
| Diary模型 | 请求显式model→Entry显式JSON模型→最近Main旧catalog model→Entry旧model→bootstrap；不能当作始终跟随Main literal。 |
| Theater | 角色非空model覆盖theater会话model；body.temperature优先，否则角色temperature；context_limit读请求，UI可切角色预填。 |
| Book | 本次model_key优先，缺省book_annotation；v2缺选择明确报错，v1 bootstrap兼容。 |
| Game | 创建显式模型优先，否则game_decision；Session保存选择/指纹，运行与恢复不重读新默认。 |

证据：[Main写入](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:940)、[默认](/Users/remix/Desktop/AionsHome-main/aion-chat/main_configuration.py:94)、[参数](/Users/remix/Desktop/AionsHome-main/aion-chat/generation_options.py:136)、[optionless](/Users/remix/Desktop/AionsHome-main/aion-chat/main_configuration.py:176)、[Diary](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/diary.py:288)、[Theater](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/theater.py:321)、[独立默认](/Users/remix/Desktop/AionsHome-main/aion-chat/independent_llm.py:19)、[Game指纹](/Users/remix/Desktop/AionsHome-main/aion-chat/game/binding.py:63)。

**[问题] Penumbra的模型显示与readiness读取不符合当前权威。** Conversation mapper只保留model；loadChatSetupForConversation传conversation.modelKey给/api/chat/readiness?model，没有conv_id。后端readiness现在按显式Main选择，legacy model query只在默认profile上改literal；对原生connection_id选择构造也可能失败。后端missing_credential/main_default_not_selected/invalid_main_selection等新reason_code不在Penumbra白名单，会判契约错误。静态链路足以证明错位，实际生产触发频率未测。只读模型目录也不是连接远端模型全集。
证据：[会话mapper](/Users/remix/Desktop/Penumbra/src/domain/conversation/conversation-mappers.ts:50)、[setup service](/Users/remix/Desktop/Penumbra/src/application/chat-setup/chat-setup-service.ts:25)、[readiness client](/Users/remix/Desktop/Penumbra/src/domain/runtime/runtime-client.ts:32)、[reason白名单](/Users/remix/Desktop/Penumbra/src/domain/runtime/runtime-mappers.ts:15)、[后端现契约](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat_readiness.py:24)。

### 5.3 切换Chat模型是否影响别的功能

**[现状] 会影响部分后续任务，不能承诺只影响Chat。** Camera Core、Location Core、Alarm、Monitor、Activity greeting、Quick Note Step2取最近更新Main会话并resolve_conversation_main；不是各自拥有独立已生效FeatureBinding。更改会话选择会更新updated_at，可能使它成为“最近会话”。

已独立绑定的Memory/压缩/Sentinel等不直接跟随Main，但若共用Connection，修改URL/Key/enabled会影响它们后续请求。显式Diary Entry/Theater/Game独立；旧Diary catalog路径仍有最近Main兼容model依赖。

证据：[会话updated_at](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:1018)、[Camera Core](/Users/remix/Desktop/AionsHome-main/aion-chat/camera.py:767)、[Location Core](/Users/remix/Desktop/AionsHome-main/aion-chat/location.py:1198)、[Activity](/Users/remix/Desktop/AionsHome-main/aion-chat/activity.py:1124)、[Alarm](/Users/remix/Desktop/AionsHome-main/aion-chat/schedule.py:428)、[Monitor](/Users/remix/Desktop/AionsHome-main/aion-chat/schedule.py:830)、[Quick Note Step2](/Users/remix/Desktop/AionsHome-main/aion-chat/schedule.py:1292)。

### 5.4 [建议] 多入口同步与进行中的Runtime

- Settings全局默认、Chat会话选择、本次参数和设备音量分开标scope；Chat复用选择器/client；不要用旧selected_api_config_id实现当前模型切换。“设为新会话默认”必须独立动作。
- 保存以服务端为准：mutation后重读，失效readiness/选择列表/使用方摘要；跨页签LS事件只能同步本地偏好。服务器配置需要revision和领域变更通知；冲突保留草稿。
- Diary本端写后核验，但Penumbra未订阅auto_feed_status_changed；Wi-Fi已有revision CAS可作并发样例。未发现全系统通用配置WS同步，不能宣称多入口已全面一致。
- 模型/连接/generation options在Runtime开始冻结，follow-up复用绑定。新默认/参数应只影响后续请求；**不要把这个保证扩展到所有全局配置**。MCP reconcile、业务开关、cache-region全库重置有各自副作用，需专门定义中途变更语义。
- Game恢复指纹校验有意阻止漂移，不绕过；改默认不修改已有会话/历史内容。

证据：[binding snapshot](/Users/remix/Desktop/AionsHome-main/aion-chat/main_configuration.py:122)、[follow-up复用](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:835)、[cache副作用](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py:511)、[Diary挂载](/Users/remix/Desktop/Penumbra/src/components/diary/useDiary.ts:10)、[Diary写后核验](/Users/remix/Desktop/Penumbra/src/application/diary-reader/diary-actions-controller.ts:112)、[Wi-Fi CAS](/Users/remix/Desktop/AionsHome-main/aion-chat/wifi_scene_config.py:56)。

补充边界：E24/E25虽能经API存储，但当前配套APK的LOCATION_INTERVAL/LOCATION_INTERVAL_DISABLED均固定10分钟，checkLocationEnabled只读取active，源码未消费heartbeat_outdoor_min/home_min。因此这是“配置可存、行为未接”的缺口，新增表单本身不能达到调节周期目标。证据：[APK固定周期](/Users/remix/Desktop/AionsHome-main/AionApp/app/src/main/java/com/aion/chat/AionPushService.java:165)、[配置读取](/Users/remix/Desktop/AionsHome-main/AionApp/app/src/main/java/com/aion/chat/AionPushService.java:456)。

## 6. 外观与图片存储专项审计

### 6.1 旧前端：未找到自定义壁纸的用户管理链路

已检查static下HTML/JS、public资源引用及相关路由；追踪壁纸/背景/主题/头像、上传、浏览器存储和图片处理调用。

| 资源 | [现状] 实际存储与恢复 | 不能据此推出的能力 |
|---|---|---|
| 旧主页壁纸 | home.html:27固定URL /public/BackGround.webp?v=1；PUBLIC_DIR是仓库根public，通过FastAPI /public挂载 | 没有“选择→上传→记录用户外观→恢复”的壁纸UI/API；手动换发布文件不是用户设置 |
| 旧Chat背景/字体/气泡 | chat.html:15–29与186起固定CSS | 不是浏览器保存的图片；没有可编辑聊天背景配置 |
| 旧Chat头像 | 固定/public/icon_user.png、icon_ai.png | 没有已证实自定义头像上传和引用记录 |
| 聊天附件 | 选择/粘贴→handleFileSelect→FormData POST /api/upload→pendingAttachments返回URL→send attachments→DB messages.attachments→历史读取恢复 | 可复用上传基础，但不是壁纸链路；上传后未发送的pending引用只在内存 |

证据：[主页固定壁纸](/Users/remix/Desktop/AionsHome-main/aion-chat/static/home.html:27)、[Chat CSS](/Users/remix/Desktop/AionsHome-main/aion-chat/static/chat.html:15)、[头像](/Users/remix/Desktop/AionsHome-main/aion-chat/static/chat.html:2976)、[选择/上传](/Users/remix/Desktop/AionsHome-main/aion-chat/static/chat.html:4950)、[附件持久化](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:1180)、[静态挂载](/Users/remix/Desktop/AionsHome-main/aion-chat/main.py:299)。

### 6.2 AionHome已经具备哪些文件能力

1. **上传/本体存储**：POST /api/upload接收UploadFile，声明content_type白名单→mimetypes推扩展名→int(time.time()*1000)文件名→完整file.read→20MiB检查→写aion-chat/data/uploads→返回url/type/name。原始字节在服务器目录，前端保存的是返回引用，不是Base64唯一副本。
2. **访问**：/uploads和/screenshots为StaticFiles；/public指向仓库根public。主鉴权中间件只豁免/public与登录等明确路径，/uploads不豁免，常规浏览器需有效session。没有逐用户/逐文件ownership ACL。反代若直接服务文件绕过FastAPI，权限仍需部署验证。
3. **重启恢复**：data文件与DB URL保留则普通服务重启后可读取。代码路径相对源码目录；重部署若换release并未保留data，不能保证恢复。没有证据可断言实际服务器挂了持久卷。
4. **主题与文件分离**：聊天附件URL进入DB，文件在uploads；主页壁纸URL写死CSS，文件在public。没有当前服务器Appearance记录可把这些资源与用户主题关联。
5. **删除**：未找到通用DELETE /uploads/{asset}或外观资产删除接口，没有统一引用计数/孤儿回收；不能把删除消息或换图等同为安全删文件。
6. **格式/安全校验**：有声明MIME白名单和总字节限制；未见图片解码、魔数、像素/解压尺寸检查；读完整文件才判尺寸；毫秒命名存在并发碰撞可能。未直接采用用户filename拼路径，但这不等于完整安全图片管线。
7. **运维**：仓库有Restic备份脚本、data_dir示例、systemd timer/service；不证明生产启用/备份成功。public固定资源不属于data/uploads，需分别落实发布与备份。

证据：[上传](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/files.py:199)、[目录](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:25)、[白名单](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:444)、[鉴权豁免](/Users/remix/Desktop/AionsHome-main/aion-chat/main.py:192)、[静态服务](/Users/remix/Desktop/AionsHome-main/aion-chat/main.py:299)、[备份示例](/Users/remix/Desktop/AionsHome-main/deploy/backup/config.example.json:1)。

### 6.3 Penumbra：图片本体和显示配置明确分开

~~~text
选择File（image/*且≤20MiB）
  → SettingsView.chooseWallpaper
  → saveCustomWallpaper(file)
  → IndexedDB penumbra-preferences / wallpapers / key=desktop（Blob本体）
  → localStorage penumbra-wallpaper-settings（mode/fit/position/shade/textTone）
  → penumbra-wallpaper-change自定义事件
  → Desktop重读Blob → URL.createObjectURL → CSS backgroundImage

页面刷新
  → 重读LS/IDB → 创建新的blob: URL；旧Blob URL未被持久保存

移除
  → IDB.delete(desktop) → mode=ambient → revokeObjectURL
~~~

**[现状] localStorage中不含壁纸图片URL、Base64或像素；图片内容在IDB，Blob URL只是当前页面渲染引用。** 这条选择/保存链没有fetch、FormData或后端上传调用。贴纸同理，但使用另一IDB库/store/key；所有贴纸实例共享desktop-sticker。清站点数据、浏览器存储回收、换origin/设备时，不能保证图片恢复。仅保存参数并不能恢复不存在的Blob。

证据：[选择校验与保存](/Users/remix/Desktop/Penumbra/src/components/settings/SettingsView.tsx:113)、[配置结构](/Users/remix/Desktop/Penumbra/src/lib/wallpaper.ts:15)、[IDB读写](/Users/remix/Desktop/Penumbra/src/lib/wallpaper.ts:131)、[Desktop恢复](/Users/remix/Desktop/Penumbra/src/widgets/Desktop.tsx:389)、[贴纸存储](/Users/remix/Desktop/Penumbra/src/widgets/sticker-storage.ts:1)。

| 存储机制 | 静态检查结果 |
|---|---|
| localStorage | 模式、两类颜色、壁纸显示参数、布局/版本、两套签名；不是壁纸文件内容 |
| IndexedDB | 壁纸Blob：penumbra-preferences/wallpapers/desktop；贴纸Blob：penumbra-widget-assets/images/desktop-sticker |
| sessionStorage | Penumbra src/public未发现调用 |
| Cache Storage / Service Worker | Penumbra未发现caches.open/put等持久化调用；旧sw.js只有安装/激活与空fetch handler，没有缓存实现 |
| Data URL / Base64 | 未发现自定义外观图片走readAsDataURL或Data URL持久化；不据此推断历史版本浏览器存储不存在这些格式 |
| Blob URL | Settings预览/Desktop背景/Sticker展示；清理时revoke；不作为长期URL存储 |
| 后端文件URL | 通用transport已有upload URL与/uploads反代；Chat附件UI仍disabled；壁纸链未调用后端 |
| HTTP缓存 | 若服务器持有文件，缓存只是可再获取副本；不是服务器持久化或访问控制，也不是唯一资产来源 |

证据：[运行端点](/Users/remix/Desktop/Penumbra/src/lib/runtime-config.ts:1)、[上传反代](/Users/remix/Desktop/Penumbra/src/config/dev-proxy-config.ts:48)、[附件未接](/Users/remix/Desktop/Penumbra/src/components/chat/Sender.tsx:126)、[旧SW](/Users/remix/Desktop/AionsHome-main/aion-chat/static/sw.js:1)。搜索排除node_modules/build/test fixtures；未检查浏览器实际数据库。

### 6.4 [建议] 最小服务器化与无损迁移

结论：**可复用已有上传、会话鉴权和文件读取基础；不能声称已有壁纸资源管理系统。** 最小缺口是资产身份/关系、服务器Appearance偏好与更新版本、替换删除、持久部署契约。

| 能力 | 建议实现 | 当前基础/缺口 |
|---|---|---|
| 资产身份 | UUID或内容哈希asset_id，记录MIME、字节、hash、尺寸、用途、服务/用户归属；稳定受控URL | 已能上传文件；缺资产registry/归属/用途和稳健唯一命名 |
| 外观引用 | Appearance记录{wallpaperAssetId,mode,fit,position,shade,textTone,revision}；颜色等可逐步并入 | 当前只有LS；没有服务器Appearance读写/版本 |
| 替换顺序 | 上传新资源并验证→更新配置引用→确认可读；失败保留旧引用；无引用新文件延迟回收 | 不先删除旧图，不先保存无效URL；文件/配置无现成事务 |
| 删除/回收 | 先解除引用，检查桌面/Chat/贴纸等全部用途，再宽限期GC；保护共享资源和恢复窗口 | 当前无通用删除API/引用追踪；不能直接unlink URL目标 |
| 多设备 | 同一服务读取Appearance revision/asset；需要时设备单独覆盖 | 当前浏览器/origin隔离；服务器URL存在仍需服务器偏好引用才能自动恢复 |
| 本地Blob无损导入 | 原origin浏览器读取原Blob→上传原字节→hash核对→保存引用→服务端重读成功→标迁移完成；成功前保留本地副本 | blob: URL本身不能迁移；不要截图/重编码替代原图；本轮不执行 |
| 格式兼容 | Penumbra接受image/*（可能含SVG/AVIF/HEIC），旧上传只白名单JPEG/PNG/GIF/WebP；迁移前核对原MIME/字节，明确服务器格式策略，不静默转码或失败后删除本地 | 复用旧接口不保证所有已有Blob可直接无损导入 |
| 历史Data URL | 若后续发现，原浏览器解码为Blob后按字节导入；仅外链不能声称已有原文件 | 当前没有历史格式证据，不自动抓远端图片 |
| 私有访问 | 普通私图不放豁免/public；复用session并核反代；多用户时补ownership ACL；根据敏感性private/no-store或受验证缓存 | /uploads经FastAPI需认证，但尚无逐用户隔离；不可用不可猜URL代替权限 |
| 重启/更新/重部署 | 稳定data根或持久卷；发布/回滚保留资产与引用；一致备份/恢复验证 | 相对data路径和备份示例不足证明实际生产持久性 |
| 失败/冲突恢复 | 保留旧背景与迁移状态；revision冲突重读；多个入口失效同步，不静默覆盖草稿 | 当前只同页事件，没有跨设备同步/迁移状态 |

长期资源本体优先服务器；页码/滚动/弹窗临时留本地。设备音量、布局、跟随系统模式可以继续本机偏好。颜色/壁纸参数是否服务默认且允许设备覆盖，属于产品语义待定，不能擅自变成“全局唯一主题”。

## 7. Settings初步分类与入口建议

以下均为**未来建议**，不是现状。分类不要求固定数量App，也不在本轮新建页面/路由。

| 放置类别 | 建议内容 | 与Chat交集/边界 |
|---|---|---|
| 统一Settings：外观 | A01–A09与服务器资产；可索引贴纸/布局 | Chat未来背景/字号快捷入口复用同一底层偏好，当前这两项尚未实现 |
| 统一Settings：API与连接 | B01–B07、测试/发现、secret操作、引用诊断 | Chat选已配置Connection/协议/模型，链接管理页，不重复Key表单 |
| 统一Settings：模型与任务 | B08–B16、Main新会话默认、各任务生命周期与覆盖来源 | Chat切当前会话；“设为新会话默认”为独立明确操作 |
| 独立App/深层页 | Persona/Worldbook、MCP、Camera、Theater、Reading/Game | 有复杂业务/Runtime；Settings索引/摘要，不塞进总长表单 |
| 保留业务App内 | Diary自动投喂/元数据、Memory置顶/锚点、Quick Note时段、Activity两个不同AI开关/Wi-Fi、Location静默/家、日程任务；心跳周期先补有效消费者契约 | 就近解释影响；Settings可提供索引，不造第二份权威 |
| Chat轻量入口 | 本会话模型、本次temperature/context/thinking/fast、设备播放/音色 | 复用领域client；新增会话参数持久化要先定契约，不能用全局PUT模拟会话偏好 |
| 功能与系统 | Web全局许可、语音/Embedding/Music集成；cache高级配置按风险/权限收纳 | 当前Web只有全局许可；每会话/单次tools授权是新能力，不能伪装已存在 |
| 管理员/部署 | env、路径/卷、鉴权/Push、TZ、retention/算法、cutover/diagnostics、backup | 不进入普通UI；可提供无秘密健康摘要 |

建议先形成“**外观、API与连接、模型与任务分配、功能与集成**”四个语义模块；Chat保持业务内轻量面板；Persona、MCP、Camera可独立页。共享字段必须同一服务端权威、领域client与readback/invalidation，不建立涵盖所有旧/api/settings字段的巨大DTO。

## 8. 重复配置、存储风险及迁移依赖

| 优先级 | [现状/问题] 与影响 | [建议] |
|---|---|---|
| P0 | Worldbook PUT仅重建ai_persona/user_persona/ai_about/ai_name/user_name五字段，而Diary在同一W写diary_auto_feed；保存世界书会丢键并按false读取，隐式关闭无对应广播 | 先修字段保留/写入契约和回归覆盖；存储拆分可后续；本轮不修 |
| P0 | Penumbra旧model/readiness mapper与main_selection、新reason codes错位（§5.2），可展示旧模型或错误阻断 | Settings/Chat表单前先对齐安全读取、会话选择与readiness，不只换UI |
| P1 | 最近Main会话被主动任务/速记复用；切模型更新updated_at，也可能改变“最近”目标 | 显式标注跟随最近Main；是否独立绑定是行为设计，不在UI迁移中偷改 |
| P1 | Main请求默认与全局兼容温度/thinking不是统一继承；旧UI温度/float双写LS/S且safe GET未投影二者 | 定义effective值/来源；去前端双权威，保留兼容 |
| P1 | 壁纸/贴纸IDB可能唯一副本；换origin/清存储/设备迁移丢图 | Appearance+资产引用+显式无损导入，成功前保留Blob |
| P1 | 上传无引用保护/归属/回收，毫秒命名及声明MIME验证有限；部署卷未证实 | 外观资源完整链路交付，落实权限、持久目录、备份/恢复 |
| P1 | Embedding SF字段与Connection兼容映射重叠；TTS共用Key；旧active配置仍影响部分catalog独立路径 | 保持Connection单一权威，展示共享影响，不另建raw provider存储 |
| P1 | cache-config保存重置全库cache_region；MCP写后reconcile真实连接 | 高级入口定义运行中变更语义，不笼统承诺全部仅下一请求生效 |
| P2 | Location心跳字段只有存储API，APK固定周期不消费（E24/E25） | 先确定需要调节的真实消费者与协议，再开放UI，避免无效开关 |
| P2 | W/L/K/M直接JSON整文件写，未见统一revision；S原子replace只保完整性，不防业务lost update或跨DB不一致 | 领域写入契约/readback，按需revision；参考Wi-Fi CAS |
| P2 | Diary不订阅开关WS；模式有storage同步，壁纸只有同页事件，颜色无同等完整同步 | 分别验证同页/同origin多页签/多设备；补失效策略 |
| P2 | classic/Editorial签名分键；Editorial不消费壁纸；贴纸实例共享key | 先明确产品范围，再定服务默认/设备覆盖/实例引用 |
| P2 | 早期审计中Chat mock、Registry缺失、GET返回raw key等均是历史快照，不能沿用为当前事实 | 保留旧文档，当前实施基于源码/日期；不复述已解决缺口 |

关键证据：[Worldbook整文件保存](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py:367)、[Diary同文件开关](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/diary.py:1712)、[cache重置](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py:511)、[MCP协调](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/mcp.py:117)、[配置原子替换](/Users/remix/Desktop/AionsHome-main/aion-chat/settings_persistence.py:9)。

安全现状纠正：GET /api/settings及api-config读取已有安全投影/no-store，不再是早期审计的“返回所有raw key”；旧UI显式查看/清除走专用secret接口。服务器JSON仍保存凭据，有权限的显式reveal不等于常规GET泄露。本轮未调用reveal、未输出秘密。
证据：[settings安全GET](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py:119)、[API config安全GET](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py:557)、[投影白名单](/Users/remix/Desktop/AionsHome-main/aion-chat/settings_secret_projection.py:31)、[旧UI显式查看](/Users/remix/Desktop/AionsHome-main/aion-chat/static/settings-registry-ui.js:80)。

## 9. 建议实施顺序

本轮不执行下列工作；按语义完整链路合并，避免每个开关拆一个PR。

| 顺序/边界 | 合并交付内容 | 依赖/验证 |
|---|---|---|
| 1. 配置权威与读取契约 | Worldbook字段保留；Main selection/readiness DTO/diagnostic对齐；scope/effective来源 | 保护Diary PR1.2.1；不改变模型调度、prompt、WS既有契约 |
| 2. 连接与任务闭环 | Penumbra连接CRUD、secret操作、测试/发现、9种任务分配；共享选择器与Chat本会话切换 | 复用v2；disabled/missing/stale_ref/引用保护；会话/任务生命周期，Runtime冻结 |
| 3. 外观资源闭环 | 资产、Appearance revision、上传/替换/删除/恢复、本地Blob导入、多设备消费 | 持久目录/权限/引用/备份恢复；避免“只上传未绑定”或“只改URL” |
| 4. 业务与集成缺口 | Persona/MCP、语音/Embedding/Music；速记时段编辑、活动联动；Location心跳如确需先实现有效消费者再开放 | 依成熟领域合并；保留Diary/Location等现有就近入口，不静默改共享连接或日界 |
| 5. 高级策略/运维视图 | cache/keepalive/调试gate、存储与备份健康摘要 | cache全库副作用、MCP协调、Game恢复指纹；不把env全部表单化 |

先完成1，再推进2/3各自闭环；4按使用频率，5延后。无需先建五个新App；也不把Provider、Prompt Architecture重构与Settings视觉改版堆成大PR。后端行为变更应有独立明确契约和必要测试。

## 10. 无法确认的事项

1. **生产未审计**：运行commit、Registry是否落盘迁移、真实默认/诊断/secret、API连通性与图片/DB内容，不得把仓库能力当生产已启用。
2. **部署存储**：data是否挂卷、更新/回滚是否保留uploads、backup timer是否启用成功、恢复是否同时恢复文件和引用；public是否另备份。
3. **私图访问**：反代是否绕过FastAPI静态鉴权、实际Cookie同源/跨域与Cache-Control行为。代码只证明FastAPI路径设计。
4. **真实浏览器数据**：IDB Blob/配额/历史Data URL/失效URL均未读取；未知当前图片是否唯一副本。迁移必须能访问原origin/设备。
5. **Native运行**：手机版本、Wi-Fi/位置/通知权限、已安装APK的实际心跳周期、绑定流程未运行审计（源码边界已确认固定10分钟）。Android模块仅作边界参考，不声称穷尽其设备本地设置。
6. **UI运行效果**：本轮无浏览器自动化/HTTP测试/全量测试。“已实现”依据静态可到达入口与有效链路；readiness错位实际触发条件需后续受控验证。
7. **远端PR/其它工作树**：只记录本地已访问工作树；未查询远端PR或其它分支，不推断别处Diary修改。
8. **产品范围待决**：服务/用户/设备外观层级，是否允许设备覆盖，Main后台跟随语义是否长期保留，Persona/MCP导航归属。这些是下一阶段决策。
9. **模型真实能力**：静态capabilities与basic探测不能证明远端vision/tools/thinking/cache/stream支持，本轮未发送模型请求。
10. **覆盖边界**：覆盖所访问后端路由、配置加载/保存/消费者、旧静态页、Penumbra业务入口与持久化调用；第三方包内部默认、未提供服务、vendor引擎全部参数及Native完整设置未纳入。内部常量按语义组归档，不逐函数参数计数。

### 10.1 完成检查记录

审计使用Git status/log/worktree、rg与带行号源码阅读、Python AST静态解析（不import业务模块）、页面→client→route→存储→消费者交叉核验。未读秘密文件，未SSH/部署/浏览器自动化，未上传/下载/迁移/移动/删除图片，未调用配置更新或DB写入，未运行全量测试，未暂存/commit/push。唯一仓库写入为本文档。

完成核验：总表ID唯一、状态分类与计数一致；本地源码链接路径/行号有效；Markdown表格列数与文档空白检查通过。Penumbra仅新增docs/settings-inventory.md，tracked源码无diff；AionHome工作树无diff。未运行业务测试（无业务代码变更）。
