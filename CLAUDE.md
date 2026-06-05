# Penumbra

Penumbra 是一个基于 React + Vite + Tailwind CSS + shadcn/ui 的个人助理应用。

## UI 开发规范

写任何 UI 代码前，先执行 `ui-dev` skill，阅读 `docs/design-spec.md` 和 `docs/chat-ui-reference.md`。

核心原则：
- 优先用 shadcn 组件，在其上扩展
- 样式严格跟 design-spec 走，颜色用 CSS 变量，间距用 Tailwind 网格
- Tailwind class 优先，禁止无理由使用 `style={{}}`
- 组件化拆分，一个文件不超过 300 行

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
  design-spec.md        ← 视觉规范（颜色、字体、间距、圆角、阴影）
  chat-ui-reference.md  ← 聊天组件交互参考
```

## 命令

- `npm run dev` — 启动开发服务器
- `npm run build` — 类型检查 + 构建
- `npm run preview` — 预览构建产物
