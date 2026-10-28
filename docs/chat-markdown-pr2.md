# Chat Markdown PR2：展示与视觉优化

日期：2026-10-28。PR1 基线为 `535c0c8`。本轮未 commit、push、deploy；不修改消息原文、历史投影、发送链路或后端。

## 打开验收页面

```sh
npm run dev
```

地址：[http://localhost:3000/dev/chat-markdown](http://localhost:3000/dev/chat-markdown)。开发页现有 43 个合成案例；新增「PR2 展示」分类，含独立代码、同段混合代码、分割线、多个纯定义、危险定义链接、正文与定义、无可见内容兜底。

可继续切换 320 / 390 / 768px 容器、编辑原文、模拟流式与暂停 / 重置。预览宽度和 Chromium 窄窗口测试都不代表移动真机验收。

## 展示变化

### 分割线恢复，但不再套普通气泡

- `---`、`***`、`----`、含空格的合法 thematic break 都交由 Markdown 解析，显示一条雾蓝淡线。
- 分段器与 Renderer 同步将 thematicBreak 视作可见输出，避免上游把它过滤掉。
- 只有分割线的段使用无背景、无普通气泡 padding / min-height 的窄分隔区域。单条规则区域约 19px 高，线本身 1px；没有空卡片。
- Setext 标题仍是标题，普通代码中的横线仍是代码；Markdown fence 的既有预览模式按 Markdown 显示。
- 普通双换行分泡、单换行不分泡与结构内部空行保护保持。合法空代码、图片、任务列表不因本轮变化被删除。

### 整条消息只有 reference definition 时提供链接兜底

`splitAssistantBubbles` 先按正常语义检查可见段。只有整个公开正文都由 definition 组成、且没有其他可见段时，才保留原文为一个兜底展示段。多条定义放在同一个紧凑链接区域。

`MarkdownDefinitionLinks` 显示定义名称和 URL，href 复用 **react-markdown 的 `defaultUrlTransform`**，与现有普通 Markdown anchor 使用相同协议策略。javascript / data / file 不生成链接，只显示「链接不可用」，不把被拒绝的原 URL 回显出来。http(s)、mailto、相对路径等依照原策略处理，点击仍使用当前标签页。

若同时有正常正文或分割线等可见内容，definition 不额外重复显示。跨泡 reference link / image 仍未共享定义上下文（MD-03）。这只是整条无正文定义消息的展示兜底。

原 `message.content`、消息复制参数、持久化与 HTTP / SSE 公开投影都不修改；链接兜底不将可视链接列表拼回原文。控制标记仍先过滤，兜底只接收过滤后的内容。

### 其他空内容外壳

完成态 Assistant 的公开正文没有可见段，且无 Thinking、DRIFT、HEART、附件、工具结果、工具等待、错误或生成状态时，显示简短「暂无可显示内容」，避免仅剩头像和时间。

提示不创建正文 BubbleSegment，并标为 `data-chat-non-body`，不会进入选区插入正文。已有整消息复制仍使用原文。独立内容与状态组件不被隐藏，User 行为不变。

### 代码块减轻嵌套卡片感

- 独立 code 节点作为一个特殊 Assistant 气泡：BubbleSegment 不再提供普通气泡外壳，代码块自身承担一层雾蓝背景、细边框与圆角。
- 嵌在同段正文、列表中的代码保持原 Markdown 结构，只用轻工具栏与细左边线；引用内代码不重复加左边线。
- Markdown 预览仍只预览一次，内部代码使用轻量嵌入样式；每个代码块保留自己的语言和复制按钮，但不叠加深蓝标题栏与实色卡片。
- 去掉大面积 `bg-ai` 与阴影。代码正文采用随主题变化的中性色与雾蓝混合，高亮通过颜色 / 字重区分；保留等宽字体、源码空行、`white-space: pre`、横向滚动与复制内容。

### 仅优化 Markdown 局部滚动条

`markdown-scroll` 只用于 Markdown 的代码 pre 与表格滚动区域：thin、圆润、低对比度雾蓝 thumb，hover 增强。保留原生滚动、滚轮和触控能力，不改全站滚动条、Thinking 或系统能力的滚动规则。

实测 390px 预览中：长代码 `scrollWidth/clientWidth/scrollLeft = 5741/302/5439`，宽表格为 `1112/270/842`；两者 `scrollbar-width: thin`，均可滚到最右。系统使用 overlay scrollbar 时，常驻可见性仍由系统决定。

## 文件边界

业务展示文件：

- `src/components/chat/markdown-boundaries.ts`：hr 可见语义与纯定义判断。
- `src/components/chat/bubble-chunks.ts`：只对全消息 definition-only 情形增加兜底分段；保留原消息内容。
- `src/components/chat/markdown-presentation.ts`：按现有 parser 区分独立 code / rule / definitions / 混合段；安全定义 URL 取值。
- `src/components/chat/BubbleSegment.tsx`：特殊段表面与纯定义展示。
- `src/components/chat/Bubble.tsx`：没有有效内容时的简短提示，保留原能力和状态分支。
- `src/components/chat/MarkdownRenderer.tsx`：恢复 hr、共用轻工具栏、定义链接展示及局部 scrollbar class。
- `src/components/chat/markdown.css`：仅 Chat Markdown、代码、分隔线与定义展示样式；未修改全局 CSS。

测试与验收：

- `src/components/dev/chat-markdown-cases.ts`：7 个 PR2 案例及已变更的 hr / 定义期望；`ChatMarkdownDevPage.tsx` 将计数文案改为视觉分段，明确包括分割线。
- `src/components/chat/Bubble.markdown-presentation.test.tsx`：30 项新展示 / 安全 / 独立内容边界测试。
- `Bubble.markdown.test.tsx`、`Bubble.chunks.test.tsx`：把已被本轮产品规则替代的「隐藏 hr」断言改为新行为；结构、复制、SSE / HTTP 和反例仍覆盖。
- `tests/browser/chat-markdown-smoke.cjs`：43 个案例、真实滚动、分隔线高度、特殊表面、原文复制、安全 URL 与点击等。
- 本记录与 5 张合成内容局部截图。

PR1 记录保留为历史验收记录，其中「隐藏 hr」与「definition-only 零气泡」的约定已由 PR2 替代。没有引入新依赖、AST 渲染系统或消息 DTO。展示分类复用现有 Markdown parser，没有新增增量缓存或 worker。

## 验证

- 针对性测试：5 文件 / 133 项通过。
- 全量 Vitest：180 文件 / 2446 项通过。
- 类型检查与生产构建通过，仍有既有 Vite 大 chunk 提示。
- 开发页 smoke：320 / 390 / 1280px 窗口，43 案例通过；检查 320 / 390 / 768px 预览容器中的真实 table scrollLeft / clientWidth / scrollWidth、横向滚轮、代码 / 消息复制、编辑恢复、流式暂停 / 重置 / 最终一致性；聊天 API 请求数为 0。
- javascript / data / file 定义 URL 不可点击，https 定义链接可点击，消息复制仍为定义原文；正常正文旁不重复 URL。
- 独立代码不再有普通气泡外层，嵌入代码保留正确容器；分割线段无 padded surface，Setext / fence 语义不变。
- Thinking / DRIFT smoke：320 / 390 / 1280px 通过；PR7 交互 smoke：1280 / 390px 通过。
- 普通气泡 / 快捷键旧 smoke：320 / 390px 通过；桌面在 Shift+Enter 菜单选项键盘导航断言处失败，单独复跑仍在同处失败，与审计中已有记录相同类型。另以临时合成脚本改为鼠标选择档位，桌面的三档实际按键发送 / 换行、IME / 修饰键、原文 / 复制、SSE / HTTP 对账全部通过。未修改 Sender、Settings 或旧脚本，不宣称旧桌面 smoke 已通过，也未定位该菜单键盘导航的根因。
- 页面 smoke 曾有一次被开发服务导航 / 重载打断，构建结束后在隔离开发服务单独复跑通过；没有将中断计为通过。明暗主题局部截图已核对，无全站截图；正式截图只有合成内容。

MD-06 仍保留：Renderer 的自定义组件类型仍随更新创建，流式代码滚动可能归零。本轮只合并重复工具栏 JSX 和修改表面，不声称修复 DOM 重挂载。MD-03 的跨泡定义共享、H4–H6 等其他 MD-07 排版也保持独立任务。

## 效果图

截图来自真实 `/dev/chat-markdown`，预览容器宽 390px。它们是可继续微调的本轮实现，不是额外的模拟渲染器。

独立代码：

![独立代码](screenshots/chat-markdown-pr2/01-code.png)

Markdown 预览内的代码：

![预览内代码](screenshots/chat-markdown-pr2/02-preview.png)

正文之间的分割线：

![轻量分割线](screenshots/chat-markdown-pr2/03-rule.png)

纯定义消息：

![定义链接兜底](screenshots/chat-markdown-pr2/04-links.png)

同段正文与代码：

![嵌入代码](screenshots/chat-markdown-pr2/05-mixed.png)

人工建议优先检查：代码表面和文字对比是否舒适、分隔线是否足够清晰、嵌入代码的左边线是否合适、链接兜底是否简洁，以及滚动条在实际系统设置下的可见程度。确认前不提交、不部署。
