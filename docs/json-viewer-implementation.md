# 通用 JsonViewer 与 MCP 结构化阅读

更新于 2026-10-25。基于当前工作树及 `chat-pr4-visual-polish.md` 实施；本轮不 commit、push 或部署，等待人工验收。没有修改系统日志、后端 DTO、执行状态机、模型上下文或持久化上限。

## 依赖选择

采用并锁定 `react-json-view-lite@2.5.0`，仅增加这一项运行时依赖和对应 lockfile 条目，没有引入 MUI 或其他 JSON Tree。实际环境为 React / React DOM 19.2.7、TypeScript 5.9.3、Vite 6.4.3、Node 24.19.0，满足该版本的 React 18/19 peer 和 Node >=18 要求。

核对了[官方仓库](https://github.com/AnyRoad/react-json-view-lite)、已安装声明和实现：提供全部节点类型、子容器、展开箭头、标点及无障碍标签的样式映射；只在展开时挂载子树；方向键负责展开、收起和节点移动。本轮实测满足只读场景，未安装 `@uiw/react-json-view`。它仍会为收起节点枚举直接子项，因此额外做了结构规模保护，避免巨宽数组在挂载时产生大量分配。

## 共享 API

公开入口：`src/components/ui/json-viewer.tsx`，遵循 UI Kit 的小写连字符文件名和具名导出；`JsonValue` / `JsonViewerProps` 同入口导出。`json-viewer-model.ts` 提供内部安全检查，第三方库负责所有树节点渲染、遍历展开和方向键导航。

```tsx
import { JsonViewer } from "@/components/ui/json-viewer";

// 原文保持安全来源中的空白、缩进和转义；点击原文可直接选择文本。
<JsonViewer rawText={safeSource} label="结果" />

// 已解析的合法 JSON，支持 Object、Array、字符串、0、false、null。
<JsonViewer data={safeValue} label="详情" />

// 同时传值和原文：data 用于树，rawText 用于原文；调用方保证一致。
<JsonViewer data={safeValue} rawText={safeSource} copyText={safeCopySource}
  className="my-json-viewer" label="详情" />
```

- `data?: JsonValue`：已解析安全值；字符串表示 JSON 字符串值，不作为待解析源码。
- `rawText?: string`：完整安全原文；有原文时不重新序列化。只传 data 时生成两空格缩进的原文，不修改 data。
- `copyText?: string`：可选完整安全复制原文；默认复制 rawText 或生成的原文，始终与当前节点展开情况无关。
- `label?: string`、`className?: string`：无障碍名称与局部样式覆盖。
- `showCopy?: boolean`：默认 true；已有字段复制工具栏的宿主可设 false。
- `onBeforeLayoutChange?: (element: HTMLElement) => void`：模式切换、加载结构和节点展开前的本地布局通知，便于宿主保护阅读锚点；不包含 Chat 身份或业务控制器。

组件默认选择结构化阅读，通常只展开根节点。超过 200 个直接子项的根也先收起。根部以字段数、数组长度或原始类型给出轻量提示。解析失败或普通文本直接显示原文，不显示解析错误卡片或不可用的模式切换。不会从自然语言、Markdown 代码围栏或混合文本中截取 JSON 片段。

## 样式与滚动

`json-viewer.css` 显式替换第三方的所有 CSS 类，不导入其默认样式表。字体、控件圆角、次级文字及低饱和类型颜色来自现有主题 tokens；按钮复用 UI Kit Button，复制成功/失败复用公共 `copy-feedback.ts` 和 Toast。Chat 原有 copy-feedback 导出保留为兼容入口。

Viewer 背景透明，由宿主的 Paper/Mist 表面承载，不创建白色子卡片、blur、阴影、限高框或滚动条。共享默认强调色来自 `--color-theme`；Chat 在 `.capability-json` 中传递 `--json-viewer-accent: var(--capability-accent)`，因此共享组件不依赖 AI 主题。调用方可用 className 和公开的 `.json-viewer-*` 类覆盖颜色、字体、间距、箭头和其他样式。

原文、字段名与字符串使用自然换行及 `overflow-wrap:anywhere`；深层分支缩小缩进。树行与箭头点击区域均至少 28px，避免相邻命中区域重叠。保留库的方向键导航，并补充 Enter / Space 激活焦点箭头。焦点描边由主题 tokens 派生；没有新增需关闭的动画。

## 性能边界

- 详情收起时沿用 `CapabilityReveal` 的按需挂载和 220ms 退出卸载，不创建 Viewer 或解析树。Viewer memo 避免无关 Chat 更新重渲染，当前挂载期间缓存解析结果；模式切换不会再次解析。
- 超过 128 × 1024 UTF-16 字符的 JSON 候选先显示完整原文，用户点击现有 Button“查看结构”后才解析并挂载树；明显普通文本不显示此入口。无法解析的候选随后直接保留原文，不给错误卡片。
- 超过 2 × 1024 × 1024 字符、深度超过 32、任一容器超过 1,000 个直接子项，或总值数量超过 20,000 时，保留完整原文及复制并显示范围说明。保护仅限制树渲染，没有裁剪数据，也没有新增持久化截断规则。
- 规模检查使用有界迭代，只检查尺寸和深度，不自建第二套 JSON Tree。单节点的展开、收起、键盘移动完全交给依赖。

## MCP 接入与保留契约

接入点为 `ToolCallDetails` → `CapabilityDetails` / `DetailField`。只对调用参数、实际执行参数、已保存结果、本次 AI 有界结果和明确的结果 text block 启用 Viewer；调用正文、错误及其他业务说明沿用文本展示。其他系统通知和 Web/URL 详情未强制转为树。

`formatPublicValue` 不再提前解析或重新排版字符串，保存安全原文格式和精确复制文本；Object/Array DTO 沿用原两空格格式化。显式 JSON 结果 0、false、null 均保留，缺失 undefined 仍不制造字段。

对于已解析结果，只读取明确的 `content[]` / `type: text` / `text`；展示投影增加可选 `CapabilityField.textBlocks`，分别判断每个完整 block，字段的完整 text 和复制值仍是原来的双换行连接结果。图片、HTML、URL 不执行、不加载或生成可点击链接。

字符串包装的旧/新 `content[]` 在详情首次挂载时才做必要的正文提取（最大 2Mi 字符），按 immutable fields 引用放入 WeakMap；长历史重渲染不重复提取。只对完整 JSON 对象检查明确的 content 字段，不按工具名猜测业务格式。无法提取或超过保护范围时，完整安全保存结果仍直接可读。拥有结果正文时，完整保存结构仍移入技术详情，避免在主要阅读区重复论坛正文。

既有成功、失败、部分完成、未知及保存/AI 截断、未交付、交付未知说明均由原 Mapper / ToolResult 保留。Viewer 不判断执行成功，不改写执行参数、命令、保存数据或模型上下文。安全结果字段仍来自公开 DTO 或已有旧 MCP allowlist / 脱敏投影，没有为 Viewer 读取原始命令或绕过过滤。

单项一次展开、多项独立展开、技术详情独立缓存、手机 44dvh / 桌面 min(42rem, 60dvh) 上限及唯一详情滚动区域不变。MCP 将 Viewer 的通用布局回调接到已有 `notifyCapabilityToggle`，节点/模式变化前继续释放自动跟随并捕获 Chat 阅读锚点。

## 自动验证与人工入口

新增共享组件、模型与 MCP 集成回归；既有 MCP 回归更新了对原始 pre markup 的假设，转为核验字段和完整复制 payload，避免把默认收起误判为数据丢失。

| 检查 | 结果 |
| --- | --- |
| `npm test -- --reporter=dot` | 133 文件、1,933 项通过 |
| TypeScript / `npm run build` | 通过；Chat chunk 约 543 kB，保留原有超过 500 kB 提示 |
| 独立合成验收页 Vite 构建 | 通过；单入口合并 Chat 的合成包保留体积提示 |
| Chromium 320px / 390px / 1280px | 通过，页面异常 0、后端请求 0 |
| 大 JSON | 600 项、383,781 字符；主动加载后根先收起；展开响应约 0.2 秒，完整原文与复制一致 |
| diff / 空白检查 | 通过，包括新增文件；构建缓存还原，不纳入交付 |

浏览器覆盖树/原文切换、深层展开、方向键和 Enter / Space、独立复制原文、完整安全执行参数、旧 MCP 脱敏展示/复制、文本与 JSON block 混合、非法 JSON、HTML 安全、长字段名和中文、独立调用开关、唯一详情滚动及 Chat 阅读锚点。明暗主题和极端 AI 色均执行无横向溢出检查，并检查实际截图。自动 Chromium 无法替代真实手机输入法、触摸手感和人工审美验收。

开发服务入口：

- `/tests/browser/json-viewer.html`：共享 Viewer，普通 JSON、16 层深 JSON、数组/空容器/原始值、大数组、复制原文、非法与普通文本。
- `/tests/browser/json-viewer.html?view=chat`：真实 Mapper / Presenter / BubbleList / ChatShell，包含论坛写入、论坛 profile 查询、非 JSON、混合 block、大结果、混合状态和旧 MCP；Composer 禁用，不调用模型或工具。

本次运行地址为 `http://127.0.0.1:45342/tests/browser/json-viewer.html`。验收页支持明暗模式和 AI 预设/纯黑/纯白，切换只作用当前页面。截图、`report.json` 与独立构建保存在本次任务的 visualization 目录 `json-viewer/` 下。

浏览器脚本：`tests/browser/json-viewer-smoke.cjs`。使用现有 Playwright 环境和已安装 Chrome，不增加项目依赖；可通过 `JSON_VIEWER_PLAYWRIGHT` 指定 Playwright 包路径，通过 `JSON_VIEWER_ORIGIN`、`JSON_VIEWER_OUTPUT` 指定服务和截图位置，`JSON_VIEWER_BROWSER` 可覆盖浏览器 channel。

## 后续日志复用

未来系统日志直接从同一 `@/components/ui/json-viewer` 入口传入日志的安全 JSON 或安全原文。标题、业务状态、日志身份、最大高度与滚动由日志宿主负责；需要已有复制入口时使用 showCopy=false，需要保护宿主阅读位置时接通用布局回调。无需复制另一套树、引入 MCP 类型或改变 PR7 前后端契约。
