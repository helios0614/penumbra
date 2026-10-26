# Chat PR3 — 会话管理与消息操作

日期：2026-10-24（Asia/Shanghai）。开始时工作区干净，分支 `main`，基线 `44ec6f2`。本轮未 commit、push 或部署，等待人工验收。

> PR6.5-B更新（2026-10-26）：会话管理统一桌面侧栏/手机抽屉，Header右侧为当前搜索→快捷参数。原PR3实现与验证记录保留；本次变更及验证见[PR6.5实施记录](./chat-pr6-5-config-implementation.md)。

## 定向审计与实现矩阵

已读取 PR1 契约文档、PR2 UI 文档、日常交互修正、模型菜单文档及实际源码；只读核对相邻 AionHome 源码 `aion-chat/routes/chat.py` 的 DTO、CRUD、历史 SQL，以及旧 `static/chat.html` 的重命名、删除、分页行为，没有访问真实聊天或凭据。

| 能力 | 审计结果与本轮实现 |
|---|---|
| 列表、排序 | Main 已用真实 Workspace；`GET /api/conversations` 按后端 `updated_at DESC` 返回。继续使用该顺序，不在前端另行排序。旧 `useConversations` 是未接入 Main 的 mock，本轮不接入它 |
| 新建 | 复用 `createConversation`，`POST /api/conversations` 只传 `{}`；服务端复制新会话默认配置。成功后重读列表及目标历史/configuration/readiness，再确认选中 |
| 重命名 | 复用 `updateConversation`，`PUT /api/conversations/{id}` 只传 `{title}`；复用 Dialog/Input/Button，打开时取原始真实标题，不把“未命名会话”占位文案当标题 |
| 删除 | 复用 `deleteConversation`，`DELETE /api/conversations/{id}`；Dialog 明确标题、不可撤销及确认按钮。HTTP 确认成功后才移除；删除当前会话后选服务端列表的第一项，或安全进入空列表 |
| 导航 | 保留桌面侧栏和手机 Sheet；手机顶部`←`返回主页、`menu`打开会话列表；Header不再有重复当前会话菜单。侧栏/抽屉每项（含当前会话）均可重命名/删除，新建也在列表内，共用同一Controller |
| 草稿 | 原 Sender 只有本地状态；增加 Main 页面内按 conversation ID 保存的草稿与失败恢复原文快照，Sender 按 ID 挂载，保留原 revision/暂存/IME/接受确认机制 |
| 消息操作 | 复用原 Assistant 头部 MessageActions，复制之后直接增加 Lucide `TextCursorInput`，重新生成位于其右侧，名称/Tooltip 为“放入输入框” |
| 更早历史 | 已有 `loadOlderMessageHistory`、`mergeOlderMessagePage` 和 `before` client；本轮接到 Controller/BubbleList，并补阅读锚点与请求隔离。未增加后端接口 |

旧前端的 Trim 非空重命名、确认删除及固定页大小是行为参考。没有照搬旧前端的当前模型继承、carryover、新旧重生成语义或全量 DOM 重渲染。

## 会话管理与请求边界

- Workspace 内的同步 mutation lock 防止快速点击重复 POST，并在写入期间阻止切换和其他 CRUD。按钮在加载时禁用，有简短状态提示。过期列表读取被 sequence/AbortSignal 作废。
- 请求失败保留原会话和草稿。POST 已成功、列表尚未确认时单独提示“已创建，请刷新核对”，不自动重复 POST。PUT/DELETE 已确认但列表重读失败时显示操作已完成和刷新入口。
- 重命名 Trim 后拒绝空名称，沿用旧交互。后端 DTO 没有 `max_length`，不添加任意长度上限；这不是宣称后端拒绝空白名称。失败保留编辑值，列表/WS 重读不覆盖编辑中的输入。
- 删除当前会话时清理对应草稿；删除其他会话保留当前历史、模型和草稿。删除最后一项进入空列表，新建入口仍可达。
- 保留 PR1 的能力限制：发送、生成、重生成、持久化确认和结果未知期间不能切换、新建、重命名或删除会话，也不能返回桌面卸载请求。手机可以打开列表查看，目标行禁用并有原因说明。
- Controller 的同步 guard 读取 Send Controller 当前状态；发送/重生成入口也读取 Workspace 当前快照，避免 React 尚未重渲染的一次点击绕过保护。
- 未引入后台生成切换能力；未把本地 abort 当成服务端停止；未增加自动重发。明确失败后的切换/新建/删除当前会话会清理旧会话的终端错误展示。
- 模型选择仍通过既有 `saveMainSelection`、owner/sequence、PUT/readback 和 readiness 保护。CRUD 不保存全局默认、不把上个会话的模型写入新会话。模型写入仍可能影响“最近 Main”相关后台消费者，沿用 PR1 说明。
- WS 只负责失效通知，HTTP 仍是持久化权威。切换/配置保存/CRUD 结束时唤醒已有 Realtime Coordinator 的待处理刷新，旧请求不会选回旧会话。

## 消息正文、选区与 Composer

完整插入内容先经过现有 Main presentation 的内部命令/Thinking/DRIFT 过滤，再用与现有渲染器相同的 Markdown/GFM parser 取得正文文字。将现有依赖树中的 `unified`、`remark-parse` 声明为直接依赖，没有引入选区库。

- 完整正文保留段落、代码和有意义的换行；链接只取可见标签，排除 URL、HTML 节点、注释、图片地址、定义和代码栏按钮等辅助信息。正文插入为可编辑的可见文字，不承诺保留 Markdown 源码格式。复制仍保持原来的语义。
- 不使用整条后端 raw payload 或整条消息 DOM 文本。独立 Thinking、DRIFT、附件、系统消息、隐藏运行时消息与执行私有信息不进入插入来源。空白、只含分隔线/不可插入内容、生成状态和 provider 失败占位不展示插入按钮。
- 原生 Selection/Range 必须起点、终点都在当前消息专用正文容器内，支持跨段落、跨 Markdown 节点及代码节点；代码栏按钮、隐藏节点被排除。跨消息或来自 Thinking 的选区不能作为局部正文，回退当前消息完整可插入正文。
- pointerdown 捕获本次手势选区；鼠标仅在存在有效选区时阻止按钮夺焦点。触屏不 preventDefault，不安装全局选区监听，不改原生长按/复制手势。
- click 优先读取仍有效的当前选区；焦点导致选区折叠时只允许使用同一次指针手势的快照。快照消费一次，pointercancel/键盘会清除；正文改变或另有无效范围时不使用旧快照。
- Main 决定目标 Composer，并再次核对 owner。追加保留原草稿，按需补足自然的两段换行，不自动发送/重生成。同步聚焦使用 `preventScroll`，提交后定位 textarea 末尾并展开；输入法组合中先暂存追加意图，在 compositionend 后应用。
- 草稿及失败恢复原文仅在当前 Chat 页面生命周期的内存中保存，不增加 localStorage/IndexedDB。A → B → A 可恢复；刷新整个页面或离开后重新打开 Chat 不承诺恢复。新会话为空，删除时清理。

## 历史分页与阅读位置

继续使用 `GET /api/conversations/{id}/messages?limit=50&before=<oldest created_at>`。页大小沿用 Workspace 配置，默认 50，不反复增加 limit，也不一次取全量历史。

- 顶部按钮或向上滚动到约 80px 触发更早加载；同步锁避免并发重复读取，同一会话保留加载/错误/重试/停止状态。
- 复用 canonical message ID 去重和时间正序合并。更早页与 WS/只读历史刷新分开持有请求身份；新 HTTP 版本优先，不用分页请求携带的旧尾部快照覆盖重生成内容。
- 同一会话最新窗口重读保留窗口之前已加载的页；明确 WS 删除优先，不会通过早期页保留或请求中的旧快照复活已删除消息。最新窗口之外的数据不会被宣称为重新做过全量校验。
- 会话切换/卸载会作废旧分页；不配合 abort 的旧响应也不能插入新会话。
- 以第一个可见 canonical message ID 及其相对 viewport 的像素偏移为锚点，在提交与 ResizeObserver 中恢复。更早页插入、图片等动态高度变化及 Composer/视口尺寸变化尽量保持阅读位置。
- 原近底部 96px 跟随逻辑及新发送跟随保留。向上阅读、打开菜单或重读列表不会强制滚到底部。

### 后端限制与最小缺口

实际 SQL 仍为 `created_at < before ORDER BY created_at DESC LIMIT ?`，没有稳定的同时间戳次序，也没有 `has_more`。若页边界有多条相同时间戳消息，未返回的同时间戳记录可能被后续请求跳过，前端无法恢复；因此本轮完成现有接口范围的分页，**不能保证整段历史无遗漏**。UI 的“已加载接口可返回的历史”只表示当前接口返回已结束，不宣称全历史完整。

建议最小后端契约：以 `(created_at, immutable_id/rowid)` 稳定排序，返回绑定会话的 opaque `next_before_cursor` 及 `has_more`，并让 canonical regenerate 保持 ID/时间。前端不猜游标、不扩大 limit 绕过该缺口，本轮未修改后端。

PR1 已记录的缺少持久执行身份/只读终态查询也继续存在，因此生成/未知期间采用清楚的导航保护，而非伪造可安全后台执行。

## 自动验证

所有 HTTP/WS 与消息均为合成数据；浏览器 fixture 拦截全部业务 API 和 Chat WS，没有模型调用、真实数据读取或写入。

| 检查 | 结果 |
|---|---|
| PR3 及 Chat 相关测试 | CRUD 成功/失败/重复点击、Dialog 保存/取消/错误保留、过期切换、页面内草稿、选区手势、IME/焦点、正文边界、分页/WS/删除竞争；现有发送、重生成、Readiness、模型自动保存继续纳入全量回归 |
| `npm test -- --reporter=dot` | 120 个文件、1780 项测试全部通过 |
| `npx tsc --noEmit` | 通过 |
| `npm run build` | TypeScript project build 与 Vite production build 通过 |
| `git diff --check` | 通过 |
| Chrome 浏览器集成 | PC 1440×1000、手机尺寸 390×844 + touch emulation 均通过；真实 Range、跨 Markdown 选区、直接操作顺序、追加/焦点/光标、A/B/C 快速切换、CRUD 失败、删除其他/当前会话、服务器默认模型、WS/分页/动态高度锚点、菜单不跳底、未知保护均验证 |

浏览器重现：启动本地 Vite（测试默认 `http://127.0.0.1:45340`），运行 `node tests/browser/chat-pr3-smoke.cjs [playwright module path] [chromium executable]`。也可用 `NODE_PATH`、`CHAT_PR3_CHROMIUM`、`CHAT_PR3_ORIGIN` 配置环境。入口 `tests/browser/chat-pr3.html` 只供测试，生产构建未包含该入口。

手机尺寸的桌面 Chrome 自动化不能证明 iOS/Android 原生选区控制柄和真实软键盘已验收。尚未进行真机或真实后端人工联调。

## 人工验收：PC

1. 打开 Chat，检查真实列表、当前选中和新建；快速双击只创建一次。切换 A/B/C、模拟慢响应，确认最终选择不被旧响应或 WS 改回。
2. A 写草稿，切 B 写不同草稿，再返回 A。检查分别恢复。新会话为空，模型来自服务端新会话默认；失败时原会话和草稿保留。
3. 侧栏当前或其他会话行`···`重命名：打开取真实标题；取消不写；空白不保存；模拟失败后编辑值仍在；成功后列表和标题更新。
4. 删除时核对确认文案中的会话；取消不发 DELETE，失败保留；删其他会话不影响当前，删当前安全选择剩余项，删最后一项有空列表与新建入口。
5. 草稿已有“我还想问一个问题：”时点击“放入输入框”。先无选区验证完整正文，再选局部、跨段落/链接/代码节点验证仅选区；检查草稿、换行、焦点、末尾光标、不发送和原消息。尝试跨消息/Thinking 选区，确认不会带入其他内容。
6. Tab/Enter/Space 操作按钮；`···` 内 ArrowUp/Down、Home/End；Escape/外部点击关闭。使用中文输入法组合、Shift+Enter，确认不误发。
7. 向上加载至少两页并触发 WS 新消息、Thinking 展开或图片高度变化，检查原消息锚点不跳；近底部仍跟随。发送/重生成/未知时检查导航与删除被保护，恢复只读取状态。

## 人工验收：手机

1. 顶部 `menu` 打开会话列表 → 选会话 → 再打开列表，反复操作；`←` 单独返回主页，不打开列表。抽屉`+`新建与当前行`···`均可触达；点行菜单操作后先关Sheet再开原确认弹窗，与桌面使用同一CRUD行为。
2. 打开重命名并弹出软键盘，检查 Dialog 标题、Input、取消/保存和错误文案；Dialog 使用现有 safe-area 样式并按 VisualViewport 调整。切横屏、改变键盘高度后仍能完成操作。
3. 检查抽屉行菜单、Header快捷配置Dialog和Composer模型Popover 未被键盘、Composer、safe-area 遮挡；外部点击/Escape 或系统键盘关闭后行为稳定，不会强制跳底。
4. 在 Assistant 正文原生长按选字，拖动两端控制柄，跨段落调整，再点“放入输入框”；检查只追加所选文字。原生“复制”、取消选区、重新选择其他消息必须正常。无选区时追加完整正文。
5. 保留已有草稿重复追加短文、长文、含多次换行正文；检查展开、内部滚动、末尾光标和键盘。用中文/日文组合输入确认追加及 Enter 不破坏输入法。
6. A/B 来回切换、创建和删除，检查草稿隔离；删除确认必须可见。模拟离线/慢请求/未知结果，检查操作禁用、错误反馈、恢复和不重发。
7. 向上读历史、打开并关闭 `···`、加载更早消息、等待图片加载；观察相同正文位置，确认没有突然跳到最新回复。对同时间戳页边界按上述后端限制验收，不宣称完整性。

## 视觉验收调整

按人工反馈，将消息头部操作顺序调整为“复制 → 放入输入框 → 重新生成”。移动端/粗指针按钮最小宽度从 36px 收至 28px，保留 36px 高度及原图标大小，收紧横向间距；复制、选区追加和重生成逻辑不变。

本次视觉调整验证：相关 9 项测试、TypeScript、PC/手机尺寸浏览器回归与 `git diff --check` 均通过。上文全量测试和生产构建结果对应 PR3 主体实现。

## 人工验收 Follow-up：恢复独立主页入口

恢复移动端两个独立按钮：`arrow-left` 使用 PR3 之前由 `DesktopAppView` 传入的真实 `onBack`，`menu` 只打开既有会话 Sheet。Chat 未增加路径推断、Router 或 `history.back()`；Desktop / Editorial 的已有父级导航保持原样。右侧新建和当前会话操作保留。

只调整 Header 呈现：窄屏减小横向留白，标题继续使用 `min-w-0` / `truncate` 让出空间；手机和粗指针设备四个按钮的触摸区域至少为 44×44px。没有修改 CRUD、草稿、分页、执行 Controller 或生成期导航规则。原同步返回guard继续在调用时读取最新执行和mutation状态，避免旧回调绕过保护。

新增 `ChatView.navigation.test.tsx` 验证返回回调、Sheet 开关及会话选择互不触发，mutation 期间仍锁定返回，以及未重渲染时最新执行/写入状态仍阻止返回。浏览器测试同时覆盖 320/390px 长标题与四按钮、结果未知禁止返回，以及真实 `/app/chat` 和 `/editorial/app/chat` 深链接通过原父级回调回到各自主页。

人工补验：手机先打开/关闭会话列表，确认仍在 Chat；再点击 `←`，确认进入当前 Penumbra 主页。发送或结果未知时，`←` 不可退出，列表仍可查看且不能切换。320px 窄屏和横屏分别检查四个触摸按钮、标题省略及右侧 `+` / `···`。

本次导航修正验证：相关 26 个测试文件、226 项测试全部通过；TypeScript、生产构建、PC/手机浏览器集成和 `git diff --check` 通过。包括真实 Desktop / Editorial 主页回调与结果未知保护。未 commit、push 或部署。

## Header 视觉收口

按最新人工反馈，主页返回和会话菜单沿用右侧 `···` 的 ghost 纯图标样式，移除常驻边框、底色和阴影，保留原按钮尺寸、手机 44×44px 点击区域与 Header 统一间距。移除 Header 新建按钮，新建仅在桌面侧栏及手机会话 Sheet 中提供；空列表文案同步指向会话列表。导航回调和请求保护不变。本次按要求不做浏览器视觉验证，浏览器测试脚本仅同步入口与按钮数量。

本次收口验证：22 项相关测试、TypeScript、浏览器脚本语法检查及 `git diff --check` 通过；未运行浏览器。未 commit。

### PR6.5-B入口回归

当前Header保留返回/手机会话列表按钮，右侧顺序为搜索→聊天快捷配置；重命名与删除只从桌面侧栏/手机抽屉行菜单进入。PR3浏览器夹具已补当前messages/window契约，当前会话菜单定位改走真实列表；不保留Header专属mutation。生成/最终确认/结果未知锁及删除后的选中、草稿恢复保持原有规则。验证结果见本次实施记录。
