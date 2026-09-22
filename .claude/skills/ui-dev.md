---
description: "UI 开发入口 — 自动指向 Penumbra 通用 UI 规范"
globs:
  - "src/components/**/*.tsx"
  - "src/components/**/*.ts"
  - "src/**/*.css"
  - "src/App.tsx"
---

# UI Development Skill

本 skill 是 Claude 环境的自动触发入口，只做指路适配。
Penumbra 的 UI 规范以 `docs/ui-development.md` 为通用入口，以 `docs/ui-guidelines.md`、`docs/design-spec.md` 和 `docs/chat-ui-reference.md` 为具体规范来源。

开始写 UI 代码前，按任务范围先阅读：

- `docs/ui-development.md`
- `docs/ui-guidelines.md`
- `docs/design-spec.md`
- `docs/chat-ui-reference.md`（涉及聊天 UI 时必读）

执行要求：

- 不在本 skill 中另起一套 UI 标准。
- 如果本文件与 `docs/` 规范冲突，以 `docs/` 为准。
- 写完 UI 代码后，按 `docs/ui-development.md` 的检查清单自查。
