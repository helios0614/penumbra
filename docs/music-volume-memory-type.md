# E43 音乐音量 / E06 记忆类型编辑交付

日期：2026-11-17。范围仅 E43、E06；未修改 Final Inventory、单条消息删除或其他确认缺口。未 commit、push、deploy。

## E43：设备音量

- 控件位于 Chat 既有 MusicCard 内，独立一行复用 Slider，不占用歌曲名称和播放按钮所在行。
- 取值 0–100，默认 100；保留既有小数存量读取行为，滑块写入整数百分比。实际 Web 音量为 `HTMLAudioElement.volume = percent / 100`，拖动期间立即应用，不重启音频。
- 浏览器存储沿用 `localStorage.aion_music_volume`，播放、恢复播放及新页面读取偏好；切歌、暂停、播放源逻辑沿用原实现。
- Android 优先读取 `window.AionMusic.getMusicVolume()`，写入 `setMusicVolume(int)` 并镜像到同名 localStorage。真实桥实现位于 AionHome 的 `AionApp/app/src/main/java/com/aion/chat/MusicVolumeBridge.java`：SharedPreferences 文件 `aion_music_prefs`，键 `music_volume_percent`。后台播放器已有偏好监听；不修改系统音量或 Android 源码。
- 桥缺失、方法缺失或抛错时回退 Web 存储；写桥失败后当前 controller 使用 Web 偏好。两种存储均不可写时，当前音频仍能调节，并显示简短的保存失败提示；无法承诺刷新恢复。
- controller 响应既有 `musicvolumechange`、相关 `storage`、`pageshow` 和可见性事件，卸载时解除监听。
- 音量不上传 AionHome；无新增音量 API 或 Settings 表单。

## E06：真实契约与持久化

- 已有 `PUT /api/memories/{id}` 的 `MemoryUpdate` 接受 `type: Optional[str]`，`content` 仍必填；原 SQL 已支持更新 `memories.type`，无需扩展 DTO、API 或数据库结构。
- 编辑弹窗与创建弹窗共用 `MEMORY_TYPE_OPTIONS`：

| 值 | 标签 |
| --- | --- |
| `shared_moment` | 共同经历 |
| `emotion` | 情感时刻 |
| `life_event` | 重要事件 |
| `preference` | 喜好 / 雷区 |
| `promise` | 约定承诺 |
| `milestone` | 关系里程碑 |
| `event` | 事件 |
| `digest` | 总结 |

- 后端类型字段实际为自由字符串，未新增枚举限制。旧名字总结、未知类型、空字符串和 NULL 原值在编辑时保留，用户可以主动选择上表中的类型；未改类型不发送 `type`。
- 链路：MemoryEditDialog → MemoryEditInput → buildMemoryEditDto → PUT → SQLite UPDATE/commit → 既有 `runWrite` 触发 `GET /api/memories?page=…` → 列表和展开正文使用服务端结果。PUT 回执不作为本地数据替换来源。
- PUT 失败保持弹窗与草稿，编辑错误显示实际 HTTP 状态、JSON 字符串 detail（如有）或网络错误类别；认证、校验等沿用现有安全错误映射。PUT 已成功但 GET 失败时沿用既有“列表暂时无法刷新”提示，可仅重试读取。
- 正文保持原字符串，不 trim 后提交；未编辑的重要度和完整关键词不发回，避免用列表截断投影覆盖数据。其他来源、时间、Pin/unresolved、ID、历史关联字段不发送、不改写。
- 本轮后端唯一业务调整：先读取现存正文；正文逐字符一致时不请求 Embedding、不写 embedding 列，保留原向量（包括 NULL/旧异常向量）。正文变化时沿用原 `get_embedding(content)` / `_pack_embedding` 路径及不可用时写 NULL 的既有行为。不存在 ID 保留原成功回执，但不再无效请求 Embedding。
- `type` 不是现有向量输入，没有更新时自动分类或总结的规则。类型展示、搜索、召回及类型对应的来源操作可用性，均沿用既有后端与前端规则；未改召回算法、来源记录、总结锚点或向量治理。

## 实际修改文件

Penumbra：

- `src/application/chat-media/audio-controller.ts`
- `src/application/chat-media/music-volume.ts`（新增）
- `src/application/chat-media/music-volume.test.ts`（新增）
- `src/components/media/MusicCard.tsx`
- `src/components/memory/MemoryEditDialog.tsx`
- `src/components/memory/MemoryManagement.test.tsx`
- `src/domain/memory/memory-management-types.ts`
- `src/domain/memory/memory-management-mappers.ts`
- `src/domain/memory/memory-management.test.ts`
- `src/application/memory-management/memory-management-controller.ts`
- `src/application/memory-management/memory-management-service.ts`
- `src/application/memory-management/memory-management.test.ts`
- `tests/browser/music-volume-memory-type-smoke.py`（新增）
- `docs/music-volume-memory-type.md`（本文）

AionHome（`/Users/remix/Desktop/AionsHome-main`）：

- `aion-chat/routes/memories.py`
- `aion-chat/tests/contract/test_memory_type_update.py`（新增）

## 验证结果

- Penumbra 相关测试通过；最终 `npm test`：225 个文件、3025 项全部通过。
- TypeScript：`npx tsc -b` 通过；最终 `npm run build` 通过（包含 TypeScript 检查）。存在既有大 chunk 提示，本轮未做打包优化。
- AionHome 相关合同测试 145 项通过：type update、create、unresolved、requeue、main memory recall、embedding vector integrity、music volume。新增 type update 测试使用真实 FastAPI 路由和临时 SQLite，外部 Embedding 为桩；验证类型持久化、重复 GET、所有无关列原样保留、旧类型/向量兼容、正文变化才生成向量及失败无部分更新。
- 生产构建浏览器回归：Classic / Editorial × 320、390、1280 像素 × Web、Native 模拟、桥抛错回退，共 18 组。真实浏览器 Audio 播放本机 PCM 音频，检查时间推进、拖动未松手时 volume 已更新、播放不中断、暂停重播及刷新恢复；没有音量写 API。
- 六组 Web 布局同时验证 Memory 类型回填、失败草稿/真实错误、成功后的 GET、刷新保持、未改类型省略、未知/旧名字/空类型保留、40 个关键词和精确重要度/正文保持，以及 360 像素短视口滚动。
- 已目视检查窄屏播放器、桌面/移动编辑弹窗截图；两仓 `git diff --check` 通过。
- 浏览器截图与失败诊断产物：`/private/tmp/penumbra-volume-memory-browser/`。最终成功组覆盖的截图可供人工复核；合成测试不代表真机或生产数据库验收。

复现浏览器测试：先构建，再以空 API/proxy 环境变量启动 `npm run preview -- --host 127.0.0.1 --port 45443 --strictPort`，使用已安装 Playwright 的 Python 运行 `tests/browser/music-volume-memory-type-smoke.py`。脚本使用隔离 Chrome profile 并拦截所有业务请求和外部请求。

## 人工验收与部署

1. Android 真机 WebView：确认真实桥读写、刷新/重进后的偏好、后台播放器对同一 SharedPreferences 的响应及实际听感。
2. 实际使用的浏览器/设备：实际歌曲播放中的触摸拖动、切歌、刷新后的音量与听感。本轮为桌面 Chrome 的移动视口/触摸能力模拟，未验证真实移动设备。
3. 测试环境真实 AionHome 数据库：选现有记忆修改类型，核对刷新及详情、关键词/重要度/来源/Pin/时间/ID 保留；复核真实持久化失败时输入和错误。未访问生产数据库或请求真实 Embedding 服务。
4. 完整交付需要部署 AionHome 的本轮路由改动，才能保证元数据编辑不重复生成 Embedding。原服务器已支持 type 字段，前端类型选择本身无需新 API；无需数据库迁移或 Android 构建。本轮仅准备代码，未执行部署。

完成后停止，等待人工验收。
