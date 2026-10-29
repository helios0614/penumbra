# Memory Library 原文查看与操作状态修正

日期：2026-10-29。基线：Penumbra `63dd0e8`、AionHome 后端 `ecb9ab4`。开始时两个工作区均干净。本轮只修改 Penumbra 前端和验证材料，没有读取真实记忆、调用真实总结、修改后端、commit、push 或 deploy。

## 1. 审计结论

### 原文读取契约

已复核后端 `aion-chat/routes/memories.py` 的 `GET /api/memories/{mem_id}/source`，及旧版 `aion-chat/static/memory.html` 的 `viewSource`：

```json
{"ok":true,"messages":[{"role":"user","name":"用户","content":"原始正文","created_at":1.5}]}
```

没有可追溯时间范围或记忆不存在时，当前接口返回 HTTP 200、`{"ok":false,"message":"该记忆没有可追溯的原文"}`。成功但找不到消息时返回空数组。读取使用现有带 Cookie 的 typed HTTP client，只发 GET，ID 经 URL 编码。

当前列表 DTO 有 `source_conv`、`source_start_ts`、`source_end_ts`，没有来源消息 ID；`/source` 的返回行也没有消息 ID 或会话 ID。后端精确来源清单虽用于 requeue 校验，尚未在这些读取接口中公开。因此本轮没有把 `source_conv`、时间戳、返回数组序号或第一条消息推断成定位锚点。

当前 `/source` 按记忆的起止时间全局查询 `user/assistant`、`is_carryover = 0` 的消息，按 `created_at, id` 升序返回，**没有按 `source_conv` 过滤，也没有采用精确来源清单**。原文弹窗明确标为“时间范围内的聊天记录”，保留接口返回顺序；它不证明这些行就是精确的重新总结材料。

通用 `ConversationContextDialog` 原有的 `conversationId + messageId` 读取、身份校验、邻近消息窗口与公开内容约束继续保留，相关回归通过。当前 Memory API 没有提供可接入此路径的可靠消息 ID，因此 Memory 使用无锚点的来源行阅读分支，共享弹窗与气泡外观，没有伪造上下文。

### 来源按钮为什么禁用

按钮由实际 `requeue-source` 响应控制，不由时间范围是否存在控制。已有原因映射正确，继续区分：

| 原因 | 含义及处理 |
| --- | --- |
| `source_untracked` | 无可信精确来源清单，继续禁用；能查看时间范围原文也不能放开组合删除 |
| `source_missing` | 部分原始消息缺失，继续禁用 |
| `source_changed` | 来源内容或关联属性变化，继续禁用 |
| `source_not_historical` | 含尚未越过正常摘要进度的来源，等待正常总结后重新预检 |
| `source_already_represented` | 其他有效记忆表示相同材料，继续禁用，不删除其他记忆 |
| `source_requeue_pending` | 相同材料已有待处理任务，保留执行接口的冲突原因 |

后端普通 digest 不为既有旧记忆补建精确来源，所以旧记录的 `source_untracked` 不会因无关批量总结自动消失。前端没有把所有冲突归为 `source_untracked`。

本轮没有访问用户的实际记录，不能断言用户所见的某条记忆具体返回了哪个原因；确认的是源码链路与合成响应。菜单每次打开仍发起新的预检，确认窗再次预检，组合接口仍负责最终校验。

## 2. 发现并修正的状态问题

1. **写操作前后的预检生命周期缺口。** 之前批量总结既不取消跨越该写操作的旧预检，也不刷新已读的来源状态；结果可能与总结后的服务端状态不一致。现在写操作开始时取消旧预检、使已缓存的能力失效；结束后重新检查用户曾打开过的来源。批量期间不另起预检。Abort 与请求归属保护继续阻止较早响应覆盖较新结果。
2. **任务查询延长批量写锁。** 之前 `digestPending` 直到已知 pending 任务查询全部结束才释放，任务读取慢或超时会拖延其他操作。现在 digest 请求及列表 GET 对账结束后即释放锁，来源和任务查询独立完成，保留各自读取中/失败反馈。
3. 单条编辑或重新总结后也刷新已读来源；普通/组合删除成功后移除目标的来源缓存。组合失败时保留执行接口的真实冲突，不立即用可能仍通过的 GET 预检覆盖它。网络结果不确定时保留同 ID 幂等重试以取回后端回执，列表仅以随后 GET 为准，不宣称删除或入队已成功。

本轮没有发现“批量总结会把所有来源永久改成不可用”的证据；修复的是上述可复现的缓存、过期读取及锁释放问题。

## 3. 原文入口与阅读体验

- `ScrollText` 仅图标入口放在原有元信息操作组，与 Pin、更多操作同行；`title`、`aria-label` 均为“查看原文”，44px 独立目标，触屏可直接点击。
- 保留连续阅读面板，没有新增底部操作行或外层卡片。Header 总结图标换为 `BrainCircuit`，按钮形状、尺寸、位置及刷新图标不变。
- 原文复用现有 Mist Dialog、视口高度、移动端 Back、焦点和滚动行为；与通用对话查看器共享只读气泡。
- 普通消息正文逐字展示为不可执行的纯文本，保留换行；不启用远程媒体、消息编辑、regenerate 或任何消息写操作。
- 若来源接口返回合法的 `system` 行，保留为紧凑事件阅读样式。当前后端主动排除系统消息，前端不能补取没有返回的记录。
- 区分加载、来源不可用、空范围、读取失败；失败可重新读取。错误不显示原始服务端私有详情。切换来源、关闭/卸载、重试均取消在途请求并隔离旧结果；重新打开重新 GET。

## 4. 修改文件及职责

| 文件 | 职责 |
| --- | --- |
| `src/domain/memory/memory-source.ts`、`index.ts` | 原文读取类型、严格映射与 `/source` GET；不生成消息锚点 |
| `src/components/memory/MemorySourceDialog.tsx` | 原文读取生命周期、失败重试、空来源及来源行展示 |
| `src/components/memory/MemoryItem.tsx` | 元信息区的原文图标入口 |
| `src/components/memory/MemoryView.tsx` | 打开/关闭来源弹窗，Header 总结图标 |
| `src/components/chat/ReadonlyConversationDialog.tsx` | 两种实际来源共用的只读 Dialog 外观、反馈及框架行为 |
| `src/components/chat/ReadonlyMessageBubble.tsx` | 共用气泡容器、角色名称与时间 |
| `src/components/chat/ConversationContextDialog.tsx`、`ReadonlyConversation.tsx` | 消费上述共享展示组件；保留原有上下文读取和公开内容规则 |
| `src/application/memory-management/memory-management-controller.ts` | 预检失效/刷新、写锁释放与组合操作结果保护 |
| `src/domain/memory/memory-source.test.ts` | 原文契约、角色/时间格式、空来源、请求编码/认证/失败/取消 |
| `src/components/memory/MemorySourceDialog.test.tsx` | 原文各状态、重试、过期响应、卸载、只读与图标位置 |
| `src/application/memory-management/memory-management.test.ts` | 来源 A–D 情形、批量前后状态、冲突、网络异常及锁释放 |
| `src/components/chat/ConversationContextDialog.test.tsx` | 共享展示层提取后的断言；原有身份与取消回归保留 |
| `tests/browser/memory-library-smoke.cjs` | 扩展现有合成验收脚本，覆盖原文与批量前后状态 |

没有修改后端、数据库、Prompt、消息写链路、召回算法或 API 契约。构建生成的已跟踪缓存文件不作为交付修改。

## 5. 验证

- `npm test`：**191 个文件、2581 条测试通过**。
- `npm run build`：类型检查及 Vite 构建通过；仍有既有的大 chunk 提示，不影响构建。
- 合成浏览器测试：**320px、390px、1280px** 均通过，分别 81 次 mock API 请求，运行时错误 0。外部请求全部阻断，未连接 AionHome；覆盖原文读取、系统行、空来源、失败重试、Back、菜单/弹窗布局与只读约束。
- 同一脚本继续验证每页 30 条、日期默认全部、搜索/时间筛选、Pin 优先、展开收起、编辑失败保留草稿、单条重新总结、普通删除及末页回退、组合冲突/入队、digest 正常/空/失败结果、任务完成刷新及卸载取消。
- 来源回归覆盖：旧来源总结后仍不支持；原本可用且总结后仍可用；服务端改为缺失/变化/冲突/pending 时采用新原因；跨越总结的旧响应被取消；任务/来源查询未完成时写锁已释放；组合操作失败或网络异常不假定删除和入队成功。
- 原文来源形态覆盖：有 `source_conv` 但无消息 ID、仅时间范围、元数据缺失、无来源/空数组、合法不同角色、非法角色/时间结构。不存在精确消息 ID 时不会调用上下文窗口接口。
- 临时日志：`/private/tmp/memory-source-full.log`、`/private/tmp/memory-source-build.log`、`/private/tmp/memory-source-browser.log`。合成截图：`/private/tmp/penumbra-memory-library-smoke/`。

## 6. 后端限制与验收边界

1. `/source` 仍是全局时间范围读取，不保证会话隔离或与精确材料清单相同；精确消息定位需要后端公开可信消息/会话 ID。本轮没有在前端猜测或扩大查询。
2. 当前 `/source` 不返回系统消息；前端已支持合法系统行展示，但无法验证真实后端返回系统行的端到端场景。
3. 来源 GET 预检没有覆盖组合写事务的全部 pending 冲突；不能把预检通过当成执行成功。执行返回 409 时继续禁用并显示具体原因，允许显式重新检查。
4. 任务仍只有 `pending/completed`，没有 running 状态或全局任务列表。沿用入队后、手动查询、批量总结后的一次查询，不做永久轮询；其他设备处理任务时不能实时推送更新，离开页面后不恢复未知任务。网络丢失组合回执时可在当前确认窗同 ID 重试取回，关闭后不能凭前端猜测任务 ID。
5. 没有调用真实辅助模型或真实用户来源。后端数据准确性、真实网络与模型运行由人工验收；前端合成回归未发现现有 Memory 功能回归。

本轮完成，等待人工验收。
