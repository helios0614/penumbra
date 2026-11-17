# Penumbra Agent Instructions

## 长期工程原则

每次开发、修复、重构和验收前，必须阅读并遵循 [长期工程原则](docs/engineering-principles.md)。完整原则以该文档为准；本入口适用于 Codex 及其他开发 agent。

核心目标：保留必要防御，清理过度防御，让正常业务自然顺畅。

## 项目规范

- 保留并遵循 `CLAUDE.md` 中的项目特殊规范。
- UI 开发从 `docs/ui-development.md` 开始，并遵循其引用的设计规范。
- 先固化合同测试，再修改实现；每次只切一个明确边界。
- 后端业务事实以 AionHome 为准，Penumbra 不复制后端业务状态机。
- 不覆盖、丢弃或重置已有工作区改动。
