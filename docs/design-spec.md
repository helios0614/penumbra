# Penumbra UI Design Specification

基于 shadcn/ui token 体系扩展，所有设计决策通过 CSS 变量驱动，支持浅色/深色主题切换。

## 设计原则：护栏，而非像素级处方

> 本规范用于约束 Penumbra 的设计语言、主题体系与工程一致性，不要求页面机械套用固定尺寸。已有成熟页面和实际视觉效果可以作为更高优先级的视觉参考，但调整仍需守住系统一致性与工程底线。

**强约束**是 token、层级、材质、交互与可访问性的一致性；**弱约束**是具体视觉数值。圆角、间距、宽度、密度和布局可以根据页面内容与成熟视觉参考调整，同时应保持：

- token 一致；
- 层级一致；
- 材质语言一致；
- 交互语言一致；
- 可访问性要求一致。

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

柔和灰绿，用于通用次级 UI 与次要操作，不承担固定的 AI 角色颜色语义。

| Token | 值 | 用途 |
|---|---|---|
| `--color-secondary` | `#6b8f71` | 通用次级 UI、次要按钮 |
| `--color-secondary-hover` | `#5d7e63` | hover 态 |
| `--color-secondary-foreground` | `#ffffff` | 辅色上的文字 |
| `--color-secondary-subtle` | `#eef5ef` | 辅色浅底 |

AI 角色颜色使用现有 `--color-ai` 系列及其角色色配置，可以由用户配置，不与 `secondary` 强绑定。

#### 中性色 Neutral

| Token | 值 | 用途 |
|---|---|---|
| `--color-muted` | `#f5f5f3` | muted 背景，不作为文字色 |
| `--color-muted-foreground` | `#6f6963` | 说明文字、时间戳、小组件次要信息 |
| `--color-muted-strong` | `#57524e` | 控件标签、API 信息、需要更强的次要文字 |

中性文字层级固定为 `foreground → muted-strong → muted-foreground`。10–14px 的正常可读文字不得继续使用更浅的装饰灰，也不要通过“浅灰文字 + opacity”叠加制造层级；`opacity` 仅用于禁用、越界日期等明确的非活跃状态。

#### 语义色 Semantic

语义色必须使用命名 token，组件中不要直接写 hex。Tailwind class 命名与 token 对齐，如 `text-success`、`bg-destructive-subtle`、`border-warning`。错误／危险以现有 destructive 系列为规范名称；error / error-foreground / error-subtle / error-subtle-foreground 保留为对应 destructive token 的兼容别名，动态跟随主题，不另建色板。

| Token | 浅色值 | 用途 |
|---|---|---|
| `--color-success` | `#22c55e` | 操作成功、在线状态 |
| `--color-success-foreground` | `#166534` | 成功浅底上的可读文字 |
| `--color-success-subtle` | `#f0fdf4` | 成功提示条浅底 |
| `--color-warning` | `#f59e0b` | 闹铃、即将过期 |
| `--color-warning-foreground` | `#92400e` | 警告浅底上的可读文字 |
| `--color-warning-subtle` | `#fffbeb` | 警告提示条浅底 |
| `--color-destructive` | `#ef4444` | 删除、错误强调；error 的兼容目标 |
| `--color-destructive-foreground` | `#991b1b` | 错误浅底上的可读文字；error-foreground / error-subtle-foreground 的兼容目标 |
| `--color-destructive-subtle` | `#fef2f2` | 错误提示条浅底；error-subtle 的兼容目标 |
| `--color-info` | `#3b82f6` | 提示、帮助 |
| `--color-info-foreground` | `#1e40af` | 信息浅底上的可读文字 |
| `--color-info-subtle` | `#eff6ff` | 信息提示条浅底 |

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
| `--color-success-foreground` | `#86efac` |
| `--color-warning-subtle` | `rgba(245, 158, 11, 0.12)` |
| `--color-warning-foreground` | `#fbbf24` |
| `--color-destructive-subtle`（及 error-subtle） | `rgba(239, 68, 68, 0.12)` |
| `--color-destructive-foreground`（及 error 前景别名） | `#fca5a5` |
| `--color-info-subtle` | `rgba(59, 130, 246, 0.12)` |
| `--color-info-foreground` | `#93c5fd` |

---

## 2. 字体规范

### 2.1 字体栈

```css
--font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
  "Helvetica Neue", "Noto Sans SC", sans-serif;
--font-decorative: "Cormorant Garamond", "Iowan Old Style", "Baskerville",
  "Times New Roman", serif;
--font-mono: "SF Mono", "Fira Code", "Cascadia Code", monospace;
```

### 2.2 英文与数字装饰字体

Penumbra 使用 **Cormorant Garamond** 作为英文和数字的装饰字体。装饰字体只负责增加视觉气质，不承担主要信息层级；字号、颜色、透明度和间距仍应根据所在组件的语义与层级决定。

实现时优先复用已有的 `--font-decorative` token 或 `.font-decorative` class，不要在页面或业务组件内重复定义字体栈。

#### Regular 400

- 用于共享页面 Header 中的英文 eyebrow / decorative title，例如 `MEMORIES`、`SETTINGS`。
- Header 中各页面保留各自原有的英文文案，只统一字体风格；不要把不同页面统一替换成某个固定单词。
- 用于装饰性数字，例如记忆总数、年份、档案编号和装饰性页码。
- 装饰数字默认保留 Cormorant Garamond 自身的原生数字字形。

#### Italic 400

- 只用于少量更柔和、偏 editorial / 手账感的英文装饰，例如 `Fragments`。
- 不作为页面英文标题或共享 Header eyebrow 的默认样式。

#### 使用边界

- 不用于中文正文。
- 不用于长正文、表单、按钮、列表等功能性文字。
- 装饰字体不能替代正常的信息层级设计；需要清晰阅读、操作或数据比较的内容仍使用对应的正文或功能字体。

#### 装饰数字的 OpenType 与字距

除非有明确且经过确认的视觉需求，装饰数字保持：

```css
font-family: var(--font-decorative);
font-weight: 400;
font-style: normal;
font-variant-numeric: normal;
/* 使用默认 letter-spacing，不额外 tracking */
```

默认不要强制使用 `lining-nums`、`tabular-nums`，也不要添加额外 tracking。这些 OpenType / spacing 设置会明显改变 Cormorant Garamond 的数字 glyph、宽度与整体气质。确有对齐或特定数字样式需求时，应在对应组件中明确说明视觉理由并单独验证，不能修改装饰数字的全局默认规则。

### 2.3 字号层级

| Token | PC 端 | 移动端 | 用途 |
|---|---|---|---|
| `--text-xs` | 12px | 12px | 辅助说明、时间戳 |
| `--text-sm` | 14px | 14px | 次要正文、表单标签 |
| `--text-base` | 15px | 16px | 正文（移动端略大保证可读性） |
| `--text-lg` | 17px | 18px | 小标题、卡片标题 |
| `--text-xl` | 20px | 20px | 页面标题 |
| `--text-2xl` | 24px | 24px | 大标题 |
| `--text-3xl` | 30px | 28px | Hero 标题（移动端略缩） |

### 2.4 行高

| 场景 | 行高 |
|---|---|
| 正文 | 1.6 |
| 标题 | 1.3 |
| 按钮/单行 | 1.2 |
| 代码块 | 1.5 |

### 2.5 字重

| Token | 值 | 用途 |
|---|---|---|
| `--font-normal` | 400 | 正文 |
| `--font-medium` | 500 | 次要强调（标签、导航） |
| `--font-semibold` | 600 | 标题、按钮 |
| `--font-bold` | 700 | 功能性关键数字突出、极少量使用（不适用于装饰数字） |

---

## 3. 间距体系

基于 Tailwind 默认 4px 网格（`1 = 0.25rem = 4px`）。以下档位是维持整体节奏的默认 / 推荐值，不要求所有组件严格等于这些数值。具体页面可根据内容密度、层级和成熟视觉参考做有限调整；调整时应优先使用现有 Tailwind spacing scale，不要随意创建大量零散的自定义数值。

### 3.1 组件内部间距

| 元素 | padding | Tailwind |
|---|---|---|
| 按钮（md） | `8px 16px` | `py-2 px-4` |
| 按钮（sm） | `4px 12px` | `py-1 px-3` |
| 输入框 | `10px 12px` | `py-2.5 px-3` |
| 卡片 | `16px` | `p-4` |
| 卡片（紧凑） | `12px` | `p-3` |
| 页面内容区 | `16px` | `p-4` |
| Dialog / AlertDialog 区域 | 移动端横向 `20px`，桌面端 `24px` | `px-5 sm:px-6`（外壳无 padding） |

### 3.2 组件之间间距

| 场景 | gap | Tailwind |
|---|---|---|
| 同级元素（按钮组、标签组） | `8px` | `gap-2` |
| 表单字段之间 | `16px` | `gap-4` |
| 卡片列表 | `12px` | `gap-3` |
| 页面区块 | `32px` | `gap-8` |
| 聊天消息之间 | `4px` | `gap-1` |

### 3.3 响应式

移动端（`<640px`）页面内容区 padding 默认参考 `16px`，桌面端通常可放宽到 `24px` 或 `32px`，例如通过 `sm:p-6 lg:p-8` 控制；实际取值可按页面密度和成熟视觉参考有限调整。

### 3.4 布局与滚动策略

**移动端优先**：先写移动端布局，再用 `sm:`、`md:`、`lg:` 断点适配大屏。

**两种成熟布局模型**：Penumbra 使用固定工作区和自然页面流两种布局模型。滚动由明确的实际容器承担，避免无意义的嵌套和高度挤压；滚动条默认隐藏，但滚动能力、焦点与内容可达性必须保留。

固定工作区适用于 Memory（列表独立滚动、分页在外）、Quick Note 单篇阅读（正文独立滚动）与 Chat（消息独立滚动、输入区固定）。典型布局是「固定顶栏 + 固定底栏 + 中间正文滚动」：

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

自然页面流适用于 Activity、Location、Quick Note 概览与 Settings：稳定 Header 下方使用公共 `PageScrollArea`，多个模块在同一主要容器中自然展开。Activity 的 Wi-Fi 配置展开不能挤压时间线成独立小滚动框。Quick Note 原始日志与 Location 时间列属于有意限高的局部控件，不改变页面主要滚动所有权。

Classic / Editorial 的应用壳保持受视口高度约束；应用与 Settings 自己承担滚动，Editorial 首页继续使用原外层滚动。不要用 `window.scrollY` 判断 feature 位置。Calendar 当前入口仅紧凑月历与日期事件空态，可在小视口滚动，不新增普通页面回顶。

---

### 3.5 Dialog / AlertDialog 公共布局

公共组件默认采用成熟的 Mist 弹框布局：

- 外壳为 `.mist-glass-strong`、28px 圆角、默认 max-width 32rem，无额外内部卡片或白底；不修改 Mist 透明度、blur、边框和阴影 token。四边至少留 16px 且避让安全区，以动态视口 `100dvh` 扣除上下安全间距限制最大高度并居中，不强设高度。
- 区域横向 padding 移动端 20px、桌面端 24px；普通 Header 上 20px / 24px、下 16px / 20px。标题固定为功能 `font-sans`、18px / 600 / 28px，描述 13px / 20px、muted；只有显式英文 eyebrow 使用 Cormorant Garamond。
- Header 和 Footer 固定，正文按需组合 `DialogBody`：`min-h-0`、可收缩、独立纵向滚动；外壳不滚动，短内容自然收缩。短确认无需固定高度或额外 Body；AlertDialog 的标题／说明区在极短视口可滚动，操作区在外。
- Footer 上下 padding 12px，操作水平右对齐、8px 间距、窄屏可换行，不强制反向纵排或全宽。取消通常 ghost，确认／保存 default，危险操作 destructive。遵守 PR1 的 Button 最小高度和文字换行规则，普通确认默认 min 36px，主要表单按需 comfortable min 44px；阅读弹框无操作时不添加 Footer。
- Dialog 关闭使用 Lucide X（16px 图标、44px 点击区、明确可访问名称）。自动关闭按钮与自定义 Header 中的公共关闭按钮二选一。保存和草稿保护沿用 Base UI 的 `onOpenChange` 事件取消机制；Popover 发起的弹框指定稳定 `finalFocus`，嵌套确认保留父子层级。AlertDialog 仍保留独立遮罩和取消语义，不改为普通 Dialog。
- 主题色、深色模式沿用语义 token；Reduced Motion 禁用弹框／遮罩动画与过渡。业务可保留不同宽度、字段节奏、时间列滚动、Quick Note 编辑高度与 `visualViewport` 特殊适配；普通 Dialog 不复制密集编辑器的键盘逻辑。

组合示例和关闭约定见 [`ui-patterns.md`](./ui-patterns.md#dialog--alertdialog-的成熟组合约定)。

---

## 4. 圆角与阴影

### 4.1 圆角

圆角越大越温和，但不能全部拉满，有大有小才有层次。下列 token 与推荐值是默认层级参考，不是硬性像素上限。

| Token | 范围 | 推荐值 | Tailwind | 适用 |
|---|---|---|---|---|
| `--radius-sm` | 8-10px | `8px` | `rounded-sm` | 按钮、标签、输入框 |
| `--radius-md` | 现有计算值 | `9.6px`（radius × 0.8） | `rounded-md` | 旧组件兼容 |
| `--radius-control` | 控件语义 | `12px` | `rounded-[var(--radius-control)]` | 基础按钮、输入、选择控件 |
| `--radius-lg` | 16-20px | `16px` | `rounded-lg` | 大容器、图片 |
| Dialog / AlertDialog 布局 | 成熟公共布局 | `28px` | `rounded-[28px]` | 弹框外壳，不改全局 token |
| `--radius-full` | — | `9999px` | `rounded-full` | 头像、Badge、胶囊按钮 |

层次原则：
- 小标签及旧紧凑工具通常可用 `--radius-sm`（8px）；常规交互控件使用下述控件语义
- 基础控件优先 `--radius-control`（12px）；不要把旧 `rounded-md` 或 `rounded-xl` 当成 12px
- 全屏容器等大元素通常优先 `--radius-lg`（推荐 16px），体现留白感；Dialog / AlertDialog 默认采用已验收的 28px
- 大型 page shell、主要 section 与玻璃外壳可根据现有成熟页面的视觉关系适当使用更大的圆角
- 嵌套圆角应具有清晰层级关系，避免随机跳变；内层通常应不大于外层的视觉半径

`--radius` 基值为 12px；旧 `--radius-md` 为基值 × 0.8（9.6px），`--radius-xl` 为基值 × 1.4（16.8px）。保留这些既有计算关系，控件通过语义 token 收敛，不修改全局圆角体系。

### 4.2 晨雾表面系统（Mist Surface）

通用 Mist Surface 只使用三个层级。组件中不要重新手写 `bg-white/70`、`backdrop-blur-md` 等组合，避免透明度和模糊强度逐渐漂移。

| Class | 用途 | 典型组件 |
|---|---|---|
| `.mist-glass` | 轻量、悬浮的普通玻璃 | 小组件、Dock、图标、设置页轻量面板、浮动按钮 |
| `.mist-glass-strong` | 需要更强结构边界的玻璃 | App 外壳、Dialog、Sheet、Popover |
| `.mist-solid` | 内容密集、需要稳定对比度的表面 | 聊天正文、日历、输入框、表单和长文本 |

三层表面均由 `src/index.css` 中的 CSS 变量控制，并在 `.dark` 下统一覆盖。圆角和 padding 仍由组件自己决定，材质类只负责背景、边框、模糊与阴影。

使用原则：

- Glass 是材质语言，不是装饰目标；材质选择应服务于内容层级与可读性。
- 浮在壁纸上的轻量信息优先 `.mist-glass`。
- 弹窗和完整功能容器优先 `.mist-glass-strong`。
- 阅读、输入、长列表和高密度信息优先保证稳定对比度，通常使用 `.mist-solid`；成熟页面在可读性充分时也可使用轻玻璃或已有的半透明语义 surface。
- 内容密集、长文本和输入区域应避免高强度 blur、多层玻璃嵌套与对比度不足。
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

**留白** — 下列数值是温和布局的默认参考，而非所有组件的硬性下限；可根据内容密度和成熟视觉参考有限调整：
- 按钮内 padding 默认参考 `8px 16px`
- 卡片内 padding 默认参考 `16px`
- 区块间距默认参考 `24px`
- 留白本身就是温和

---

## 5. 组件状态

所有交互元素按变化属性选择过渡：颜色用 `transition-colors duration-150`，位移/缩放用 `transition-transform duration-200`，多个属性确实同时变化时才使用 `transition-all`。

### 5.1 按钮

| 状态 | 视觉变化 |
|---|---|
| Default | 背景 `--color-primary`，文字 `--color-primary-foreground` |
| Hover | 背景切换到 `--color-primary-hover`，`cursor: pointer` |
| Active | 背景切换到 `--color-primary-active`，不强制位移／缩放 |
| Focus | 使用 ring token 的 `focus-visible` 2px / 20% 外环；不叠加全局 outline 或固定颜色 glow |
| Disabled | `opacity-50`，`cursor-not-allowed`，`pointer-events-none` |
| Loading | 设置 aria-busy 并禁用点击；可用 Button loading 在保留标签布局后展示 spinner，或保留已有“保存中…”文案 |

次要按钮（variant="secondary"）同理，颜色走 `--color-secondary` 系列。

Button 的视觉优先级由当前交互场景决定，不仅由操作名称决定。弹框中的主要操作可使用 Primary（`variant="default"`），即使执行读取、刷新或重试；保留真实 disabled／loading 状态。`soft-primary` 适合页面级辅助查询／重新读取：浅主题底、primary-ink 文字，Hover / Active 保持柔和主题强调，例如 Location「查询」。ghost、outline、destructive 分别表示轻工具、中性描边与危险操作，不混用业务语义。

控件可见尺寸不等于交互目标尺寸；Penumbra 不要求所有移动端控件视觉高度达到 44px。Button 使用 compact / default / lg / comfortable（最小 32 / 36 / 40 / 44px）；输入和 AppSelect 使用 controlSize（32 / 40 / 44px），多行 Textarea 只按此属性调整内边距。文字控件应自然增高以容纳字体放大；旧 xs / sm / icon 紧凑工具栏保留。FilterChip 与 SegmentedControlItem 的约 36px 表面位于各自 min 44px 的目标内，不扩大或重叠热区。具体组合与例外见 ui-patterns。

### 5.2 输入框

| 状态 | 视觉变化 |
|---|---|
| Default | solid / translucent 表面；常规默认 min 40px，保留已有表单的显式密度 |
| Hover | translucent 表面适度提亮，`cursor: text` |
| Focus | ring token 的克制边框与 2px / 20% 外环，不叠加固定颜色 glow |
| Disabled | `opacity-50`，背景变浅，`cursor-not-allowed` |
| Error | aria-invalid 使用 destructive 边框及浅外环，下方保留字段错误文字 |

### 5.3 卡片

卡片的具体材质由所在场景决定，可使用 `.mist-glass`、`.mist-glass-strong`、`.mist-solid` 或语义 surface。本节只定义交互状态，不为所有卡片指定统一的 surface、阴影与边框模板。

静态内容卡片默认不需要 hover 浮起。只有语义上明确可点击或可选择的 interactive card，才使用 hover shadow、translate 等交互反馈；以下数值仅是 interactive card 的状态参考。

| 状态 | 视觉变化 |
|---|---|
| Default | 按所在场景选择材质并保持静态；不默认添加 hover 浮起 |
| Hover（仅 interactive card） | 阴影可提升到 `--shadow-md`，位移可参考 `translate-y-[-1px]` |
| Active（仅 interactive card） | 阴影回落到默认状态（可参考 `--shadow-sm`），位移可参考 `translate-y-[0]` |

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

### 6.2 滚动条与回顶

实际原生滚动容器使用公共 `.scrollbar-none`，统一处理 Firefox 的 `scrollbar-width`、WebKit 伪元素与兼容属性，纵横滚动条均隐藏。公共 ScrollArea 的 Viewport 同样隐藏原生条，自绘 ScrollBar / Corner 通过公共 slot 样式隐藏。不能用 `overflow: hidden` 代替隐藏滚动条；滚轮、触摸、触控板、键盘、焦点定位和程序滚动必须保留。DialogBody、长确认说明、输入区、阅读区、时间列、消息列表与桌面横向分页均消费该约定。

自然页面流由 `PageScrollArea` 绑定实际容器；位置严格超过 `max(720px, 1.5 × 容器可视高度)` 才显示 Mist 回顶按钮。容器 ResizeObserver 更新阈值，卸载或隐藏时清理监听；点击聚焦该容器并滚到顶部，Reduced Motion 使用即时滚动。业务已有的位置重置／恢复规则继续由原导航语义决定。Quick Note 单篇阅读保留独立 360px 阈值。

回顶按钮位于容器右下角，44px 目标，避让底部安全区；仅按钮显示时给自然流内容增加相应底部空间。通过 `data-toast-obstacle` 复用 Toast 的移动端避让，Toast 位于按钮上方；桌面 Toast 仍在右上角。按钮局部层级 10、低于 Popover / Dialog，存在模态 Dialog / AlertDialog 时隐藏，不引入新的浮层或滚动管理器。

### 6.3 z-index 层级

| 层级 | 值 | 用途 |
|---|---|---|
| Base | 0 | 默认内容 |
| Sticky | 10 | 吸顶导航栏 |
| Dropdown | 20 | 下拉菜单、tooltip |
| Modal | 50 | 弹窗、dialog |
| Toast | 100 | 全局提示 |
| Alarm | 200 | 闹铃弹窗（最高优先级） |

Toast 的 100 层级由公共 Host 管理，portal 到 body，并按应用视口定位。默认采用 13px 功能字体、小型 Lucide 图标、Mist 强玻璃、16px 圆角、自然宽度（最大 26rem）及 44px 关闭目标。默认严格单行；第二行只放有实际解释价值的信息。手机底部居中并避让安全区／Dock／固定操作区／键盘，桌面右上角。模态 Dialog 打开时暂缓展示和计时，避免遮挡关键操作。反馈归属及生命周期见 `ui-guidelines.md` §4.7 和 `ui-patterns.md` 的 Toast / Feedback。

### 6.4 最大宽度

`max-w-[600px]` 与 `max-w-[720px]` 是常见阅读、设置和聊天页面的参考宽度，不是所有页面的强制最大宽度。页面宽度应根据内容类型、信息密度、操作复杂度和现有成熟页面选择：

- Settings / 简单表单通常偏紧凑；
- Memory / Diary / Chat 可适当放宽以保证阅读；
- Calendar / 数据密集工作区可以使用更宽布局。

### 6.5 可访问性

UI 默认满足键盘、触屏和低动效用户的基本需求：

- 文字与背景对比度至少达到 WCAG AA：正文 4.5:1，大号文字与图标按钮 3:1。
- 半透明表面上的主题色小字通过 `primary-ink` 以 5.5:1 为派生目标，给壁纸透色预留对比度余量。
- `muted-foreground` 仍是正常可读文字，不得降级为装饰灰；真正的禁用状态再单独使用透明度。
- 主要独立触屏操作优先保留 `44px × 44px` 有效目标；可见表面可较小。紧凑工具栏、列表与密集选择按明确尺寸语义保留密度和间距，不把所有视觉控件统一增高；扩大的命中区域必须占据独立布局空间，不能与相邻目标重叠。
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
