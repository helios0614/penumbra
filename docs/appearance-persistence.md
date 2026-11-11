# Penumbra 外观配置持久化

## 一、原有存储方式

| 项目 | 原有读写链路 |
| --- | --- |
| 主题模式、主题色、AI 气泡色 | Settings 写入 `localStorage`。HTML 启动脚本也读取这三个值并设置页面主题。 |
| 桌面壁纸 | `localStorage` 保存模式、填充、位置、遮罩和文字色。IndexedDB 的 `penumbra-preferences/wallpapers` 保存图片 Blob。 |
| 桌面贴纸 | 所有贴纸从 IndexedDB 的 `penumbra-widget-assets/images` 共用一张图片。增删和布局参数随 Classic 桌面布局写入 `localStorage`。 |
| 用户和 AI 头像 | 共享聊天气泡引用随 Penumbra 打包的两张默认图片。 |

## 二、服务端配置和图片

外观随 AionHome 实例的 `aion-chat/data/` 持久化。同一实例的登录会话共享外观，使用独立数据目录的实例各自保存。外观文件和图片目录已加入 AionHome 的 Git 忽略规则。

```text
aion-chat/data/
  appearance.json
  appearance/
    avatars/
    wallpapers/
    stickers/
```

`appearance.json` 包含以下字段。

- `themeMode`、`themeColor`、`aiColor`。未选择颜色时保存空引用，由 CSS 提供各自的浅色和深色默认值。
- `wallpaper`。保存 `mode`、`fit`、`position`、`shade`、`textTone` 和可空的 `image` 文件名。
- `avatars.user`、`avatars.assistant`。分别保存可空的头像文件名。
- `stickerImage` 和 `stickers`。贴纸实例共享图片，每个实例保存 `id`、`page`、`position` 和 `size`。删除实例时保留共用图片，后续添加贴纸时可继续使用。Classic 仍在本机保存其他小组件布局，贴纸与本机组件重叠时仅在渲染时避让。

`GET /api/appearance` 读取当前配置，配置文件缺失时返回默认值。该读取不会创建配置文件。`PATCH /api/appearance` 合并本次提交的主题和壁纸字段，贴纸按实例增删，重置桌面布局时同步恢复默认贴纸列表。配置和图片接口复用现有登录会话，并返回 `Cache-Control: no-store`。

图片上传复用 AionHome 的 multipart 处理、文件内容校验、UUID 命名和失败清理。外观图片支持 JPEG、PNG、GIF、WebP，单张上限 20 MiB。外观路由使用独立目录，聊天的 `/api/upload` 和 `/uploads` 保持原契约。外观 JSON 复用 `atomic_save_settings`。现有单进程服务在锁内读取最新文件并保存字段或图片引用。图片替换先写入新文件，再原子提交引用，最后清理旧文件。JSON 保存失败时清理新上传文件，已确认的引用和旧图继续可读。

## 三、头像替换

Settings 的「聊天头像」支持分别上传、替换和恢复默认用户头像及 AI 角色头像。Settings 预览和共享聊天气泡读取同一份外观状态。主聊天和日记对话通过共享组件应用头像，无需改写历史消息。恢复默认后使用原有的打包占位图。

## 四、前端读取与保存

1. HTML 使用系统明暗偏好完成首屏初始化。应用启动后读取 AionHome 配置，再应用主题和图片。外观加载失败时可在 Settings 重试。
2. 用户操作触发字段、图片或贴纸实例保存。请求成功后更新页面内的共享状态。请求失败时显示提示，保留最后一次从服务端确认的外观。
3. 其他浏览器刷新后读取最新配置。启动脚本和外观保存流程均已退出旧 `localStorage`、IndexedDB 链路。Classic 继续读取其他小组件的本机布局，并过滤同一个布局键里的旧贴纸项。
4. Classic 继续显示自定义壁纸与桌面贴纸。Editorial 继续使用原有桌面布局，并共享主题、Settings 和聊天头像。AionHome 已登记两种桌面原有的 Settings 地址，直接打开或刷新均可加载页面。

## 五、验证

| 检查 | 结果 |
| --- | --- |
| Penumbra `npm test` | 223 个测试文件、3018 项通过。 |
| TypeScript 与生产构建 | `tsc --noEmit` 和 `npm run build` 通过。 |
| AionHome 契约 | 外观、既有媒体上传和 Penumbra 静态路由共 139 项通过。覆盖字段并发写入、登录访问、实例隔离、图片内容校验、失败时保留旧图，以及 Settings 直达与刷新。 |
| Settings 浏览器回归 | Classic 与 Editorial 在 320、390、1440 px 共六组通过，包含自定义色选择、壁纸保存及移除、页面导航和系统状态。 |
| 真实 AionHome 浏览器回归 | 两个独立 Chrome 会话，分别使用桌面和移动触屏视口。验证主题及壁纸刷新、贴纸增删与图片共用、两种头像上传替换及恢复默认、Editorial 主聊天头像、旧浏览器数据无启动写入，以及模拟 503 时保留已确认的头像。 |
| 生产子路径 | 桌面与移动视口的 Vite 开发及生产预览回归通过。 |
| PWA | 用临时 Chrome 配置安装并启动现有 Aion Chat PWA，确认独立窗口从 `/chat` 进入，沿现有链接切换到 Penumbra 后读取服务端主题和壁纸，刷新读回成功。 |

真实 API 浏览器回归脚本为 `tests/browser/appearance-persistence-smoke.cjs`。使用隔离的 AionHome 源码副本及测试数据目录，提供生产构建的 `dist`，创建脚本头部指定的合成账号及一条包含用户和 AI 消息的对话，再用 `APPEARANCE_TEST_ORIGIN` 指向该本机实例。脚本会写入外观，重复运行前应使用新的测试数据目录。

## 六、验收边界

服务端测试和浏览器回归使用合成图片和独立测试数据。真实 API 回归运行在本机 AionHome，测试进程关闭后台任务。移动端覆盖 Chrome 触屏视口，手机真机和手机已安装的 PWA 留待人工验收。
