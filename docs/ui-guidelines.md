# Penumbra UI Guidelines v0.1

本文件描述 Penumbra 的视觉语言与页面组合方式，面向未来页面设计、UI 实现与评审。

它回答“界面应该呈现什么气质、内容应如何组织、哪些模式已经稳定”，但不重复 token 表、不重新定义 CSS 变量，也不替代现有工程文档：

- 具体颜色、字体、间距、圆角、阴影、动效与可访问性要求见 [`docs/design-spec.md`](./design-spec.md)。
- UI 开发流程与检查清单见 [`docs/ui-development.md`](./ui-development.md)。
- Chat 功能与交互规划见 [`docs/chat-ui-reference.md`](./chat-ui-reference.md)。
- 已验证的 UI 工程模式与排障经验见 [`docs/ui-patterns.md`](./ui-patterns.md)。

本文中的模式按 `Stable`、`Provisional`、`Exploratory` 标注成熟度。稳定模式可以直接复用；暂定和探索模式应先确认当前产品语义，不应被提前固化成全局组件。

---

## 1. Design Intent

Penumbra 的视觉基调是：

- **Warm mist**：温暖、低对比、带空气感，不冷硬。
- **Paper / journal feeling**：界面像可阅读、可书写的纸面，而不是仪表盘。
- **Archive feeling**：信息有被保存、整理与重新翻阅的感觉。
- **Soft glass**：玻璃是轻薄的空间层次，不是高亮炫技效果。
- **Content first**：正文、对话和记忆始终比装饰与容器更重要。

核心原则：

> Surface 是承载内容的纸，不是一个个独立卡片。

页面应先通过内容顺序、留白、排版和分隔线建立结构，再决定是否需要 Surface。一个区域能在连续纸面中成立时，不要把每条内容继续包成独立卡片。

### 应避免

- 强科技感、镜面感或过度发光的玻璃；
- 高饱和渐变和大面积品牌色铺陈；
- 每段内容都拥有背景、边框、圆角和阴影的卡片墙；
- 后台管理系统式的密集模块、硬分栏和表格化视觉；
- 与信息无关的装饰、重复标题和常驻操作；
- 为追求统一而压平页面自身的内容节奏。

克制不等于空洞。Penumbra 可以有明确气质，但气质应来自材质、字体角色、内容密度和细节节奏，而不是堆叠视觉效果。

---

## 2. Typography Roles

字体首先承担角色，其次才承担风格。不要只因为两段文字“看起来应该一样”就混用字体。

### 2.1 Functional Typography

功能字体用于：

- 中文正文；
- 表单与输入；
- 按钮和操作文案；
- 列表、导航与筛选；
- 时间、状态和需要比较的数据。

要求：

- 清晰、稳定、易阅读；
- 不抢夺内容注意力；
- 在浅色、深色和半透明表面上均保持足够对比度；
- 通过字号、字重、颜色和留白建立信息层级，不依赖装饰字体。

页面中文标题仍属于功能信息。除非某一页面已有明确且经过验证的 editorial 方案，否则不要为了“纸张感”擅自改用装饰字体。

### 2.2 Decorative Typography

Penumbra 使用 Cormorant Garamond 作为英文与数字的装饰字体。实现时复用现有 `--font-decorative` 或 `.font-decorative`，不要在业务组件内重新声明字体栈。

适用场景：

- Page Header 的英文 eyebrow，例如 `MEMORIES`；
- 装饰数字，例如 `4718`；
- 少量 editorial 英文，例如 `Fragments`。

使用边界：

- 不用于中文正文；
- 不用于按钮、表单、列表等功能文字；
- 不承担主要信息层级；
- 不因为使用装饰字体就自动增加字号、透明度或字距。

装饰数字默认保持字体原生数字形态：

```css
font-variant-numeric: normal;
```

除非有明确视觉理由并完成单独验证，不要默认使用：

- `lining-nums`；
- `tabular-nums`；
- 额外 tracking。

英文 eyebrow 可以根据其标签角色使用经过验证的 uppercase 与 tracking；这不代表装饰数字也继承相同字距。

---

## 3. Surface Hierarchy

Penumbra 使用现有三层 Mist Surface。Surface class 负责材质，不负责 padding、圆角、宽度、滚动和布局。

### 3.1 `mist-glass`

轻量玻璃层，用于浮在壁纸或页面背景上的辅助区域，例如：

- 普通浮层；
- Page Header；
- 筛选区；
- 页面辅助区域；
- 低密度信息面板。

它应保持轻，不应通过不断加深背景来弥补文字层级问题。优先调整正确的文字语义和对比度。

### 3.2 `mist-glass-strong`

结构边界更明显的玻璃层，用于需要清楚建立范围的容器，例如：

- App 外壳；
- Dialog、Sheet、Popover；
- 已经验证可读性的主要内容容器；
- Memory 这类连续阅读区域。

`mist-glass-strong` 不是所有主内容的默认选择。长文本和高密度内容仍需先验证对比度；Memory 的使用是成熟页面模式，不自动推广到所有页面。

### 3.3 `mist-solid`

需要稳定可读性的内容表面，用于：

- 输入区域；
- 长文本；
- 表单；
- 高密度列表；
- 对背景变化敏感的内容。

### 3.4 Surface 使用原则

- 不重复制造玻璃层；
- 业务组件不得自行组合新的透明度、blur、shadow 配方，形成未命名的隐性 Surface；
- 不给每段内容套独立卡片；
- 内容结构优先于视觉容器；
- 同一个连续任务优先共享一张 Surface；
- Surface 内部优先用留白、文字层级和 divider 分组；
- 材质选择服务于可读性，不能为了“更玻璃”牺牲正文；
- 页面或 feature 可以在已有 Surface primitive 基础上做经过可读性验证的成熟页面级视觉调整；Memory 的特殊材质组合属于此类页面模式，不自动推广为通用 Surface；
- 如果页面调整演变成新的材质模式，应先提升为新的语义 primitive，再供业务代码使用，而不是将配方散落在业务组件中。

---

## 4. Page Composition

页面应先判断自己属于哪种内容形态，再选择组合方式。

### 4.1 Editorial Page

Memory、Settings 等页面属于以阅读、浏览和有限操作为主的 editorial page。常见结构是：

```text
Page Header

Optional Controls / Filters

Primary Reading Surface
```

各区域数量应尽量少。主要内容应在一个连续区域中展开，不要把页面切成大量同权重模块。

### 4.2 Workspace Page

Chat 等页面属于持续交互的 workspace page，通常由固定导航或标题区、内部滚动内容区和固定输入区组成。

Workspace 不需要机械套用 editorial Page Header。它可以使用更紧凑的工作区标题栏，只要继续遵循字体角色、Surface 层级、可访问性和内容优先原则。

### 4.3 Page Header

`PageHeader` 是当前稳定的共享组件，信息结构为：

```text
eyebrow
title
description
actions
```

规则：

- eyebrow 使用 decorative font，作为气质提示，不替代标题；
- title 使用功能字体，承担页面主标题语义；
- description 降权，但仍保持正常可读性；
- actions 位于稳定、易触达的位置，并保留清晰命中区域；
- actions 可以为空或包含多个操作；
- `titleId` 是必填的字符串 prop，并设置为标题元素的 `id`；消费者必须让页面容器的 `aria-labelledby` 引用同一标识；
- 不为不同页面增加任意的 Header 字体、Surface、对齐或圆角变体。

### 4.4 Layout and Scrolling

- 页面优先采用移动端布局，再逐步扩展到大屏；
- Penumbra 使用固定工作区和自然页面流两种布局模型。滚动由明确的实际容器承担，避免无意义的嵌套和高度挤压；滚动条默认隐藏，但滚动能力、焦点与内容可达性必须保留；
- 固定工作区：Memory 列表独立滚动且分页稳定，Quick Note 阅读正文独立滚动，Chat 消息滚动且输入区固定；固定头部和底部使用 `shrink-0`，正文使用明确的 `flex-1`、`min-h-0` 和内部 overflow；
- 自然页面流：Activity、Location、Quick Note 概览与 Settings 在稳定 Header 下复用 `PageScrollArea`，多个纵向模块共享一个主要容器。展开 Activity Wi-Fi 配置不能压缩时间线；
- Classic / Editorial 的应用入口都由 feature 承担主要滚动；Editorial 仅在首页保留原有外层滚动，首页和导航布局不改变。Calendar 当前紧凑内容保留入口滚动，不新增回顶；
- 回顶绑定实际容器，超过 `max(720px, 1.5 × 可视容器高度)` 才显示，响应容器高度、Reduced Motion 与现有导航恢复规则。单篇速记保留原 360px 阈值；Memory 与 Chat 不套用普通页面回顶；
- 滚动容器统一使用 `.scrollbar-none`，ScrollArea 同时隐藏自绘条；有意限高的日志与时间选择列可独立滚动。Mist 浮钮避让安全区，显示时才增加页面尾部空间，通过现有 Toast obstacle 规则避让提示，模态 Dialog 打开时隐藏；
- 阅读宽度根据内容类型决定，不为追求统一强制所有页面同宽；
- 主要触屏操作应保留足够命中区域，具体要求遵循 `design-spec.md`。

### 4.5 Dialog Composition

UI Foundation PR2 已将 Memory、Quick Note、Activity、Location 的成熟弹框布局落实到公共 Dialog / AlertDialog：原有 Mist 强玻璃、28px 圆角、受动态视口与安全区约束的自然高度、左对齐 Header、功能字体标题（18px / 600 / 28px）、可选独立滚动 Body，以及水平右对齐、可换行的 Footer。区域横向留白为移动端 20px / 桌面端 24px，英文 eyebrow 仍为显式可选装饰。

- 表单：Header、正文、操作分区；字段及区域错误留在正文，保存期间的关闭规则由业务控制。沿用 PR1 密度，已验收的主要表单操作显式选择 comfortable，不因 Footer 统一而扩大全部按钮。
- 阅读：固定 Header，长内容使用 `DialogBody` 独立滚动；内容少时自然收缩，没有实际底部操作就不生成 Footer。
- 确认：使用 AlertDialog 的取消和危险操作语义；说明区可在极短视口滚动，Footer 紧凑且保持可达。遮罩、Escape 和焦点行为继续由 Base UI 管理。

关闭按钮默认提供单个 Lucide X 与 44px 点击区域，可传入业务名称和 disabled；自定义 Header 关闭按钮时关闭自动 X，统一复用 `DialogCloseButton`。所有关闭入口遵守同一业务规则，拒绝关闭沿用底层事件取消机制；从 Popover 打开的弹框通过 `finalFocus` 返回稳定触发区域。嵌套确认保留 Base UI 父子关系，不重建焦点框架。业务宽度、表单结构、Location 时间列与 Quick Note 已验证的编辑器／软键盘适配仍允许局部保留。具体组合见 [`ui-patterns.md` 的 Dialog / AlertDialog 小节](./ui-patterns.md#dialog--alertdialog-的成熟组合约定)。

### 4.6 Control Density and Semantics

控件可见尺寸不等于交互目标尺寸；Penumbra 不要求所有移动端控件视觉高度达到 44px。保持已经验证的信息密度，不通过放大字号、表面和留白制造统一感，也不全局调整正文或标题字号。主要独立触控目标优先提供 44px 的有效区域，允许表面更小；目标必须占据各自布局空间，不以重叠的绝对定位热区扩张。Chat 工具栏、日历和列表内操作可明确选择紧凑尺寸，保留足够间距并人工验证。

- Button：`compact` 以 32px 为基准，`default` 为 36px，`lg` 为 40px，`comfortable` 为 44px；旧 `xs` / `sm` 与 icon 尺寸保留给紧凑消费者。文字按钮使用最小高度和可增长布局，不以固定高度裁切放大或换行的文字。
- Input / AppSelect：`controlSize="compact" | "default" | "comfortable"` 对应 32 / 40 / 44px 的最小高度。32px 用于日历等紧凑组合，不作为常规表单推荐值。Textarea 的同名属性只控制内边距，多行高度由内容、rows 或编辑器布局决定。
- FilterChip：Memory 时间／钉选与 Activity 设备筛选复用轻主题描边、背景和 `primary-ink`；36px 表面放在最小 44px 的独立目标内，选中 Hover 仍保持主题色。窄屏及文字放大时可换行，不能相互覆盖。
- SegmentedControlItem：用于 Quick Note 日期内容切换，保留等宽布局和更明确的实心主题选中态，不与筛选 Chip 混用。
- Select：触发器使用中性 Mist 表面，截断长选中标签但保留完整可访问文字；下拉选项可换行。Activity 复合日期范围继续使用 Popover，不强行转换为 Select。
- Button 的视觉优先级由当前交互场景决定，不仅由操作名称决定。`default`（Primary）表达当前场景的主要操作，包括弹框内作为主操作的读取、刷新或重试；`soft-primary` 适合页面级辅助查询／重新读取，ghost 表达轻量工具，outline 表达中性描边次级操作，destructive 表达危险操作。视觉统一不改变真实 disabled／loading 状态，也不因空列表而自动禁用仍可重新获取数据的操作。`secondary` 继续保留现有辅色语义，不用它冒充柔和主题操作。
- 公共 Switch 只负责受控值、输入和基础状态，通过原生 button 支持 Space / Enter，使用可访问名称及可见标签关联；44×24px 轨道不扩大。即时提交、草稿保存、失败恢复均留在业务层，Checkbox、Radio、筛选不转换为 Switch。

同类控件统一状态，不同语义保留合理差异。具体 API、尺寸例外和消费方式见 `ui-patterns.md`；控件密度沿用 PR1，Dialog 布局见 §4.5，页面滚动模型见 §4.4。

### 4.7 Toast 与持续反馈

UI Foundation PR3 的公共 Toast 使用 Mist 强玻璃、主题语义色的小型 Lucide 图标、13px 功能文字及柔和圆角。**默认严格单行**，没有自动副标题；只有影响理解或下一步操作的额外信息才允许第二行（例如 Step 1 完成后原正文已清空）。宽度随文案自然变化，最大 26rem；窄屏可必要换行，不能截断关键错误。

- 手机底部居中，避让安全区、Dock、固定操作区与软键盘；桌面位于当前应用视口的右上角。Host portal 位于 body，不能放在滚动内容或持久 transform 的祖先内。默认 Desktop 与 Editorial 共用应用入口。
- 已确认的创建、保存、删除、复制采用 Toast；请求只被接受时写“已提交补写请求”，不能写成生成完成。成功约 3 秒、普通信息约 4 秒；最多同时两条，重复通知更新或去重。主动关闭按钮保留 44px 目标，不抢焦点，采用 polite ARIA 播报并响应 Reduced Motion。
- 表单校验靠近字段；保存失败、草稿保留、冲突与保存结果未知留在 Dialog／表单内。加载、生成、连接中断、服务不可用和模块读取失败继续作为持续业务状态，不能用 Toast 掩盖，也不能从 HTTP transport 层统一弹错。
- 同源故障需要结构化证据。Activity 仅合并同一 HTTP 服务的多个 `NETWORK_ERROR` 或共享会话的 401，403、超时、业务错误及独立模块保留自己的恢复入口；WebSocket 的状态不被推定成 HTTP 故障的原因。
- 页面、日期、设备或内容切换应清理旧反馈；读取成功后移除已失效的读取错误。结果未知的写入不能因普通读取成功就被宣布保存成功。异步晚到结果不得进入已离开的作用域。
- 持续错误置于已有 Surface，用简短、低饱和的层级表达；后端诊断长文放在按需展开的排查信息里，不堆积在主要阅读路径和壁纸上。Dialog 打开时暂缓 Toast 的显示、播报与计时，保证关键操作可达。

API 与操作归属见 [`ui-patterns.md`](./ui-patterns.md#toast--feedback)，来源审计与人工验收清单见 [`ui-feedback.md`](./ui-feedback.md)。

---

## 5. Memory Pattern

Memory 当前采用成熟的连续阅读模式。它不是 Card List。

```text
Reading Surface

  Memory Item
    type / importance
    content
    tags                    time

  Divider

  Memory Item
    ...
```

### 5.1 内容层级

1. 正文是主要阅读内容；
2. 类型和重要度帮助定位，但不抢正文；
3. tags 提供索引；
4. 时间位于内容尾部并保持低权重；
5. 必要操作保持克制，不形成常驻工具栏。

### 5.2 组合原则

- 所有条目共享一块 Reading Surface；
- item 依靠留白和 divider 区分；
- metadata 使用低权重文字层级；
- tags 是分类索引，不是按钮；
- 长正文可以折叠，但展开操作不能压过正文；
- 时间保持在阅读路径末端，宽屏下靠右；
- loading、empty、error 和分页属于 Reading Surface 的状态，不另建卡片墙。

### 5.3 不要这样做

```text
Card
  Memory

Card
  Memory

Card
  Memory
```

不要为每条记忆重复添加完整背景、边框、圆角和阴影。也不要把 type、importance、tags 全部变成同等醒目的 Badge。

---

## 6. Chat Pattern

Chat 当前有稳定方向，但消息 Surface、分段方式和 Thinking 展示语义仍处于 `Provisional`。当前实现可以作为 Chat 内的实验方向，不作为全局 UI 模式。

### 6.1 已稳定方向

- User 靠右；
- AI 靠左；
- 角色可以通过受控颜色区分；
- 正文内容优先于头像、时间和操作；
- system、unknown、execution status 等辅助信息与普通对话区分；
- 消息区内部滚动，输入区保持稳定；
- 用户主动离开底部阅读历史时，不强制自动拉回。

### 6.2 视觉边界

不要：

- 使用传统 IM 式的大气泡连续堆叠；
- 给每个段落重复添加强边框、强背景和明显阴影；
- 用头像、状态和操作挤压正文宽度；
- 为 AI 内容增加与信息无关的科技感装饰；
- 因为角色不同而降低正文可读性。

消息的具体 Surface、分段方式、操作位置和长内容折叠规则尚未成为全局规范。当前 `Bubble` 实现不是推荐方案；新页面不应复制其像素细节作为通用 Message pattern。

### 6.3 Thinking

Thinking 的展示语义仍处于 `Provisional`，当前只是 Chat feature 内的实验方向，不是全局 UI primitive。

以下仅描述当前展示实验，不代表已定稿或可推广的展示语义：

- collapsed 状态提供简短 preview；
- expanded 状态展示完整内容；
- 整体是轻量辅助阅读区域；
- 不使用明显的大灰框与重阴影；
- 展开状态应具有正确的可访问性语义。

当前不要写死：

- `thinking` 数据究竟代表什么；
- 哪类推理或活动允许展示；
- preview 的生成规则；
- streaming、持久化和折叠状态策略；
- 是否与 Activity Trail 或其他可解释事件合并。

这些内容需要在产品和数据契约确认后，再进入稳定规范。

---

## 7. Metadata and Labels

外观相似不代表语义相同。Metadata、Tag 与 Status Badge 不应混用。

### 7.1 Metadata

例如：

- 时间；
- 重要度；
- 编号；
- 来源；
- 次要统计信息。

特点：

- 低于正文和标题；
- 用于辅助理解、定位或比较；
- 通常不拥有独立背景；
- 根据重要程度选择普通或较强的次要文字层级；
- 不通过过低 opacity 制造“更次要”的文字。

### 7.2 Tags

Tags 是内容分类与检索索引。

特点：

- 默认不可点击；
- 不承担状态；
- 不表示成功、警告或错误；
- 视觉轻、尺寸小，但保持可读；
- 数量较多时应截断、折叠或汇总，而不是撑开主要阅读结构。

如果 Tag 未来可筛选或可删除，它已成为交互控件，需要重新处理命中区域、focus、键盘操作和状态反馈，不能只添加 click handler。

### 7.3 Status Badge

Status Badge 表达状态，例如处理中、失败、已完成或未确认。

它可以使用语义色，并可能需要图标或实时状态语义。Status Badge 不应用来承载普通分类；Tag 也不应用来伪装状态。

---

## 8. Component Abstraction Rules

业务层 UI 抽象进入 `src/components/ui/` 前，原则上应同时满足：

1. 至少有两个独立消费者；
2. 视觉和行为已经稳定；
3. 语义明确；
4. 不依赖具体业务状态；
5. API 能表达真实差异，而不是暴露大量样式开关；
6. 抽象后能降低维护成本，而不是只减少几行 className。

“至少两个独立消费者”主要约束业务层 UI 抽象。Button、Dialog 等基础交互 primitive 可以因基础能力、可访问性和一致性交付提前存在；第三方组件或基础设施封装也应按自身职责评估，不与业务模式抽象混为一谈。

不要因为两个地方长得像就抽象。相似的外观可能承担完全不同的内容、交互和可访问性语义。

### 8.1 当前稳定组件

#### `PageHeader`

`PageHeader` 已满足共享条件。保持以下内容槽位：

- `eyebrow`；
- `title`；
- `description`；
- `actions`；
- 标题与页面容器关联所需的标识。

`titleId` 已由组件 prop 类型设为必填；页面容器的 `aria-labelledby` 与标题 `id` 是否匹配仍需由消费者保证，并通过页面测试验证。

不要为单个页面加入大量视觉 props。页面差异优先通过内容表达，而不是重新配置 Header 材质。

### 8.2 暂不抽象

#### `GlassPanel`

暂不抽。现有 Surface class 已经承担材质 primitive，使用者的语义元素、布局、圆角、padding 和滚动方式并不相同。

如果未来确实出现多个结构一致的消费者，应优先考虑语义化 `Surface`，仅暴露有限的材质 variant，不暴露任意 blur、opacity 或 shadow 数值。

#### `MemoryCard`

不抽。Memory 是连续阅读区域，不是卡片集合。保留业务级 `MemoryItem` 比制造通用 Card API 更符合当前信息结构。

#### `MessageBubble`

不抽。Chat 的消息分段、Surface、操作、附件、Thinking 和执行状态仍在变化。当前 feature 组件可以继续演进，但不应升级为全局 UI primitive。

#### `MarkdownRenderer`

保持 Chat feature 组件，不提升为全局 UI。当前渲染行为和视觉仍与 AI 内容、代码块、消息分段及 Chat token 绑定。

#### `DecorativeText`、`MetaText`、`Tag`、`Divider`

暂不为了减少 className 而新增组件：

- Decorative text 内部仍有 eyebrow、数字和 editorial 英文等不同角色；
- Metadata 具有不同强度和语义；
- Tag 目前消费者有限，且不能与现有 Badge 混淆；
- Divider 的方向、间距和语义依赖所在布局。

优先把这些规则写清楚。只有出现第二个独立、语义相同的消费者后，再评估组件化。

---

## 9. Maturity

### Stable

- Design intent 与 content-first 原则；
- Functional / Decorative typography 的角色边界；
- Cormorant Garamond 的装饰用途与数字默认规则；
- `mist-glass` / `mist-glass-strong` / `mist-solid` 三层 Surface hierarchy；
- `PageHeader` 的信息结构与共享组件；
- Memory continuous reading pattern；
- Metadata、Tag、Status Badge 的语义区分；
- 先验证语义稳定性再进入 `components/ui` 的抽象原则。

### Provisional

- Chat message 的具体 Surface、分段与操作布局；当前 `Bubble` 仅是实验方向；
- Thinking 的展示语义与 preview；
- Chat Markdown 的排版和代码块呈现；
- 通用 Tag、MetaText、DecorativeText 等轻量 primitive；
- 将半透明 Surface 用于其他页面主要阅读区的适用范围。

### Exploratory

- Future workspace patterns；
- Activity Trail 与可解释事件展示；
- 多模态消息和附件布局；
- 通用 Content Renderer；
- 新的页面类型与跨页面复合组件。

---

## 10. Review Questions

设计或实现新页面时，至少检查：

1. 用户首先看到的是内容，还是容器？
2. 是否能用一张连续 Surface，而不是多个卡片？
3. Functional 与 Decorative typography 是否各守其职？
4. 当前 Surface 是否来自既有三层体系？
5. metadata、tag 和 status 是否被正确区分？
6. 是否因为视觉相似而过早创建了通用组件？
7. 页面属于 editorial page 还是 workspace page？
8. 阅读、滚动、触屏和键盘操作是否仍然自然？
9. 当前决策属于 Stable、Provisional 还是 Exploratory？
10. 如果偏离成熟模式，是否有明确的内容或交互理由？

Penumbra 的一致性不是让所有页面长得一样，而是让所有页面使用相同的视觉语言，忠实表达各自的内容。
