# Penumbra UI Design Specification

基于 shadcn/ui token 体系扩展，所有设计决策通过 CSS 变量驱动，支持浅色/深色主题切换。

---

## 1. 颜色系统

所有颜色通过 `@theme` 块中的 CSS 变量定义，Tailwind 通过 `var(--color-xxx)` 引用。不要使用 `@theme inline`，否则语义颜色会被编译成固定浅色值，导致 `.dark` 与运行时主题色无法覆盖。

### 1.1 浅色主题

| Token | 用途 | 值 |
|---|---|---|
| `--color-background` | 页面底色 | `#fafaf8` |
| `--color-foreground` | 正文文字 | `#1a1a1a` |
| `--color-surface` | 卡片/面板底色 | `#ffffff` |
| `--color-surface-secondary` | 次级表面（输入框底、侧栏） | `#f5f5f3` |
| `--color-border` | 边框/分割线 | `#e8e8e4` |
| `--color-border-strong` | 强调边框（focus ring） | `#c8c8c4` |

#### 主色 Primary — 统一主题色变量

所有主色变体从单一 `--color-theme` 自动派生，换主题只需改这一个值。
派生优先使用 CSS `color-mix()`，不要在组件里手写主色 hover/active 的 hex 值。

```css
:root {
  --color-theme: #F4845F;  /* ← 唯一需要改的变量 */
  --color-primary: var(--color-theme);
  --color-primary-hover: color-mix(in srgb, var(--color-theme), black 12%);
  --color-primary-active: color-mix(in srgb, var(--color-theme), black 22%);
  --color-primary-foreground: #ffffff; /* 浅色默认，深色或自定义主题需按对比度切换 */
  --color-primary-ink: var(--theme-primary-ink-light); /* 浅底/玻璃上的主题色文字 */
  --color-primary-subtle: color-mix(in srgb, var(--color-theme), white 92%);
}
```

| Token | 来源 | 用途 |
|---|---|---|
| `--color-theme` | 手动设定 | 品牌主色，唯一入口 |
| `--color-primary` | = theme | 主按钮背景、链接 |
| `--color-primary-hover` | theme + 12% black | hover 态 |
| `--color-primary-active` | theme + 22% black | active 态 |
| `--color-primary-foreground` | 浅色默认白，必要时切换 | 主色上的文字 |
| `--color-primary-ink` | 按对比度动态派生 | 浅色底、半透明底和 `primary/10` 上的主题色小字 |
| `--color-primary-subtle` | theme + 92% white | tag、badge 浅底 |

`primary` 与 `primary-ink` 不可混用：原始主题色保留给色块、图标、边框和实心背景；主题色承担文字语义时使用 `primary-ink`。运行时会分别为浅色和深色表面派生可读版本，目标对比度为 5.5:1，为半透明玻璃和壁纸颜色波动预留余量。

#### 辅色 Secondary

柔和灰绿，用于 AI 角色气泡、次要操作。

| Token | 值 | 用途 |
|---|---|---|
| `--color-secondary` | `#6b8f71` | AI 元素、次要按钮 |
| `--color-secondary-hover` | `#5d7e63` | hover 态 |
| `--color-secondary-foreground` | `#ffffff` | 辅色上的文字 |
| `--color-secondary-subtle` | `#eef5ef` | 辅色浅底 |

#### 中性色 Neutral

| Token | 值 | 用途 |
|---|---|---|
| `--color-muted` | `#f5f5f3` | muted 背景，不作为文字色 |
| `--color-muted-foreground` | `#6f6963` | 说明文字、时间戳、小组件次要信息 |
| `--color-muted-strong` | `#57524e` | 控件标签、API 信息、需要更强的次要文字 |

中性文字层级固定为 `foreground → muted-strong → muted-foreground`。10–14px 的正常可读文字不得继续使用更浅的装饰灰，也不要通过“浅灰文字 + opacity”叠加制造层级；`opacity` 仅用于禁用、越界日期等明确的非活跃状态。

#### 语义色 Semantic

语义色必须使用命名 token，组件中不要直接写 hex。Tailwind class 命名与 token 对齐，如 `text-success`、`bg-error-subtle`、`border-warning`。

| Token | 浅色值 | 用途 |
|---|---|---|
| `--color-success` | `#22c55e` | 操作成功、在线状态 |
| `--color-success-foreground` | `#ffffff` | 成功色上的文字/图标 |
| `--color-success-subtle` | `#f0fdf4` | 成功提示条浅底 |
| `--color-success-subtle-foreground` | `#166534` | 成功浅底上的文字 |
| `--color-warning` | `#f59e0b` | 闹铃、即将过期 |
| `--color-warning-foreground` | `#ffffff` | 警告色上的文字/图标 |
| `--color-warning-subtle` | `#fffbeb` | 警告提示条浅底 |
| `--color-warning-subtle-foreground` | `#92400e` | 警告浅底上的文字 |
| `--color-error` | `#ef4444` | 删除、致命错误 |
| `--color-error-foreground` | `#ffffff` | 错误色上的文字/图标 |
| `--color-error-subtle` | `#fef2f2` | 错误提示条浅底 |
| `--color-error-subtle-foreground` | `#991b1b` | 错误浅底上的文字 |
| `--color-info` | `#3b82f6` | 提示、帮助 |
| `--color-info-foreground` | `#ffffff` | 信息色上的文字/图标 |
| `--color-info-subtle` | `#eff6ff` | 信息提示条浅底 |
| `--color-info-subtle-foreground` | `#1e40af` | 信息浅底上的文字 |

### 1.2 深色主题

深色主题通过在 `<html>` 上加 `dark` class 激活。应用支持 `light`、`dark`、`system` 三种外观模式，默认跟随系统；模式会在首屏绘制前解析，避免切换时出现浅色闪烁。主色仍以 `--color-theme` 为唯一入口，除非可访问性测试证明对比度不足，否则不要单独覆盖 `--color-primary-hover` 或 `--color-primary-active`。

| Token | 值 |
|---|---|
| `--color-background` | `#111110` |
| `--color-foreground` | `#e8e8e4` |
| `--color-surface` | `#1a1a18` |
| `--color-surface-secondary` | `#242422` |
| `--color-border` | `#2e2e2c` |
| `--color-border-strong` | `#484844` |
| `--color-theme` | `#f79e7f` |
| `--color-primary-foreground` | `#111110` |
| `--color-secondary` | `#7fa685` |
| `--color-secondary-foreground` | `#111110` |
| `--color-secondary-subtle` | 当前辅色的 14% 透明混合 |
| `--color-muted` | `#242422` |
| `--color-muted-foreground` | `#aaa49c` |
| `--color-muted-strong` | `#c0bab2` |
| `--color-primary-ink` | 按暗色表面对比度动态派生 |

语义色的「浅」变体在深色下替换为对应低透明度底色，并保留可读前景色：

| Token | 深色值 |
|---|---|
| `--color-success-subtle` | `rgba(34, 197, 94, 0.12)` |
| `--color-success-subtle-foreground` | `#86efac` |
| `--color-warning-subtle` | `rgba(245, 158, 11, 0.14)` |
| `--color-warning-subtle-foreground` | `#fcd34d` |
| `--color-error-subtle` | `rgba(239, 68, 68, 0.14)` |
| `--color-error-subtle-foreground` | `#fca5a5` |
| `--color-info-subtle` | `rgba(59, 130, 246, 0.14)` |
| `--color-info-subtle-foreground` | `#93c5fd` |

---

## 2. 字体规范

### 2.1 字体栈

```css
--font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
  "Helvetica Neue", "Noto Sans SC", sans-serif;
--font-mono: "SF Mono", "Fira Code", "Cascadia Code", monospace;
```

### 2.2 字号层级

| Token | PC 端 | 移动端 | 用途 |
|---|---|---|---|
| `--text-xs` | 12px | 12px | 辅助说明、时间戳 |
| `--text-sm` | 14px | 14px | 次要正文、表单标签 |
| `--text-base` | 15px | 16px | 正文（移动端略大保证可读性） |
| `--text-lg` | 17px | 18px | 小标题、卡片标题 |
| `--text-xl` | 20px | 20px | 页面标题 |
| `--text-2xl` | 24px | 24px | 大标题 |
| `--text-3xl` | 30px | 28px | Hero 标题（移动端略缩） |

### 2.3 行高

| 场景 | 行高 |
|---|---|
| 正文 | 1.6 |
| 标题 | 1.3 |
| 按钮/单行 | 1.2 |
| 代码块 | 1.5 |

### 2.4 字重

| Token | 值 | 用途 |
|---|---|---|
| `--font-normal` | 400 | 正文 |
| `--font-medium` | 500 | 次要强调（标签、导航） |
| `--font-semibold` | 600 | 标题、按钮 |
| `--font-bold` | 700 | 数字突出、极少量使用 |

---

## 3. 间距体系

基于 Tailwind 默认 4px 网格（`1 = 0.25rem = 4px`），不自定义额外档位。

### 3.1 组件内部间距

| 元素 | padding | Tailwind |
|---|---|---|
| 按钮（md） | `8px 16px` | `py-2 px-4` |
| 按钮（sm） | `4px 12px` | `py-1 px-3` |
| 输入框 | `10px 12px` | `py-2.5 px-3` |
| 卡片 | `16px` | `p-4` |
| 卡片（紧凑） | `12px` | `p-3` |
| 页面内容区 | `16px` | `p-4` |
| 弹窗/Modal | `24px` | `p-6` |

### 3.2 组件之间间距

| 场景 | gap | Tailwind |
|---|---|---|
| 同级元素（按钮组、标签组） | `8px` | `gap-2` |
| 表单字段之间 | `16px` | `gap-4` |
| 卡片列表 | `12px` | `gap-3` |
| 页面区块 | `32px` | `gap-8` |
| 聊天消息之间 | `4px` | `gap-1` |

### 3.3 响应式

移动端（`<640px`）页面内容区 padding 保持 `16px`，桌面端可放宽到 `24px` 或 `32px`，通过 `sm:p-6 lg:p-8` 控制。

### 3.4 布局与滚动策略

**移动端优先**：先写移动端布局，再用 `sm:`、`md:`、`lg:` 断点适配大屏。

**禁止页面级滚动**：页面整体不能出现 `overflow-y: auto`，滚动必须在组件内部解决。

**优先滚动正文区**：典型布局是「固定顶栏 + 固定底栏 + 中间正文滚动」：

```
┌─────────────────────┐
│   顶栏（固定）        │
├─────────────────────┤
│                     │
│   正文区（可滚动）    │  ← overflow-y-auto, flex-1, min-h-0
│                     │
├─────────────────────┤
│   底栏（固定）        │
└─────────────────────┘
```

关键实现：
- 页面容器 `h-dvh flex flex-col`（移动端用 `dvh` 避免地址栏高度跳动）
- 顶栏/底栏 `shrink-0`
- 正文区 `flex-1 min-h-0 overflow-y-auto`（`min-h-0` 是 flex 子元素溢出滚动的关键）

---

## 4. 圆角与阴影

### 4.1 圆角

圆角越大越温和，但不能全部拉满，有大有小才有层次。

| Token | 范围 | 推荐值 | Tailwind | 适用 |
|---|---|---|---|---|
| `--radius-sm` | 8-10px | `8px` | `rounded-sm` | 按钮、标签、输入框 |
| `--radius-md` | 12-14px | `12px` | `rounded-md` | 卡片、下拉菜单、列表项 |
| `--radius-lg` | 16-20px | `16px` | `rounded-lg` | 弹窗、大容器、图片 |
| `--radius-full` | — | `9999px` | `rounded-full` | 头像、Badge、胶囊按钮 |

层次原则：
- 小元素（按钮、标签、输入框）走 `--radius-sm`（8px），紧凑感
- 中等元素（卡片、面板）走 `--radius-md`（12px），舒适感
- 大元素（弹窗、全屏容器）走 `--radius-lg`（16px），留白感
- 同一容器内圆角要统一，不要卡片 12px、里面的按钮 4px

shadcn/ui 的 `--radius` 默认值设为 `12px`（对应 `--radius-md`），组件默认走这个值。

### 4.2 晨雾表面系统（Mist Surface）

全局表面只使用三个层级。组件中不要重新手写 `bg-white/70`、`backdrop-blur-md` 等组合，避免透明度和模糊强度逐渐漂移。

| Class | 用途 | 典型组件 |
|---|---|---|
| `.mist-glass` | 轻量、悬浮的普通玻璃 | 小组件、Dock、图标、设置页轻量面板、浮动按钮 |
| `.mist-glass-strong` | 需要更强结构边界的玻璃 | App 外壳、Dialog、Sheet、Popover |
| `.mist-solid` | 内容密集、需要稳定对比度的表面 | 聊天正文、日历、输入框、表单和长文本 |

三层表面均由 `src/index.css` 中的 CSS 变量控制，并在 `.dark` 下统一覆盖。圆角和 padding 仍由组件自己决定，材质类只负责背景、边框、模糊与阴影。

使用原则：

- 浮在壁纸上的轻量信息优先 `.mist-glass`。
- 弹窗和完整功能容器优先 `.mist-glass-strong`。
- 阅读、输入、长列表和高密度信息优先 `.mist-solid`。
- 语义气泡、成功/错误提示可以保留语义色，但不再创建第四套通用玻璃材质。
- `desktop-v2` 编辑感实验桌面是独立视觉方案，不强制使用晨雾表面系统。

#### 玻璃与壁纸上的文字可读性

玻璃透明度属于材质设计，不应仅因为灰字难读就整体加深设置页或桌面卡片。可读性按以下顺序处理：

1. 正文与标题使用 `text-foreground`。
2. 控件标签和重要次级信息使用 `text-muted-strong`。
3. 普通说明文字使用 `text-muted-foreground`。
4. 主题色小字、浅色选中态和 `bg-primary/10` 上的文字使用 `text-primary-ink`。
5. 只有直接压在壁纸上的少量文字才允许使用局部阴影或低存在感背板，并统一使用 `.desktop-on-wallpaper`，不要写死 `text-black`、`text-white` 或 `text-foreground`。

桌面 App 名称的背板必须克制，保持低透明度与小范围模糊，不能形成明显的独立按钮或大面积实色胶囊。设置页继续保持现有 `.mist-glass` 透明度；如果文字不清晰，优先调整文字 token，而不是修改整块面板材质。

壁纸文字通过 `data-wallpaper-text` 独立于界面明暗模式控制：`auto` 随界面主题、`dark` 强制黑字、`light` 强制白字。该选择同时作用于桌面 App 名称、签名、装饰线和分页指示，并保存在 `penumbra-wallpaper-settings` 中。

### 4.3 阴影

温和风格的核心：扩散大、透明度低、边缘模糊，不用硬阴影。

| Token | 值 | 适用 |
|---|---|---|
| `--shadow-sm` | `0 2px 8px rgba(74,59,50,0.05)` | 卡片静态、列表项 |
| `--shadow-md` | `0 4px 20px rgba(74,59,50,0.08)` | hover 浮起、下拉菜单 |
| `--shadow-lg` | `0 8px 30px rgba(74,59,50,0.10)` | Modal、弹窗 |
| `--shadow-glow` | `0 0 0 3px color-mix(in srgb, var(--color-theme), transparent 75%)` | Primary focus ring |
| `--shadow-glass` | `0 4px 20px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.1)` | 毛玻璃卡片、导航栏 |

`--shadow-glass` 是毛玻璃专用阴影：外阴影浮起 + 内阴影模拟光泽，让玻璃质感更明显。

深色主题下阴影统一加深至 `rgba(0,0,0,0.35)` 基底，色调不变。

### 4.4 温和风格补充

几个细节让整体更柔和：

**过渡动画** — 按属性选择过渡，不默认使用 `transition-all`。颜色变化用 `transition-colors duration-150`，位移/缩放用 `transition-transform duration-200`，展开/折叠用 `duration-300`。

**边框** — 用半透明边框代替实色，若有若无：
- 浅色主题：`1px solid rgba(0, 0, 0, 0.06)`
- 深色主题：`1px solid rgba(255, 255, 255, 0.08)`
- 毛玻璃：`1px solid rgba(255, 255, 255, 0.15)`

**留白** — padding 多给一点，元素间不要太挤：
- 按钮内 padding 至少 `8px 16px`
- 卡片内 padding 至少 `16px`
- 区块间距至少 `24px`
- 留白本身就是温和

---

## 5. 组件状态

所有交互元素按变化属性选择过渡：颜色用 `transition-colors duration-150`，位移/缩放用 `transition-transform duration-200`，多个属性确实同时变化时才使用 `transition-all`。

### 5.1 按钮

| 状态 | 视觉变化 |
|---|---|
| Default | 背景 `--color-primary`，文字 `--color-primary-foreground` |
| Hover | 背景切换到 `--color-primary-hover`，`cursor: pointer` |
| Active | 背景切换到 `--color-primary-active`，轻微 `scale-[0.98]` |
| Focus | 键盘导航时显示 `focus-visible` 外轮廓，可叠加 `--shadow-glow` |
| Disabled | `opacity-50`，`cursor-not-allowed`，`pointer-events-none` |
| Loading | 文字替换为 spinner，按钮保持原尺寸不变 |

次要按钮（variant="secondary"）同理，颜色走 `--color-secondary` 系列。

### 5.2 输入框

| 状态 | 视觉变化 |
|---|---|
| Default | 背景 `--color-surface-secondary`，边框 `--color-border` |
| Hover | 边框颜色不变，`cursor: text` |
| Focus | 边框切换到 `--color-primary`，外发光 `--shadow-glow` |
| Disabled | `opacity-50`，背景变浅，`cursor-not-allowed` |
| Error | 边框切换到 `--color-error`，下方显示错误文字 |

### 5.3 卡片

| 状态 | 视觉变化 |
|---|---|
| Default | 背景 `--color-surface`，阴影 `--shadow-sm`，边框 `--color-border` |
| Hover（可点击） | 阴影提升到 `--shadow-md`，`translate-y-[-1px]` |
| Active（可点击） | 阴影回到 `--shadow-sm`，`translate-y-[0]` |

### 5.4 链接/文字按钮

| 状态 | 视觉变化 |
|---|---|
| Default | 实色/稳定表面可用 `--color-primary`；浅主题底或玻璃上的小字使用 `--color-primary-ink` |
| Hover | 下划线出现，颜色不变 |
| Active | 颜色切换到 `--color-primary-active` |
| Focus | 外发光 `--shadow-glow` |

### 5.5 全局 focus 规则

```css
:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
:focus:not(:focus-visible) {
  outline: none;
}
```

只在键盘导航时显示 focus ring，鼠标点击不显示。

---

## 6. 附加约定

### 6.1 动画时长

| 场景 | 时长 |
|---|---|
| 颜色/背景切换 | `150ms` |
| 位移/缩放 | `200ms` |
| 展开/折叠 | `300ms` |
| 页面过渡 | `300ms` |

缓动函数统一 `ease-in-out`，弹出类元素用 `ease-out`。

### 6.2 滚动条

自定义滚动条宽度 `6px`，轨道透明，滑块 `rgba(0,0,0,0.15)`，hover 加深。
深色主题滑块改为 `rgba(255,255,255,0.15)`。

### 6.3 z-index 层级

| 层级 | 值 | 用途 |
|---|---|---|
| Base | 0 | 默认内容 |
| Sticky | 10 | 吸顶导航栏 |
| Dropdown | 20 | 下拉菜单、tooltip |
| Modal | 50 | 弹窗、dialog |
| Toast | 100 | 全局提示 |
| Alarm | 200 | 闹铃弹窗（最高优先级） |

### 6.4 最大宽度

内容区最大宽度 `max-w-[600px]`（移动端全宽，桌面端居中），聊天页面可放宽到 `max-w-[720px]`。

### 6.5 可访问性

UI 默认满足键盘、触屏和低动效用户的基本需求：

- 文字与背景对比度至少达到 WCAG AA：正文 4.5:1，大号文字与图标按钮 3:1。
- 半透明表面上的主题色小字通过 `primary-ink` 以 5.5:1 为派生目标，给壁纸透色预留对比度余量。
- `muted-foreground` 仍是正常可读文字，不得降级为装饰灰；真正的禁用状态再单独使用透明度。
- 触屏可点击目标不小于 `44px × 44px`；视觉上较小的图标按钮也要通过 padding 扩大命中区域。
- 交互元素必须可键盘访问，`Tab` 顺序与视觉顺序一致，焦点不能被弹窗或侧栏吞掉。
- 图标按钮必须提供 `aria-label`；只有视觉 tooltip 不算可访问名称。
- 展开/折叠、侧栏、弹窗等状态变化要同步 `aria-expanded`、`aria-controls`、`aria-modal` 等语义。
- 遵守 `prefers-reduced-motion: reduce`：关闭非必要动画，保留即时状态变化。
- 文本内容必须允许换行，长 URL、代码、文件名要用 `break-words` 或内部横向滚动处理，不能撑破布局。


---

## 7. 图标规范

### 7.1 图标库选择

使用 **Lucide React**（shadcn/ui 默认图标库），不再使用 emoji 作为 UI 图标。

```tsx
import { Send, Settings, Brain } from "lucide-react";

// 用法
<Send className="size-4" />
<Settings className="size-5 text-muted-foreground" />
```

选择理由：
- shadcn/ui 原生集成，组件内直接使用无需额外适配
- SVG 组件按需引入，自动 tree-shake，比 iconfont 字体方案体积更小
- 每个图标可独立控制大小、颜色、stroke-width，配合 Tailwind 使用
- 1500+ 图标覆盖项目所有场景
- Retina 屏渲染清晰，无字体模糊问题

### 7.2 图标尺寸

| 场景 | Tailwind class | 实际尺寸 | 示例 |
|---|---|---|---|
| 按钮内图标（sm） | `size-3.5` | 14px | 关闭按钮、删除按钮 |
| 按钮内图标（md） | `size-4` | 16px | 发送、保存、主操作 |
| 行内图标 | `size-4` | 16px | 列表项前缀、标签 |
| 导航图标 | `size-5` | 20px | 底部导航、侧栏 |
| 页面标题图标 | `size-6` | 24px | 顶部标题旁 |
| 空状态/插画 | `size-12` | 48px | 空列表提示 |

### 7.3 图标颜色

| 场景 | 颜色规则 | Tailwind |
|---|---|---|
| 默认 | 跟随父元素文字色 | 不加 color class |
| 次要 | `--color-muted-foreground` | `text-muted-foreground` |
| 主色强调 | `--color-primary` | `text-primary` |
| 可点击图标按钮 | 默认 muted foreground，hover 切 primary | `text-muted-foreground hover:text-primary` |
| 语义色 | success / warning / destructive / info | `text-success` 等 |

### 7.4 图标按钮规范

图标按钮必须有 tooltip 说明用途，使用 shadcn/ui `Tooltip` 组件：

```tsx
<TooltipProvider>
  <Tooltip>
    <TooltipTrigger asChild>
      <Button variant="ghost" size="icon" className="size-8" aria-label="复制">
        <Copy className="size-3.5" />
      </Button>
    </TooltipTrigger>
    <TooltipContent>复制</TooltipContent>
  </Tooltip>
</TooltipProvider>
```

### 7.5 项目常用图标速查

| 功能 | 图标名 | 功能 | 图标名 |
|---|---|---|---|
| 发送消息 | `Send` | 返回 | `ArrowLeft` |
| 设置 | `Settings` | 记忆 | `Brain` |
| 日记 | `BookOpen` | 日程 | `CalendarDays` |
| 摄像头 | `Camera` | 位置 | `MapPin` |
| 音乐 | `Music` | 剧场 | `Clapperboard` |
| 附件 | `Paperclip` | 复制 | `Copy` |
| 删除 | `Trash2` | 搜索 | `Search` |
| 心声 | `Heart` | 编辑 | `Pencil` |
| 新建 | `Plus` | 关闭 | `X` |
| 菜单 | `Menu` | 更多 | `MoreHorizontal` |
| 下载 | `Download` | 上传 | `Upload` |
| 停止生成 | `Square` | 重新生成 | `RefreshCw` |
| 闹铃 | `AlarmClock` | 笔记 | `StickyNote` |

### 7.6 Lucide 未覆盖时的处理

极少数场景 Lucide 没有合适图标时：
1. 去 iconfont.cn 搜索并下载 SVG
2. 放到 `src/assets/icons/` 目录
3. 封装为 React 组件，导出接口与 Lucide 一致（`className`、`size`）

```tsx
// src/assets/icons/WechatIcon.tsx
export function WechatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {/* SVG path */}
    </svg>
  );
}
```


---

## 8. 用户自定义主题色

### 8.1 机制

系统所有主色变体从单一 CSS 变量 `--color-theme` 自动派生（通过 `color-mix()`）。
用户只需修改这一个变量，hover、active、subtle、ring 全部自动跟随变化，无需逐个覆盖。

- `--color-primary-foreground` 根据主题色对比度在 `#ffffff` / `#111110` 之间切换，用于实心主题色背景上的文字。
- `--theme-primary-ink-light` 与 `--theme-primary-ink-dark` 将主题色分别向当前主题的正文色混合，直到达到至少 5.5:1。
- `--color-primary-ink` 在浅色/深色模式下引用对应 ink，用于浅底、玻璃、浅主题色背景上的小字。
- 色块、图标和装饰仍使用原始 `--color-primary`，不要为了文字可读性改变用户选中的主题色本身。

```ts
// 运行时切换主题色
function setThemeColor(hex: string) {
  document.documentElement.style.setProperty("--color-theme", hex);
  applyThemeInk(hex); // 同时更新 light/dark primary ink
  localStorage.setItem("penumbra-theme-color", hex);
}
```

### 8.2 预设色板

提供 8-10 个预设色供用户快速选择，覆盖暖色/冷色/中性色：

| 名称 | 色值 | 风格 |
|---|---|---|
| 珊瑚（默认） | `#F4845F` | 暖，活力 |
| 琥珀 | `#d4924a` | 暖，柔和 |
| 落日 | `#c4553a` | 暖，深沉 |
| 森林 | `#4a8f6b` | 冷，沉稳 |
| 海蓝 | `#4a6fd4` | 冷，理性 |
| 薰衣草 | `#8b6bc4` | 冷，温柔 |
| 石墨 | `#6b6560` | 中性，克制 |
| 玫瑰 | `#c44a6b` | 暖，浪漫 |

用户也可输入任意 hex 值自定义。

### 8.3 存储与加载

- 存储位置：`localStorage` 键 `penumbra-theme-color`
- 同步到后端：可选，存入 `settings.json` 的 `theme_color` 字段，跨设备同步
- 加载时机：`index.html` 的 `<head>` 中内联一段同步 JS，在页面渲染前应用主题色、实心前景色和 light/dark primary ink，避免闪烁（FOUC）

```html
<script>
  const tc = localStorage.getItem("penumbra-theme-color");
  if (tc) {
    document.documentElement.style.setProperty("--color-theme", tc);
    applyThemeForeground(tc);
    applyThemeInk(tc);
  }
</script>
```

### 8.4 深色模式联动

外观模式存储在 `localStorage` 的 `penumbra-theme-mode` 键中：

- `light`：始终使用浅色主题
- `dark`：始终使用深色主题
- `system`：监听 `prefers-color-scheme`，随设备设置实时切换

`index.html` 在加载应用代码前同步解析模式并更新 `<html class="dark">` 与 `color-scheme`；应用启动后继续监听系统主题和跨标签页存储变化。

深色模式可以为默认主题提供稍亮的 `--color-theme`，但用户自定义主题色本身保持不变，以保证用户选择的色块、图标和强调色一致。需要承担文字语义时，使用单独计算的 `--theme-primary-ink-dark`：

```ts
const lightInk = getReadableThemeInk(theme, "#FAFAF8", "#1A1A1A");
const darkInk = getReadableThemeInk(theme, "#1A1A18", "#E8E8E4");
```

`getReadableThemeInk` 保留主题色的色相倾向，并逐步向目标正文色混合，直到达到 5.5:1；因此琥珀等偏亮主题色作为色块时保持原色，作为浅底小字时会自动变深。

### 8.5 设置 UI

在设置页面提供「界面外观」和「主题色」选项：

- 外观切换：跟随系统 / 浅色 / 深色，选择后立即生效并持久化
- 预设色板：圆形色块网格，选中态加对勾
- 自定义输入：hex 输入框 + 实时预览色块
- 实时生效：选择后立即预览，无需保存确认
- 选中项如果使用浅主题色背景，文字必须是 `text-primary-ink`；实心主题色背景上的对勾或文字使用 `text-primary-foreground`
