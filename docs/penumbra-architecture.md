# Penumbra 前端架构原则

> 最后更新：2026-07-31

导航：[架构原则](./penumbra-architecture.md) · [迁移路线图](./frontend-migration-plan.md) · [前端契约](./frontend-contracts.md)

本文定义 Penumbra 前端重构的长期边界。它是后续前端任务的稳定约束，不记录短期排期，也不复制 AionsHome 的完整后端规范。

## 1. 项目定位

- Penumbra 是 AionsHome 的新前端。
- 现有 AionsHome 后端仍是唯一事实来源。
- 前端采用增量替换，不进行大爆炸重写。
- 新前端不要求复刻旧前端的内部实现，只保留经过确认的真实能力、交互语义和契约。
- 旧前端可作为能力与兼容性参考，但不是新前端的目标架构。

## 2. 核心数据流

```text
UI / React Hook
       ↓
View Model
       ↓
Domain Client / Adapter / Mapper
       ↓
HTTP / WebSocket / Stream Transport
       ↓
Existing AionsHome Backend
```

各层只承担一种主要职责：

- **UI / React Hook**：渲染、收集用户输入、维护局部交互状态，并调用领域能力；不处理传输细节或后端兼容分支。
- **View Model**：向 UI 提供稳定、可直接展示的结构和明确的 loading、empty、error 状态；不暴露原始后端 DTO。
- **Domain Client / Adapter / Mapper**：调用领域 endpoint，解析和归一化 DTO，将 stream 或 WebSocket event 转为领域更新，并隔离后端历史差异。
- **Transport**：处理 URL、credentials、timeout、序列化、连接、重连和底层错误；不包含 Chat、Schedule 等领域规则。
- **Existing AionsHome Backend**：拥有业务状态机、持久化、命令执行和跨领域副作用，是业务事实的最终裁决者。

同一职责应只有一个明确归属。兼容逻辑不得同时散落在 transport、hook 和组件中。

## 3. 强制架构原则

- 后端是 conversation、message 和其他业务状态的事实来源。
- 不在前端复制后端状态机。
- 页面和组件不得直接调用 `fetch`。
- 环境变量只能通过统一的 `src/lib/runtime-config.ts` 读取。
- HTTP 请求统一通过 `src/lib/api.ts` 提供的 transport 能力。
- 上传和 WebSocket 必须使用统一的 runtime URL resolution。
- 原始后端 DTO 不得直接进入普通 UI 组件。
- 后端 DTO 必须通过 domain client、adapter 或 mapper 转换。
- UI 优先依赖稳定的 view model。
- 前端可以维护输入、选择、展开、loading 和 optimistic placeholder 等交互状态，但不能伪造业务完成状态。
- mock 数据只用于原型，不得继续演化为真实业务事实来源。
- 错误展示必须区分用户可理解的信息和仅供开发诊断的详情。
- secret 不得传入普通展示组件或直接显示。
- 前端不得解析 command 文本来重新实现后端 command grammar 或触发业务副作用；隐藏 command marker 只能是显示层过滤。
- 不擅自改变 WebSocket event type、payload 或 timing。
- 不擅自改变 message persistence。
- 不擅自改变 prompt 输入顺序。
- 不擅自改变 command side effect 顺序。

## 4. 代码组织原则

- 保留 Penumbra 当前以 `src/components`、`src/widgets` 和 `src/lib` 为主的结构，按最小改动演进。
- 领域 client、DTO 和 mapper 优先放在最邻近的现有领域位置；只有出现明确复用需求时才提升为共享模块。
- 不为了追求理想目录一次性搬动现有文件，也不预先创建尚无实现需要的复杂分层目录。
- 通用 runtime config、HTTP、WebSocket 和 stream transport 放在 `src/lib`。
- Chat、Schedule、Memory 等领域规则不得塞入通用 transport。
- React 组件只消费 normalized domain type 或 view model，不负责兼容 JSON string/list、缺失字段或历史 DTO 差异。

## 5. 开发流程

1. 只读扫描相关前端、后端契约和当前工作区状态。
2. 明确本次任务的最小边界与不可变契约。
3. 以可独立审查和回退的小 PR 实施。
4. 审查完整 diff，确认没有夹带无关改动。
5. 运行与变更相关的测试和构建。
6. 记录尚未确认的契约与遗留风险。
7. 不顺手修改无关代码。

## 6. 权威来源

- AionsHome 后端当前实现、后端契约测试及其强制文档，是运行语义的权威来源。
- 重点入口包括 AionsHome 的 `docs/aionhome-runtime-model.md`、`docs/aionhome-refactor-master-plan.md`、`docs/chat-message-dto-contract.md`、`docs/ws-event-contract.md` 和相关 contract tests。
- Penumbra 文档只记录新前端必须遵守的边界，不在两个仓库中复制两份完整后端规范。
- 出现冲突时，以 AionsHome 当前后端实现、契约测试和强制文档为准；Penumbra 必须明确记录差异和待确认项，不能用前端假设覆盖后端事实。
