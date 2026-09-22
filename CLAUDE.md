# Penumbra

Penumbra 是一个基于 React + Vite + Tailwind CSS + shadcn/ui 的个人助理应用。

## UI 开发规范

UI 开发的通用入口是 `docs/ui-development.md`，适用于人类开发者、Codex、Claude 和其他 agent。
在 Claude 环境中，`.claude/skills/ui-dev.md` 是 Claude 专用自动触发入口；它只负责指向同一套 `docs/` 规范，不单独定义另一套标准。

核心原则：
- 优先用 shadcn 组件，在其上扩展
- 样式严格跟 design-spec 走，颜色用 CSS 变量，间距用 Tailwind 网格
- Tailwind class 优先，禁止无理由使用 `style={{}}`
- 组件化拆分，一个文件不超过 300 行
- 主色只从 `--color-theme` 派生，语义色使用命名 token，不在组件里硬编码 hex
- UI 必须满足基础可访问性：键盘可用、图标按钮有 `aria-label`、触屏目标不小于 44px

## 页面重构参考

涉及页面重构时，原始文件参考 `/Users/remix/Desktop/AionsHome-main` 项目。

**重要约束**：
- 功能和布局可参考原项目
- **样式、组件、规范严格按 Penumbra 的来**（`docs/ui-development.md`、`docs/ui-guidelines.md`、`docs/design-spec.md`）
- 不要复制原项目的样式代码，全部用 Penumbra 的设计系统重写
- shadcn 组件优先，Tailwind class 优先，CSS 变量驱动

## 技术栈

- React 19 + TypeScript
- Vite 6
- Tailwind CSS 4（CSS 变量驱动主题）
- shadcn/ui（base-nova 风格，底层 @base-ui/react）
- Lucide React 图标库
- date-fns 日期处理

## 目录结构

```
src/
  components/
    ui/          ← shadcn 基础原语（shadcn add 生成，少改）
    <feature>/   ← 业务组件（calendar/、chat/ 等）
  lib/
    utils.ts     ← cn() 等通用工具
    hooks/       ← 自定义 hooks
  types/         ← 共享类型定义
  assets/        ← 静态资源、自定义 SVG 图标
docs/
  ui-development.md     ← UI 开发通用入口（所有开发者/agent 从这里开始）
  ui-guidelines.md      ← 视觉语言、页面组合、模式成熟度与 UI 抽象边界
  design-spec.md        ← 视觉规范（token、字体、间距、圆角、阴影、可访问性）
  chat-ui-reference.md  ← 聊天组件交互参考与默认实现决策
```

## 命令

- `npm run dev` — 启动开发服务器
- `npm run build` — 类型检查 + 构建
- `npm run preview` — 预览构建产物
