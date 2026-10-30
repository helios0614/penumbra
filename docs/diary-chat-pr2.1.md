# Diary PR2.1：阅读体验与日历入口

2026-10-30（Asia/Shanghai）。本次属于 Phase 3 / Diary PR2.1 的局部展示与入口调整。开始时两个仓库均干净：Penumbra `main` / `2563dcbb9f30a971687bc84b956791f1e064ebab`，AionHome `refactor-code-main` / `7105f948d2965ead1f8023a691100112e0b4f5c3`。

本轮共享气泡视觉补丁仅修改 `src/components/diary/diary-chat.css`、浏览器验收脚本和本文。删除局部 AI 颜色、AI 气泡底层、用户气泡颜色/底层及其深色覆盖，所有气泡参数直接继承 Main Chat 使用的共享样式。阅读遮罩与模糊保留，DiaryChatView 和共享组件未改动。开工时原 PR2.1 的 7 个文件已暂存；本轮保留暂存区，只追加工作区修改。下文记录 PR2.1 的最终展示状态。

已重新核对 AGENTS、runtime model、master plan 和当前 PR2 实现。没有改变 Diary DTO、消息顺序、WS 事件/刷新、消息持久化、Prompt、命令副作用或共享 Chat 业务逻辑；不接入发送、SSE、投喂或消息操作。运行时变化仅为局部阅读样式，以及 Archived 也可通过日历入口打开已有 Chat。

## 修改清单

所有改动都在 Penumbra，AionHome 无修改。

| 文件 | 职责 |
| --- | --- |
| `src/components/diary/DiaryCalendar.tsx` | 日期信息行共用 MessagesSquare 图标文字入口；将 metadata 移出归档正文按钮，两个入口为兄弟元素 |
| `src/components/diary/useDiaryChatNavigation.ts` | 原 Entry 导航允许 pending 和 archived，继续使用真实 entryId |
| `src/components/diary/DiaryChatView.tsx` | 给现有 ChatShell 添加 Diary 专用阅读容器，无共享组件改动 |
| `src/components/diary/diary-chat.css` | 只保留 Diary Chat 暖白/暖深色透明阅读底层与模糊，气泡完全继承共享 Chat 样式 |
| `src/components/diary/DiaryChat.test.tsx` | 独立点击、无嵌套、真实 ID、两种状态的返回滚动/焦点回归 |
| `tests/browser/diary-chat-pr2-smoke.cjs` | 两种状态的独立入口、布局边界、共享气泡计算样式对照、十组截图 |
| `docs/diary-chat-pr2.1.md` | 本交付记录与截图索引 |

## 实现说明

原归档预览是一整张正文阅读按钮，把 Chat 入口直接加入其中会产生嵌套按钮。现在日期、星期、状态位于共用信息行左侧，对话图标与文字位于右侧；Pending 和 Archived 使用相同组件与位置。窄屏允许左侧 metadata 换行，右侧保持轻量文字入口。入口视觉无操作卡片、无明显填充背景，保留 44px 点击高度与键盘焦点样式。

Archived 下方的标题/正文预览仍是原正式阅读按钮，原阅读、编辑入口和返回焦点不变。对话入口只打开同一个 DiaryChatView，不创建或修改 Entry。

已核对当前 AionHome `routes/diary.py`：`GET /api/diary/entries/{entry_id}` 只按 ID 查询，无状态限制；`GET /api/diary/entries/{entry_id}/messages` 也无状态限制。因此现有 API 支持 archived Entry，无需后端修改。浏览器 fixture 以 `status=done` 和该 Entry 的消息验证了前端完整路径。

阅读层保留父级原壁纸和主题：浅色为 72% 暖白透明背景与 6px 模糊，深色为 78% 暖深色透明背景并沿用同一模糊。气泡背景透明度、AI 原始主题蓝色、用户文字颜色、边框、阴影、圆角、内边距均使用 Main Chat 的现有共享规则。Diary 不再定义 `--color-ai`、`--chat-ai-surface` 或 `[data-user-bubble]` 覆盖。消息分段、Markdown、Thinking、DRIFT 和滚动实现保持原样。

## 验证结果

- 先更新入口/导航回归再实现：旧实现有 2 项失败（缺少共用入口、archived 导航不开放），已有展示基线通过。
- **21 个测试文件、391 项通过**：Diary Domain/Application/UI、原归档阅读与编辑、共享 Bubble/Markdown/滚动回归。此次在既有导航测试中增加 archived 用例，其余只更新入口断言。
- **`npm run build` 通过**：TypeScript 与 Vite 生产构建。
- **浏览器 10 组通过**：Classic/Editorial × 320/390/1280px 浅色六组，加两种桌面的 390/1280px 深色四组；统一 640px 高度。
- 每组都验证 Pending 和 Archived 的真实 ID 导航，Archived 正文/编辑入口保留、Chat 不替代正文阅读、兄弟按钮无嵌套/几何重叠、44px 点击高度、返回入口焦点与日历选择/滚动、前进后退及刷新恢复。
- 复用 64 条长短混合消息，继续验证原 ID 顺序、长文/代码/Thinking/DRIFT、有效滚动高度、无横向溢出、刷新阅读锚点及既有 WS 失效/重连/删除恢复。十组零 API 写请求、无页面异常或重复 key。
- 每组将实际共享 Bubble 的 DOM 副本放在 Diary 阅读容器之外、保留当前全局主题，分别对照用户/AI/代码气泡的 26 项计算样式：背景、文字颜色、四边边框颜色/宽度/类型、四角圆角、阴影、四向内边距、气泡背景模糊、字体大小与行高，逐项一致。此次按要求恢复共享 Chat 的原始颜色与透明度，不再沿用先前加深颜色时的独立对比度门槛。
- 进入 Chat 前后父级背景样式一致。新增样式均以 `.diary-chat-reading` 为作用域，Main Chat、Calendar 和正式 Reader 不使用此容器。

测试与构建在临时源码副本运行，回写时逐文件比较基线并确认与验收源码一致。不复制 `.env`、个人配置或真实数据；所有 API/WS 使用合成对象，没有请求真实模型、日记、原文或生产服务。

## 截图

全部 30 张截图保存在[截图目录](/Users/remix/.codex/visualizations/2026/10/30/01a18b74-c2df-7fa0-a995-61d49f8fa0cc/diary-pr21-bubble-patch)。每组有 `-pending-calendar.png`、`-archived-calendar.png`、`-chat.png` 三张；日历截图滚动到完整预览区，方便查看两个独立入口。

| 桌面 | 宽度 | 文件名前缀 |
| --- | --- | --- |
| Classic | 320 / 390 / 1280 | `classic-320` / `classic-390` / `classic-1280` |
| Editorial | 320 / 390 / 1280 | `editorial-320` / `editorial-390` / `editorial-1280` |
| Classic / Editorial 深色 | 390 / 1280 | `classic-390-dark` / `classic-1280-dark` / `editorial-390-dark` / `editorial-1280-dark` |

主要预览：[Classic 390 阅读](/Users/remix/.codex/visualizations/2026/10/30/01a18b74-c2df-7fa0-a995-61d49f8fa0cc/diary-pr21-bubble-patch/classic-390-chat.png)、[Editorial 390 阅读](/Users/remix/.codex/visualizations/2026/10/30/01a18b74-c2df-7fa0-a995-61d49f8fa0cc/diary-pr21-bubble-patch/editorial-390-chat.png)、[320 归档双入口](/Users/remix/.codex/visualizations/2026/10/30/01a18b74-c2df-7fa0-a995-61d49f8fa0cc/diary-pr21-bubble-patch/classic-320-archived-calendar.png)、[1280 阅读](/Users/remix/.codex/visualizations/2026/10/30/01a18b74-c2df-7fa0-a995-61d49f8fa0cc/diary-pr21-bubble-patch/classic-1280-chat.png)、[深色阅读](/Users/remix/.codex/visualizations/2026/10/30/01a18b74-c2df-7fa0-a995-61d49f8fa0cc/diary-pr21-bubble-patch/classic-390-dark-chat.png)。

## 剩余限制

- 浏览器为桌面 Chromium 的合成数据与移动尺寸模拟，未做真实手机/Safari 或线上验收；没有遍历所有用户自定义壁纸与配色。
- PR2 原有只读边界、WS 不覆盖全部后台消息、无分页历史以及整页刷新不持久化日历滚动/焦点的限制仍在，本次没有修改这些机制。
- 没有 commit、push、deploy 或暂存，等待人工验收。
