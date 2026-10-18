# UI Development Guide

本文件是 Penumbra UI 开发的通用入口，适用于人类开发者、Codex、Claude 和其他 agent。
Claude 专用的 `.claude/skills/ui-dev.md` 只负责自动触发和指路，具体规范以本文件和 `docs/` 下的设计文档为准。

---

## 1. 必读文档

开始写 UI 代码前，先阅读并按任务范围确认相关规范：

- `docs/ui-guidelines.md` — 视觉语言、页面组合原则、Stable / Provisional / Exploratory 模式与 UI 抽象边界
- `docs/design-spec.md` — token、颜色、字体、间距、圆角、阴影、毛玻璃、动效、可访问性
- `docs/chat-ui-reference.md` — 聊天组件交互参考与默认实现决策

所有 UI 任务均需遵循 `docs/ui-guidelines.md` 与 `docs/design-spec.md`。如果任务涉及聊天页、消息气泡、输入框、会话列表、建议卡片或附件能力，则同时遵循 `docs/chat-ui-reference.md`。

---

## 2. 工作顺序

1. 确认任务涉及的页面、组件、状态和 token。
2. 先检查 `src/components/ui/` 是否已有 shadcn 原语可复用。
3. 业务组件放在 `src/components/<feature>/`，不要把业务逻辑塞进 `src/components/ui/`。
4. 样式优先用 Tailwind class 和 CSS 变量；只有动态计算值才使用 `style={{}}`，并说明原因。
5. 写完按本文的检查清单自查。

---

## 3. 核心规则

- 优先使用 shadcn/ui 组件，在其上组合业务 UI；缺基础原语时再用 `shadcn add`。
- 颜色使用 `docs/design-spec.md` 定义的 CSS 变量，不在组件里硬编码 hex。
- 主色只从 `--color-theme` 派生；语义色使用 `--color-success`、`--color-warning`、`--color-error`、`--color-info` 等命名 token。
- 间距使用 Tailwind 4px 网格，圆角、阴影、动效按 design-spec 档位。
- 毛玻璃优先用于导航栏、弹框、下拉菜单、Toast、悬浮工具条等浮层。内容密集区域、长文本与表单应优先保证可读性，避免多层嵌套或高强度 blur；可使用低透明度或轻玻璃 surface，但不应为了视觉效果牺牲文字对比度和信息密度。
- 移动端优先，先选择固定工作区或自然页面流，明确实际滚动容器。固定工作区的正文使用 `flex-1 min-h-0 overflow-y-auto`，自然页面流在稳定 Header 下复用 `PageScrollArea`，不要把多个模块分别压入限高滚动框。
- 原生滚动容器使用 `.scrollbar-none`，公共 ScrollArea 隐藏原生及自绘滚动条；保留滚动、键盘焦点与内容可达性。页面回顶复用公共容器，不能每页复制 window 监听。具体消费方式见 `ui-patterns.md`。
- 图标统一用 Lucide React；图标按钮必须同时有 tooltip 和 `aria-label`。
- 控件可见尺寸不等于交互目标尺寸；不要求所有移动端控件视觉高度达到 44px。主要独立触控目标优先保留 44px 的有效区域，紧凑工具栏／列表操作按 ui-patterns 的尺寸语义与间距处理，目标不得重叠；键盘焦点清晰，遵守 `prefers-reduced-motion`。
- 单个组件文件超过 300 行时优先拆分，除非拆分会明显降低可读性。

---

## 4. 页面重构

涉及从 `/Users/remix/Desktop/AionsHome-main` 项目重构页面时：

- 可以参考原项目的功能和信息布局。
- 不复制原项目样式代码。
- 样式、组件、token、动效、可访问性全部按 Penumbra 规范重写。
- 优先复用 Penumbra 已有 shadcn 原语和业务组件。

---

## 5. 检查清单

写完 UI 相关代码后，自查：

- [ ] 是否已阅读本任务相关的 `ui-guidelines` / `design-spec` / `chat-ui-reference` 条目
- [ ] 是否优先使用了 shadcn 原语
- [ ] 颜色是否全部来自 CSS 变量，没有组件内硬编码 hex
- [ ] 主色是否只依赖 `--color-theme`，语义色是否使用命名 token
- [ ] 间距、圆角、阴影、动效是否符合 design-spec 档位
- [ ] 是否避免了不必要的 `style={{}}`
- [ ] 组件是否拆分到合理粒度
- [ ] 是否选对滚动模型，真实高度链、主要滚动容器和局部控件例外明确，无不必要的同向嵌套
- [ ] 隐藏滚动条后滚轮、触摸、键盘与程序滚动是否可用，Memory 分页／Chat 输入区是否稳定
- [ ] 回顶是否绑定实际容器、达到足够阈值才显示、支持低动效并清理监听，位置恢复／Toast／Dialog 避让是否正常
- [ ] 内容密集区域是否保持可读，未滥用毛玻璃
- [ ] 图标按钮是否有 tooltip 和 `aria-label`
- [ ] 触屏目标、键盘焦点、ARIA 状态、低动效偏好是否处理
