# Chat Markdown PR1 修复与人工验收记录

日期：2026-10-28。基线 `a2e4af2`。本轮实施 MD-01 / MD-02 / MD-04 / MD-05，并增加开发验收页面；不 commit、push、deploy。开始时仅有上一轮新增、未提交的 `docs/chat-markdown-audit.md`，已保留。

## 本地打开与操作

在项目目录执行：

```sh
npm run dev
```

打开 **http://localhost:3000/dev/chat-markdown**（也可用 http://127.0.0.1:3000/dev/chat-markdown）。若 Vite 提示其他端口，以终端实际端口替换。交付时已确认本项目现有 3000 开发服务可打开此入口。

- 顶部选择案例，立即通过真实 `Bubble → BubbleSegment → MarkdownRenderer` 显示。下方原文区域可折叠、可编辑，编辑后实时预览；“恢复默认文本”恢复当前案例。
- 宽度档位为 **320px / 390px / 桌面 768px 的预览容器宽度**。这是容器模拟，不是移动设备或触屏真机验收；窗口比目标容器窄时，外层预览区域可以横向移动，页面本身不应被撑宽。
- 显示当前**正文视觉气泡数**；生成等待提示不计入此数。默认泡数只针对预置原文，编辑后按实际结果判断。
- 选择“12 列宽表格”，在表格内部用触控板或鼠标横向滚轮滚动，最右应能看到 `column11`。代码块也可横向滚动，消息复制与代码复制使用真实按钮。
- 切换“模拟流式输出”，点击“继续 / 开始”，每 40ms 追加最多 8 个 UTF-16 字符。支持暂停、继续、重置；完整结束后应与“完整显示”的正文一致。编辑或切换案例会停止并重置流式。
- 页面不调用聊天 API、不依赖登录、Provider 或历史。完整模式经过真实 HTTP presenter 的公开正文过滤；模拟流式使用真实 accumulator 逐段追加，随后交给同一 Bubble。

## 预置案例：36 个

| 分类 | 案例 |
| --- | --- |
| 基础气泡（5） | 普通单行、单换行、双换行、连续空白行、空格与不可见空段 |
| 代码块（9） | 三反引号、波浪线、缩进围栏、四反引号包三个、闭合长度不足、非法 info、未闭合围栏、缩进代码含空行、代码后普通正文 |
| 列表与引用（7） | 普通列表、loose list / 重复 1.、多段列表项、嵌套列表与续段、引用内代码、引用内列表、引用之间合法空白分隔 |
| 表格（4） | 短表格、12 列宽表格、超长单元格、表格后普通正文 |
| 空白气泡（8） | 分割线变体、Setext、只有 reference definition、正文与隐藏节点混合、控制过滤后隐藏节点、合法空代码块、任务列表、图片反例 |
| 后续待修（3） | MD-03 跨泡引用链接、MD-03 跨泡引用图片、MD-06 流式代码滚动归零 |

图片反例使用保留域名 `example.invalid` 的合成 URL，不读取任何用户上传；离线或加载失败时，真实 MediaImage 显示失败 / 重试界面，仍应保留气泡。自动化测试用合成 SVG 拦截该 URL，验证媒体节点不被空泡过滤删除。

## 修复实现与边界

### MD-01 / MD-02：按真实块范围保护空白行

`markdown-boundaries.ts` 复用已有 `unified + remark-parse + remark-gfm`，对当前**已过滤的公开正文**解析；从顶层 code、list、blockquote、table 的 source position 取得行范围。顶层容器自然包含其嵌套结构，不手写 fence / 列表状态机。

`splitAssistantBubbles` 继续逐行寻找空白 / 不可见行分界，仅禁止切开受保护范围内的空行。范围以外照常分泡，例如代码后接两段正文仍是三个气泡。单换行不拆泡，连续 / 首尾空白仍不产生空段；两个本来独立的引用仍然是两个泡。非法 info string 由 parser 判定为普通正文，不能误开 fence 状态。

开放 fence 使用当前前缀解析到 EOF 的范围，不补闭合标记。保留下来的代码和容器源文本直接切片拼接，没有重排缩进或序列化 AST。沿用原渲染副本 CRLF / CR 转 LF 的规则，原 Message / VM / 复制源不变。User 函数仍是原有的按换行 split + 同一可见性判断，没有引入 Markdown 分析。

### MD-05：与当前 Renderer 对齐的语义空输出检查

新 helper 对解析节点判断可见输出：definition 和 thematicBreak 不输出；普通容器递归检查子节点；代码（含空代码工具栏）、行内代码装饰、图片 / 图片失败反馈、列表标记 / checkbox、表格等保留。不是按 DOM textContent 判断，也不按标点正则删除。

各段仍独立解析判断，因此定义共享没有被顺带实现。仅当切片与规范化全文完全相同时复用解析树；其余气泡分别解析，以符合现有逐泡 Markdown 语义。特别覆盖了行首零宽空段被移除后，剩余文本从普通段落变成 definition 的边界，避免误留空泡。正常文本、链接、HTML 的转义文本，以及 Setext 标题都保留；多种合法 hr 和 definition-only 段不留下外壳。`hr: () => null` 兼容约定保持。

### MD-04：仅增加 table 局部滚动容器

`MarkdownRenderer` 自定义 table 外包装 `max-w-full overflow-x-auto overscroll-x-contain`，提供可聚焦的 region 和横向滚动说明，内部仍为原 table / th / td。保留气泡宽度、圆角、背景、overflow-hidden 及其他现有样式，不改全局消息容器。

浏览器验收检查实际 `scrollWidth > clientWidth`、设置 scrollLeft 后大于零、最后一列进入容器右边界，以及鼠标横向滚轮实际移动；短表格不产生多余横向溢出。页面无横向撑宽只是附加条件。

### 开发隔离

`App.tsx` 用 `import.meta.env.DEV` 双重保护路由与动态 import；正式导航没有入口，不挂载 ScheduleRuntime / Chat 数据读取链路。开发页与集中 fixture 仅由该开发分支导入。

生产构建后检查 48 个 JS chunk，未检出页面组件、fixture 标识或 `/dev/chat-markdown` 路由。生产 preview 访问同一路径不显示验收 UI，也没有加载 fixture 模块（SPA fallback 可能显示原桌面，不等同于开放验收页）。未引入依赖或改动 package-lock。

## 修改文件

- `src/components/chat/markdown-boundaries.ts`：已有 parser 的块范围与可见输出辅助函数。
- `src/components/chat/bubble-chunks.ts`：仅 Assistant 的保护性分段和语义空输出过滤；User 行为不变。
- `src/components/chat/MarkdownRenderer.tsx`：仅增加局部 table 滚动包装。
- `src/App.tsx`：开发路由及开发条件动态导入。
- `src/components/dev/ChatMarkdownDevPage.tsx`：薄合成消息适配、编辑 / 宽度 / 流式控件，真实 Bubble 预览。
- `src/components/dev/chat-markdown-cases.ts`：集中维护的 36 个合成案例及期望 / 已知限制。
- `src/components/chat/Bubble.markdown.test.tsx`：新增 83 项语义、结构、SSE / HTTP、控制过滤等回归。
- `tests/browser/chat-markdown-smoke.cjs`：开发页交互、实际表格滚动、复制、流式及可选生产隔离检查。
- `tests/performance/chat-markdown-segmentation.ts`：可复跑的合成 CPU / 更新开销测量。
- 本记录；上一轮审计报告保持原样。

没有修改 DTO、历史公开投影、后端、发送 / 快捷键 / Settings、Thinking / DRIFT / HEART 的实现、PR7 对账、BubbleSegment、整消息复制或全局视觉样式。

## 基础性能结果

执行：

```sh
node node_modules/vite-node/vite-node.mjs tests/performance/chat-markdown-segmentation.ts
```

同一本地进程，合成内容，每组预热 5 次、采样 25 次。下表为最终代码在全量测试 / 构建结束后单独复测的结果；历史扫描保留旧算法缺陷，只用于 CPU 对照，不用于业务。parser-only 与 split 分开测量，存在 JIT / GC 波动，不能把两列简单相减当成精确独占成本。

| 内容 | 字符数 | 旧扫描 P95 | 新完整分段 P50 / P95 |
| --- | ---: | ---: | ---: |
| 200 行代码 | 5,188 | 0.051ms | 0.627 / 0.759ms |
| 800 行代码 | 21,388 | 0.139ms | 2.482 / 2.701ms |
| 2400 行代码 | 67,388 | 0.350ms | 8.234 / 8.771ms |
| 50 项多段列表 | 2,078 | 0.031ms | 1.390 / 1.623ms |
| 200 项多段列表 | 8,578 | 0.079ms | 6.162 / 6.993ms |
| 800 项多段列表 | 34,978 | 0.320ms | 31.537 / 42.165ms |
| 200 个带格式自然段 | 14,798 | 0.050ms | 20.518 / 22.633ms |

逐字符 / 小 chunk 的每次都重新解析当前累计前缀：

| 内容与更新方式 | 更新次数 | 总 CPU / P95 单次 / 最大单次 |
| --- | ---: | ---: |
| 代码前 2000 字符，逐字符 | 2000 | 347.0ms / 0.296ms / 1.542ms |
| 5188 字符代码，每 16 字符 | 325 | 131.6ms / 0.724ms / 1.016ms |
| 列表前 2000 字符，逐字符 | 2000 | 1728.6ms / 2.140ms / 5.577ms |
| 8578 字符列表，每 16 字符 | 537 | 2185.3ms / 9.844ms / 50.760ms |

新开销主要来自完整 Markdown parse。单个受保护块复用全文树；多普通段落还有逐段语义 parse。**长列表 800 项已超过 16.7ms 单帧预算；200 个带格式自然段也接近 / 超过该预算**，不能宣称任意长度逐 token 输出都流畅。连续全文解析的累计总成本随前缀长度增长，这是本次简单策略的已知成本；按本轮范围约束未引入 worker 或跨消息缓存，也没有将本次结果外推为手机性能。

本轮保持简单实现；没有引入增量 AST / worker / 跨消息缓存。如果实际业务经常生成数万字复杂列表或上百段正文，应在独立性能任务里测量真实更新频率和 React / 高亮总耗时，再决定是否按稳定内容缓存或合并渲染更新；不在本轮扩大实现。开发页计数也调用真实 splitter，因此开发页自身的重复计算不能视作生产 Chat 的单次 CPU 指标。

## 测试结果

- 新旧针对性 Vitest：3 文件 / 98 项全部通过。
- 全量 `npm test`：179 文件 / 2416 项全部通过（新增 83 项）。
- `npx tsc -b` 通过；`npm run build`（含类型检查）通过。保留原有 Vite 大 chunk 提示。
- 新开发页 smoke：320 / 390 / 1280px 窗口，逐个验证 36 案例、每窗 320 / 390 / 768px 三档预览宽度的实际表格滚动与滚轮、短表格、复制、编辑 / 恢复、流式暂停 / 重置 / 最终一致性；聊天 API 请求数为 0。
- 生产 preview 的开发页缺席和 fixture 不加载检查通过；产物 JS 扫描无开发页 / fixture / 路由标识。
- 既有 `chat-bubbles-shortcuts-smoke.cjs`：320 / 390 / 1280px 最终单独复跑全部通过，覆盖 User 原文与单消息身份、快捷键、SSE / HTTP 对账。
- 既有 `chat-thinking-smoke.cjs`：320 / 390 / 1280px 最终单独复跑全部通过。
- 既有 `chat-pr7-interaction-smoke.cjs`：1280 / 390px 通过，覆盖重挂载、会话所有权、失败重生成、499 receipt 恢复。
- 少量局部截图检查宽表格最右列和四反引号内嵌代码，没有全站截图。

并行运行浏览器回归时：快捷键 smoke 在桌面 Shift+Enter 选项断言失败（审计时已有同类波动），Thinking smoke 在复制等待处超时；各自单独复跑全部通过。保留首次失败记录，不据此声称已经修复浏览器测试时序稳定性，也未改动这些旧脚本或相关业务。

新语义测试覆盖 0–3 空格围栏、波浪线、长短 fence 匹配、非法 info、开放 fence、缩进 / 容器内代码、loose list、嵌套续段、正常独立引用、普通正文拆泡、CRLF 及不可见行、语义空泡反例。对 14 类正文枚举每个两 chunk 切点，检查不完整前缀可分段和完整输出与 HTTP 一致；另逐字符验证代码中的隐藏控制标记不会恢复。

复跑新浏览器检查（Playwright 已安装时）：

```sh
node tests/browser/chat-markdown-smoke.cjs
# 可选：生产构建 + preview 后，额外核对生产隔离
CHAT_MARKDOWN_PRODUCTION_ORIGIN=http://127.0.0.1:4173 node tests/browser/chat-markdown-smoke.cjs
```

脚本默认开发服务为 `http://127.0.0.1:45365`，可设置 `CHAT_MARKDOWN_ORIGIN=http://127.0.0.1:3000`。可将 Playwright 模块绝对路径作为第一个参数传入；脚本使用隔离 Chrome。生产 preview 端口以启动输出为准，本轮验证使用 45367。完整日志与性能原始结果保留在 `/private/tmp/penumbra-markdown-pr1-*.log`，均为合成数据。

## 明确保留的限制与人工验收建议

- **MD-03 未修复**：reference definition-only 泡已消除，但跨泡链接 / 图片仍缺定义上下文。开发页中有两个明确的“已知限制”案例。
- **MD-06 未修复**：现有自定义 Markdown 组件仍随正文更新重挂载，流式中代码横向滚动可能归零。开发页可暂停、滚动后继续观察；不计作 PR1 失败条件。
- **MD-07 未修复**：H4–H6、段落 / 引用间距与隐藏 hr 约定保持原状。
- 没有新增数学、Mermaid、原始 HTML 执行或新的链接 / 图片权限；隐藏内容不会因结构保护恢复。
- 没有真机、Safari / Firefox、实际模型或后端写入验收。容器宽度模拟与 Chromium 窄窗口测试都不代表真机。

人工优先确认：基础双换行仍为多泡；波浪线 / 长围栏 / loose list / 嵌套续段完整；分割线和定义空泡消失而 Setext、图片、任务列表、空代码保留；表格可滚到最右；流式最终结果与完整显示一致。确认后再决定后续 MD-03 / MD-06 或独立性能工作，本轮不提交代码。
