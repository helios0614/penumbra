# UI Foundation PR3：反馈来源与验收

## Activity 来源审计

| 模块 | 来源／依赖 | 失败与恢复 |
|---|---|---|
| 手机快照 | device-context 的 `getDeviceStatus`；电量／Wi-Fi 各自期限 | 读取失败清除快照，不把它显示为正常空采样；refreshPhone 重读三项 |
| AI 读取权限 | `getDeviceAiVisible`，独立于采集、日志及 Wi-Fi 配置 | 未知或失败禁用 Switch；独立故障可重新读取权限 |
| 网络标记 | `getWifiConfig`／`saveWifiConfig`，版本冲突后仍重读 | Dialog 保留 SSID／场景与失败；重读失败可在 Dialog 内恢复；列表操作错误留在 Wi-Fi 区域 |
| 归档日期 | `/api/activity/dates` | 失败不生成空归档或“已删除”的结论；保留局部重读或共同恢复入口 |
| 活动记录 | `/api/activity/recent` 或 `/api/activity/logs/:date` | 失败保留旧记录并说明；没有数据时不显示“共 0 条”／正常空结果 |
| 旧联动配置 | `/api/activity/config`，不控制日志／规则摘要能否浏览 | false 是真实关闭状态；读取失败不推断为关闭，置于 Surface 内 |
| 三小时摘要 | `/api/activity/summary`，独立于时间／设备筛选 | 按需打开 Dialog，保持独立读取与恢复 |
| 实时连接 | Activity realtime WebSocket；恢复时协调既有 GET | blocked／reconnecting 保留持续状态；不将其状态直接等同于 HTTP 请求失败 |

这些 HTTP domain client 共用现有 API base URL。现在在应用层 `ReadState.failure` 保留类型、状态码、错误码与诊断消息，合并多个 NETWORK_ERROR 或共享会话的 401；文案相同本身不构成证据。403、TIMEOUT、5xx、契约校验及其他独立失败不合并。页面提示“连接异常，部分信息暂不可用”与一个恢复入口；模块继续显示简短不可用状态，共同故障不重复放置重试按钮。与共同故障同时存在的独立错误保留恢复入口。

诊断详情默认折叠。没有新增全局网络中心、HTTP 自动 Toast、轮询或自动写入重试；原有 WebSocket 退避、手机／最近活动轮询、权限确认、Wi-Fi revision 处理保持原业务语义。成功读取移除对应 error／failure；日期／设备切换清理旧操作 notice，旧作用域的晚到反馈不重新出现。写入未知不靠普通读取宣称成功。

## 页面迁移边界

- Memory：本轮现有页面只提供创建与待继续标记，均以写入确认产生 Toast。列表读取、创建表单和变更失败继续内联；没有新增编辑或删除功能。
- Quick Note：正文保存、核对后确认保存、删除、Step 1／2 完成进入 Toast。Step 1 用有意义的第二行说明正文清空；补写只提示“已提交补写请求”。生成进度、日志、读取失败、冲突、草稿与结果未知继续内联。重试 Dialog 与页面共用 notice 但只有当前出口显示，阅读内容／日期切换清理过期反馈。
- Location：Key、位置参数、静默／定位配置分区确认成功均有 Toast 出口；复制、清除 Key、设为家保留真实确认。家庭状态／距离等待设备上报的提示继续在位置 Surface；刷新后未保存草稿的提醒继续持续展示。区域错误、校验、未确认保存和独立草稿不被 Toast 覆盖。
- Chat：仅处理消息与代码复制，等待 clipboard 写入成功，失败明确提示；移除重复的局部 copied 状态和 timer，不重构消息功能。

## 人工验收

本轮不使用 Playwright 或浏览器自动化。自动测试验证计时、容量、去重、作用域、渲染语义、视口交集和业务出口；以下实际渲染／系统交互仍需人工验收：

1. 经典 `/app/...` 与 Editorial `/editorial/app/...`：桌面 Toast 跟随应用右上角，滚动不带走浮层；手机底部居中；浅色／深色／自定义主题／复杂壁纸的对比度。
2. 真机安全区、横屏、软键盘弹出／平移、Chat 输入区自动增高和字体放大：不挡 Dock、输入区和 Dialog 保存／取消按钮，长错误必要换行且不截断。
3. 键盘 Tab、手动关闭、悬停／焦点暂停、系统 Reduced Motion，以及 NVDA／VoiceOver 的 polite 播报；重复同一结果不反复播报，Dialog 内不被外部 Toast 打断。
4. Activity 断网、同一凭据失效、多模块失败混合独立契约故障；统一恢复、局部重读、WS 重连恢复后不残留旧错误；Wi-Fi 保存失败／409／重读失败时草稿与恢复入口保留。
5. Location 三个区域分别保存成功／失败、保存后 GET 失败、多区域同时有草稿、Key 复制权限被拒绝、设为家后等待新上报；Toast 不泄露 Key。
6. Quick Note 日期／阅读内容切换、Dialog 重试、补写接受后仍在生成、生成完成、保存超时／冲突／GET 核对；Chat 剪贴板权限拒绝与不支持 Clipboard API 的环境。
