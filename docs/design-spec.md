# Penumbra UI Design Specification

基于 shadcn/ui token 体系扩展，所有设计决策通过 CSS 变量驱动，支持浅色/深色主题切换。

---

## 1. 颜色系统

所有颜色通过 `@theme` 块中的 CSS 变量定义，Tailwind 通过 `var(--color-xxx)` 引用。

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

```css
:root {
  --color-theme: #d4624a;  /* ← 唯一需要改的变量 */
  --color-primary: var(--color-theme);
  --color-primary-hover: color-mix(in srgb, var(--color-theme), black 12%);
  --color-primary-active: color-mix(in srgb, var(--color-theme), black 22%);
  --color-primary-foreground: #ffffff;
  --color-primary-subtle: color-mix(in srgb, var(--color-theme), white 92%);
}
```

| Token | 来源 | 用途 |
|---|---|---|
| `--color-theme` | 手动设定 | 品牌主色，唯一入口 |
| `--color-primary` | = theme | 主按钮背景、链接 |
| `--color-primary-hover` | theme + 12% black | hover 态 |
| `--color-primary-active` | theme + 22% black | active 态 |
| `--color-primary-foreground` | 固定白 | 主色上的文字 |
| `--color-primary-subtle` | theme + 92% white | tag、badge 浅底 |

深色主题只需覆盖 `--color-theme` 为稍亮的值（如 `#e07a66`），其余自动适配。

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
| `--color-muted` | `#a0998f` | 次要文字、时间戳 |
| `--color-muted-strong` | `#6b6560` | 需要稍强的次要文字 |
| `--color-muted-foreground` | `#ffffff` | muted 色上的文字 |

#### 语义色 Semantic

| 语义 | 背景 | 前景（文字/图标） | 用途 |
|---|---|---|---|
| 成功 | `#22c55e` | `#ffffff` | 操作成功、在线状态 |
| 成功-浅 | `#f0fdf4` | `#166534` | 成功提示条 |
| 警告 | `#f59e0b` | `#ffffff` | 闹铃、即将过期 |
| 警告-浅 | `#fffbeb` | `#92400e` | 警告提示条 |
| 错误 | `#ef4444` | `#ffffff` | 删除、致命错误 |
| 错误-浅 | `#fef2f2` | `#991b1b` | 错误提示条 |
| 信息 | `#3b82f6` | `#ffffff` | 提示、帮助 |
| 信息-浅 | `#eff6ff` | `#1e40af` | 信息提示条 |

### 1.2 深色主题

深色主题通过在 `<html>` 上加 `dark` class 激活，变量覆盖规则：

| Token | 值 |
|---|---|
| `--color-background` | `#111110` |
| `--color-foreground` | `#e8e8e4` |
| `--color-surface` | `#1a1a18` |
| `--color-surface-secondary` | `#242422` |
| `--color-border` | `#2e2e2c` |
| `--color-border-strong` | `#484844` |
| `--color-primary` | `#e07a66` |
| `--color-primary-hover` | `#e88d7c` |
| `--color-primary-active` | `#d4624a` |
| `--color-primary-subtle` | `#2a1f1c` |
| `--color-secondary` | `#7fa685` |
| `--color-secondary-subtle` | `#1a241c` |
| `--color-muted` | `#78726a` |
| `--color-muted-strong` | `#9a9490` |

语义色的「浅」变体在深色下替换为对应低透明度底色（如 `rgba(34,197,94,0.12)`）。

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
---|---|---|
| 同级元素（按钮组、标签组） | `8px` | `gap-2` |
| 表单字段之间 | `16px` | `gap-4` |
| 卡片列表 | `12px` | `gap-3` |
| 页面区块 | `32px` | `gap-8` |
| 聊天消息之间 | `4px` | `gap-1` |

### 3.3 响应式

移动端（`<640px`）页面内容区 padding 保持 `16px`，桌面端可放宽到 `24px` 或 `32px`，通过 `sm:p-6 lg:p-8` 控制。

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

### 4.2 毛玻璃表面（Glass Surface）

导航栏、卡片、弹框、下拉菜单等浮层统一使用毛玻璃，不使用纯色背景。

```css
.glass {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.15);
}
```

Tailwind：`bg-white/70 backdrop-blur-md border border-white/15`
深色主题：`bg-black/40 backdrop-blur-md border border-white/10`

| 元素 | 背景色 | blur | 说明 |
|---|---|---|---|
| 顶部导航栏 | `white/60` | `blur(20px)` | 更轻，下方内容隐约透出 |
| 卡片 | `white/70` | `blur(12px)` | 主体内容足够辨识 |
| 弹窗/Modal | `white/80` | `blur(16px)` | 稍实，保证弹窗内容清晰 |
| 下拉菜单 | `white/75` | `blur(12px)` | 与卡片一致 |
| Toast | `black/80` | `blur(8px)` | 深底白字，半透明 |

深色主题所有 `white` 换为 `black`，透明度适当提高（`black/50` → `black/60`）。

### 4.3 阴影

温和风格的核心：扩散大、透明度低、边缘模糊，不用硬阴影。

| Token | 值 | 适用 |
|---|---|---|
| `--shadow-sm` | `0 2px 8px rgba(74,59,50,0.05)` | 卡片静态、列表项 |
| `--shadow-md` | `0 4px 20px rgba(74,59,50,0.08)` | hover 浮起、下拉菜单 |
| `--shadow-lg` | `0 8px 30px rgba(74,59,50,0.10)` | Modal、弹窗 |
| `--shadow-glow` | `0 0 0 3px rgba(212,98,74,0.25)` | Primary focus ring |
| `--shadow-glass` | `0 4px 20px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.1)` | 毛玻璃卡片、导航栏 |

`--shadow-glass` 是毛玻璃专用阴影：外阴影浮起 + 内阴影模拟光泽，让玻璃质感更明显。

深色主题下阴影统一加深至 `rgba(0,0,0,0.35)` 基底，色调不变。

### 4.4 温和风格补充

几个细节让整体更柔和：

**过渡动画** — 所有交互元素统一加过渡，动起来不生硬：
```css
transition: all 0.2s ease;
```
Tailwind：`transition-all duration-200`

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

所有交互元素统一使用 `transition-colors duration-150`（150ms 颜色过渡）。

### 5.1 按钮

| 状态 | 视觉变化 |
|---|---|
| Default | 背景 `--color-primary`，文字 `--color-primary-foreground` |
| Hover | 背景切换到 `--color-primary-hover`，`cursor: pointer` |
| Active | 背景切换到 `--color-primary-active`，轻微 `scale-[0.98]` |
| Focus | 外发光 `--shadow-glow`，无默认 outline |
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
| Error | 边框切换到 `--color-error`（`#ef4444`），下方显示错误文字 |

### 5.3 卡片

| 状态 | 视觉变化 |
|---|---|
| Default | 背景 `--color-surface`，阴影 `--shadow-sm`，边框 `--color-border` |
| Hover（可点击） | 阴影提升到 `--shadow-md`，`translate-y-[-1px]` |
| Active（可点击） | 阴影回到 `--shadow-sm`，`translate-y-[0]` |

### 5.4 链接/文字按钮

| 状态 | 视觉变化 |
|---|---|
| Default | 颜色 `--color-primary`，无下划线 |
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


---

## 7. 图标规范

### 7.1 图标库选择

使用 **Lucide React**（shadcn/ui 默认图标库），不再使用 emoji 作为 UI 图标。

```tsx
import { Send, Settings, Brain } from "lucide-react";

// 用法
<Send className="size-4" />
<Settings className="size-5 text-muted" />
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
| 次要 | `--color-muted` | `text-muted` |
| 主色强调 | `--color-primary` | `text-primary` |
| 可点击图标按钮 | 默认 muted，hover 切 primary | `text-muted hover:text-primary` |
| 语义色 | success / warning / destructive / info | `text-success` 等 |

### 7.4 图标按钮规范

图标按钮必须有 tooltip 说明用途，使用 shadcn/ui `Tooltip` 组件：

```tsx
<TooltipProvider>
  <Tooltip>
    <TooltipTrigger asChild>
      <Button variant="ghost" size="icon" className="size-8">
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

系统所有主色变体从单一 CSS 变量 `--color-theme` 自动派生（通过 `color-match()`）。
用户只需修改这一个变量，hover、active、subtle、ring 全部自动跟随变化，无需逐个覆盖。

```ts
// 运行时切换主题色
function setThemeColor(hex: string) {
  document.documentElement.style.setProperty("--color-theme", hex);
  localStorage.setItem("penumbra-theme-color", hex);
}
```

### 8.2 预设色板

提供 8-10 个预设色供用户快速选择，覆盖暖色/冷色/中性色：

| 名称 | 色值 | 风格 |
|---|---|---|
| 珊瑚（默认） | `#d4624a` | 暖，活力 |
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
- 加载时机：`index.html` 的 `<head>` 中内联一段同步 JS，在页面渲染前就应用主题色，避免闪烁（FOUC）

```html
<script>
  const tc = localStorage.getItem("penumbra-theme-color");
  if (tc) document.documentElement.style.setProperty("--color-theme", tc);
</script>
```

### 8.4 深色模式联动

深色模式下预设色自动切换为稍亮版本（亮度 +10~15%），保证在暗底上可读。
例如珊瑚色 `#d4624a` → 深色下 `#e07a66`。

用户自定义的 hex 在深色模式下由前端自动提亮：

```ts
function lightenForDark(hex: string, amount = 0.12): string {
  // 简单实现：将 RGB 各通道向 255 靠近 amount 比例
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lr = Math.round(r + (255 - r) * amount);
  const lg = Math.round(g + (255 - g) * amount);
  const lb = Math.round(b + (255 - b) * amount);
  return `#${[lr, lg, lb].map(c => c.toString(16).padStart(2, "0")).join("")}`;
}
```

### 8.5 设置 UI

在设置页面提供「主题色」选项：

- 预设色板：圆形色块网格，选中态加对勾
- 自定义输入：hex 输入框 + 实时预览色块
- 实时生效：选择后立即预览，无需保存确认
