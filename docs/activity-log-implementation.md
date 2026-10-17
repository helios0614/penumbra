# Activity Log 首版迁移与人工验收说明

实现日期：2026-10-17。仅修改 Penumbra；不修改 AionHome、Android、手机采样契约或 AI 上下文；未 commit、部署或运行浏览器自动化。

## 1. 文件与入口

新增 Domain：

- `src/domain/activity/activity-types.ts`
- `src/domain/activity/activity-mappers.ts`
- `src/domain/activity/activity-client.ts`
- `src/domain/activity/activity.test.ts`
- `src/domain/activity/index.ts`
- `src/domain/device-context/device-context-types.ts`
- `src/domain/device-context/device-context-mappers.ts`
- `src/domain/device-context/device-context-client.ts`
- `src/domain/device-context/device-context.test.ts`
- `src/domain/device-context/index.ts`

新增 Application：

- `src/application/activity/activity-state.ts`：独立读取资源、操作状态和安全错误文案。
- `src/application/activity/activity-presentation.ts`：事件筛选、计数、展示映射及服务端有效截止时间的显示判断。
- `src/application/activity/activity-controller.ts`：请求取消与竞争隔离、完整快照重读、独立到期调度、配置写入与写后读取恢复。
- `src/application/activity/activity-controller.test.ts`
- `src/application/activity/activity-realtime.ts`：WebSocket 订阅、重连、恢复可见与低频对账。
- `src/application/activity/activity-realtime.test.ts`

新增 Feature：

- `src/components/activity/ActivityView.tsx`：PageHeader、次级菜单、反馈和页面组合。
- `src/components/activity/PhoneStatusPanel.tsx`：紧凑手机状态和 AI 可见性权限。
- `src/components/activity/WifiSceneSettings.tsx`：默认折叠的标记列表与配置表单。
- `src/components/activity/ActivityControls.tsx`：时间/归档日期与设备筛选。
- `src/components/activity/ActivityTimeline.tsx`：连续阅读列表、可展开标题与前端分批渲染。
- `src/components/activity/ActivityDialogs.tsx`：独立最近三小时摘要及全量清空确认。
- `src/components/activity/useActivity.ts`：React 生命周期接入及完整清理。
- `src/components/activity/activity.css`：局部复用 Memory/Quick Note 已有阅读材质。
- `src/components/activity/ActivityPresentation.test.tsx`

修改：

- `src/components/apps/DesktopAppView.tsx`、`DesktopAppView.test.tsx`：注册独立 `activity` 应用，lazy 加载，共用关闭行为，避免重复 Header/玻璃外壳。
- `src/components/desktop/DesktopApps.tsx`、`src/components/desktop-v2/EditorialQuickApps.tsx`：两个桌面入口及对应网格/数量。
- `src/application/realtime/realtime-types.ts`、`realtime-dto.ts`、`realtime-events.ts`：活动事件与旧活动配置通知适配。
- `src/application/realtime-reconciliation/realtime-reconciliation-plan.ts`、`src/application/chat-realtime/chat-realtime-coordinator.ts`：既有聊天消费者继续忽略活动通知，不触发聊天读取或写入。
- 本说明。

入口为标准桌面“活动日志”与 `/app/activity`，实验桌面入口与 `/editorial/app/activity`。沿用现有应用路由和关闭/返回实现。

## 2. 实际接口

| 能力 | 接口与语义 |
| --- | --- |
| 最近活动 | GET `/api/activity/recent?hours=3`；完整集合，无服务端分页 |
| 归档日期 | GET `/api/activity/dates`；仅提供服务端实际保存的日期 |
| 日期活动 | GET `/api/activity/logs/{date_str}`；日期作为归档文件键传递，不从浏览器时区推算 Unix 查询区间 |
| 规则摘要 | GET `/api/activity/summary?hours=3`；独立于页面日期和设备筛选 |
| 全部清空 | POST `/api/activity/clear`；删除全部活动 JSONL 文件；`deleted` 是文件数 |
| 旧联动状态 | GET `/api/activity/config`；仅只读，不提供旧开关或对应 PUT |
| 绑定手机快照 | GET `/api/device-context/status`；使用真实的 `fresh`、`reason`、`availability`、独立采样时间及 `expires_at` |
| 手机 AI 权限 | GET `/api/settings`，PUT `/api/settings` 仅发送 `device_context_ai_visible` |
| Wi-Fi 标记 | GET/PUT `/api/device-context/wifi-config`；PUT 发送原始 `revision` 与完整 `mappings`，保留 409 并发冲突保护 |

旧 HTML 实际只有最近三小时和按日期，未发现其他既有小时选项，首版不增加新的小时预设。PC tracker 诊断接口不作为采集器正常运行的推断依据，首版未增设控制页。

## 3. 同步、时间和身份

`activity_log` 被投影为时间戳/设备的失效通知，不直接追加推送内容。600ms 合并通知后重读当前最近范围；读取中收到通知会在完成后再次读取。每次 HTTP 完整结果替换当前集合，避免初始 GET 与推送边界重复，以及 PC 推送/HTTP 名称解析不一致。

记录按 Unix 时间倒序；同时间按完整值元组及相同元组内的出现序号稳定排序。身份不是数组下标，也不按“应用名称相同”去重；服务端确实保存的完全相同事件仍保持原有条数。原始时间戳、服务端日期/时分与来源均保留。

列表与采样时间使用浏览器时区，并在页面说明；跨日分组来自完整时间戳。日期筛选使用服务端归档日期，不把 `HH:mm:ss` 反推成完整日期。摘要接口只提供窗口时分，没有绝对日期，前端保留原文并说明限制。

订阅断线按 1、2、4、8、16、30 秒上限退避；1008 停止自动 WebSocket 重连并提供手动入口。连接建立/恢复和页面重新可见时重新读取。最近范围每 60 秒做完整读取，以补齐 PC 仅落盘未广播的采样；手机状态/权限/标记每 30 秒重读服务端快照。页面隐藏时暂停这些定期读取。归档视图不因新活动推送插入最新事件。

电量与 Wi-Fi 分别依据后端的截止时间安排显示失效；使用服务端 `evaluated_at` 与单调时钟经过时长，避免浏览器/服务端时钟差影响 TTL。即使一次重读正在等待，另一组到期仍会独立失效。不会在前端另设手机状态 TTL、映射缓存或场景识别规则。

应用层保存整个当前查询集合，初次渲染 200 条，每次继续显示 200 条。计数始终来自完整集合，显示数量不是服务端分页。对账替换完整集合避免不断追加；更新不会主动回滚到底部。仅主动切换查询/设备时回到顶部。

卸载会取消读取和写入等待，忽略迟到响应，关闭 WebSocket，清理重连、对账、到期及合并计时器和可见性监听。读取恢复不重发写入；Wi-Fi 保存冲突/结果未知和全量清空后均以 GET 核对，不自动重复提交。

## 4. 保留的功能与参考图差异

保留手机快照刷新、AI 手机状态权限、Wi-Fi 查看/新增/改场景/移除、最近与日期查询、全部/电脑/手机筛选、事件数、活动刷新、规则摘要、全量清空危险确认和桌面关闭。

遵循真实 PageHeader、Mist 材质和 Lucide 图标。阅读面局部复用 Memory/Quick Note 的 69% strong / 31% normal 背景组合，不增加全局材质、固定插画、Emoji、每事件 Card 或逐条操作菜单。时间线仅做可靠展示映射，不推算使用时长。长窗口标题默认紧凑预览，整行可展开，保留完整文本和触屏命中尺寸。

相比参考图，只提供后端支持的三个设备筛选；“加载更多”仅代表前端继续渲染。普通浏览器提供手工填写准确网络名称及管理标记，不伪造当前 SSID。

## 5. 接口与配置限制

- 手机状态 HTTP 仅返回语义场景，不返回 SSID/BSSID。现有 Android `DeviceContextBridge` 限制主框架 origin 与页面路径，只允许 `/activity-logs`、`/chat`、`/`；不能直接用于 `/app/activity`。本轮未扩展 Android、iframe 中继或桥接权限。新页明确说明当前网络名称能力限制，可使用现有 PUT 配置准确名称。
- 标记识别、缓存信任和手机同步仍由已有 Android 实现负责；页面不判断浏览器设备是否为绑定手机，也不承诺配置已在手机生效。SSID 只保留在用户配置界面，不参与任何新增 AI 请求。
- Wi-Fi 修改带 revision；冲突或请求结果未知后重新读取并要求核对。前端不做自动合并重写。名称验证与后端保持 UTF-8 1–32 字节、无 Unicode C 类字符、大小写/空格保留、同名唯一、最多 128 项。
- 活动 API 没有事件 ID、游标、分页、单条/按日/按设备删除。JSONL 默认仍由后端按三小时策略清理；页面不能恢复已被后端清理的历史。
- 摘要是规则结果，可能包含估算和无新数据状态；不能视为精确应用使用时长。当前公开 DTO 缺少每窗口绝对日期。
- 旧活动联动与手机状态 AI 权限独立。当前摘要 GET 本身没有旧联动开关门槛；旧配置关闭时，新页只读提示相关 AI 动态消费受限，日志/规则摘要仍可查看。未读取或修改线上配置，实际状态以页面运行时 GET 为准。

## 6. 验证与人工验收

- `npm test -- --reporter=dot`：58 个测试文件，995 项通过。
- `tsc --noEmit`：通过。
- `npm run build`：通过，包含 `tsc -b` 与 Vite production build。
- `git diff --check`：通过；新增文件另作空白错误检查。

测试覆盖真实 DTO、权限字段、独立采样时间/到期/未知、SSID 验证、配置冲突、查询切换/取消/迟到响应、稳定身份和重复采样、WS 读取边界与重连补漏、可见性恢复、10,000 条数据与初次 200 条渲染、摘要语义、安全文本、全量清空范围/文件计数、失败后 GET-only 恢复和卸载清理。

使用合成数据、mock HTTP/WebSocket、控制器测试与静态组件渲染。未启动浏览器、Playwright、截图或视觉回归；未调用生产写接口。手机/桌面布局、材质、字级、密度、实际 Wi-Fi 同步与触屏操作等待人工验收。

## 7. V1.1：信息密度、SSID 入口和重复事件（2026-10-17）

本节覆盖首版相关 UI 展示说明。保留 PageHeader、桌面路由、背景、数据源、原始 Domain 集合、HTTP/实时同步和全量清空确认，不修改后端或 Android。

### SSID 局部只读核对

以下为代码中已确认的行为；本轮未连接真实手机验证最终同步效果。

1. **实际 API 与正式能力**：手工添加沿用 `saveWifiConfig()` 的 PUT `/api/device-context/wifi-config`，请求为 `{revision, mappings:[{ssid,scene}]}`。它是 DC2 的正式配置能力，不是新增或臆测的接口。`routes/device_context_settings.py` 和 `wifi_scene_config.py` 定义读写、授权、校验及 revision 冲突；`tests/contract/test_device_context_dc2.py` 的 `test_config_revision_crud_and_stale_write`、`test_config_concurrent_compare_and_swap`、`test_config_validation`、`test_http_permissions_and_effective_expiry` 覆盖这些契约。
2. **保存与匹配**：服务端将名称和 `home/work` 场景存入 SQLite 的 `wifi_scene_config`，保留名称大小写和空格，原子比较 revision 后更新。Android `WifiSceneCache.scene()` 用准确 SSID 字符串查表，仅在缓存可信时产生家里/公司或其他场景。遥测继续只上报场景，不上传当前 SSID/BSSID。
3. **同步**：`DeviceContextReporter.syncConfig()` 通过现有 GET 读取配置，约十分钟同步一次；校验后端实例、绑定范围、revision 和缓存有效性。配置变化会让下一次 Wi-Fi 采样提前执行。Android `DeviceContextReporterTest.configChangesAndDeletionGenerateNewWifiSamples`、`DeviceContextTest` 的缓存/场景测试及 `DeviceBindingTest` 的后端范围隔离测试已覆盖相关行为。本轮不改手机采样或同步逻辑，也不承诺保存后立即生效。
4. **旧页的当前名称**：不是手机浏览器的通用能力。旧页通过 `window.AionDeviceContext` 原生桥接读取 WebView 宿主手机的 Wi-Fi；嵌入旧 Chat 时使用 `device-context-host.js` 同源父框架中继。无桥接的普通浏览器也只能管理已保存标记。
5. **新页能力限制**：HTTP 状态仅返回语义场景，没有可远程读取绑定手机 SSID 的接口。原生桥接仅接受可信 HTTPS origin、主框架与 `/activity-logs`、`/chat`、`/` 路径，现有中继也绑定旧活动 iframe。新 `/app/activity`、`/editorial/app/activity` 不在该契约内；不能仅检测浏览器网络或绕过路径限制，更不能把宿主手机当作已绑定设备。本轮保留明确限制说明，不新增桥接、后端或 Android 能力。
6. **输入风险和反馈**：正式支持的是字符串映射配置，不是网络存在性验证。名称误拼、大小写/空格不同、手机无权限或 Android 无法读取名称，均可能导致合法配置未命中。Android 还拒绝未知名称及不可确定的十六进制 SSID，手工输入无法绕过这些限制。前后端仍验证 UTF-8 1–32 字节、无 Unicode C 类字符、名称唯一、最多 128 项及 `home/work` 场景；新 Dialog 不静默覆盖已有同名标记，引导在列表修改。422、409、读取失败和结果不明确时保留反馈与输入，不自动重复 PUT。

结论：保留手动添加，但改为低频“添加网络标记”Dialog；保留家庭/公司列表及改场景、移除操作。保存成功不等于网络已被手机识别，最终状态仍以手机有效采样为准。

### 展示调整

- 手机电量/Wi-Fi 改为紧凑自适应双列，去掉大图标底座、重复电源描述及刷新机制说明。充电状态仍来自独立字段，不用电源连接状态猜测；采样显示 `HH:mm`，完整日期/秒数通过 tooltip、title 和可访问名称保留。两组有效期及异常反馈不变。
- AI 手机状态 Checkbox 保留在底部紧凑设置行。Wi-Fi 配置默认折叠，展开为清单与 Dialog 入口，表单不再常驻。
- 时间 Select 与三个设备筛选减少留白，触屏目标保持 44px；原始事件数量移到时间线标题旁。删除正常连接说明和底部技术长段，异常重连/读取恢复保留。
- 状态面局部与现有 Memory/Quick Note 阅读面使用同一 Mist 背景混合；不改共享 token、壁纸或 Header。
- Android 原始 `title` 由 `AionPushService.postActivityToServer()` 填包名，HTTP 的 `app` 已经过名称解析。包名仅作为次级信息显示一次，没有额外内容时不渲染展开。短窗口标题直接显示；只有长或多行详情可展开，展开时隐藏重复预览，原始数据完整保留。

### 连续上报分组

- 仅在 Application 中生成显示投影，不修改 Domain 记录，不去重或计算使用时长。
- 手机优先使用 `title` 保留的原始包名，或仍明确保留在 `app` 中的包名；PC 仅使用明确保留的 `.exe` 进程名。HTTP 可能把 PC 应用解析为窗口标题，不能恢复原始身份的记录保持逐条。不能只按中文显示名称合并；标识冲突也不分组。
- 同设备、同原始身份、相同补充标题的连续事件，邻接间隔在 0–180 秒内，且服务端日期与浏览器显示日期均相同，至少两条才分组。`screen_on/screen_off/亮屏/锁屏` 排除；不同应用、设备、标题或系统事件均打断。
- 先在完整当前数据上分组，再进行设备筛选，因此隐藏的其他设备事件也不会被跨越。查询变化或 HTTP/WS 重读后，按当前完整数据重新计算。
- 默认折叠，只显示名称、真实采样时间范围与“连续 N 条上报”。展开按现有时间倒序显示全部原始事件及秒数。折叠时不挂载隐藏的全部事件 DOM。
- 分组键使用设备、原始身份和组内最早原始记录键，不使用数组位置。普通最新采样加入组时，已有组键保持稳定；最早记录离开查询或身份/边界变化时重新建立投影。
- 原始统计不因分组改变；分批渲染按展示项推进，继续读取的内存集合仍是完整服务端结果，没有假服务端分页。

### 本轮修改文件

新增：

- `src/application/activity/activity-timeline.ts`、`activity-timeline.test.ts`：保守分组、身份判断及有效详情投影。
- `src/components/activity/WifiNetworkDialog.tsx`、`WifiNetworkDialog.test.tsx`：添加入口、小 Dialog、校验与失败输入保留。

修改：

- `src/application/activity/activity-presentation.ts`：短采样时间格式。
- `src/application/activity/activity-controller.ts`、`activity-controller.test.ts`：返回写入是否被确认，让 Dialog 仅在确认成功后关闭；增加真实读取/重同步后的分组验证，原有请求与副作用不变。
- `src/components/activity/PhoneStatusPanel.tsx`、`WifiSceneSettings.tsx`、`ActivityControls.tsx`、`ActivityView.tsx`、`ActivityTimeline.tsx`、`activity.css`、`ActivityPresentation.test.tsx`：信息密度、异常反馈、无效展开和完整分组阅读。
- 本说明。

### 验证与待人工确认

- 全量测试：60 个文件、1027 项通过。覆盖全部首版回归、独立采样/到期、配置 Dialog、原始身份不确定与同名不同包、系统事件/中间事件/时间间隔/跨日拆分、完整展开、10,000 条数据、HTTP/WS 稳定重分组及筛选统计。
- `tsc --noEmit`：通过。
- `npm run build`：通过，包含 `tsc -b` 与 Vite production build。
- `git diff --check`：通过；新增文件另作空白检查。

未运行浏览器、Playwright、截图或视觉回归，未改 AionHome/Android，未 commit 或部署。需人工确认手机双列和桌面密度、玻璃材质、时间 tooltip、Dialog 软键盘空间、分组展开/收起，以及输入准确 SSID 后 Android 按既有流程同步的实际结果。
