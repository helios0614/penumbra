# Settings PR5-B · Web 服务

## 基线与范围

Penumbra 起始分支为 `main`，HEAD 为 `ecd8a25ad7085e4d8967a3af95ce1523a88ea6da`，与本地 `origin/main` 一致。保留开工时未跟踪的 `docs/settings-pr5-audit.md`。AionHome 工作区干净，`refactor-code-main` 的 HEAD 即已提交的 **PR5-B0 `6a79a1251c2f9fea692843a8e5463943974b46c7`**。Web 凭据清除依赖该提交的提交后发布契约，部署应包含它或其后续兼容版本。

按 PR5-A 审计、AionHome 的 PR5-B0 交付、现行 API Connection 与 PR3 契约实现。本轮只接 Web 服务设置，保留现有 Web Search、URL Reader、Web Evidence、regenerate、Feature Binding 与后端 API 行为。

## 页面与文件

Settings 首页在「服务集成」分组下直接提供「Web 服务」入口。「服务集成」只作为分组标题，后续服务可在同组新增入口。Web 页内使用一个玻璃面板，细分割线区分联网许可、Brave Search 凭据、网页内容压缩入口。使用现有主题色、Switch、Input、Dialog、AlertDialog、Toast 和凭据行操作。联网关闭时仍可管理 Brave Key。未配置 Key 时单独显示「未配置」，URL 直接读取仍取决于联网许可。

| 文件 | 职责 |
| --- | --- |
| `src/components/settings/SettingsView.tsx`、`SettingsShell.tsx` | 首页分组与 Web 直接入口、懒加载 Web 页、传递现有返回栈的上一级页面 ID。 |
| `src/components/settings/web/WebSettingsPage.tsx` | 三个配置区、临时明文、复制反馈、编辑和危险操作确认。 |
| `src/components/settings/web/useWebSettings.ts` | 页面范围内串行读写、Switch 乐观反馈、保存读回、错误恢复和中止隔离。 |
| `src/domain/web-settings/web-settings-client.ts` | 普通 Settings 窄投影、独立写入体、Session/no-store 和安全错误归类。 |
| `src/components/settings/features/FeatureBindingsPage.tsx` | 从 Web 入口进入时，读取成功后滚动并聚焦现有 `web_compression` 行。 |
| `src/domain/web-settings/web-settings-client.test.ts`、`tests/browser/settings-pr5-b-smoke.cjs` | Mock HTTP 契约及生产构建的 Fake API 交互、布局回归。 |

## API 与读回

所有调用使用现有 Session API client，采用 `credentials: include` 与 `cache: no-store`。

| 路径 | 请求与响应 |
| --- | --- |
| GET `/api/settings` | 只保留 `web_access_enabled: boolean` 和 `credentials.brave_search_key: {configured,masked,secret_ref}`。布尔值和元数据按服务端 DTO 校验。后端缺省的 false 由投影返回。缺字段或读取异常显示错误与重新读取。 |
| PUT `/api/settings` | 联网只提交 `{web_access_enabled:boolean}`。替换只提交 `{brave_search_key:string}`，拒绝空白和掩码，输入去除首尾空白。两者均要求 `{ok:true}`。 |
| POST `/api/settings/secrets/reveal` | 主动查看时发送最新安全快照的 `{secret_ref}`，读取 `{secret:string}`。 |
| POST `/api/settings/secrets/clear` | 通过独立危险确认弹窗，使用打开弹窗时最新快照的 `{secret_ref}`，确认时核对引用仍匹配，要求 `{ok:true}`。 |

Switch 切换后立即独立保存。写入与读回期间禁用其他页面配置操作，防止同一挂载中重复提交。保存失败先撤销乐观显示，再用 GET 更新能确认的状态。如果读回也失败，标明显示的是上次读取结果，并禁用编辑直到重新读取成功。

Key 编辑初始值始终为空。只有收到写入回执才清空草稿并关闭弹窗。响应丢失时保留弹窗草稿，GET 回读的配置状态与掩码在弹窗内展示，后续提交由用户主动触发。普通 422 `Secret reference is invalid or stale` 会读取最新元数据并提示核对。Clear 同一次确认尝试后不可重发，重新打开确认才能发起下一次清除。成功 Toast 依赖回执及读回一致性。若回执成功但读回失败，提示重新读取，保留回执与当前状态的区别。

明文和新 Key 草稿只由当前页面及弹窗临时持有。默认读取不 reveal。隐藏、切换到编辑或清除、关闭编辑以及页面卸载均清理对应的临时显示或草稿。请求中止和页面生命周期检查丢弃迟到响应。剪贴板只在用户点击复制时写入，Toast 与错误文案使用固定内容。无 Key、ref 或原始错误正文进入浏览器持久存储、路由历史或日志。

## 功能分配导航

「网页内容压缩模型」通过 Settings 已有 history 栈进入「模型与任务分配」，列表加载后聚焦并滚动到「网页内容压缩」。原有编辑入口仍由该页面管理。Web 页初始化不读取 Registry，不持有任务分配数据。浏览器返回或页内返回可回到 Web，重新进入会读取服务配置。

Classic 和 Editorial 共用同一套 Settings 导航。首页路径为 `[]`，直接进入 Web 后为 `["web"]`，由 Web 打开任务分配时为 `["web","features"]`。页内返回与浏览器后退依次回到 Web 和首页，浏览器前进可恢复同一条路径。「服务集成」不写入 History。导航简化仅涉及入口和返回路径，沿用原 Web 页、凭据流程与 Feature 定位。

## 验证

- 导航简化后，**20 条**定向导航与页面结构测试通过。TypeScript 和生产构建通过。全量 Vitest **220 个文件、2,976 条通过**。
- Web 浏览器回归 **6 组通过**，覆盖 Classic／Editorial 与 320、390、1440px。核对首页直达、页内返回、浏览器前进／后退和任务分配定位，也复跑了许可保存、凭据读写、异常恢复和迟到响应测试。无页面异常、外部请求或横向溢出。
- 首次实现时，既有 Connection／MCP 统一资源页 **7 组**、PR3 任务分配 **9 组**浏览器回归通过。
- 在 320 和 390px 下把视口压至 460px 并聚焦密码输入，检查 Dialog、输入和操作区边界。截图与回归使用临时 Chrome 配置及合成数据，复制使用 Fake Clipboard。

## 限制与人工验收

- 普通 Settings PUT 无替换 CAS。读取凭据元数据只能确认当前配置状态及掩码，无法证明当前 Key 明文等于某份草稿，也不验证 Brave 连通性。
- 串行保护在本次页面挂载内生效。离开时取消客户端等待，已抵达服务端的保存仍可能完成。重新进入以 GET 读回为准。
- 真机 iOS／Android 软键盘与部署域名下的剪贴板权限待人工验收。未访问真实 Provider、真实 Key 或生产配置。
- 仅交付 Penumbra 工作区变更，未 commit、push 或 deploy。等待人工验收。
