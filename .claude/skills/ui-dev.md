---
description: "UI 开发规范 — 优先 shadcn 组件、Tailwind 样式、遵循 design-spec"
globs:
  - "src/components/**/*.tsx"
  - "src/components/**/*.ts"
  - "src/**/*.css"
  - "src/App.tsx"
---

# UI Development Skill

## Instructions

### 1. 先读规范，再写代码

开始写 UI 之前，必须先阅读以下文档：

- `docs/design-spec.md` — 颜色、字体、间距、圆角、阴影、毛玻璃等全部视觉规范
- `docs/chat-ui-reference.md` — 聊天相关组件的交互参考

读完后，确认你理解了当前任务涉及的 token 和规范条目，再动手。

### 2. 优先用 shadcn 组件

- 先检查 `src/components/ui/` 里有没有现成组件可以用
- 有的话直接 import，在现有组件上扩展（加 variant、加 className 覆盖）
- 没有的话用 `shadcn add` 添加官方组件，不要自己从头写基础 UI 原语（按钮、弹窗、下拉等）
- 自定义业务组件（如 Calendar、ChatBubble）可以自己写，但底层应尽量用 shadcn 原语组合

### 3. 样式严格跟规范走

- 颜色只用 design-spec 里定义的 CSS 变量（`--color-primary`、`--color-surface` 等），不要写死 hex 值
- 间距用 Tailwind 的 4px 网格（`p-4`、`gap-2`、`mt-3`），不要自己算 px
- 圆角按规范：小元素 `rounded-sm`（8px）、卡片 `rounded-md`（12px）、大容器 `rounded-lg`（16px）
- 阴影用 `--shadow-sm` / `--shadow-md` / `--shadow-lg`，不要写自定义 box-shadow
- 毛玻璃：浮层统一用毛玻璃，不用纯色背景
  - 卡片/面板：`.glass-card`（`bg-white/70 backdrop-blur-md`）
  - 导航栏：`.glass-nav`（`bg-white/60 backdrop-blur-xl`）
  - 手写时：`bg-white/70 backdrop-blur-md border border-white/15`，深色换 `bg-black/40 border-white/10`
- 过渡动画统一 `transition-all duration-200`，不要用不同时间

### 4. Tailwind 优先，禁止堆 style

- **必须**用 Tailwind class 写样式，不要用 `style={{}}` 内联样式
- 唯一例外：动态计算的值（如根据数据变化的颜色、位置），可以用 `style`，但要加注释说明为什么不能用 class
- className 太长时，用 `cn()` 工具函数（来自 `@/lib/utils`）合并，不要手动拼字符串
- 条件样式用 `cn("base-class", condition && "conditional-class")` 模式

### 5. 组件化拆分原则

- 一个文件只做一件事，超过 300 行考虑拆分
- 可复用的 UI 片段抽成独立组件，放在 `src/components/` 对应子目录下
- 组件目录结构：
  - `src/components/ui/` — shadcn 基础原语（不改业务逻辑）
  - `src/components/<feature>/` — 业务组件（如 `calendar/`、`chat/`）
- 每个组件文件导出一个默认组件 + 必要的子组件和类型
- Props 接口用 `interface` 定义在组件上方，不要内联

### 6. 移动端优先 & 滚动策略

- **移动端优先**：先写移动端布局，再用 `sm:`、`md:`、`lg:` 断点适配大屏
- **禁止页面级滚动**：页面整体不能出现 `overflow-y: auto`，滚动必须在组件内部解决
- **优先滚动正文区**：典型布局是「固定顶栏 + 固定底栏 + 中间正文滚动」，正文区用 `overflow-y-auto` 且撑满剩余高度（`flex-1 min-h-0`）
- 移动端内容区 padding 保持 `p-4`（16px），桌面端可放宽到 `sm:p-6 lg:p-8`
- 内容区最大宽度 `max-w-[600px]`（聊天页 `max-w-[720px]`），桌面端居中

### 7. 主题色可配置

- 默认主题色为 `#F4845F`，通过 CSS 变量 `--color-theme` 驱动
- 所有主色变体（primary、primary-hover、primary-active、primary-subtle）从 `--color-theme` 自动派生，**不要写死**
- 用户可在设置中切换主题色，切换时只需修改 `--color-theme` 这一个变量
- 写组件时不要硬编码任何主色相关的 hex 值，始终用 `var(--color-primary)` 等变量
- 深色模式下主题色自动提亮，不需要单独处理

### 8. 图标规范

- 图标统一用 Lucide React，不要用 emoji 代替 UI 图标
- 尺寸按规范：按钮内 `size-4`、导航 `size-5`、标题 `size-6`
- 图标按钮必须有 tooltip

### 9. 检查清单

写完 UI 代码后，自查：

- [ ] 颜色是否全部用 CSS 变量，没有硬编码 hex
- [ ] 是否有 `style={{}}` 能改成 Tailwind class 的
- [ ] 圆角、阴影、间距是否符合 design-spec 档位
- [ ] 组件是否拆分到合理粒度
- [ ] 是否优先用了 shadcn 组件而非手写
- [ ] 布局是否移动端优先，页面无全局滚动，正文区可滚动
- [ ] 浮层（导航、卡片、弹框）是否用了毛玻璃样式
