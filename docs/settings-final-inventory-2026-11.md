# Settings Final Inventory · 最终只读核销

2026-11-16 · 等待人工验收。保留原始 A01–F14 共 159 项与 N01–N11 共 11 项，未重编号、拆 ID 或新增统计行。

## 结论与统计

全局 Settings 的主要迁移已经闭环；不再重复立项 Diary 模型、外观服务端持久化、Embedding、Music、缓存/保活和 HEART/DRIFT。下面的“确认存在缺口”包含业务端缺失与内部一致性问题，不是全局 Settings 待加表单数量。

| 范围 | 已完成 | 无需迁移 | 留在业务页面 / Native | 已明确暂缓 | 确认存在缺口 | 合计 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| A | 14 | 2 | 0 | 0 | 0 | 16 |
| B | 18 | 8 | 0 | 0 | 0 | 26 |
| C | 12 | 5 | 0 | 2 | 8 | 27 |
| D | 12 | 4 | 5 | 1 | 0 | 22 |
| E | 28 | 4 | 15 | 0 | 7 | 54 |
| F | 0 | 14 | 0 | 0 | 0 | 14 |
| 历史小计 | 84 | 37 | 20 | 3 | 15 | 159 |
| N01–N11 | 6 | 1 | 1 | 0 | 3 | 11 |
| 总计 | 90 | 38 | 21 | 3 | 18 | 170 |

分类互斥，每条只计一次。“已完成”按其合理入口的配置读写/持久化/实际消费者核销，也包括已有业务页闭环和有意只读的配置。“留在业务页面 / Native”表示保留原业务责任；表中明确区分 Native 已支持与业务页尚未迁入 Penumbra，不能据此声称这些新业务页面已经交付。“已明确暂缓”只用于已有交付文档明确暂缓的 C15/C16/D07，不擅自把未决定事项改为已暂缓。“无需迁移”可以仍有后端消费者、兼容入口或内部治理需求。

历史 159 项为 84 项已完成、37 项无需迁移、20 项留业务/Native、3 项明确暂缓、15 项确认缺口；新增记录分别为 6/1/1/0/3。总计 170 项，90/38/21/3/18。不以“完成率”推动业务配置外移或内部字段 UI 化。

## 基线、方法与限制

- Penumbra `c0956e152ea3e995bfef2715bd35d8fe028f8c18`；AionHome `7637437`。两个仓库开工均干净。本文核销当前源码与提交，不读取真实配置、密钥、数据库或运行数据，不访问真实 Provider 或生产。
- 基于[原始 Inventory](./settings-inventory.md)、[第二轮复审](./settings-inventory-followup-2026-11.md)、PR1–PR5-E、Chat PR6.5、Diary 模型、外观持久化、Embedding 向量审计、[高级设置](./settings-advanced.md)及 [HEART/DRIFT 独立修复](./settings-heart-drift-independence-fix.md)。旧报告是历史基线，遇到源码/后续交付冲突时以当前源码为准。
- 对照迁移后的导航、组件、domain client、服务端路由/保存字段和实际消费者；未改动领域结合原逐项链与两仓 Git diff 核对，变化领域重新沿调用方定位。表中源码链接省去旧报告过时行号。静态消费者存在不等同真实上游连通、生产部署完成或实体 Android 验收通过。
- 本任务没有修改 Settings 源码或后端。另一个独立任务只修改 Chat 单条删除及其测试/文档；本轮前端测试不是所有设置的真实后端持久化联调，也不把旧交付报告中的测试结果冒充本轮重跑。

## 近期交付专项核销

| 范围 | 当前事实与权威 | 提交及源码证据 |
| --- | --- | --- |
| Diary Chat 模型与跟随 | Settings 实际列出 10 项 usage。`diary_chat` 独立绑定与 `diary_chat_follow_main` 已有保存及读回；跟随默认开启，消费最近 updated_at 的 Main 会话选择，不是 `main_chat` 新会话默认。只影响之后启动的投喂；已有 Entry 继续自己的选择。无 Main 时明确报错，不静默用全局新会话默认。合并记在 E02，避免为新机制重编号。 | P `557ac19`、`8597330`；A `89e2fcb`、`80d338c`；[FeatureBindingDialog](../src/components/settings/features/FeatureBindingDialog.tsx)、[feature DTO](../src/domain/registry/feature-bindings.ts)、[Diary feed](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/diary.py)、[设置写入](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py) |
| 外观持久化 | A01–A10 和头像以 `appearance.json`/独立图片目录为权威；GET/PATCH、图片与贴纸接口、共享状态到实际显示闭环。旧 LS/IDB 读写已退出当前外观链路，不能继续报告“仅本机唯一副本”。其他桌面布局/签名仍为本机；旧资产不自动导入，多端在刷新后读最新。 | P `70d71ac`、A `6dc8217`；[外观交付](./appearance-persistence.md)、[客户端](../src/domain/appearance/appearance-client.ts)、[后端持久化](/Users/remix/Desktop/AionsHome-main/aion-chat/appearance_persistence.py)、[路由](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/appearance.py) |
| Embedding | 独立 URL/Key 已提交，模型有意只读。Memory 调用独立来源，返回长度须 1024，元素/float32 编解码/非零范数检查已有，召回拒绝不相容长度，原 zip 截断结论已过时。同维不同空间仍无持久代际证明，N09 保留部分缺口。 | P `fb62689`、A `84c6f3a`、`cb2b99f`；[Embedding client](../src/domain/embedding-settings/embedding-settings-client.ts)、[Memory 验证与消费者](/Users/remix/Desktop/AionsHome-main/aion-chat/memory.py) |
| Music | E42 凭据管理与 N05 `/api/music/auth-status` 已接通。状态是当前凭据 generation 的进程最近登录结果，可为 unverified；查看状态不触发登录，PUT 成功不是登录成功。音量 E43 另属播放器。 | P `15a92a7`、A `dbb55e2`；[Music client](../src/domain/music-settings/music-settings-client.ts)、[Music routes](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/music.py) |
| 缓存与保活 | C14/C17/C18/C19 已完成；Settings 高级设置读回，System TTL 和 Activity 日/夜间检查有实际消费者。保活独立于缓存总开关；关闭缓存不会自动关闭 Activity 主动保活。C15/C16 无 UI 是明确暂缓，旧全库重置风险仍在。 | [SettingsAdvanced](../src/components/settings/SettingsAdvanced.tsx)、[client](../src/domain/advanced-settings/advanced-settings-client.ts)、[Settings routes](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py)、[Activity](/Users/remix/Desktop/AionsHome-main/aion-chat/activity.py)、[Prompt builder](/Users/remix/Desktop/AionsHome-main/aion-chat/prompts/builder.py) |
| HEART / DRIFT 四项 | C12/C13 历史回显与 D10/D09 生成指令独立保存、独立消费。关闭生成不再关闭已有历史回显；默认 fallback 以当前 config 为准（新字段缺省 true），旧文档曾写生成默认 false 已不准确。Main/Diary/Memory 的相关读取均保留。 | P `05a580f`、A `c3fb8dd`；[Chat 高级控制](../src/components/chat/ChatAdvancedSettings.tsx)、[后端 gate](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py)、[修复记录](./settings-heart-drift-independence-fix.md) |
| 高级设置替代系统状态 | Settings 导航只有 advanced，没有系统状态编辑页；SettingsSafeBasics 已移除。readiness/session 接口仍由启动、配置等调用方使用，不能据此恢复旧卡片。N06 标为被替代/无需迁移。 | [SettingsView](../src/components/settings/SettingsView.tsx)、[导航测试](../src/components/settings/SettingsView.test.tsx) |

## 历史 159 项逐项核销

每项沿用旧 ID 和粒度；“已完成”仍受上文静态范围限制。入口为归属，不意味着都加入全局 Settings。每行保留源头证据，变化项补最新证据。

### A · 外观与桌面

| ID | 原配置 / 能力 | 最终分类 | 入口 / 范围 | 核销说明 | 当前证据 |
| --- | --- | --- | --- | --- | --- |
| A01 | 明暗 / penumbra-theme-mode | 已完成 | 全局 Settings/外观 | 已改为实例级 appearance.json；启动 GET、保存 PATCH，LS 不再为权威。 | [外观](../src/domain/appearance/appearance-client.ts) |
| A02 | 主题色 / penumbra-theme-color | 已完成 | 全局 Settings/外观 | 服务端 themeColor，空引用使用主题默认色；不再从旧 LS 读写。 | [外观](../src/domain/appearance/appearance-client.ts) |
| A03 | AI色 / penumbra-ai-color | 已完成 | 全局 Settings/外观 | 服务端 aiColor，共享气泡和主题使用；不再从旧 LS 读写。 | [外观](../src/domain/appearance/appearance-client.ts) |
| A04 | 壁纸 / penumbra-wallpaper-settings.mode | 已完成 | 全局 Settings/外观 | 服务端 wallpaper.mode；Classic 实际消费，Editorial 不消费壁纸。 | [外观](../src/domain/appearance/appearance-client.ts) |
| A05 | 壁纸适配 / .fit | 已完成 | 全局 Settings/外观 | 服务端 wallpaper.fit；Classic 背景消费。 | [外观](../src/domain/appearance/appearance-client.ts) |
| A06 | 壁纸位置 / .position | 已完成 | 全局 Settings/外观 | 服务端 wallpaper.position；Classic 背景消费。 | [外观](../src/domain/appearance/appearance-client.ts) |
| A07 | 壁纸遮罩 / .shade | 已完成 | 全局 Settings/外观 | 服务端 wallpaper.shade；Classic 遮罩消费。 | [外观](../src/domain/appearance/appearance-client.ts) |
| A08 | 壁纸文字明暗 / .textTone | 已完成 | 全局 Settings/外观 | 服务端 wallpaper.textTone；桌面快捷操作共用外观状态。 | [外观](../src/domain/appearance/appearance-client.ts) |
| A09 | 自定义壁纸文件 / wallpapers[desktop] | 已完成 | 全局 Settings/外观 | 独立 appearance 图片接口上传、引用提交与读取；旧 IDB 不再是当前图片权威。旧浏览器资产不会自动导入。 | [外观](../src/domain/appearance/appearance-client.ts) |
| A10 | 贴纸图片 / images[desktop-sticker] | 已完成 | 经典桌面 | 共用 stickerImage 与贴纸实例均服务端保存；经典桌面操作原位保留。 | [外观](../src/domain/appearance/appearance-client.ts) |
| A11 | 布局 / penumbra-desktop-layout、-version | 已完成 | 经典桌面 | 普通小组件布局仍本机；贴纸布局与重置已接服务端，不应把所有布局宣称为云端同步。 | [外观](../src/domain/appearance/appearance-client.ts) |
| A12 | 经典签名 / penumbra-desktop-signature | 已完成 | 经典桌面 | 经典桌面签名仍在本机 LS；留桌面原位。 | [P/SignatureWidget.tsx](/Users/remix/Desktop/Penumbra/src/widgets/SignatureWidget.tsx) |
| A13 | Editorial签名 / penumbra-editorial-signature | 已完成 | Editorial 桌面 | Editorial 签名仍在本机 LS；留桌面原位。 | [P/EditorialSignature.tsx](/Users/remix/Desktop/Penumbra/src/components/desktop-v2/EditorialSignature.tsx) |
| A14 | 字体/字号 / --font-heading、--font-sans、text classes | 无需迁移 | 无 UI | 兼容、内部或运维字段；保留原消费者，不新增用户编辑器。 | [P/index.css](/Users/remix/Desktop/Penumbra/src/index.css) |
| A15 | Mist/Paper/透明度 / mist-glass、mist-solid、Diary paper样式 | 无需迁移 | 无 UI | 兼容、内部或运维字段；保留原消费者，不新增用户编辑器。 | [P/index.css](/Users/remix/Desktop/Penumbra/src/index.css) · [P/DiaryReaderDetails.tsx](/Users/remix/Desktop/Penumbra/src/components/diary/DiaryReaderDetails.tsx) |
| A16 | 头像/气泡几何 / avatar placeholder、Bubble classes | 已完成 | Settings / 聊天头像；几何内部 | 头像上传/恢复默认已接 Settings 与共享气泡；气泡几何仍为内部样式，不新增尺寸编辑器。 | [头像](../src/components/identity/AppearanceAvatar.tsx) |

### B · 模型与任务分配

| ID | 原配置 / 能力 | 最终分类 | 入口 / 范围 | 核销说明 | 当前证据 |
| --- | --- | --- | --- | --- | --- |
| B01 | Connection名称 / name | 已完成 | 全局 Settings/API 与连接 | 现有入口读写及实际消费链保留；不重复迁移。 | [P/ConnectionDetail.tsx](/Users/remix/Desktop/Penumbra/src/components/settings/connections/ConnectionDetail.tsx) · [H/registry.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/registry.py) |
| B02 | 连接Base URL / base_url | 已完成 | 全局 Settings/API 与连接 | 现有入口读写及实际消费链保留；不重复迁移。 | [P/registry-client.ts](/Users/remix/Desktop/Penumbra/src/domain/registry/registry-client.ts) · [H/main_configuration.py](/Users/remix/Desktop/AionsHome-main/aion-chat/main_configuration.py) |
| B03 | API Key / credential（落盘key） | 已完成 | 全局 Settings/API 与连接 | 现有入口读写及实际消费链保留；不重复迁移。 | [P/ConnectionDetail.tsx](/Users/remix/Desktop/Penumbra/src/components/settings/connections/ConnectionDetail.tsx) · [H/registry.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/registry.py) |
| B04 | 连接启用 / enabled | 已完成 | 全局 Settings/API 与连接 | 现有入口读写及实际消费链保留；不重复迁移。 | [P/ConnectionDetail.tsx](/Users/remix/Desktop/Penumbra/src/components/settings/connections/ConnectionDetail.tsx) · [H/main_configuration.py](/Users/remix/Desktop/AionsHome-main/aion-chat/main_configuration.py) |
| B05 | 传输 / transport | 已完成 | 全局 Settings/API 与连接 | 现有入口读写及实际消费链保留；不重复迁移。 | [P/ConnectionDetail.tsx](/Users/remix/Desktop/Penumbra/src/components/settings/connections/ConnectionDetail.tsx) · [H/main_configuration.py](/Users/remix/Desktop/AionsHome-main/aion-chat/main_configuration.py) |
| B06 | 网关 / gateway_id | 已完成 | 全局 Settings/API 与连接 | 现有入口读写及实际消费链保留；不重复迁移。 | [P/ConnectionDetail.tsx](/Users/remix/Desktop/Penumbra/src/components/settings/connections/ConnectionDetail.tsx) · [H/main_configuration.py](/Users/remix/Desktop/AionsHome-main/aion-chat/main_configuration.py) |
| B07 | 连接模型提示 / default_model | 已完成 | 全局 Settings/API 与连接 | 连接模型提示仅预填，不是 Main/Diary/任务选择的权威。 | [P/ConnectionDetail.tsx](/Users/remix/Desktop/Penumbra/src/components/settings/connections/ConnectionDetail.tsx) · [H/registry.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/registry.py) |
| B08 | Main新会话默认 / usage_bindings.main_chat {connection_id,protocol,model} | 已完成 | 全局 Settings/模型与任务分配 | Main 新会话默认；不改已有会话。新增 Diary usage 与跟随策略并入 E02 说明，不新增编号。 | [P/FeatureBindingDialog.tsx](/Users/remix/Desktop/Penumbra/src/components/settings/features/FeatureBindingDialog.tsx) · [H/main_configuration.py](/Users/remix/Desktop/AionsHome-main/aion-chat/main_configuration.py) · [H/chat.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py) |
| B09 | Memory Sentinel绑定 / .memory_sentinel | 已完成 | 全局 Settings/模型与任务分配 | 现有入口读写及实际消费链保留；不重复迁移。 | [P/FeatureBindingDialog.tsx](/Users/remix/Desktop/Penumbra/src/components/settings/features/FeatureBindingDialog.tsx) · [H/memory.py](/Users/remix/Desktop/AionsHome-main/aion-chat/memory.py) |
| B10 | Web压缩绑定 / .web_compression | 已完成 | 全局 Settings/模型与任务分配 | 现有入口读写及实际消费链保留；不重复迁移。 | [P/SettingsView.tsx](/Users/remix/Desktop/Penumbra/src/components/settings/SettingsView.tsx) · [H/external_content.py](/Users/remix/Desktop/AionsHome-main/aion-chat/external_content.py) |
| B11 | Memory Digest绑定 / .memory_digest | 已完成 | 全局 Settings/模型与任务分配 | 现有入口读写及实际消费链保留；不重复迁移。 | [P/FeatureBindingDialog.tsx](/Users/remix/Desktop/Penumbra/src/components/settings/features/FeatureBindingDialog.tsx) · [H/memory.py](/Users/remix/Desktop/AionsHome-main/aion-chat/memory.py) |
| B12 | Quick Note Step1绑定 / .quick_note_compression | 已完成 | 全局 Settings/模型与任务分配 | 现有入口读写及实际消费链保留；不重复迁移。 | [P/FeatureBindingDialog.tsx](/Users/remix/Desktop/Penumbra/src/components/settings/features/FeatureBindingDialog.tsx) · [H/schedule.py](/Users/remix/Desktop/AionsHome-main/aion-chat/schedule.py) |
| B13 | Camera Sentinel绑定 / .camera_sentinel | 已完成 | 全局 Settings/模型与任务分配 | 现有入口读写及实际消费链保留；不重复迁移。 | [P/FeatureBindingDialog.tsx](/Users/remix/Desktop/Penumbra/src/components/settings/features/FeatureBindingDialog.tsx) · [H/camera.py](/Users/remix/Desktop/AionsHome-main/aion-chat/camera.py) · [H/connection_registry.py](/Users/remix/Desktop/AionsHome-main/aion-chat/connection_registry.py) |
| B14 | Location Sentinel绑定 / .location_sentinel | 已完成 | 全局 Settings/模型与任务分配 | 现有入口读写及实际消费链保留；不重复迁移。 | [P/FeatureBindingDialog.tsx](/Users/remix/Desktop/Penumbra/src/components/settings/features/FeatureBindingDialog.tsx) · [H/location.py](/Users/remix/Desktop/AionsHome-main/aion-chat/location.py) |
| B15 | Book批注默认 / .book_annotation | 已完成 | 全局 Settings/模型与任务分配 | 现有入口读写及实际消费链保留；不重复迁移。 | [P/FeatureBindingDialog.tsx](/Users/remix/Desktop/Penumbra/src/components/settings/features/FeatureBindingDialog.tsx) · [H/independent_llm.py](/Users/remix/Desktop/AionsHome-main/aion-chat/independent_llm.py) · [H/book.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/book.py) |
| B16 | Game新Session默认 / .game_decision | 已完成 | 全局 Settings/模型与任务分配 | 现有入口读写及实际消费链保留；不重复迁移。 | [P/FeatureBindingDialog.tsx](/Users/remix/Desktop/Penumbra/src/components/settings/features/FeatureBindingDialog.tsx) · [H/binding.py](/Users/remix/Desktop/AionsHome-main/aion-chat/game/binding.py) · [H/service.py](/Users/remix/Desktop/AionsHome-main/aion-chat/game/service.py) |
| B17 | 旧API Config / api_configs[].id/name/url/key/model/enabled/auth_mode/gateway_id/reusable_protocols | 无需迁移 | 无 UI | 兼容、内部或运维字段；保留原消费者，不新增用户编辑器。 | [H/settings.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py) · [H/settings.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py) · [H/connection_registry.py](/Users/remix/Desktop/AionsHome-main/aion-chat/connection_registry.py) |
| B18 | 旧激活API / selected_api_config_id | 无需迁移 | 无 UI | 兼容、内部或运维字段；保留原消费者，不新增用户编辑器。 | [H/settings.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py) · [H/independent_llm.py](/Users/remix/Desktop/AionsHome-main/aion-chat/independent_llm.py) |
| B19 | 旧provider字段 / aipro_*、custom_*、aux_*、gemini_*、siliconflow_*、custom_model | 无需迁移 | 无 UI | 兼容、内部或运维字段；保留原消费者，不新增用户编辑器。 | [H/connection_registry.py](/Users/remix/Desktop/AionsHome-main/aion-chat/connection_registry.py) · [H/connection_registry.py](/Users/remix/Desktop/AionsHome-main/aion-chat/connection_registry.py) · [H/config.py](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py) |
| B20 | 静态模型定义 / RAW_MODEL_DECLARATIONS、aliases、key/display_name/provider/model | 无需迁移 | 无 UI | 兼容、内部或运维字段；保留原消费者，不新增用户编辑器。 | [H/model_registry.py](/Users/remix/Desktop/AionsHome-main/aion-chat/model_registry.py) |
| B21 | 模型能力 / api_formats、capabilities | 无需迁移 | 无 UI | 兼容、内部或运维字段；保留原消费者，不新增用户编辑器。 | [H/model_registry.py](/Users/remix/Desktop/AionsHome-main/aion-chat/model_registry.py) · [H/generation_options.py](/Users/remix/Desktop/AionsHome-main/aion-chat/generation_options.py) |
| B22 | Bootstrap默认 / AION_DEFAULT_MODEL、DEFAULT_MODEL | 无需迁移 | 无 UI | 兼容、内部或运维字段；保留原消费者，不新增用户编辑器。 | [H/model_registry.py](/Users/remix/Desktop/AionsHome-main/aion-chat/model_registry.py) · [H/main_configuration.py](/Users/remix/Desktop/AionsHome-main/aion-chat/main_configuration.py) |
| B23 | 连接测试 / connection_id、protocol、model | 已完成 | 全局 Settings/API 与连接 | 现有入口读写及实际消费链保留；不重复迁移。 | [P/ConnectionProbe.tsx](/Users/remix/Desktop/Penumbra/src/components/settings/connections/ConnectionProbe.tsx) · [H/registry.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/registry.py) |
| B24 | 远端模型发现 / protocol、after_id | 已完成 | 全局 Settings/API 与连接 | 现有入口读写及实际消费链保留；不重复迁移。 | [P/ModelDiscovery.tsx](/Users/remix/Desktop/Penumbra/src/components/settings/connections/ModelDiscovery.tsx) · [H/registry.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/registry.py) |
| B25 | 失败策略 / disabled_profile、feature_binding_required、deferred诊断 | 无需迁移 | 无 UI | 兼容、内部或运维字段；保留原消费者，不新增用户编辑器。 | [H/main_configuration.py](/Users/remix/Desktop/AionsHome-main/aion-chat/main_configuration.py) · [H/connection_registry.py](/Users/remix/Desktop/AionsHome-main/aion-chat/connection_registry.py) |
| B26 | 输出/context上限 / max_tokens、TEMPERATURE_RANGES、MAX_CONTEXT_LIMIT | 无需迁移 | 无 UI | 兼容、内部或运维字段；保留原消费者，不新增用户编辑器。 | [H/generation_options.py](/Users/remix/Desktop/AionsHome-main/aion-chat/generation_options.py) · [H/generation_options.py](/Users/remix/Desktop/AionsHome-main/aion-chat/generation_options.py) |

### C · Chat 与生成

| ID | 原配置 / 能力 | 最终分类 | 入口 / 范围 | 核销说明 | 当前证据 |
| --- | --- | --- | --- | --- | --- |
| C01 | 会话模型 / conversations.main_selection；旧model另存 | 已完成 | Chat/Composer | 当前 Main 会话独立选择；不与新会话默认重复迁移。 | [P/useMainModelSelectionDraft.ts](/Users/remix/Desktop/Penumbra/src/components/chat/useMainModelSelectionDraft.ts) · [H/chat.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py) · [H/main_configuration.py](/Users/remix/Desktop/AionsHome-main/aion-chat/main_configuration.py) |
| C02 | Main默认温度 / main_chat_defaults.temperature_by_protocol；请求temperature仍可覆盖 | 已完成 | Chat/Header | 现有入口读写及实际消费链保留；不重复迁移。 | [P/chat-settings-controller.ts](/Users/remix/Desktop/Penumbra/src/components/chat-workspace/chat-settings-controller.ts) · [H/chat_defaults.py](/Users/remix/Desktop/AionsHome-main/aion-chat/chat_defaults.py) |
| C03 | Main默认上下文 / main_chat_defaults.context_limit；请求context_limit仍可覆盖 | 已完成 | Chat/Header | 现有入口读写及实际消费链保留；不重复迁移。 | [P/ChatRequestParametersMenu.tsx](/Users/remix/Desktop/Penumbra/src/components/chat/ChatRequestParametersMenu.tsx) · [H/chat_defaults.py](/Users/remix/Desktop/AionsHome-main/aion-chat/chat_defaults.py) |
| C04 | Main扩展思考默认 / main_chat_defaults.thinking_by_protocol；请求thinking_effort | 已完成 | Chat/Header | 现有入口读写及实际消费链保留；不重复迁移。 | [P/ChatRequestParametersMenu.tsx](/Users/remix/Desktop/Penumbra/src/components/chat/ChatRequestParametersMenu.tsx) · [H/chat_defaults.py](/Users/remix/Desktop/AionsHome-main/aion-chat/chat_defaults.py) · [H/generation_options.py](/Users/remix/Desktop/AionsHome-main/aion-chat/generation_options.py) |
| C05 | 请求快速模式 / fast_mode | 确认存在缺口 | Chat/Composer | 后端支持 fast_mode，Penumbra 未提供请求入口；先确认产品保留需求，不因存在参数就补开关。 | [P/ChatRequestParametersMenu.tsx](/Users/remix/Desktop/Penumbra/src/components/chat/ChatRequestParametersMenu.tsx) · [H/chat.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py) |
| C06 | 请求密语模式 / whisper_mode | 确认存在缺口 | Chat/Whisper | 后端支持 whisper_mode，Penumbra 未提供入口；与 E54 专用业务设备流程一并决策。 | [H/generation_options.py](/Users/remix/Desktop/AionsHome-main/aion-chat/generation_options.py) · [H/chat.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py) · [H/chat.html](/Users/remix/Desktop/AionsHome-main/aion-chat/static/chat.html) |
| C07 | 新会话携带历史数量 / main_chat_defaults.carryover_count；conversations.carryover_source_conv_id | 已完成 | Chat/Header | 现有入口读写及实际消费链保留；不重复迁移。 | [P/chat-workspace-controller.ts](/Users/remix/Desktop/Penumbra/src/components/chat-workspace/chat-workspace-controller.ts) · [H/chat_defaults.py](/Users/remix/Desktop/AionsHome-main/aion-chat/chat_defaults.py) · [H/chat.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py) · [H/chat.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py) |
| C08 | 全局兼容温度 / temperature | 无需迁移 | 无 UI | 兼容、内部或运维字段；保留原消费者，不新增用户编辑器。 | [H/settings.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py) · [H/diary.html](/Users/remix/Desktop/AionsHome-main/aion-chat/static/diary.html) · [H/main_configuration.py](/Users/remix/Desktop/AionsHome-main/aion-chat/main_configuration.py) |
| C09 | 全局thinking开关 / enable_thinking | 无需迁移 | 无 UI | 兼容、内部或运维字段；保留原消费者，不新增用户编辑器。 | [H/settings.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py) · [H/ai_providers.py](/Users/remix/Desktop/AionsHome-main/aion-chat/ai_providers.py) |
| C10 | 全局thinking强度 / thinking_effort | 无需迁移 | 无 UI | 兼容、内部或运维字段；保留原消费者，不新增用户编辑器。 | [H/config.py](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py) · [H/chat.html](/Users/remix/Desktop/AionsHome-main/aion-chat/static/chat.html) |
| C11 | 低频记忆浮现间隔 / 原SETTINGS.float_interval | 已完成 | Chat/Header，标注共享 | 共享 float_interval 已接 Chat 参数，Diary 也消费；不另建全局表单。 | [P/ChatRequestParametersMenu.tsx](/Users/remix/Desktop/Penumbra/src/components/chat/ChatRequestParametersMenu.tsx) · [H/settings.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py) · [H/diary.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/diary.py) |
| C12 | 旧HEART上下文 / include_heart | 已完成 | Chat / 聊天设置 / 高级控制 | Chat 高级控制 include_heart；历史回显独立于生成 gate。 | [四项控制](../src/components/chat/ChatAdvancedSettings.tsx) · [gate](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py) |
| C13 | 旧DRIFT上下文 / include_drift（旧include_simplethink兼容） | 已完成 | Chat / 聊天设置 / 高级控制 | Chat 高级控制 include_drift；历史回显独立于生成 gate。 | [四项控制](../src/components/chat/ChatAdvancedSettings.tsx) · [gate](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py) |
| C14 | 缓存开关 / cache_enabled | 已完成 | 全局 Settings / 高级设置 | Settings 高级设置缓存总开关；GET settings / PUT cache-toggle 后读回，有实际缓存构造消费者。 | [高级设置](./settings-advanced.md) · [当前 UI](../src/components/settings/SettingsAdvanced.tsx) |
| C15 | 冻结区 / cache_freeze_size（API freeze_size） | 已明确暂缓 | 无 UI（运维高级） | 明确暂缓 UI：旧 cache-config 保存 JSON 后全库重置缓存分区，需先治理一致性。 | [高级设置](./settings-advanced.md) · [当前 UI](../src/components/settings/SettingsAdvanced.tsx) |
| C16 | 滑动区 / cache_slide_max（API slide_max） | 已明确暂缓 | 无 UI（运维高级） | 同 C15；不将后端能写入等同可安全开放普通编辑器。 | [高级设置](./settings-advanced.md) · [当前 UI](../src/components/settings/SettingsAdvanced.tsx) |
| C17 | System缓存TTL / anthropic_system_cache_ttl（API ttl） | 已完成 | 全局 Settings / 高级设置 | Settings 高级设置 System TTL（5m/1h）；System prompt 消费，历史冻结 TTL 仍有自身策略。 | [高级设置](./settings-advanced.md) · [当前 UI](../src/components/settings/SettingsAdvanced.tsx) |
| C18 | 保活 / cache_keepalive_enabled | 已完成 | 全局 Settings / 高级设置 | Settings 高级设置缓存保活；Activity 日间/夜间检查实际消费，与语音播放保活不同。 | [高级设置](./settings-advanced.md) · [当前 UI](../src/components/settings/SettingsAdvanced.tsx) |
| C19 | 保活阈值 / cache_keepalive_threshold_min | 已完成 | 全局 Settings / 高级设置 | Settings 高级设置阈值 1–55 分钟；下一次 Activity 检查读取。 | [高级设置](./settings-advanced.md) · [当前 UI](../src/components/settings/SettingsAdvanced.tsx) |
| C20 | 兼容格式 / chat_format | 无需迁移 | 无 UI | 兼容、内部或运维字段；保留原消费者，不新增用户编辑器。 | [H/settings.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py) · [H/independent_llm.py](/Users/remix/Desktop/AionsHome-main/aion-chat/independent_llm.py) |
| C21 | Anthropic日程分层 / anthropic_schedule_in_system | 无需迁移 | 无 UI | 兼容、内部或运维字段；保留原消费者，不新增用户编辑器。 | [H/settings.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py) |
| C22 | 自动播放 / aion_tts_enabled | 确认存在缺口 | Chat/播放偏好 | 新端尚无自动 TTS 播放偏好入口及完整接线；已有手动音频播放不能算自动播放已迁移。 | [H/chat.html](/Users/remix/Desktop/AionsHome-main/aion-chat/static/chat.html) · [H/settings.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py) · [H/ws.py](/Users/remix/Desktop/AionsHome-main/aion-chat/ws.py) |
| C23 | 音色 / aion_tts_voice | 确认存在缺口 | Chat/播放偏好 | 新端未接 TTS 音色偏好与 WS 握手；服务 Provider 配置不能代替音色选择。 | [H/chat.html](/Users/remix/Desktop/AionsHome-main/aion-chat/static/chat.html) · [H/settings.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py) |
| C24 | 自动语音条 / aion_voice_auto_generate | 确认存在缺口 | Chat/播放偏好 | 新端未接自动语音条偏好；服务配置和手动播放不等同自动生成。 | [H/chat.html](/Users/remix/Desktop/AionsHome-main/aion-chat/static/chat.html) · [H/settings.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py) |
| C25 | 语音监听 / aion_voice_enabled、voice.enabled | 确认存在缺口 | Chat/Voice | Voice 监听未迁；旧内部 loopback send 的鉴权/DTO 风险仍需先修，不能仅加 UI。 | [H/chat.html](/Users/remix/Desktop/AionsHome-main/aion-chat/static/chat.html) · [H/voice.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/voice.py) · [H/voice.py](/Users/remix/Desktop/AionsHome-main/aion-chat/voice.py) |
| C26 | 唤醒词 / aion_voice_wakeword、wake_word | 确认存在缺口 | Chat/Voice | 唤醒词未迁，依赖 C25 的真实回送闭环。 | [H/chat.html](/Users/remix/Desktop/AionsHome-main/aion-chat/static/chat.html) · [H/voice.py](/Users/remix/Desktop/AionsHome-main/aion-chat/voice.py) |
| C27 | 麦克风来源 / aion_voice_mic_source | 确认存在缺口 | Chat/Voice | 麦克风来源未迁，保留设备/Voice 归属，先解决 C25。 | [H/chat.html](/Users/remix/Desktop/AionsHome-main/aion-chat/static/chat.html) · [H/voice.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/voice.py) |

### D · 人设、能力与工具

| ID | 原配置 / 能力 | 最终分类 | 入口 / 范围 | 核销说明 | 当前证据 |
| --- | --- | --- | --- | --- | --- |
| D01 | AI人设 / ai_persona | 留在业务页面 / Native | Worldbook/Persona | 旧 Worldbook 页面仍可编辑；Penumbra 未迁此业务编辑器，名称另有全站只读投影。保留业务归属，不追加全局设置。 | [H/worldbook.html](/Users/remix/Desktop/AionsHome-main/aion-chat/static/worldbook.html) · [H/settings.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py) · [H/builder.py](/Users/remix/Desktop/AionsHome-main/aion-chat/prompts/builder.py) |
| D02 | 用户人设/规则 / user_persona | 留在业务页面 / Native | Worldbook/Persona | 旧 Worldbook 页面仍可编辑；Penumbra 未迁此业务编辑器，名称另有全站只读投影。保留业务归属，不追加全局设置。 | [H/settings.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py) · [H/builder.py](/Users/remix/Desktop/AionsHome-main/aion-chat/prompts/builder.py) |
| D03 | AI背景记忆 / ai_about | 留在业务页面 / Native | Worldbook/Persona | 旧 Worldbook 页面仍可编辑；Penumbra 未迁此业务编辑器，名称另有全站只读投影。保留业务归属，不追加全局设置。 | [H/settings.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py) · [H/builder.py](/Users/remix/Desktop/AionsHome-main/aion-chat/prompts/builder.py) |
| D04 | AI名称 / ai_name | 留在业务页面 / Native | Worldbook/Persona | 旧 Worldbook 页面仍可编辑；Penumbra 未迁此业务编辑器，名称另有全站只读投影。保留业务归属，不追加全局设置。 | [P/worldbook-client.ts](/Users/remix/Desktop/Penumbra/src/domain/worldbook/worldbook-client.ts) · [H/settings.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py) |
| D05 | 用户名 / user_name | 留在业务页面 / Native | Worldbook/Persona | 旧 Worldbook 页面仍可编辑；Penumbra 未迁此业务编辑器，名称另有全站只读投影。保留业务归属，不追加全局设置。 | [P/useDisplayNames.ts](/Users/remix/Desktop/Penumbra/src/components/identity/useDisplayNames.ts) · [H/settings.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py) |
| D06 | 遗留Prompt字段 / system_prompt | 无需迁移 | 无 UI | 兼容、内部或运维字段；保留原消费者，不新增用户编辑器。 | [H/config.py](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py) · [H/settings.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py) |
| D07 | Provider metadata前缀 / user_prefix | 已明确暂缓 | 全局 Settings/安全高级 | settings-advanced.md 已明确暂缓：实例级 provider metadata 前缀，没有已确认的缓存命中收益；不提供内部 user_id 编辑。 | [高级设置](./settings-advanced.md) · [当前 UI](../src/components/settings/SettingsAdvanced.tsx) |
| D08 | Provider metadata身份 / user_id | 无需迁移 | 无 UI | 兼容、内部或运维字段；保留原消费者，不新增用户编辑器。 | [H/config.py](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py) |
| D09 | 隐藏DRIFT生成gate / enable_hidden_drift（旧simplethink兼容） | 已完成 | Chat / 聊天设置 / 高级控制 | Chat 高级控制 enable_hidden_drift；控制后续生成指令与输出处理，不再阻断历史回显。 | [四项控制](../src/components/chat/ChatAdvancedSettings.tsx) · [gate](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py) |
| D10 | 隐藏HEART生成gate / enable_hidden_heart | 已完成 | Chat / 聊天设置 / 高级控制 | Chat 高级控制 enable_hidden_heart；与 C12 独立。 | [四项控制](../src/components/chat/ChatAdvancedSettings.tsx) · [gate](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py) |
| D11 | 联网总许可 / web_access_enabled | 已完成 | 全局 Settings/Web | 现有入口读写及实际消费链保留；不重复迁移。 | [P/useWebSettings.ts](/Users/remix/Desktop/Penumbra/src/components/settings/web/useWebSettings.ts) · [H/chat.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py) · [H/reply_result_execution.py](/Users/remix/Desktop/AionsHome-main/aion-chat/reply_result_execution.py) |
| D12 | Brave凭据 / brave_search_key | 已完成 | 全局 Settings/Web | 现有入口读写及实际消费链保留；不重复迁移。 | [P/useWebSettings.ts](/Users/remix/Desktop/Penumbra/src/components/settings/web/useWebSettings.ts) · [H/web_search.py](/Users/remix/Desktop/AionsHome-main/aion-chat/web_search.py) · [H/settings.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py) |
| D13 | MCP总开关 / enabled | 已完成 | 全局 Settings/MCP | 现有入口读写及实际消费链保留；不重复迁移。 | [P/MCPPage.tsx](/Users/remix/Desktop/Penumbra/src/components/settings/mcp/MCPPage.tsx) · [H/mcp.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/mcp.py) |
| D14 | MCP标识 / servers[name].name | 已完成 | 全局 Settings/MCP | 现有入口读写及实际消费链保留；不重复迁移。 | [P/MCPServerEditor.tsx](/Users/remix/Desktop/Penumbra/src/components/settings/mcp/MCPServerEditor.tsx) · [H/mcp.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/mcp.py) |
| D15 | MCP显示名 / display_name | 已完成 | 全局 Settings/MCP | 现有入口读写及实际消费链保留；不重复迁移。 | [P/MCPServerEditor.tsx](/Users/remix/Desktop/Penumbra/src/components/settings/mcp/MCPServerEditor.tsx) · [H/mcp.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/mcp.py) |
| D16 | MCP地址 / url | 已完成 | 全局 Settings/MCP | 现有入口读写及实际消费链保留；不重复迁移。 | [P/MCPServerEditor.tsx](/Users/remix/Desktop/Penumbra/src/components/settings/mcp/MCPServerEditor.tsx) · [H/mcp.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/mcp.py) · [H/mcp_client.py](/Users/remix/Desktop/AionsHome-main/aion-chat/mcp_client.py) |
| D17 | MCP凭据 / token | 已完成 | 全局 Settings/MCP | 现有入口读写及实际消费链保留；不重复迁移。 | [P/MCPConfirmDialog.tsx](/Users/remix/Desktop/Penumbra/src/components/settings/mcp/MCPConfirmDialog.tsx) · [H/mcp.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/mcp.py) · [H/mcp.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/mcp.py) |
| D18 | MCP服务器启用 / enabled | 已完成 | 全局 Settings/MCP | 现有入口读写及实际消费链保留；不重复迁移。 | [P/MCPServerEditor.tsx](/Users/remix/Desktop/Penumbra/src/components/settings/mcp/MCPServerEditor.tsx) · [H/mcp.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/mcp.py) |
| D19 | MCP鉴权模式 / credential_mode | 已完成 | 全局 Settings/MCP | 现有入口读写及实际消费链保留；不重复迁移。 | [P/MCPServerEditor.tsx](/Users/remix/Desktop/Penumbra/src/components/settings/mcp/MCPServerEditor.tsx) · [H/mcp.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/mcp.py) |
| D20 | MCP链深 / mcp_max_chain_depth | 已完成 | 全局 Settings/MCP 高级 | 现有入口读写及实际消费链保留；不重复迁移。 | [P/mcp-client.ts](/Users/remix/Desktop/Penumbra/src/domain/mcp/mcp-client.ts) · [H/settings.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py) · [H/config.py](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py) |
| D21 | Capability/Command策略 / CAPABILITY_REGISTRY、default_enabled、effective policy | 无需迁移 | 无 UI | 兼容、内部或运维字段；保留原消费者，不新增用户编辑器。 | [H/capability_registry.py](/Users/remix/Desktop/AionsHome-main/aion-chat/capability_registry.py) · [H/chat.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py) |
| D22 | 自动总结阈值 / _AUTO_DIGEST_MIN | 无需迁移 | 无 UI | 兼容、内部或运维字段；保留原消费者，不新增用户编辑器。 | [H/memory.py](/Users/remix/Desktop/AionsHome-main/aion-chat/memory.py) |

### E · 业务与服务

| ID | 原配置 / 能力 | 最终分类 | 入口 / 范围 | 核销说明 | 当前证据 |
| --- | --- | --- | --- | --- | --- |
| E01 | Diary自动投喂 / diary_auto_feed | 已完成 | Diary | Diary 自动投喂原位管理，W 字段保留与投喂参数校验已有交付；不移入全局 Settings。 | [P/diary-write-client.ts](/Users/remix/Desktop/Penumbra/src/domain/diary/diary-write-client.ts) · [H/diary.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/diary.py) · [H/schedule.py](/Users/remix/Desktop/AionsHome-main/aion-chat/schedule.py) |
| E02 | Diary模型 / diary_entries.model、请求model | 已完成 | Diary Entry + 全局模型与任务分配 | Entry 独立模型已接；新增全局 diary_chat 与 diary_chat_follow_main 已接读写/消费。跟随最近 Main 仅影响之后投喂，已有草稿继续 Entry 选择。 | [Entry/投喂](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/diary.py) · [Feature UI](../src/components/settings/features/FeatureBindingDialog.tsx) |
| E03 | Diary缓存断点 / diary_cache_breakpoint、diary_cache_msg_id | 无需迁移 | 无 UI | 兼容、内部或运维字段；保留原消费者，不新增用户编辑器。 | [H/diary.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/diary.py) · [H/diary.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/diary.py) |
| E04 | Diary元数据 / importance、keywords、tags | 已完成 | Diary/单篇 | 现有入口读写及实际消费链保留；不重复迁移。 | [P/diary-write-client.ts](/Users/remix/Desktop/Penumbra/src/domain/diary/diary-write-client.ts) · [H/diary.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/diary.py) · [H/database.py](/Users/remix/Desktop/AionsHome-main/aion-chat/database.py) |
| E05 | Memory置顶待解决 / memories.unresolved | 已完成 | Memory/单条 | 现有入口读写及实际消费链保留；不重复迁移。 | [P/memory-client.ts](/Users/remix/Desktop/Penumbra/src/domain/memory/memory-client.ts) · [H/memories.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/memories.py) · [H/memory.py](/Users/remix/Desktop/AionsHome-main/aion-chat/memory.py) |
| E06 | Memory元数据 / type、importance、keywords | 确认存在缺口 | Memory/单条 | 重要度/关键词可编辑、创建可选类型；现存条目 type 尚不可编辑，保留业务页补齐。 | [Memory 编辑](../src/components/memory/MemoryEditDialog.tsx) |
| E07 | 总结锚点 / last_digest_ts、last_digest_msg_id | 确认存在缺口 | Memory/高级 | 总结锚点查看/重置未接；重总结和 requeue 不能替代锚点管理。 | [Memory 路由](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/memories.py) |
| E08 | Quick Note截止时刻 / qn_trigger_hours | 已完成 | Quick Note | 现有入口读写及实际消费链保留；不重复迁移。 | [P/quick-note-config-controller.ts](/Users/remix/Desktop/Penumbra/src/application/quick-note/quick-note-config-controller.ts) · [H/quick_notes.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/quick_notes.py) · [H/quick_note_config.py](/Users/remix/Desktop/AionsHome-main/aion-chat/quick_note_config.py) |
| E09 | Quick Note名称 / qn_period_labels | 已完成 | Quick Note | 现有入口读写及实际消费链保留；不重复迁移。 | [P/QuickNoteConfig.tsx](/Users/remix/Desktop/Penumbra/src/components/quick-note/QuickNoteConfig.tsx) · [H/quick_notes.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/quick_notes.py) |
| E10 | 活动AI联动 / activity_tracking_enabled | 确认存在缺口 | Activity | Activity 联动仅查看；后端 PUT 已有，Penumbra 无编辑入口。开启可能触发后续主动行为。 | [Activity 查看](../src/components/activity/ActivityLinkageDetails.tsx) |
| E11 | AI手机上下文可见 / device_context_ai_visible | 已完成 | Activity | 现有入口读写及实际消费链保留；不重复迁移。 | [P/device-context-client.ts](/Users/remix/Desktop/Penumbra/src/domain/device-context/device-context-client.ts) · [H/settings.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py) · [H/device_context.py](/Users/remix/Desktop/AionsHome-main/aion-chat/device_context.py) |
| E12 | Wi-Fi场景 / mappings[].ssid/scene、revision | 已完成 | Activity | 现有入口读写及实际消费链保留；不重复迁移。 | [P/WifiSceneSettings.tsx](/Users/remix/Desktop/Penumbra/src/components/activity/WifiSceneSettings.tsx) · [H/wifi_scene_config.py](/Users/remix/Desktop/AionsHome-main/aion-chat/wifi_scene_config.py) · [H/WifiSceneCache.java](/Users/remix/Desktop/AionsHome-main/AionApp/app/src/main/java/com/aion/chat/WifiSceneCache.java) |
| E13 | 手机绑定 / device_id、binding_id、installation_id、revision | 留在业务页面 / Native | Activity 状态，Android Native 管理 | 绑定由 Android 管理，Web 只读状态为有意边界，不应在 Settings 重建绑定编辑器。 | [P/device-context-client.ts](/Users/remix/Desktop/Penumbra/src/domain/device-context/device-context-client.ts) · [H/device_binding.py](/Users/remix/Desktop/AionsHome-main/aion-chat/device_binding.py) · [H/DeviceBindingClient.java](/Users/remix/Desktop/AionsHome-main/AionApp/app/src/main/java/com/aion/chat/DeviceBindingClient.java) |
| E14 | Location总开关 / enabled | 已完成 | Location | 现有入口读写及实际消费链保留；不重复迁移。 | [P/location-controller.ts](/Users/remix/Desktop/Penumbra/src/application/location/location-controller.ts) · [H/location.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/location.py) |
| E15 | Location静默开关 / quiet_hours_enabled | 已完成 | Location | 现有入口读写及实际消费链保留；不重复迁移。 | [P/location-controller.ts](/Users/remix/Desktop/Penumbra/src/application/location/location-controller.ts) · [H/location.py](/Users/remix/Desktop/AionsHome-main/aion-chat/location.py) |
| E16 | 统一静默 / quiet_hours_start/end | 已完成 | Location | 现有入口读写及实际消费链保留；不重复迁移。 | [P/location-controller.ts](/Users/remix/Desktop/Penumbra/src/application/location/location-controller.ts) · [H/location.py](/Users/remix/Desktop/AionsHome-main/aion-chat/location.py) |
| E17 | 工作日静默 / quiet_hours_weekday_start/end | 已完成 | Location | 现有入口读写及实际消费链保留；不重复迁移。 | [P/location-controller.ts](/Users/remix/Desktop/Penumbra/src/application/location/location-controller.ts) · [H/location.py](/Users/remix/Desktop/AionsHome-main/aion-chat/location.py) |
| E18 | 休息日静默 / quiet_hours_weekend_start/end | 已完成 | Location | 现有入口读写及实际消费链保留；不重复迁移。 | [P/location-controller.ts](/Users/remix/Desktop/Penumbra/src/application/location/location-controller.ts) · [H/location.py](/Users/remix/Desktop/AionsHome-main/aion-chat/location.py) |
| E19 | 工作日 / weekday_days | 已完成 | Location | 现有入口读写及实际消费链保留；不重复迁移。 | [P/location-controller.ts](/Users/remix/Desktop/Penumbra/src/application/location/location-controller.ts) · [H/location.py](/Users/remix/Desktop/AionsHome-main/aion-chat/location.py) |
| E20 | 家庭坐标 / home_lng、home_lat | 已完成 | Location | 现有入口读写及实际消费链保留；不重复迁移。 | [P/location-controller.ts](/Users/remix/Desktop/Penumbra/src/application/location/location-controller.ts) · [H/location.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/location.py) |
| E21 | 在家范围 / home_threshold | 已完成 | Location | 现有入口读写及实际消费链保留；不重复迁移。 | [P/location-controller.ts](/Users/remix/Desktop/Penumbra/src/application/location/location-controller.ts) · [H/location.py](/Users/remix/Desktop/AionsHome-main/aion-chat/location.py) |
| E22 | POI半径 / poi_radius | 已完成 | Location | 现有入口读写及实际消费链保留；不重复迁移。 | [P/location-controller.ts](/Users/remix/Desktop/Penumbra/src/application/location/location-controller.ts) · [H/location.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/location.py) |
| E23 | 高德凭据 / amap_key | 已完成 | Location | 现有入口读写及实际消费链保留；不重复迁移。 | [P/location-controller.ts](/Users/remix/Desktop/Penumbra/src/application/location/location-controller.ts) · [H/location.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/location.py) · [H/location.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/location.py) |
| E24 | 外出上报周期 / heartbeat_outdoor_min | 确认存在缺口 | Location/Android，先无 UI | 可通过 Location API 保存，但 Android 仍使用固定 LOCATION_INTERVAL；无周期消费者，不加无效 Web 控件。 | [Native](/Users/remix/Desktop/AionsHome-main/AionApp/app/src/main/java/com/aion/chat/AionPushService.java) |
| E25 | 在家上报周期 / heartbeat_home_min | 确认存在缺口 | Location/Android，先无 UI | 同 E24，家庭周期字段没有 Native 消费，留待 Native/API 契约决策。 | [Native](/Users/remix/Desktop/AionsHome-main/AionApp/app/src/main/java/com/aion/chat/AionPushService.java) |
| E26 | POI类别映射 / poi_types | 无需迁移 | 无 UI | 兼容、内部或运维字段；保留原消费者，不新增用户编辑器。 | [H/location.py](/Users/remix/Desktop/AionsHome-main/aion-chat/location.py) · [H/location.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/location.py) |
| E27 | 显著移动阈值 / movement_threshold | 无需迁移 | 无 UI | 兼容、内部或运维字段；保留原消费者，不新增用户编辑器。 | [H/location.py](/Users/remix/Desktop/AionsHome-main/aion-chat/location.py) · [H/location.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/location.py) |
| E28 | Camera设备 / camera_index | 留在业务页面 / Native | Camera | 旧 Camera 专页保留，新端无 Camera 管理页；随 Camera 业务迁移，裁剪还需标明进程内状态边界。 | [H/camera.html](/Users/remix/Desktop/AionsHome-main/aion-chat/static/camera.html) · [H/cam.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/cam.py) · [H/cam.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/cam.py) |
| E29 | 随机截图周期 / auto_interval_min/max | 留在业务页面 / Native | Camera | 旧 Camera 专页保留，新端无 Camera 管理页；随 Camera 业务迁移，裁剪还需标明进程内状态边界。 | [H/cam.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/cam.py) · [H/camera.py](/Users/remix/Desktop/AionsHome-main/aion-chat/camera.py) |
| E30 | 截图保留数量 / max_screenshots | 留在业务页面 / Native | Camera | 旧 Camera 专页保留，新端无 Camera 管理页；随 Camera 业务迁移，裁剪还需标明进程内状态边界。 | [H/cam.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/cam.py) · [H/camera.py](/Users/remix/Desktop/AionsHome-main/aion-chat/camera.py) |
| E31 | 自动监控 / monitor_enabled | 留在业务页面 / Native | Camera | 旧 Camera 专页保留，新端无 Camera 管理页；随 Camera 业务迁移，裁剪还需标明进程内状态边界。 | [H/cam.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/cam.py) · [H/config.py](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py) |
| E32 | Camera静默 / quiet_hours_enabled/start/end | 留在业务页面 / Native | Camera | 旧 Camera 专页保留，新端无 Camera 管理页；随 Camera 业务迁移，裁剪还需标明进程内状态边界。 | [H/cam.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/cam.py) · [H/camera.py](/Users/remix/Desktop/AionsHome-main/aion-chat/camera.py) |
| E33 | Camera裁剪 / zoom、cx、cy | 留在业务页面 / Native | Camera | 旧 Camera 专页保留，新端无 Camera 管理页；随 Camera 业务迁移，裁剪还需标明进程内状态边界。 | [H/cam.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/cam.py) |
| E34 | 四类日程 / type、content、trigger_at、status | 已完成 | 记挂/待办/闹钟/查岗 | 现有入口读写及实际消费链保留；不重复迁移。 | [P/DesktopAppView.tsx](/Users/remix/Desktop/Penumbra/src/components/apps/DesktopAppView.tsx) · [H/database.py](/Users/remix/Desktop/AionsHome-main/aion-chat/database.py) · [H/schedule.py](/Users/remix/Desktop/AionsHome-main/aion-chat/schedule.py) |
| E35 | Theater角色 / name、persona、model、temperature、context_limit | 留在业务页面 / Native | Theater/角色 | 旧 Theater 专页保留，Penumbra 未迁业务页；不与全局模型默认混合。 | [H/theater.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/theater.py) · [H/theater.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/theater.py) |
| E36 | Theater会话 / model、persona_id | 留在业务页面 / Native | Theater/会话 | 旧 Theater 专页保留，Penumbra 未迁业务页；不与全局模型默认混合。 | [H/theater.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/theater.py) · [H/theater.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/theater.py) |
| E37 | Theater请求偏好 / theater_context_limit、theater_temperature | 留在业务页面 / Native | Theater/生成 | 旧 Theater 专页保留，Penumbra 未迁业务页；不与全局模型默认混合。 | [H/theater.html](/Users/remix/Desktop/AionsHome-main/aion-chat/static/theater.html) · [H/theater.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/theater.py) |
| E38 | Theater语音 / theater_tts_enabled、theater_tts_voice | 留在业务页面 / Native | Theater/语音 | 旧 Theater 专页保留，Penumbra 未迁业务页；不与全局模型默认混合。 | [H/theater.html](/Users/remix/Desktop/AionsHome-main/aion-chat/static/theater.html) · [H/tts.py](/Users/remix/Desktop/AionsHome-main/aion-chat/tts.py) |
| E39 | Book批注覆盖 / model_key | 留在业务页面 / Native | Reading/批注 | Reading 单次/批量批注覆盖属于 Reading；旧页/后端保留，Penumbra 未迁。B15 默认已完成。 | [H/reading.html](/Users/remix/Desktop/AionsHome-main/aion-chat/static/reading.html) · [H/book.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/book.py) |
| E40 | Game模型 / model_key、binding_fingerprint/metadata | 留在业务页面 / Native | Game/新局 | Game 新局绑定/指纹属于 Game；后端保留，Penumbra 无正式新局页。B16 默认已完成。 | [H/service.py](/Users/remix/Desktop/AionsHome-main/aion-chat/game/service.py) · [H/binding.py](/Users/remix/Desktop/AionsHome-main/aion-chat/game/binding.py) |
| E41 | Game局参数 / config.difficulty/chapter | 留在业务页面 / Native | Game/新局 | Game 难度/章节属于新局业务表单，后端支持不等于应加入全局 Settings。 | [H/detroit.py](/Users/remix/Desktop/AionsHome-main/aion-chat/game/detroit.py) · [H/service.py](/Users/remix/Desktop/AionsHome-main/aion-chat/game/service.py) |
| E42 | 音乐登录 / netease_music_u | 已完成 | 全局 Settings/Music | Music 凭据替换/查看/清除已接；登录结果用 N05，只是当前凭据最近一次进程状态。 | [P/useMusicSettings.ts](/Users/remix/Desktop/Penumbra/src/components/settings/music/useMusicSettings.ts) · [H/settings.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py) · [H/music.py](/Users/remix/Desktop/AionsHome-main/aion-chat/music.py) |
| E43 | 音乐音量 / aion_music_volume | 确认存在缺口 | Music/播放控件 | Chat 音乐播放器读取已有 LS/Native 音量值，但没有持久化音量控件。 | [音量消费](../src/application/chat-media/audio-controller.ts) |
| E44 | MiniMax TTS连接 / minimax_tts_url/key | 已完成 | 全局 Settings/Speech | 现有入口读写及实际消费链保留；不重复迁移。 | [P/SpeechSettingsPage.tsx](/Users/remix/Desktop/Penumbra/src/components/settings/speech/SpeechSettingsPage.tsx) · [H/tts.py](/Users/remix/Desktop/AionsHome-main/aion-chat/speech/tts.py) · [H/settings.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py) |
| E45 | MiniMax TTS模型 / minimax_tts_model | 已完成 | 全局 Settings/Speech | 现有入口读写及实际消费链保留；不重复迁移。 | [P/speech-settings.ts](/Users/remix/Desktop/Penumbra/src/domain/speech-settings/speech-settings.ts) · [H/tts.py](/Users/remix/Desktop/AionsHome-main/aion-chat/speech/tts.py) |
| E46 | TTS Provider / tts_provider | 已完成 | 全局 Settings/Speech | 现有入口读写及实际消费链保留；不重复迁移。 | [P/SpeechSettingsPage.tsx](/Users/remix/Desktop/Penumbra/src/components/settings/speech/SpeechSettingsPage.tsx) · [H/tts.py](/Users/remix/Desktop/AionsHome-main/aion-chat/speech/tts.py) |
| E47 | SiliconFlow TTS模型 / siliconflow_tts_model | 已完成 | 全局 Settings/Speech | 现有入口读写及实际消费链保留；不重复迁移。 | [P/SpeechSettingsPage.tsx](/Users/remix/Desktop/Penumbra/src/components/settings/speech/SpeechSettingsPage.tsx) · [H/tts.py](/Users/remix/Desktop/AionsHome-main/aion-chat/speech/tts.py) |
| E48 | ElevenLabs连接 / elevenlabs_tts_url/key | 已完成 | 全局 Settings/Speech | 现有入口读写及实际消费链保留；不重复迁移。 | [P/SpeechSettingsPage.tsx](/Users/remix/Desktop/Penumbra/src/components/settings/speech/SpeechSettingsPage.tsx) · [H/tts.py](/Users/remix/Desktop/AionsHome-main/aion-chat/speech/tts.py) |
| E49 | ElevenLabs模型/格式 / elevenlabs_tts_model/output_format | 确认存在缺口 | 全局 Settings/Speech | 模型可编辑，格式只读；后端仍接受任意输出格式并按 MP3 路径/类型消费，缺格式一致性约束，不能直接开放格式编辑。 | [Speech UI](../src/components/settings/speech/SpeechSettingsPage.tsx) |
| E50 | ASR连接 / minimax_asr_url/key | 已完成 | 全局 Settings/Speech | 现有入口读写及实际消费链保留；不重复迁移。 | [P/speech-settings.ts](/Users/remix/Desktop/Penumbra/src/domain/speech-settings/speech-settings.ts) · [H/voice.py](/Users/remix/Desktop/AionsHome-main/aion-chat/voice.py) · [H/voice.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/voice.py) |
| E51 | ASR模型 / minimax_asr_model | 已完成 | 全局 Settings/Speech | 现有入口读写及实际消费链保留；不重复迁移。 | [P/SpeechSettingsPage.tsx](/Users/remix/Desktop/Penumbra/src/components/settings/speech/SpeechSettingsPage.tsx) · [H/config.py](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py) · [H/voice.py](/Users/remix/Desktop/AionsHome-main/aion-chat/voice.py) |
| E52 | Embedding共享连接 / siliconflow_url/key | 无需迁移 | 无 UI（旧共享字段） | 旧 siliconflow_url/key 不再作为 TTS/Embedding 共用编辑器；N02/N03 为独立权威。 | [H/config.py](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py) · [H/connection_registry.py](/Users/remix/Desktop/AionsHome-main/aion-chat/connection_registry.py) · [H/memory.py](/Users/remix/Desktop/AionsHome-main/aion-chat/memory.py) |
| E53 | Embedding模型 / embedding_model | 已完成 | 全局 Settings/Embedding（只读） | Embedding 模型只读符合既定策略；地址与 Key 在 N03，向量约束余项在 N09。 | [P/embedding-settings-client.ts](/Users/remix/Desktop/Penumbra/src/domain/embedding-settings/embedding-settings-client.ts) · [H/settings.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py) · [H/memory.py](/Users/remix/Desktop/AionsHome-main/aion-chat/memory.py) |
| E54 | 旧Whisper设备预设 / sosexy_presets_v3[].motors[].on/mode/speed | 留在业务页面 / Native | Chat/Whisper 设备 | 旧 Whisper 专用设备预设留原业务入口，Penumbra 无对应业务页；不移入服务配置。 | [H/chat.html](/Users/remix/Desktop/AionsHome-main/aion-chat/static/chat.html) |

### F · 系统、Native 与内部策略

| ID | 原配置 / 能力 | 最终分类 | 入口 / 范围 | 核销说明 | 当前证据 |
| --- | --- | --- | --- | --- | --- |
| F01 | 数据路径 / DATA_DIR、DB_PATH、UPLOADS_DIR、CHATS_DIR、SCREENSHOTS_DIR、TTS_CACHE_DIR | 无需迁移 | 无 UI | 兼容、内部或运维字段；保留原消费者，不新增用户编辑器。 | [H/config.py](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py) · [H/database.py](/Users/remix/Desktop/AionsHome-main/aion-chat/database.py) |
| F02 | 上传策略 / ALLOWED_TYPES、20MiB、时间戳命名 | 无需迁移 | 无 UI | 兼容、内部或运维字段；保留原消费者，不新增用户编辑器。 | [H/files.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/files.py) · [H/config.py](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py) · [H/upload_validation.py](/Users/remix/Desktop/AionsHome-main/aion-chat/upload_validation.py) |
| F03 | 初始登录 / AION_AUTH_USERNAME/PASSWORD | 无需迁移 | 无 UI | 兼容、内部或运维字段；保留原消费者，不新增用户编辑器。 | [H/auth.py](/Users/remix/Desktop/AionsHome-main/aion-chat/auth.py) |
| F04 | 鉴权/Push / session_secret、push_token、ANDROID_PUSH_TOKEN、SESSION_SECONDS | 无需迁移 | 无 UI | 兼容、内部或运维字段；保留原消费者，不新增用户编辑器。 | [H/auth.py](/Users/remix/Desktop/AionsHome-main/aion-chat/auth.py) · [H/auth.py](/Users/remix/Desktop/AionsHome-main/aion-chat/auth.py) |
| F05 | 设备有效期env / AION_DEVICE_CONTEXT_BATTERY_TTL_SECONDS、WIFI_TTL_SECONDS、MAX_SAMPLE_AGE_SECONDS、FUTURE_SKEW_SECONDS | 无需迁移 | 无 UI | 兼容、内部或运维字段；保留原消费者，不新增用户编辑器。 | [H/device_context.py](/Users/remix/Desktop/AionsHome-main/aion-chat/device_context.py) · [H/device_context.py](/Users/remix/Desktop/AionsHome-main/aion-chat/device_context.py) |
| F06 | 旧绑定env / AION_DEVICE_CONTEXT_DEVICE_ID、BINDING_ID | 无需迁移 | 无 UI | 兼容、内部或运维字段；保留原消费者，不新增用户编辑器。 | [H/device_binding.py](/Users/remix/Desktop/AionsHome-main/aion-chat/device_binding.py) |
| F07 | 业务时区 / TZ或/etc/localtime IANA | 无需迁移 | 无 UI（可业务只读） | 兼容、内部或运维字段；保留原消费者，不新增用户编辑器。 | [H/quick_note_config.py](/Users/remix/Desktop/AionsHome-main/aion-chat/quick_note_config.py) · [H/quick_notes.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/quick_notes.py) |
| F08 | Penumbra端点 / VITE_API_BASE_URL(BASE)、VITE_UPLOAD_URL、VITE_WEBSOCKET_URL(WS_URL)、VITE_API_TIMEOUT_MS | 无需迁移 | 无 UI | 兼容、内部或运维字段；保留原消费者，不新增用户编辑器。 | [P/runtime-config.ts](/Users/remix/Desktop/Penumbra/src/lib/runtime-config.ts) |
| F09 | 开发反代 / PENUMBRA_DEV_PROXY_TARGET | 无需迁移 | 无 UI | 兼容、内部或运维字段；保留原消费者，不新增用户编辑器。 | [P/dev-proxy-config.ts](/Users/remix/Desktop/Penumbra/src/config/dev-proxy-config.ts) |
| F10 | 受控路径gate / canonical_path_enabled、force_legacy、anthropic_canonical_path_enabled、anthropic_force_legacy | 无需迁移 | 无 UI | 兼容、内部或运维字段；保留原消费者，不新增用户编辑器。 | [H/settings.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py) · [H/chat.py](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/chat.py) |
| F11 | 诊断/启动/代理 / AION_STARTUP_MODE、AION_ANTHROPIC_PROVENANCE_DEBUG/HMAC_KEY/LOG、WEB_EVIDENCE_DIAGNOSTICS(_TARGET)、HTTPS_PROXY/https_proxy | 无需迁移 | 无 UI | 兼容、内部或运维字段；保留原消费者，不新增用户编辑器。 | [H/main.py](/Users/remix/Desktop/AionsHome-main/aion-chat/main.py) · [H/anthropic_provenance.py](/Users/remix/Desktop/AionsHome-main/aion-chat/anthropic_provenance.py) · [H/web_evidence_diagnostics.py](/Users/remix/Desktop/AionsHome-main/aion-chat/web_evidence_diagnostics.py) · [H/web_search.py](/Users/remix/Desktop/AionsHome-main/aion-chat/web_search.py) |
| F12 | 备份 / data_dir、state_dir、credentials_file、restic_binary、expected_repository_id、historical_database_files、extra_files、reserve_bytes、run_timeout_seconds、sqlite_timeout_seconds；timer | 无需迁移 | 无 UI | 兼容、内部或运维字段；保留原消费者，不新增用户编辑器。 | [H/config.example.json](/Users/remix/Desktop/AionsHome-main/deploy/backup/config.example.json) · [H/aionhome-backup.timer](/Users/remix/Desktop/AionsHome-main/deploy/backup/aionhome-backup.timer) |
| F13 | Activity保留 / KEEP_HOURS、清理节流 | 无需迁移 | 无 UI | 兼容、内部或运维字段；保留原消费者，不新增用户编辑器。 | [H/activity.py](/Users/remix/Desktop/AionsHome-main/aion-chat/activity.py) · [H/activity.py](/Users/remix/Desktop/AionsHome-main/aion-chat/activity.py) |
| F14 | Memory算法 / DECAY_LAMBDA、FRESHNESS_HALF_LIFE_H、ARCHIVE_THRESHOLD、SQL top-k/阈值 | 无需迁移 | 无 UI | 兼容、内部或运维字段；保留原消费者，不新增用户编辑器。 | [H/decay_engine.py](/Users/remix/Desktop/AionsHome-main/aion-chat/decay_engine.py) · [H/memory.py](/Users/remix/Desktop/AionsHome-main/aion-chat/memory.py) |

## 后续 11 项新增记录

| ID | 原记录 | 最终分类 | 核销说明 | 当前证据 |
| --- | --- | --- | --- | --- |
| N01 | 发送快捷键 | 已完成 | Chat 设置发送快捷键仍为本机偏好，不需要服务端迁移。 | [快捷键](../src/components/chat/send-shortcut-preference.ts) |
| N02 | SiliconFlow TTS 独立地址与 Key | 已完成 | Speech 独立 siliconflow_tts_url/key，启动单次迁移后与 LLM/Embedding 分离。 | [Speech](../src/components/settings/speech/SpeechSettingsPage.tsx) |
| N03 | Embedding 独立地址与 Key | 已完成 | 已提交的 Embedding URL/Key；模型只读。实际消费者 memory.get_embedding，不能把保存当联通。 | [Embedding](../src/domain/embedding-settings/embedding-settings-client.ts) |
| N04 | MCP 单工具启禁用 | 已完成 | MCP disabled_tools 有配置与运行时过滤；重连/发现状态与配置成功分别呈现。 | [MCP](../src/components/settings/mcp/MCPPage.tsx) |
| N05 | Music 最近登录状态 | 已完成 | 只读最近登录结果，无验证副作用；详见专项核销。 | [Music](../src/domain/music-settings/music-settings-client.ts) |
| N06 | Session 与 Main readiness 管理视图 | 无需迁移 | 原管理视图被高级设置替代，旧组件已删除；readiness/session 仍供功能调用。无需恢复页面。 | [导航](../src/components/settings/SettingsView.tsx) |
| N07 | Android 服务地址、自动连接与按 origin 保存 Push 凭据 | 留在业务页面 / Native | Android 服务地址、自动连接、按 origin 隔离 Push 凭据仍留 Native；默认进入 Penumbra 的提交已落地，不改回旧入口。 | [Native 连接](/Users/remix/Desktop/AionsHome-main/AionApp/app/src/main/java/com/aion/chat/ConnectionPage.java) |
| N08 | Diary 生成温度与上下文显式参数 | 确认存在缺口 | Diary 温度/上下文请求参数仍无新端编辑入口；不是 Entry 模型绑定或全局 Diary usage 的缺口。先确认是否需要用户覆盖。 | [Diary 发送](../src/domain/diary/diary-chat-send-client.ts) |
| N09 | 向量空间与维度约束 | 确认存在缺口 | 已补响应 1024 长度、有限非零值/float32 验证、异维召回保护和失败向量处理；同维不同向量空间无代际标记，无法验证历史空间。留内部治理，不加配置 UI。 | [向量校验](/Users/remix/Desktop/AionsHome-main/aion-chat/memory.py) |
| N10 | 历史来源重排队、重总结与任务确认 | 已完成 | Memory 重总结、历史来源 requeue 与任务确认仍在业务页，已接后端。 | [Memory](../src/components/memory/MemoryView.tsx) |
| N11 | 语音条收藏 | 确认存在缺口 | 旧 Chat 可管理 voice favorite，新端未接管理入口；和语音偏好一同评估，不挪全局服务配置。 | [语音 API](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py) |

## 重复入口、旧入口清理与无效配置检查

| 检查 | 结论 / 影响 | 建议 |
| --- | --- | --- |
| Web 压缩模型 vs 功能分配 | Web 页只导航到同一 Feature 编辑器，无第二套权威。Main 当前会话、Main 新会话默认、Diary Entry 与 Diary 投喂默认具有不同生命周期，不是重复编辑器。 | 保持现有边界。 |
| 外观旧存储和快捷入口 | src 与 index.html 当前外观链已无旧 penumbra-theme-mode/color/ai-color、旧 IDB 图片读写；桌面和 Settings 写同一服务端权威。普通组件布局/签名本机保存为有意边界。 | 不重复迁移；旧图片需用户重新上传，旧历史备份不在本轮修改。 |
| 旧静态 Settings/Chat | `/settings`、`/chat` 等旧页面仍为兼容入口，旧 Settings 有 Registry/服务/缓存等编辑器。不是新端同时维护的第二份配置，但旧 Chat 仍含兼容温度/Thinking/LS 请求偏好，可能与新端 Main defaults 不同。默认入口已切 Penumbra，不表示旧 HTML 退役。 | 保留兼容期；如要移除旧入口单独确认，不能为本次核销直接删旧端。 |
| 系统状态旧组件 | SettingsSafeBasics 与导航已经移除；session/readiness API 有真实调用，保留 API 不是清理遗漏。 | 无需恢复原卡片。 |
| 功能分配数量文案 | 实际 FEATURE_GROUPS 为 10 项，SettingsView description 仍写“九项功能”。列表按实际数量渲染，无任务缺失。 | P3 文案修正候选；本次保持只读。 |
| Location 周期 E24/E25 | 后端 DTO/文件能保存，Native 仍固定 10 分钟；新 UI 没伪装接通，也没有新增无效表单。 | Native 与 API 先决定接通或退役字段。 |
| 高级缓存与 HEART/DRIFT | 新入口均有消费者；旧 include_simplethink/enable_hidden_simplethink 仅迁移兼容，不新增同义开关。生成和历史四项独立，不能用旧文档的联动描述验收。 | 完成项不重复立项。 |
| 后端有支持但新端未提供 | Memory type/锚点、Activity 联动、音乐音量为新端已存在业务中的实质缺口；Voice/自动 TTS/收藏与请求覆盖则需产品选择和完整消费链。 | 按下一节分批确认，全部先列出不实现。 |
| 输出格式 E49 | 当前 UI 格式只读，而后端有任意字符串写入；音频路径/MIME 假设 MP3。缺少的是后端一致性约束，不是简单缺一个下拉框。 | 后端先确定允许格式/失败语义，再决定是否开放。 |
| 向量 N09 | 异维/非法值保护已做；同维跨服务空间没有历史证明。现有地址可编辑，但 UI 无法解决旧 BLOB 空间识别。 | 内部数据契约治理，避免重复做已完成的数值校验。 |

本轮未发现新的全局 Settings 表单已接入却完全无后端消费者的情形。E24/E25 是仍保留的无消费后端字段；E49 是可写但消费约束不足；Music、MCP 的“配置已保存”不应解释成外部登录/连接已成功。

## 剩余缺口与处理顺序（待确认）

以下 18 项与逐项表中“确认存在缺口”完全对应。分组不增加项目数，也不授权本轮实现。

| 顺序 | ID / 数量 | 最小建议与验收目标 |
| --- | --- | --- |
| P1 数据正确性 | N09（1） | 在已有非法值/异维保护上，只处理同维空间来源和切换策略；涉及 schema、代际或重建时需另行确认。不要再将旧 zip 截断风险列为未修。 |
| P1 Voice 前置 | C25/C26/C27（3） | 先核对/修复内部回送鉴权及生成 DTO，再决定设备监听 UI；避免做成“开启成功但消息未送达”。 |
| P1 服务约束 | E49（1） | ElevenLabs 格式与落盘路径/MIME 一致性；先约束后端，再决定是否需格式编辑器。 |
| P2 现存业务小缺口 | E06/E07/E10/E43（4） | Memory 现存条目 type、总结锚点，Activity 联动保存读回，音乐可持久音量控件；分别留对应业务页。锚点与联动须说明真实行为影响。 |
| P2 Native 契约 | E24/E25（2） | 先决定固定周期是否为预期设计；如需可调，由 Android 真正读取配置并实测，再加有价值的 UI。 |
| 随语音产品决策 | C22/C23/C24/N11（4） | 自动播放、音色、自动语音条与收藏一并评估，保留播放权限、Provider 切换和设备范围语义。 |
| 随请求功能决策 | C05/C06/N08（3） | fast/whisper 与 Diary 参数覆盖是否仍需保留；确认保留才做原位入口，不把后端参数存在当必须迁移理由。 |

C15/C16/D07 的 3 项明确暂缓另计：C15/C16 先治理全库缓存重置和失败恢复，D07 需实际 Provider 身份管理需求再重开。Worldbook、Camera、Reading、Theater、Game、Whisper 设备页共 19 条未迁业务记录留旧业务入口；E13 和 N07 两条 Native 配置已由原生承接，不强迁 Web。

其他横向风险保留为治理观察，不新增 ID 或包装成配置缺口：普通 Settings 与旧专用 setter 的 RAM/文件提交边界、Worldbook/Location/Camera 文件并发、MCP 配置保存与连接 reconcile、最近 Main 模型被后台任务复用。外观原子提交与向量数值校验已有改善，不能原样重复旧风险描述。

## 本轮验证与交付边界

- 本文 ID/分类计数、重复 ID 和引用文件存在性以脚本复核；原始 159 + 11 记录全部保留。
- 本轮静态核对了两仓源码/提交，不执行设置写操作，不读取实例数据、不做生产或 Android 真机验收。
- Penumbra 的全量 Vitest、TypeScript、生产构建和 diff 检查结果另见 [Chat 单条删除交付](./chat-single-message-delete.md)，它们验证本轮前端变更回归，不替代 Settings 全项运行时验收。
- Settings、后端、Native 源码均未修改。气泡间距提交 `846c0ca`、后端默认入口 `f4cbae6`、Android 默认入口 `4adbe6f` 均保留。无 commit、push 或 deploy。上述缺口等待人工确认处理范围。
