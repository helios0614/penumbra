# Settings PR5-E · Embedding 独立设置

## 基线与实现范围

Penumbra 开工位于 `main`，HEAD 为已提交的 PR5-D `15a92a7`，领先本地 `origin/main` 一个提交。AionHome 位于 `refactor-code-main`，HEAD 为 `dbb55e2`，包含依赖 PR5-C1 `84c6f3a`。两个工作区开工时均干净。已核对 C1、C2、D 交付文档及 C1 的 Settings 路由和响应投影。

「设置 → 服务集成 → Embedding 服务」使用现有 Settings 导航和玻璃面板，分为 API 地址、只读模型和 API Key 三个区域。地址与 Speech 共用 C2 的 Dialog、Input、HTTPS 校验和恢复默认交互。Key 复用 `SettingsCredentialActions`，地址与 Key 分开保存。

模型区显示实际保存值，缺失或为空时使用默认模型。现有记忆和日记保存了历史向量，更换模型可能导致向量空间不兼容。1024 是当前默认维度约定，历史数据的实际维度未在本轮检查。模型编辑、发现和测试均不在本轮范围内。开放模型修改前需要先设计模型版本、向量重建和回滚机制。

## 接口契约

| 操作 | 接口与字段 |
| --- | --- |
| 读取地址 | `GET /api/settings` 使用 `embedding_custom_url`。默认状态显示 `https://api.siliconflow.cn/v1`，自定义状态只显示已配置。 |
| 修改地址 | `PUT /api/settings` 仅提交 `{embedding_url: "新地址"}`。输入框初始为空，保存前说明当前 Key 会随请求发送到新地址。 |
| 恢复默认地址 | 独立确认后仅提交 `{embedding_url: ""}`，保留 Key。 |
| 读取模型 | `GET /api/settings` 使用 `embedding_model`，回退为 `BAAI/bge-large-zh-v1.5`。 |
| 读取 Key | `GET /api/settings` 使用 `credentials.embedding_key` 下的 `configured`、`masked` 和 `secret_ref`。 |
| 查看 Key | `POST /api/settings/secrets/reveal` 提交 `{secret_ref}`，成功返回 `{secret}`。复制由用户触发。 |
| 替换 Key | `PUT /api/settings` 仅提交 `{embedding_key: "新值"}`。密码输入框初始为空，拒绝空白值和掩码。 |
| 清除 Key | 独立确认后向 `POST /api/settings/secrets/clear` 提交 `{secret_ref}`，成功返回 `{ok:true}`。 |

请求复用 Session、`no-store` 和普通 Settings 的安全错误处理。无效或过期引用返回 422 后重新读取元数据。查看需要再次点击，清除需要关闭旧确认并重新确认。主动查看的明文最多在页面上保留 30 秒，也会在隐藏、打开编辑或离开页面时清理。关闭弹窗清理对应草稿。

地址和 Key 操作共用一个串行通道。写入收到 `{ok:true}` 后重新 GET，核对地址的默认或自定义状态，或核对 Key 的配置状态及 C1 安全掩码。Key 掩码可能重复，自定义地址只提供布尔状态，读回确认限于这些元数据。模型以同一 GET 的实际返回值或默认回退展示。写入回执丢失时也尝试读回，并提示结果未确认。

读回失败时保留上次成功读取的配置和当前弹窗草稿，暂停写入，直到重新读取成功。手动重新读取只刷新当前状态，保留草稿供核对，且不会自动重发写入或补发成功提示。离开页面时取消客户端等待并忽略迟到响应。已经到达后端的写入仍可能完成，重新进入页面时以新的 GET 为准。

Embedding 独立使用 C1 字段，不读取旧 SiliconFlow URL 或 Key，不访问 Registry，不提交共享连接字段或 `embedding_model`。本轮只改 Penumbra，未调用真实 Provider 或生成向量。数据库、历史向量、召回逻辑和默认维度约定均保留。

## 验证

- 定向 Vitest 4 个文件、46 条通过。前端全量 Vitest 223 个文件、3,015 条通过。TypeScript、生产构建及 `git diff --check` 通过。
- Embedding 浏览器回归 6 组通过，覆盖 Classic／Editorial 各 320px、390px、1440px。验证默认及自定义地址、HTTPS 拒绝规则、单字段保存和恢复默认、Key 查看／复制／替换／清除、无效和过期引用、写入失败、读回失败和不匹配、重复提交、离开页面后的迟到回执及读回、模型只读及默认回退、Registry 隔离。窄屏还在 460px 高度下聚焦输入并检查弹窗边界。六组均无页面错误或非预期请求。
- Speech、Music、Web 浏览器回归各 6 组通过，覆盖相同的布局与宽度，均无页面错误或外部请求。

本地复现使用同源生产构建和已有 Playwright 模块。Chrome 通过 Fake API 和 Mock Clipboard 运行，测试在浏览器中拦截外部请求。

```sh
npm test -- src/domain/embedding-settings src/domain/service-settings src/domain/speech-settings src/domain/music-settings src/domain/web-settings
npm test
npx tsc --noEmit --pretty false
VITE_API_BASE_URL='' VITE_API_BASE='' VITE_WEBSOCKET_URL='/ws' VITE_UPLOAD_URL='/api/upload' npm run build
node tests/browser/settings-pr5-e-smoke.cjs <playwright模块路径> <Chromium可执行文件>
git diff --check
```

## 待人工验收

- 部署域名的剪贴板权限及 iOS／Android 真机软键盘。
- 使用已完成 C1 启动迁移的后端环境验收 Settings 元数据与表单操作。Provider 连通性、向量空间相容性和历史向量维度未纳入本次验证。

交付保留在 Penumbra 工作区，等待人工验收。未提交、推送或部署。
