# Diary Chat PR1：入口安全与消息身份契约

交付日期：2026-10-30（Asia/Shanghai）。本轮只修自动投喂默认参数、AionHome 旧 Diary 页的消息协调，并补隔离回归测试。没有接入 Penumbra Diary Chat，也没有实现正文提取或任务状态机。

## 1. 基线与修改范围

| 仓库 | 分支 / HEAD | 开始工作区 | 本轮结果 |
| --- | --- | --- | --- |
| AionHome `/Users/remix/Desktop/AionsHome-main` | `refactor-code-main` / `76b006df89f8beb0dd81ee668fefe95cc7cf04d5` | 干净 | 4 个已有文件修改、3 个测试文件新增 |
| Penumbra `/Users/remix/Desktop/Penumbra` | `main` / `96b4455ef3b4b7eee3e46d21c8b21993794f2896` | 干净 | 仅新增本文 |

已核对 PR0 报告与当前源码。当前 AionHome 没有 `aion-chat/AGENTS.md`，遵守根目录 `AGENTS.md` 及其 runtime model / master plan；本轮属于 Diary Chat PR1 的窄范围行为修复。没有覆盖或清理其他修改，没有暂存、commit、push 或 deploy。

| 文件 | 修改内容 |
| --- | --- |
| [routes/diary.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/diary.py:1005) | 两个投喂入口使用普通布尔默认值；发送/再生成增加兼容 SSE 身份及保存信息 |
| [schedule.py](/Users/remix/Desktop/AionsHome-main/aion-chat/schedule.py:1904) | 定时内部调用显式 `replace_existing=False` |
| [static/diary.html](/Users/remix/Desktop/AionsHome-main/aion-chat/static/diary.html:641) | 三条发送路径共用局部流读取、ID 绑定、WS 合并及收尾；历史刷新隔离和最终重绘 |
| [test_daily_digest_before_diary.py](/Users/remix/Desktop/AionsHome-main/aion-chat/tests/contract/test_daily_digest_before_diary.py:110) | 既有定时链 fake 要求显式传入 false，并保留原顺序断言 |
| [test_diary_pr1_contract.py](/Users/remix/Desktop/AionsHome-main/aion-chat/tests/contract/test_diary_pr1_contract.py:1) | 新增入口安全、HTTP bool 解析、SSE/SQL/WS 身份和内部流消费者测试 |
| [diary_stream_identity.test.cjs](/Users/remix/Desktop/AionsHome-main/aion-chat/tests/contract/diary_stream_identity.test.cjs:1) | 原样执行旧页脚本，以合成 fetch/SSE/WS/历史验证展示和失败恢复 |
| [run_diary_pr1_isolated.py](/Users/remix/Desktop/AionsHome-main/aion-chat/tests/contract/run_diary_pr1_isolated.py:1) | 可重复运行的源码白名单隔离入口，不导入生产应用或个人配置 |

## 2. 自动投喂参数修复

`start_auto_feed(date, replace_existing=False)` 和 `start_history_feed(date, replace_existing=False)` 的默认值现在都是 Python `False`。FastAPI 根据 `bool` 注解继续将其识别为 query 参数，HTTP 解析与内部布尔语义不再共用 `Query` 默认对象。history 委托仍显式转传参数；定时入口也显式传 false。没有抽取或重写整套业务流程。

已保留并测试：

- 已有 done Entry 在 false/true 两种请求下都不替换。
- 已有草稿默认返回原 `diary_draft_exists`、原 entry_id 和 `replace_auto / continue_manual` 选项；重复调用仍返回冲突。
- 显式 true 继续按原语义删除旧 Entry、建立新 ID，再启动首批；没有改成恢复任务或原地替换。
- `2020-01-02` 这样的历史日期仍可启动，不限制为今天，也不套候选列表的90天上限。
- HTTP 缺省、`false/0/true/1` 正确解析；非法布尔值继续422且不写入。
- 日界速记→记忆总结→延迟投喂的前置关系、开关判断和失败策略没有改动。

实现位置：[普通入口](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/diary.py:1740)、[历史入口](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/diary.py:1966)、[定时调用](/Users/remix/Desktop/AionsHome-main/aion-chat/schedule.py:1904)。

## 3. 消息身份契约

只补历史重读后的 render，不能覆盖 WS 先到或历史重读失败。因此采用两个兼容扩展：增加 `start` 帧，在既有 `done` 中附加可空 `message`。原 `chunk`、`error`、`done` 字段及单条回复结束语义保留，WS 的 type、payload、commit 后广播位置不变。

### 3.1 发送（普通消息与素材消息共用后端）

```json
{"type":"start","entry_id":"diary_example","id":"dma_example","user_message_id":"dm_example"}
```

`user_message_id` 是本请求已经保存的 user ID；`id` 是本请求预留的 assistant ID。`start` 在首个生成 chunk 前发出，**不证明 assistant 已保存**，更不证明自动投喂任务完成。

### 3.2 再生成

```json
{"type":"start","entry_id":"diary_example","id":"dma_new","replaced_message_ids":["dma_old","dm_later"]}
```

`replaced_message_ids` 是后端当前再生成流程原本就会删除的精确快照后缀。前端只有确认新消息已持久化后才清除这些 ID；没有根据“最新 assistant”、角色、正文或时间戳推导目标，也没有新增 latest-only 限制。

### 3.3 保存事实与单条结束

```json
{
  "type":"done",
  "drift":"",
  "thinking":"",
  "message":{
    "id":"dma_example",
    "entry_id":"diary_example",
    "role":"assistant",
    "content":"最终清理后的正文",
    "created_at":1234567890.0
  }
}
```

`message` 复用当前回复 commit 后用于广播的对象，有值时可确认该 ID 已保存，且拿到后处理后的正文；非空 DRIFT/Thinking 与原广播一样按需带出。WS wire 仍由原 adapter 将 drift 映射为 simple_think，SSE 保持 drift。

普通发送如果没有产生可保存的 assistant，仍按旧逻辑发 done，但 `message:null`；这只撤下本请求未保存的 overlay，不过滤真实空白消息。再生成失败仍发 error 并早退，保留原消息，不伪造成功 done。普通发送既有的“error 后可能保存部分输出并 done”也保留，前端同时保留失败反馈与真实保存结果。

内部 `_consume_streaming_response` 忽略新增身份字段，原错误拒存逻辑仍有效；旧前端消费者忽略未知 start / done.message 后仍能消费原字段。新增信息没有参与 Prompt、命令解析或消息写入条件。

证据：[发送身份](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/diary.py:1005)、[发送保存对象](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/diary.py:1108)、[再生成身份](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/diary.py:1505)、[再生成提交/回执](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/diary.py:1619)。

## 4. 旧前端协调行为

`sendDiaryMsg`、`sendSelectedMemories`、`regenerateDiaryMsg` 保持各自入口与业务操作，共用页面内的 `readDiaryStream` / `finishDiaryStream`；这不是通用 Chat Runtime 或任务注册表。

1. 本地请求仍先展示临时消息。收到 start 后，将临时 user/assistant ID 精确绑定服务端 ID；真正不同 ID 的相同文本继续分别展示。
2. start 到达前的 WS 消息暂存于当前本地请求；身份帧到达后按 ID 合并。匹配的 WS 或 done.message 到达后，以保存对象为准，后续 raw chunk / done 不再覆盖其正文。
3. 再生成只用当前请求明确关联的成功消息与快照 ID 移除旧后缀；未确认保存时保留原消息副本，失败或结果未知不会留下被清空的原回复。
4. 本地流式期间，定时或其他历史刷新不覆盖增长中的消息。请求开始前已在途的历史读取被序号隔离，不会晚到覆盖流。
5. 结束时读取同 Entry 的持久历史并立即重绘。读取失败不再将消息数组清空，而是保留已收到内容、提示“消息历史读取失败…刷新核对”；已确认保存的 done.message 也能覆盖 WS 丢失/迟到场景。
6. error、断流、无 done 的 EOF 和 HTTP 拒绝保留失败反馈；finally 释放原有本页发送状态。没有自动重发、全局生成锁或永久轮询。

证据：[历史读取](/Users/remix/Desktop/AionsHome-main/aion-chat/static/diary.html:641)、[ID/WS 协调](/Users/remix/Desktop/AionsHome-main/aion-chat/static/diary.html:665)、[流事件处理](/Users/remix/Desktop/AionsHome-main/aion-chat/static/diary.html:700)、[收尾](/Users/remix/Desktop/AionsHome-main/aion-chat/static/diary.html:761)。编辑、删除、提取菜单与允许操作的消息范围没有改动；原有三分钟历史刷新窗口也未延长。

## 5. 验证结果与安全隔离

最终从 AionHome 实际修改文件执行：

```bash
cd /Users/remix/Desktop/AionsHome-main
.venv/bin/python -B aion-chat/tests/contract/run_diary_pr1_isolated.py
git diff --check
```

| 检查 | 结果 |
| --- | --- |
| 既有日界、Diary 手动/再生成、reader calendar 合约 | **75 项通过** |
| 新增入口与身份合约 | **24 项通过**，后端合计 **99 项通过** |
| 旧 Diary 前端合成事件测试 | **26 项通过** |
| Python 修改/新增文件 `py_compile` | 通过，输出仅写临时目录 |
| 真实 HTML 内联脚本与 Node 测试 `node --check` | 通过 |
| AionHome `git diff --check` | 通过；暂存区为空 |

隔离 runner 只复制明确白名单源码与上述测试到临时目录，不复制 data、`.env`、个人配置或 Git 元数据。生产 main/database/diary/schedule 仅按测试需要做 AST 抽取；不导入应用或启动 lifespan。生产 config 模块不导入，只提取其纯 Thinking 解析函数，其他配置接口用 fixture。Python 外连被拒绝；HTTP 使用进程内 ASGI TestClient，数据库为临时合成 SQLite，批次、模型、广播和记忆流程为 fake。Node 通过 VM 执行实际旧页脚本，fetch、SSE reader、WS 回调、历史与界面节点全部为合成对象，没有启动浏览器或服务。

**基线与新增失败的区别：** 先在原始生产源码和原始既有测试上加入新回归 fixtures 验证，再修复。最终 fixtures 回放原始源码时，后端为 `91 passed / 8 failed`，8项失败全部来自新增 PR1 用例（两个默认参数、两个重复调用冲突、两个身份流、失败预留身份、空回复回执），既有75项无基线失败；Node为 `7 passed / 19 failed`。同一组最终fixtures在修复源码上为后端99项、前端26项全通过。测试替身缺失依赖等编写过程问题已校正，没有把它们记为产品基线故障。

前端覆盖 chunk→WS→done、WS→start/chunk→done、成功/失败历史回读、在途历史晚到、error/断流、素材发送、再生成成功/失败、WS延迟、同正文不同ID、真实空白消息、明确空保存回执、精确后缀移除及分片SSE。测试使用ID和最终快照断言，不用正文去重模拟实现。

## 6. 已知限制与后续待办

- 本轮没有建立可靠的整次自动投喂完成或全局 busy 信号。`done` 仍只结束一条回复，`message` 只证明该消息保存；`finished` 和日历 pending 不变。
- 后端 ReadOriginal/NextGroup 的保存与派生任务顺序、批次并发、无任务取消、Entry替换竞争、毫秒ID策略、外键连接策略均未改。PR0记录的这些风险仍需独立边界处理。
- 如果连接在身份帧之前中断、且历史也读取失败，无法可靠关联潜在后台消息。当前保留原回复/现有内容并要求刷新核对，不猜测新ID或自动重试。更新页配旧后端而缺身份字段时，同样依赖成功的历史回读，不承诺该混合版本在失败回读下完整恢复。
- 发送有身份但既无保存回执/WS、又无法读取历史时，已有流式片段可能仍是未确认内容；不会宣称它已保存。再生成在这种情况下恢复原回复，之后用HTTP核对。
- 未做浏览器真实视觉、设备、真实模型、生产数据或全仓集成验收。没有为了全量测试导入个人配置。后续人工可用合成 Entry 检查气泡增长、失败提示、素材发送和旧菜单交互。
- Penumbra Diary Chat、日历启动入口、正文提取、模型设置接线属于后续 PR，本轮未实施。

交付后停止，等待人工验收。两个仓库的 HEAD 均未改变；未触及真实个人数据或线上服务。
