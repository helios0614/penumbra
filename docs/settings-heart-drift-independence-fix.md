# HEART / DRIFT 历史回显与生成控制解耦

2026-11-11 · 本记录描述修复后的行为，修复前的证据见 [配置独立性复审](./settings-heart-drift-independence-audit.md)。

## 门控与默认值

| 字段 | 缺失时 | 实际作用 |
| --- | --- | --- |
| `include_heart` | 开 | 独立控制已存 HEART 和旧 assistant 正文内嵌 HEART 的回注。 |
| `include_drift` | 开 | 独立控制已存 DRIFT 的回注，兼容 `include_simplethink`。 |
| `enable_hidden_heart` | 开 | 控制生成指令。生成关闭时沿用现有的意外输出处理。 |
| `enable_hidden_drift` | 开 | 控制生成指令。生成关闭时沿用现有的意外输出处理，兼容 `enable_hidden_simplethink`。 |

新建配置、运行时缺字段和 GET `/api/settings` 的缺字段投影一致。现代 DRIFT 字段优先于旧别名，旧别名迁移保留原值。现有 `false` 原样读取，包括过去由初始化写入的 `false`。单凭落盘值无法区分初始化与用户选择，需要时可在 Chat 高级控制手动开启相应字段。已有「生成关、回显开」的配置会在后续请求开始回注已有历史。 [初始化](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:67) · [运行时](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:185) · [HTTP 投影](/Users/remix/Desktop/AionsHome-main/aion-chat/settings_secret_projection.py:75)

本机 AionHome 的 `settings.json` 缺少四个现代字段和两个旧别名。以当前文件为准，使用新代码启动后会按全开处理，无需写入配置或迁移历史。此次未修改配置文件或数据库。其他实例的实际值需以各自配置为准。

## 消费路径

Main 的普通发送、普通重生成和指定消息重生成，以及 Diary 的普通对话和重生成继续使用共享历史读取函数。Memory HEART 原文召回、Diary 查看记忆原文、Anthropic 的冻结区／滑动区／普通历史构造、速记 Step 2 也使用同一历史门控。历史清洗按回显偏好处理旧内嵌 HEART，DRIFT 标记继续与普通正文分开处理。速记 Step 1 仍直接读取生成开关决定是否向辅助模型提供 DRIFT，缺字段时会使用本轮统一的新默认。 [Main](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py:1550) · [Diary](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/diary.py:921) · [Memory](/Users/remix/Desktop/AionsHome-main/aion-chat/memory.py:447) · [Anthropic Builder](/Users/remix/Desktop/AionsHome-main/aion-chat/prompts/builder.py:645) · [速记 Step 1](/Users/remix/Desktop/AionsHome-main/aion-chat/schedule.py:1113) · [速记 Step 2](/Users/remix/Desktop/AionsHome-main/aion-chat/schedule.py:1243)

生成结果继续使用现有解析、持久化和流式事件。切换回显只影响模型的后续上下文，已存历史仍由原消息读取与心语入口提供。Penumbra 仅更新高级控制提示，两个开关仍分别写入并读回。 [高级控制](/Users/remix/Desktop/Penumbra/src/components/chat/ChatAdvancedSettings.tsx:26)

## 验收

HEART 和 DRIFT 各自核对了四种组合。生成指令的验证覆盖支持现有指令的路径，旧版 OpenAI 的能力过滤见下节。

| 生成 | 回显 | 验证结果 |
| --- | --- | --- |
| 开 | 开 | 组装生成指令，回注已选历史，新输出可解析和保存。 |
| 开 | 关 | Prompt 不带已存历史，仍能生成、流式返回和保存新内容。旧 DRIFT 和 HEART 继续可读，重新打开回显后，旧记录可再次进入 Prompt。 |
| 关 | 开 | 省略生成指令，回注已选历史。单个意外标记按现有输出契约处理。 |
| 关 | 关 | 省略生成指令，停止回注已选历史。保存的旧记录仍可读取。 |

- **AionHome 定向回归 318 项通过。** 使用临时 SQLite、合成 Provider 和实际路由／Prompt 构造，覆盖 Main 三条路径、Diary 两条路径、Memory HEART 原文、Anthropic 缓存历史、速记 Step 2、新建和缺失字段默认、显式关闭与旧别名迁移。另验证共享构造器用于闹铃时，关闭生成后仍可回注历史。 [路由与持久化矩阵](/Users/remix/Desktop/AionsHome-main/aion-chat/tests/contract/test_drift_display_contract.py) · [实际 Main payload](/Users/remix/Desktop/AionsHome-main/aion-chat/tests/contract/test_main_capability_exposure.py:155) · [默认值与兼容](/Users/remix/Desktop/AionsHome-main/aion-chat/tests/contract/test_drift_compatibility.py:156)
- **AionHome 全量契约回归 4,118 项通过、34 项失败。** 逐项对照修复前的隔离运行，34 项失败均可在基线复现。本次两边仓库的 `git diff --check` 通过。
- **Penumbra TypeScript 和 56 项定向测试通过。** 320、390、1280px 合成浏览器验证通过，覆盖生成开／回显关时的 DRIFT 流式展示、历史刷新以及四字段分别写入。测试未连接真实 Provider。 [流式浏览器测试](../tests/browser/chat-thinking-smoke.cjs) · [设置浏览器测试](../tests/browser/chat-advanced-settings-smoke.cjs)

## 暂缓事项

- Main 指定消息重生成仍有重复或未闭合标记的输出清洗边界问题。
- Diary 流式预览仍沿用现有机制，额外的生成许可过滤暂缓。
- 旧版 OpenAI 的能力块过滤沿用现有行为。
- Diary HEART 的历史查看入口仍与 Main 有差异。
