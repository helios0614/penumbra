# Penumbra Chat Markdown 与气泡分段审计

日期：2026-10-28（Asia/Shanghai）。审计基线：`a2e4af2916d7f1bdd20fab5544843b9617465b71`。

本轮只读业务代码，唯一保留的新增文件是本报告；未 commit、push、deploy，未访问真实聊天内容、数据库、模型或后端写接口。复现只使用合成 Markdown 和隔离浏览器。

## 1. 结论与基线

**可以保留 Assistant 普通正文按空白行拆泡，同时局部保护代码块、列表和引用。** 保护范围应来自 Markdown 的实际块边界，不能简单地把“出现 Markdown 的整条消息”合并成一个气泡。最小可行策略见第 8 节。

已确认的问题：

| 编号 | 结论 | 优先级 | 安全 / 数据影响 |
| --- | --- | --- | --- |
| MD-01 | fence 状态只认行首三个反引号，波浪线、缩进、长围栏和嵌套样例被错误切开 | 必须修，P1 | 显示、代码复制语义受损；无持久化丢失证据 |
| MD-02 | loose list、列表内多段和嵌套结构被拆断，可能把续段渲染成代码 | 必须修，P1 | 显示语义受损；原文仍在 |
| MD-03 | 跨泡 reference link / image 丢失定义上下文 | 建议修，P2 | 链接不能点击、图片不显示；原文仍在 |
| MD-04 | 宽表格没有横向滚动容器，被气泡裁切 | 必须修，P1 | 内容留在 DOM，但正常浏览看不到右侧列 |
| MD-05 | thematic break 变体、定义等渲染为空的源段仍会创建空泡 | 必须修，P2 | 违反无空泡规则；无存储影响 |
| MD-06 | 每次正文更新重建代码 / 图片自定义组件，代码横向滚动归零 | 建议修，P2 | 流式交互状态丢失；无消息数据丢失 |
| MD-07 | H4–H6 无视觉层级、块内间距紧凑，分割线全隐藏 | 可暂缓，P3 / 兼容约定 | 不应未经确认全局重设计或恢复所有 hr |

上一轮交付已在 HEAD `a2e4af2 feat(chat): refine bubble splitting and send shortcuts` 提交，包含 `docs/chat-bubbles-shortcuts.md` 及气泡、快捷键实现和测试。审计开始时 `git status --short` 无输出。上一轮文档中的“本轮未 commit”描述的是当时交付状态，当前 Git 记录已确认后来提交，不构成未提交残留。

## 2. 实际技术栈与可见消息链路

### 2.1 技术栈

本地安装版本（同时核对 package-lock 和依赖源码）：React 19、react-markdown 10.1.0、remark-gfm 4.0.1、rehype-highlight 7.0.2、remark-parse 11.0.0、unified 11.0.5；高亮使用 lowlight 3.3.0 / highlight.js 11.11.1。Vite 6.4.3，Tailwind CSS 4。

`MarkdownRenderer.tsx:216` 的实际配置：

1. react-markdown 的 Markdown → mdast → hast → React 流程。
2. `remark-gfm`：表格、删除线、自动链接、任务列表等 GFM 语法。
3. `rehype-highlight`：已注册语言高亮；默认不自动猜测无语言代码。未知语言保留代码，实际样例没有崩溃。
4. `rehypeSearchHighlight`：在渲染树的文本节点上标记搜索命中，不执行 HTML。
5. 自定义 `img`、`code`、`pre`、`hr`。没有自定义 `a`，没有数学、Mermaid 或原始 HTML 执行插件。

`insertable-body.ts` 已使用 `unified + remark-parse + remark-gfm` 提取公开可插入正文。这是现有轻量解析能力，不需要为分段再引入一个语法不同的新库。

### 2.2 SSE 临时正文

`chat-execution-client` 的 SSE 解码 / 事件映射 → `chat-send-controller.ts:362` 的 `reduceChatExecutionEvent` → `chat-send-accumulator.ts` → controller 发布 `accumulator.message` → `composeVisibleChatMessages` → `ChatView.tsx:305` → `BubbleList` → `Bubble`。

Accumulator 先处理 provider failure、Thinking、DRIFT 和隐藏控制标记；`pending` 暂存不完整标记前缀，不把前缀刷入正文。`flushAssistantAccumulator` 不补造闭合控制标记，也不把残缺控制前缀作为正文输出。可见 `message.content` 是已过滤的累计文本。

没有增量 Markdown AST 或单独的流式 Markdown 渲染器。每次可见正文变化，Bubble 对当前全文重新分段，每个气泡重新走相同 Markdown 配置。

### 2.3 HTTP 历史正文

`message-window.ts` 的 `/api/conversations/:id/messages/window`（兼容 history client 也经同一 mapper）→ `mapMessageHistory / mapMessage` → workspace history → `presentChatMessages / presentChatMessage` → `composeVisibleChatMessages` → 同一条 Bubble 渲染路径。

`chat-message-presenter.ts:67` 的 `presentAssistantContent` 先截取 provider failure 之前的正文，再复用 `appendAssistantChunk + flushAssistantAccumulator` 过滤控制标记。持久化 Message 的原 content 不因此改写。Thinking 独立过滤，HTTP DRIFT 来自已映射的独立字段，系统能力仍来自原公开投影。

Composer 用 HTTP 权威消息替换对应 SSE overlay；没有把多个视觉气泡持久化为多个 Message。相同公开正文经过相同拆分器和渲染器；服务端实际保存内容若不同于临时输出，显示会按现有对账结果更新，本轮不改变该规则。

### 2.4 控制过滤 → 分段 → Markdown

`Bubble.tsx:120` 选择 Assistant / User 拆分函数；`hasBody` 由最终 chunks 数量决定。`bubble-chunks.ts:16–29` 的 Assistant 规则实际是：

- CRLF / 单 CR 转 LF，只影响渲染切片。
- `hasVisibleText` 去除 Cc 和 Unicode Default_Ignorable 后 trim，用于判断行 / 段是否可见；不会改写保留下来的行内容。
- 任何 `/^```/` 开头的行都翻转一个布尔值；不检查 fence 字符、长度、缩进、合法 info string、容器层级或是否真是闭合行。
- fenceOpen 为 false 时，空 / 不可见行分段；连续空段被过滤。
- 整段 trim 后恰好是 `---`、`***`、`___` 时删除。

`BubbleSegment.tsx:54` 按 `${messageId}:${index}` 挂载视觉段；每个 Assistant 段独立调用 `MarkdownRenderer`。因此**Markdown 在分段后解析，定义、列表容器、代码围栏等上下文不能跨泡传递**。

ThinkingBlock、SimpleThink、CapabilityMessage、ToolResult、HeartMarker 不在该正文 Markdown 入口内。系统消息提前分支，User 用纯文本 `whitespace-pre-wrap`，没有改成 Markdown。

## 3. 实测语法矩阵

以下“解析支持”与“Chat 实际支持”分开判定。主矩阵 48 组内容同时以整段 MarkdownRenderer 和实际 Bubble 渲染，在 320 / 390 / 1280px 核对 DOM；另补 7 组容器 / 语言样例。没有仅根据插件名判断。

| 类型 | 解析和实际显示 | 分段 / 样式限制 |
| --- | --- | --- |
| 普通段落 | 单换行保持一个气泡，软换行显示为空格；双换行和连续空白行分泡且不产生额外空段 | 没有 remark-breaks。两个行末空格或反斜杠产生 `<br>`，仍在一个泡 |
| H1–H6 | 六级都生成对应 heading 元素；Setext `Title\n---` 正确生成 H2 | H1/2/3 为 20/18/16px、600；H4/5/6 继承 14px、400。标题和 p margin 为 0，紧邻正文没有额外间距 |
| 粗体 / 斜体 / 删除线 | `**bold and *italic***`、`~~gone~~`、单换行跨行加粗正常 | 空白行本来就结束普通段落，不要求强调跨段继续 |
| 行内代码 | 单 / 双反引号、内容含反引号、单换行 code span 正常；跨行被归一为空格 | 500 字符长 token 能换行。包含空白行的反引号文本在整段解析下也不是合法跨段 code span，不归为分段缺陷 |
| 围栏代码 | 无语言和 `ts` 均有代码工具栏、复制按钮；反引号 fence 内空行保留 | 普通行首三反引号可用；`~~~`、1–3 空格缩进和四反引号嵌三反引号失败，见 MD-01 |
| 缩进代码 | 整段解析支持 4 空格 / Tab 代码 | 内部空行被拆成多个代码泡，复制时只能复制局部 |
| 语言与 Markdown fence | 已注册语言产生 `hljs-*`；未知语言显示源码 | `md` / `markdown` fence 默认渲染一次 Markdown 预览；预览内部不再递归预览。不能把这种预览模式误报为普通代码源码显示 |
| 有序 / 无序 / 嵌套列表 | 紧凑连续列表、无空行嵌套正常 | loose list、列表内多段、带空行嵌套失败。显式 `2.` 的第二泡保留 `ol start=2`，并非所有有序列表都重置编号 |
| 引用 | `> one\n>\n> two`、`> > nested`、带 `>` 的引用内 fence / 列表正常 | 带 `>` 的“空行”有可见字符，不会触发拆分。`> one\n\n> two` 整段解析本就得到两个 blockquote，不能误报为同一引用被拆坏 |
| GFM 表格 | 表头、对齐、连续多行、单元格内容正常 | 合法连续表格无内部空白行，通常不会被拆断；空行后再写管道行，整段解析也会结束原表格。宽表格裁切，见 MD-04 |
| 分割线 | Markdown 能识别 `---`、`***`、`___`、`----`、`* * *`、`- - -` 等 | 自定义 `hr: () => null` 隐藏所有分割线；拆分器只删除三个精确值，其他变体可能留空泡。Setext 标题不能按字符串包含 `---` 删除 |
| URL / Markdown 链接 | 普通 https URL、行内链接、mailto 可生成 anchor 并点击；长链接不撑破容器 | 默认当前标签页跳转，无 target/rel 定制。reference link 若定义跨空白行落到另一泡则失效 |
| 图片 | 行内 Markdown 图片交给 MediaImage，支持加载 / 失败 / 重试 / 查看器 | 合成 2400×600 图片在窄屏收缩到容器内；max-height 290px。只接受符合资源策略的 URL；reference image 跨泡失效 |
| 任务列表 | 生成 `type=checkbox` 的 input，checked 状态正确、disabled=true | 仅展示，不能交互勾选；ul 仍保留当前列表样式，未专门定制 task-list 排版 |
| 原始 HTML | `<img onerror>`、`<script>`、`<b>` 均作为文本展示，无对应可执行节点 | 未配置 rehype-raw；并非富 HTML 支持。`<meta>` 等已知控制语法先被上游过滤 |
| 数学及其他扩展 | `$a^2$` / `$$…$$` 显示普通文本，没有数学排版 | 没有 KaTeX / MathJax / Mermaid / footnote 插件。`See[^n]` 不成为脚注；不作为本轮必须新增能力 |

CRLF、LF、空格和 Tab 分隔样例符合现有产品拆泡规则。U+200B、U+2060、FEFF、NBSP 单独一行均按当前可见性规则分泡；其中一些字符在 CommonMark 内不等于空白行，这是现有显示策略比 Markdown blank line 更宽的兼容点。未来结构保护时仍须保留代码内原字符，不能全局删除不可见字符。

## 4. Markdown 与拆泡冲突矩阵

| 输入 / 边界 | 当前实际结果 | 应保留 / 建议修复边界 |
| --- | --- | --- |
| 行首三反引号，内部空行 | 整块一个泡，代码空行保留；外部 Tail 是另一个泡 | 保留 |
| 三反引号未闭合 | 已打开部分到当前 EOF 一直一个泡 | 可解释，保留 EOF 开放块语义，不人为补源码闭合标记 |
| 波浪线 fence | 内部空行分泡；后半代码降为正文，末尾 `~~~` 被当作新空代码块开头 | 保护整块，字符和闭合长度必须匹配 |
| 1–3 空格缩进 fence | Markdown 识别 fence，拆分器不识别，出现与波浪线相同损坏 | 不能 trim 所有代码行来修复，会破坏原缩进 |
| 四反引号包三反引号 | 内部三反引号误翻转外层状态，后续空行拆断 | 根据真实外层 fence 长度识别闭合；不要求“任意三反引号行翻转” |
| 四反引号打开，三反引号行在内部 | 三反引号不足以关闭 Markdown 块，但拆分器已翻转 | 同上 |
| 非法开围栏（info 中含反引号） | Markdown 保持正文，拆分器却可能进入 fence 状态，吞掉后续自然分泡 | 只认 Markdown 实际合法块 |
| 缩进代码中的空行 | 一个逻辑块变两个代码块 | 保护 code 节点范围 |
| loose list / 列表多段 | 列表被拆为多个 ul/ol、续段脱离 li | 仅保护同一个 list 块内部空白行；外部自然段继续分泡 |
| 嵌套列表的缩进续段 | 续段可能变成顶层缩进代码 | 不用简单“上一行以 - 开头”启发式判断整个列表 |
| `>` 空白引用行、引用内 list / fence | 常规样例已正确保留 | 保留；按块范围处理容器嵌套，不扩大为所有相邻引用强行合并 |
| 裸空白行分隔两个引用 | 两个独立 blockquote、两个泡 | 合法块边界，不是必须修的问题 |
| 连续 GFM 表格 | 一个 table、一个泡 | 保留，无需人工把空行后的管道文本拼回表格 |
| standalone 精确 `--- / *** / ___` | 拆分前删除，不产生气泡 | 维持本轮兼容；是否恢复 hr 需单独确认 |
| `---- / * * * / - - -`，或多条 hr 同段 | MarkdownRenderer 不输出 hr，但气泡外壳仍在 | 语义识别隐藏节点，防空泡；不能误删 Setext heading 或代码中的横线 |
| reference 定义与使用跨泡 | 定义所在泡为空，使用所在泡显示字面引用文本 | 共享消息内定义上下文；不合并所有正文段落 |
| 无闭合强调 / 反引号 | 以普通文本显示，后续 token 到达可变成格式 | 正常流式 Markdown 重解释，不能把每次变化都判定为内容异常 |

## 5. 确认问题与最小复现

### MD-01：围栏与缩进代码的实际语法比 fenceOpen 更复杂

分别将以下完整文本作为 Assistant 公开正文：

````text
~~~ts
const a = 1;

const b = 2;
~~~
````

期望一个代码块、一个泡。实际两个泡：第一个只含 a；第二个含普通正文 b 和一个空代码框。再加 `\n\nTail` 后共三个泡。320 / 390 / 1280px 均复现。

缩进 fence 同样复现，精确文本如下（围栏各有两个前导空格）：

````text
  ```ts
const a = 1;

const b = 2;
  ```
````

缩进代码样例 `    const a=1;\n\n    const b=2;` 在整段解析时是一个代码块，Bubble 路径拆成两个代码块。

长 fence 最小构造：外层四反引号 `md`，内部 `# Demo` 后空行，再放三反引号 ts 块，内部 a / 空行 / b，再关闭内外 fence。整段 Renderer 正确得到一次 Markdown 预览和一个代码块，Bubble 路径却把 b 变成普通正文，并产生额外 Code 框。

根因：`bubble-chunks.ts:17` 把“任何行首三个反引号”当成开关，与 Markdown 的字符、长度、缩进和容器语义不同。只扩大一个正则到 `~~~` 不能解决长 fence、列表 fence 和非法 info string。

### MD-02：loose list 与容器续段被重新解释

```markdown
1. one

1. two
```

整段解析：一个 ol，浏览器顺序为 1、2。当前：两个 ol，各自从 1 开始。若源文本第二项写 `2.`，第二泡会有 `start="2"`，但仍丢失同一个列表容器的语义。

```markdown
- one

  - nested

    continuation

- two
```

整段解析：嵌套列表内的 continuation 是列表段落；当前四个泡，continuation 变成带复制按钮的缩进代码块。`- one\n\n  continuation` 则把续段变成列表外普通 p。

根因：在 Markdown 识别 list / listItem 之前删除分界空行、分别解析余下缩进；不能从单个段重新恢复原容器。

### MD-03：消息级定义上下文被分段切断

```markdown
Read [guide][doc].

[doc]: https://example.org/guide
```

整段 Renderer：一个可点击 guide 链接。Bubble：第一泡显示 `Read [guide][doc].`，无 anchor；第二泡存在 padding / border，但内部没有正文节点。`![synthetic][pic]` 加空行后的图片定义同样从可见图片变成字面文本。

这是跨段定义，单纯保护 list / code / quote 无法解决。保持普通段落分泡时，需传递同一消息的 definition 上下文。直接要求“全部链接改行内写法”只是兼容限制，不是完整修复。

### MD-04：宽表格被裁切

可确定复现的合成文本：

```javascript
const table = [
  '| ' + Array.from({length: 12}, (_, i) => 'column' + i).join(' | ') + ' |',
  '| ' + Array(12).fill('---').join(' | ') + ' |',
  '| ' + Array(12).fill('longcontent').join(' | ') + ' |',
].join('\n');
```

实际 ChatView 的 table 宽约 1112px；气泡 clientWidth 在 320 / 390 / 1280px 分别约 243 / 302 / 583px，scrollWidth 均约 1128px。table 的 overflow-x 是 visible，气泡却是 hidden；没有 table 专属 overflow-x-auto 容器，右侧列被截断。页面 scrollWidth 等于视口，**页面没横向溢出不代表表格可读**。

根因位于 `MarkdownRenderer.tsx:208` 仅设 table `w-full`，以及 `bubble-surface.ts:2` 的 `overflow-hidden`。CSS 表格最小内容宽度仍可大于 `w-full`。推荐局部 table wrapper 横向滚动，不去掉整个气泡的裁切，也不改变全局布局。

### MD-05：源字符串可见，不等于 Markdown 有可见输出

依次作为独立 Assistant 正文：`----`、`* * *`、`- - -`、`___\n***`。当前每个都会留下一个空的 BubbleSegment；渲染器全部 hr 都返回 null，而拆分器只过滤三个精确源值。

`[doc]: https://example.org` 也是非空源文本，但只有 definition，无可见节点，会留空泡。过滤控制标记后若只剩这类源语法，也不能依靠当前 `hasVisibleText` 消除外壳。

不能用“所有标点段都删掉”或“无 textContent 就删掉”修复：图片、checkbox、合法空代码块工具栏等可能有真实可视 / 交互输出；`Title\n---` 是合法标题。需要与当前 renderer 的隐藏节点规则对齐。

### MD-06：流式更新破坏代码块局部交互状态

用 500 字符无空格代码行生成 fence，先把 `<pre>.scrollLeft` 设为 200，再在同一 Message / 同一段尾追加 `\nnext`。三种宽度下均观察到：旧 pre 与新 pre 不是同一 DOM 节点，scrollLeft 从 200 变成 0。追加内容没有拆出新泡，故不是泡数变化的必然结果。

`MarkdownRendererInner` 每次创建新的 `components.img / code / pre` 函数（171–182 行），React 将它们当成新的组件类型，重建相关子树。正文图片同样被重建；这支持“加载状态会被重置”的判断，但本轮没有将每次重建推断成一定发生新的网络下载，缓存行为另当别论。

这会影响流式期间横向阅读、复制反馈状态和图片状态；未量化各设备逐帧闪烁，不把所有流式重排都归为此缺陷。建议稳定自定义组件类型，通过 props / context 传递 preview 设置，避免每个新 token 产生新函数类型。

### MD-07：现有样式 / 兼容限制

H1–H3 有字号和字重；H4–H6 没有专门样式，Tailwind preflight 清除了浏览器 heading 默认字号 / 字重，实际与正文一致。普通 p、H1–H3 上下 margin 为 0；ul、ol、blockquote、table 为上下 8px，li 上下 2px；Assistant 气泡间 gap 为 2px。

因此引用中 `> one\n>\n> two` 有两个 p 的语义，但两段本身无额外间距。该现象有明确 DOM / CSS 原因，建议仅在产品需要时补局部 heading / 引用段落样式，不扩大到全局视觉设计。

`hr: () => null` 是显式兼容行为，不是 Markdown 不识别分割线。消除空泡与恢复合法 hr 的可见性是两件事；本轮不替产品决定恢复全部 hr。

## 6. 流式、交互与安全

### 6.1 SSE / 最终状态

对 13 组合成正文逐个枚举两段 SSE 切点，共 563 个切点 / 宽度，三种宽度合计 1689 次。覆盖普通 / 波浪线 / 缩进 / 长 / 未闭合 fence、列表、引用、引用内代码、reference、CRLF、控制过滤。每次比较 accumulator flush 后正文与 HTTP presenter 正文，以及最终 chunks，全部一致。

逐字符流式 DOM 观察：

- 普通三反引号样例，在收到三个反引号时从文本变成代码，代码内空行不增加气泡；收到外部 Tail 才从 1 泡变 2 泡。
- 波浪线样例在内部空行后的 b 到达时从 1 泡变 2 泡，末尾围栏又产生第二个 code 框，Tail 到达变 3 泡；最终 HTTP 显示保留相同错误。
- 四反引号 Markdown 预览包含三反引号时，预览 / 代码结构会重新解释，内部空行出现额外分泡。
- 围栏在 chunk 中间切开不会额外缓存或丢弃 Markdown 字符。前 1–2 个反引号暂作文本、完整后识别为块是可解释的前缀解析；不能保证任何前缀与最终格式完全相同。

没有发现由 SSE 切点本身造成的正文重复或持久化数据丢失。这里测试的是相同合成正文下的传输边界，不是所有真实模型输出或后端重写行为的证明。

### 6.2 复制、选择和链接

320 / 390 / 1280px 均验证：

- 消息复制接收完整的已公开 `message.content`，保留 Markdown 标记及原空白行，不拼接视觉段。
- 代码复制通过高亮 React children 提取文本，移除 renderer 加入的一个末尾 LF；样例得到 `const a=1;\n\nconst b=2;`。代码显示 DOM 保留一个最终 LF；CRLF 渲染 / 代码复制采用 LF，整消息复制仍来自 VM 原文。
- 原生 Range 从第一泡 first 选到第二泡 second，原生选择与 `readMessageSelection` 均得到 `first\n\nsecond`；“放入输入框”使用相同选区。该函数排除代码工具栏、按钮及其他 non-body 节点。
- 正常 https 链接点击进入当前标签页的合成目标。拆分不额外拦截点击；reference 失效属于解析上下文缺失。
- 超长正文、500 字符行内代码 / 链接能换行且容器内无横向超出；代码 pre 用 `white-space:pre; overflow-x:auto`，滚动可达右侧。宽表格是独立缺陷。

选择返回的是公开可见文本，不是 Markdown 原文序列化：列表符号、checkbox 状态、图片 URL、工具栏不承诺复制到选区插入结果。流式 code DOM 重建期间选区是否被浏览器保留未做完整矩阵，不能声称所有选区稳定。

### 6.3 安全边界

核对本地实际 react-markdown 10.1.0 实现：raw hast 节点在无 rehype-raw 的配置下转为文本。合成 `<script>` 和 `<img onerror>` 的正文 DOM 中 script / img 均为 0，测试标志未执行。不要把头像或合法 Markdown 图片误算成 HTML 注入节点。

默认 `defaultUrlTransform` 对 javascript、data、file 链接生成空 href；实测三个危险协议均未保留原地址。http(s)、mailto、相对路径和协议相对 URL 可保留。没有 target=_blank，因此不存在本实现主动新增窗口却遗漏 noopener 的问题。空 href 仍可能作为当前页链接被点击，属于可用性小问题，不是危险协议执行。

正文图片额外经过 `markdownImageResource`：上传路径白名单；外部只接受 https；拒绝凭据、data/blob、协议相对输入、明显私网字面地址、敏感 query key 和受限内部路由；然后交给 MediaImage。它不是对任意域名 DNS 最终解析地址的网络隔离证明，不能把字符串策略描述成完整 SSRF 防线。当前是浏览器加载图片，并没有审计到新增服务端抓取入口。本轮未发现已测试路径中的可执行 HTML / 危险协议注入。

控制标记过滤在代码解析之前、并不识别 Markdown code context。合成 fence 内写 `[HEART:SYNTHETIC]`、`[TODO:SYNTHETIC]`，这些文本也会被过滤，只留下代码框及换行。这是现有权限边界 / 表达兼容限制；不能为保护 Markdown 而把隐藏命令或 Thinking / DRIFT 恢复进正文。被过滤后的公开正文才是结构保护器的输入。

## 7. 验证结果与限制

| 验证 | 结果 |
| --- | --- |
| 既有针对性 Vitest：Markdown、Bubble、搜索、插入、chat-send、presentation | 17 文件 / 248 项全部通过 |
| 全量 `npm test` | 178 文件 / 2333 项全部通过 |
| 临时 Markdown 矩阵 | 48 组 × 整段 / 分泡两模式 × 3 宽度，共 288 次 DOM 核对；另补 7 组特殊样例 / 宽度 |
| SSE 任意两段切点 | 563 × 3 = 1689 次正文和最终 chunks 一致性断言通过 |
| 临时浏览器交互断言 | 三种宽度的整消息复制、代码复制、跨泡选区、插入、链接、代码滚动通过；DOM 重建与滚动归零被稳定复现 |
| 真实 ChatView + 合成 HTTP | 三宽度复现表格裁切、代码滚动正常、长词换行正常、波浪线错误分泡；页面本身无横向撑宽 |
| 已有 `chat-bubbles-shortcuts-smoke.cjs` | 隔离环境最终复跑 320 / 390 / 1280px 全部通过，包含原文 / 复制、单 Message 身份、SSE / HTTP 对账 |
| 关键截图 | 仅 3 张：320 表格、390 波浪线、1280 heading / 引用；已人工核对，没有全站截图 |

已有 smoke 的首次启动未进入初始消息。改用 `envDir:false` 的临时 Vite 隔离本地环境后，能进入并通过移动端；首次桌面运行在快捷键菜单的 Shift+Enter 选择断言失败，完全相同测试再跑一次全部通过。这一条存在时序波动，报告保留失败记录；未修改快捷键或既有测试，未把一次复跑通过等同于稳定性已解决。

主矩阵最初使用项目 Vite；真实 ChatView 和最终 smoke 使用临时隔离 Vite，均读取同一 HEAD 源码。Chrome 使用隔离配置和合成网络路由，非用户日常浏览器会话。测试临时文件在结束后移除，原始 JSON、日志及 3 张截图仅位于 `/private/tmp/penumbra-markdown-audit/`，不是仓库交付依赖。

本轮没有业务代码变更，所以未为报告单独跑构建。未做 iOS / Android 真机、Safari / Firefox、逐帧视频、真实后端或大文本性能基准。现有绿色测试只说明基线没有回归，不能说明本报告中的 Markdown 缺口已被覆盖或修复。

## 8. 推荐的最小修复方案与必要成本

### 8.1 分段：局部识别源范围，保留普通空白行规则

仅给 fence 再加一个正则风险较低，但只能修一部分；手写完整 list / blockquote 状态机会再次复制 Markdown 语法，遇到缩进续段、容器内 fence 和松散列表仍不可靠。

推荐复用现有 `unified + remark-parse + remark-gfm`，只做**分段边界规划**：

1. 输入为控制过滤后的公开正文；在渲染副本上统一 CRLF / CR，保留原始 Message 和复制源。
2. 解析一次当前公开全文，取得 code、list、blockquote 等顶层块的 source position 范围。顶层 list 范围自然包含嵌套 list / 引用 / code，不应另起互相矛盾的状态机；连续 table 也可以保护其范围。
3. 仍按现有空白 / 不可见行寻找分界，仅禁止切断受保护块内部。块外的自然段之间照常拆泡。自然段位于代码块之前 / 之后时，仍可形成独立气泡。
4. 基于当前 renderer 的可见节点规则识别纯隐藏输出，处理 definition / thematicBreak-only 空段。图片、任务列表和代码块不能用纯文本为空来排除。
5. 未闭合 code 在 EOF 的范围由现有解析器决定；流式到达更多内容时重新规划。保持“同一前缀→同一结果”，不用给原文补 fence，也不改 SSE controller。

这是局部利用现有解析树的位置，不是把聊天 UI 全面改成 AST 渲染或重写 react-markdown。可以继续把受保护范围的原文本切片交给现有 Renderer。

真实成本：每次累计内容更新会多一次全文 parse，时间 / 内存与当前文本规模相关；现有分段本来已扫描全文，Markdown / 高亮也会重跑，但不能假定额外解析免费。应在实现时用长代码、长列表和实际 chunk 频率测量。短期先全量解析清晰可测，不先做增量 AST、worker 或统一渲染树缓存。出现测量证据再考虑缓存已稳定前缀。

### 8.2 引用定义：独立的小范围上下文补齐

MD-03 无法只靠保护块内部空行解决。若纳入下一轮：从同一公开正文抽取 definition，作为各段的解析上下文传入；definition 自身不产生视觉气泡，保留原定义优先级，并继续走默认 URL / 图片资源过滤。可通过解析阶段注入定义或附加仅供解析的 definition 源实现，不能把定义拼进原 Message、复制源或可见正文。

这会给 chunks 元数据 / BubbleSegment 与 Renderer 的接口带来小幅变化；需要同时检查搜索纯文本映射，不能简单把不连续的定义行计入可见文本偏移。若先修代码、列表、表格和空泡，reference 限制可以明确保留到第二步，但不应声称已经完整支持消息级 Markdown。

### 8.3 局部渲染与交互

- MD-04：只给 table 加 `min-w-0 / max-w-full / overflow-x-auto` 的容器，保留现有消息宽度和气泡裁切；验证表格语义和真实 scrollLeft，不以页面无溢出代替验收。
- MD-06：稳定自定义 img / pre / code 的组件类型，设置通过 props / context 传递。用同一个 code DOM 的身份、scrollLeft、复制反馈以及图片状态做回归。
- MD-07：H4–H6 和引用内部 p 间距按产品需要局部调整，可暂缓；恢复 hr 另行决定，不与分段修复绑定。

### 8.4 预计受影响文件

| 文件 | 最小职责 |
| --- | --- |
| `src/components/chat/bubble-chunks.ts` | Assistant 块内边界保护、语义空输出判断；User 函数保持原样 |
| 可选新增 `src/components/chat/markdown-boundaries.ts` | 复用现有 parser，返回范围 / definition 元数据，避免把复杂遍历塞入 Bubble |
| `src/components/chat/Bubble.tsx` | 若接口需要，仅接入新 chunks 元数据及 hasBody；不改变 Message、能力组件或发送流程 |
| `src/components/chat/BubbleSegment.tsx` | reference 上下文传入 / 搜索纯文本映射，若不纳入 MD-03 可减少改动 |
| `src/components/chat/MarkdownRenderer.tsx` | table 滚动容器、稳定组件类型、可选 definition 解析上下文 |
| `Bubble.chunks.test.tsx`、`MarkdownRenderer.test.tsx`、相关搜索 / 插入测试及合成 browser fixture | 下列语义和交互回归 |

不需要改后端、公开历史投影、receipt / reconciliation、Chat Settings、发送 controller、User 气泡规则、HEART / DRIFT / Thinking 入口或全局 CSS。

## 9. 下一轮必须补充的回归

1. 正文单换行保持一个泡，双换行多个泡，首尾 / 连续空白和控制过滤残留不产生空泡；原文、消息身份、整消息复制不变。
2. 三反引号 / 波浪线、1–3 空格缩进、四反引号含三反引号、闭合长度不足、非法 info、未闭合到 EOF、列表 / 引用内 fence；内部空行、缩进和代码复制均完整。
3. 缩进代码含空行 / Tab；loose list、重复 `1.` 的连续编号、显式起始编号、列表多段、嵌套续段、列表后普通正文仍分泡。
4. `>\n` 引用内空段保持同一引用；裸空白行本来结束引用时不强行合并；引用内列表 / fence 保持语义。
5. 表格连续行、对齐、普通短表格；12 列和长单元格在 320 / 390 / 桌面横向可滚动。表格后空白行仍结束表格，不把非法表格内容修造成新语法。
6. hr 精确值、任意合法长度 / 空格变体、同段多个 hr 不留空泡；Setext、代码和普通横线文本不误删。若保留隐藏 hr，测试明确表达这一兼容规则。
7. definition-only 段无空泡；若修 MD-03，跨泡链接 / 图片引用、重复定义、定义在使用前后、长 URL 和被拒绝协议保持正确；搜索命中和选中插入同步校验。
8. 固定同一个流式 Message / 同一视觉段，追加 token 后 code DOM 不因组件类型变化而重建，scrollLeft 不归零；复制按钮仍排除工具栏文字、保留内部空行。图片状态按稳定 URL 保持。
9. 每一类结构枚举 SSE 两段切点并抽取逐字符前缀；最终公开正文、chunks 与 HTTP presenter 一致，不重复输出、不显示控制前缀。CRLF / LF / 不可见行在受保护块内外各覆盖。
10. 原始 HTML 保持文本；javascript / data / file href 不可执行；图片继续遵循资源白名单。结构保护后隐藏命令不恢复，独立能力投影和权限边界不变。

本轮到报告交付为止，以上均为修复建议，未实施。建议先确认 MD-01 / 02 / 04 / 05 的局部修复，决定 MD-03 是否同期完成；MD-06 可独立小改，MD-07 暂缓。人工确认后再进入业务代码修复。
