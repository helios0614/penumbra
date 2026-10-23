# Chat 日常交互验收修正

日期：2026-10-23（Asia/Shanghai）。开始前工作区干净；基线为 `f84d786 fix(chat): refine composer interactions and generation feedback`。未 commit、push 或部署。

## 修改与边界

| 文件 | 改动 |
|---|---|
| `src/components/chat/chat.css` | 单层文字 / 按钮中心轴计入 Paper/Mist 的 1px 边框；保留双层布局、最大高度与 200ms 过渡 |
| `Sender.tsx` | Composer 附近的反馈插槽；模型 Popover 保持挂载，关闭后不会丢失未完成的保存队列或编辑内容 |
| `ChatView.tsx` | 将发送异常从顶部通知移至 Composer 附近；适配原恢复回调；模型编辑器只按会话 ID 定位，防止 readback 导致整个编辑器重新挂载 |
| 新增 `ChatExecutionFeedback.tsx` | 简短状态入口 + 按需展开的说明 / 只读刷新 / 人工返回编辑；使用现有 Popover、ScrollArea、Button |
| `MainModelSelection.tsx` | 中文日常模型切换，接口格式与完整身份放入详细信息；摘要严格读取已确认配置，待应用草稿单独标识 |
| 新增 `useMainModelSelectionDraft.ts` | 只管理 UI 草稿、完成编辑事件与串行保存意图，继续调用 PR1 `onSave` / `onRefresh`；不请求 API，不引入配置或协议兼容性系统 |
| `src/components/ui/popover.tsx` | 可选透传 Base UI Portal 的 `keepMounted`；其他调用的默认行为不变 |
| 测试 | `MainModelSelection.test.tsx`、`ChatExecutionFeedback.test.tsx`、`Sender.interactions.test.tsx`、`ChatView.test.tsx` |

没有修改 AionHome、application、domain、Main Workspace / Send / Realtime Controller、Runtime Binding、持久化、SSE/WS、命令、canonical regenerate 或 Diary。未处理 canceled/524、断流自动回填、部分正文丢失，也未接入 PR3 功能。

## 单层 Composer 的盒模型

原来的 52px / 60px 外框使用固定 14px / 18px 顶部 padding，而 textarea 自己没有边框，Composer 表面另有上下各 1px 边框；按钮独立距底 8px。结果文字行框中心比按钮中心低 2px。

保留字号 16px、line-height 24px、原有 36px / 44px 点击区域和图标尺寸，改为对边框计数后的对称计算：

| 形态 | 文字中心 | 按钮中心 |
|---|---|---|
| PC 单行 52px | `1 + 13 + 24/2 = 26` | `52 - 1 - 7 - 36/2 = 26` |
| 手机单行 60px | `1 + 17 + 24/2 = 30` | `60 - 1 - 7 - 44/2 = 30` |

textarea 和测量镜像明确继承同一字体、字重和字距，避免浏览器表单字体与文字镜像分离。未增加 translateY 或图标位移；手机双层仍保留原 padding 和距底 8px 工具栏。多行高度、textarea 节点、草稿 revision、IME、提交保护与 reduced-motion 沿用原逻辑。字体实际字面重心和不同系统 fallback 的最终观感仍需人工确认，盒模型测试不等于真机字体视觉测试。

## 异常与结果未知

顶部不再铺开生成错误、长说明和恢复按钮。Composer 附近默认只有“回复结果待确认”或“回复状态需要处理”的单行入口，正文阅读区保留原消息与必要的消息状态。详细安全错误、刷新按钮和人工返回编辑都在 Popover 中，按需打开；窄屏 / 短视口通过既有隐藏滚动条 ScrollArea 滚动。

- 结果未知保持未知，不作为成功或明确失败处理。
- “刷新状态”仍调用原 `retryFinalization` 和 Workspace HTTP 刷新；不调用 send / regenerate，不自动重发。
- 刷新只说明读取了历史，不说明后台任务结束；仅原 `recoveryReadSucceeded` 为真时才提供“已核对历史，返回编辑”。
- 操作前明确说明返回编辑不会停止后台任务，提醒核对历史、避免重复提交。
- 刷新使用同步 ref 锁和 busy 状态防重复点击；刷新出错保留安全反馈。
- 普通失败有简短入口及具体安全说明；Readiness / 配置不可用继续在 Composer 状态区和模型状态处提供反馈。输入占位不再重复显示整段错误文案。

没有改变恢复状态机、未知结果释放条件或生成执行行为。

## 日常模型切换

第一层展示当前生效模型、友好连接名、模型状态，以及连接 / 模型名称两个常用控件。接口格式位于“详细信息”，原始 ID、协议标识、Runtime 与完整后台影响说明不默认铺开。保留短说明：“切换模型也可能影响知远之后的主动消息与提醒。”

1. 选择连接时，仅取该连接的 `default_model` 预填模型名称；当前接口格式原样保留，不清空、不自动切换、不从连接 transport 推导。
2. 连接、接口格式和模型名称都非空时自动提交完整预设；默认模型为空时保持可编辑，不提交。
3. 手输模型名称仅修改草稿，失焦或非 IME 的 Enter 才提交；不逐字符保存。Enter 随后 blur 会合并为同一次选择，不重复 PUT。
4. 高级编辑中明确选择接口格式时，同样在组合完整后提交。候选只使用服务端的全局 `allowedProtocols` 和当前已存值；不使用连接的推导 `protocols` 作为 UI gate，也不新增前端兼容性校验。
5. 快速连续选择时，当前保存必须先完成原 PUT + readback，随后只保存最后一个排队意图。不会取消已发 PUT 来制造请求乱序。排队期间控件仍能接收后续选择，发送 / 重生成 UI 保持锁定。
6. 旧 readback 更新“当前生效模型”，不会覆盖新草稿；只有最后选择完成 readback 后才显示切换确认。菜单关闭不清空队列；切换会话 / 卸载会清空旧会话的待发意图，旧响应仍由 PR1 owner/sequence 保护。
7. 保存拒绝或无法确认时停止排队，保留最新草稿，不静默切换其他连接 / 接口格式。已知服务端原因使用安全中文映射；未知原始错误不直接回显。用户可只读“刷新状态”，再明确“重试切换”。

服务端 configuration / Readiness 仍是已存身份与执行资格权威；本地 UI 草稿和提示不伪造生效。原 PR1 MainConfiguration 读取契约没有修改，也没有增加 Connection 配置字段。

## 自动验证

测试全部使用合成数据、mock fetch/SSE、组件回调及人工几何，没有读取真实聊天或个人信息，没有调用真实模型。

新增 / 调整验证包括：盒模型中心轴、双层 / 200ms / 无 translate 偏移；恢复入口的展开 / 收起与可访问名称；只读刷新锁、未知状态释放条件与安全说明；接口格式保留、默认模型填入、缺失默认不提交、输入完成时机、Enter/blur 去重、快速切换合并、失败停止队列、刷新不新增 PUT、旧 / 新身份区分、卸载不再提交旧意图，以及通过真实前端 Workspace Controller 的 PUT / readback / Readiness 集成。

| 检查 | 结果 |
|---|---|
| 相关回归 | 28 个文件、459 项通过；随后补充的只读刷新草稿测试纳入全量 |
| 全量测试 | `npm test -- --reporter=dot`：115 个文件、1731 项通过 |
| `npx tsc --noEmit` | 通过 |
| `npm run build` | TypeScript build 与 Vite production build 通过 |
| `git diff --check` | 通过；已还原生成的 tsbuildinfo、清理临时日志 |

## PC / 手机人工验收

1. **单层视觉**：空输入、中文、英文、数字、标点混排，检查文字与 `+` / 发送图标重心。PC 和手机分别检查 36px / 44px 点击区、真实字体 fallback、浏览器缩放。输入多行、失焦、再次聚焦、横竖屏切换，确认双层和 200ms 过渡不回归，历史阅读不被拉到底。
2. **恢复入口**：在专用合成测试会话模拟未知与普通失败，确认顶部没有大块恢复说明；入口打开后可滚动、外部点击 / Escape 关闭，键盘可到刷新与返回编辑。历史读取失败不能返回编辑；读取成功但结果仍未知时，说明和按钮仍明确“不停止后台”。网络中不得出现自动第二次 send / regenerate。
3. **日常切换**：在默认模型不同的连接间快速连续切换，核对当前接口格式始终保持原值；请求逐次 PUT + readback，最后选择最终生效，保存中发送按钮不可用，摘要不提前显示新模型已生效。
4. **手动编辑与失败**：无默认模型的连接不提交空值；输入模型名称期间无 PUT，失焦 / Enter 后保存。测试后端拒绝和 readback 失败，编辑内容保留；刷新只读取、不写入，明确重试才再次保存。高级接口格式修改独立生效，无 silent fallback。
5. **浮层**：手机键盘打开、短视口、长连接名 / 模型名、嵌套 Select、触摸 / 滚轮 / 键盘滚动、菜单关闭后请求完成、切会话时仍有排队意图；检查隐藏滚动条、焦点返回和 Composer 交互可达。

尚未进行真实浏览器视觉、真机键盘或真实服务联调；自动测试不能确认字体光学居中、软键盘动画、原生选区或触屏命中效果。
