# Settings UI Follow-up：API 与 MCP 资源列表统一

日期：2026-11-05（Asia/Shanghai）。仅统一两个资源列表的展示骨架，等待人工验收。

## 基线与范围

Penumbra 分支 `main`，HEAD `d83bd13acc0f9b457396d9097be40be4bc60d2be`，开始时工作区干净。已确认该提交包含上一轮 MCP UI 收尾、Advanced 分区和交付记录。读取并对照当前 ConnectionsList、MCPPage、系统 Button / Tooltip 和既有测试，参考用户截图的结构，没有复制真实服务地址或凭据。

本轮未 reset、clean、stash、commit、push 或 deploy；没有修改后端、API DTO、凭据安全、CRUD、连接测试、模型发现、Feature Binding、MCP 工具管理、全局/独立启用语义或其他 Settings 分类。图片中的资源管理面板仅作结构参考，没有据此建立新的业务模型或卡片容器。

## 修改文件与职责

| 文件 | 职责 |
| --- | --- |
| `src/components/settings/ResourceList.tsx`（新增） | 一份展示层文件：受控展开行、字段行、状态圆点/文字、图标操作和操作分组；仅用 useId 生成可访问详情 ID，没有业务 Hook、API 或资源状态机 |
| `src/components/settings/connections/ConnectionsList.tsx` | 将原紧凑行和只读详情接入共同结构；保留原请求、复制/Reveal 任务、过期引用核对、编辑焦点返回和各 Dialog |
| `src/components/settings/mcp/MCPPage.tsx` | 接入共同标题/字段/图标操作；保留独立 Switch 和凭据/工具控制；历史验证信息纳入展开字段；全局开关、高级设置和工具 Dialog 保持专属页面 |
| `tests/browser/settings-pr2-smoke.cjs` | 保留功能断言，将原合并文字定位更新为左标签/右值字段定位 |
| `tests/browser/settings-pr4b-smoke.cjs` | 保留原功能断言，使用共同详情定位；验证断言在展开状态执行 |
| `tests/browser/settings-resources-smoke.cjs`（新增） | 双页面合成对照：公共几何/字体/箭头、长内容、凭据操作、测试入口、Cloudflare 特殊信息和导航/焦点 |
| 本文及既有 PR2/MCP UI 记录 | 交付说明和后续索引 |

## 统一的视觉和交互

- 主玻璃面板仍由各页面提供。行之间沿用细分割线，展开区域透明、无圆角卡片和阴影；只有标题行有轻微背景变化。
- 共同标题使用相同左右内边距、14px 字号和字体权重、14px 箭头、44px 右侧控件槽；API 保持44px紧凑行。MCP 的第二行状态允许自然增加高度。箭头对齐第一行名称，避免多行标题将箭头下推。
- 共同展开按钮维持各页面原来的单项展开方式，使用一致的箭头旋转、标题背景过渡、详情淡入和减少动态效果支持。aria-expanded / aria-controls 连接实际详情区域；资源名称仍作为可访问名称提供。
- 详情采用72px左标签列和可收缩的右值列，标签用次级文字，值右对齐；长 URL 安全换行，不通过截断丢失地址。API 继续使用原 displayBaseUrl 安全展示规则（包括去除末尾斜杠），没有改写配置。
- 普通/危险操作统一复用系统 Button：轻量文字、16px 图标、6px 图文间距、一致按钮尺寸及换行间距；删除/清除使用克制红色。编辑统一 Pencil，测试统一 FlaskConical，查看/复制沿用 Eye/Copy。
- 长名称在紧凑标题中省略显示，完整名称保留于可访问名称及 title；字段内容可换行。没有新增 Badge 或玻璃材质层。

## 保留的资源差异

API 右侧仍为编辑图标，没有新增 Switch；原启用状态圆点及 Key 配置文字保持各自含义。展开保留 API 地址、模型预填、安全 Mask、复制/查看、测试与删除。Direct 不展示 Transport；Cloudflare REST / Anthropic 继续展示必要的接入方式和 Gateway ID。

MCP 右侧仍为独立启停 Switch，标题下保留 Server 启用与凭据配置文字。验证结果及 Unix 秒时间在展开的「验证状态」行展示，不作为实时心跳；未验证仍只显示「尚未验证」。展开另含公开 URL、凭据模式、Mask、已加载工具数量和原凭据/Server 操作。编辑位于展开操作组，和 API 编辑图标使用相同图标尺寸；没有为了位置一致增加额外控制。

共同组件只接收 React 内容、受控 expanded、onToggle 和事件回调，不依赖 Connection/MCP 类型，不读取 API 或存储 secret_ref、凭据、工具列表及网络任务；只渲染业务组件传入的 React 内容。业务内容和生命周期继续在原页面处理。API 的过期引用反馈有独立展示槽，折叠后仍可核对，避免布局复用改变其原行为。只增加一个组件源文件，没有新 Hook 或抽象服务层。

## 验证结果

- 相关 Vitest：**12 个文件、156 项通过**（Settings、Registry、MCP 及既有交互/请求隔离测试）。
- TypeScript 与生产构建：`npm run build`（含 `tsc -b`）通过；`git diff --check` 通过。
- 新增双页面对照：**7组通过**，Classic / Editorial 各320、390、1440px，另 Classic390深色合成壁纸。每组23次合成API请求、7次明确写操作，零外部请求、零页面脚本错误。共同标题/箭头/状态文字/控件槽的计算几何一致，箭头对齐首行名称。
- 原 MCP 功能浏览器：**7组通过**，同样覆盖两种布局、三档宽度和深色壁纸；每组72次请求、23次明确写操作，原凭据、CRUD、工具、启停和高级设置断言保留。
- 原 API 单次测试分组（`CONNECTION_TEST_ONLY=1`）：**8组通过**，覆盖两种布局、三档宽度和深色桌面；包括测试入口、结果、关闭/清理和迟到响应隔离。
- 已目视检查320px API/MCP展开详情、390px深色MCP、Editorial1440 API，以及长名称/URL布局。API紧凑行保留，详情和操作无独立卡片，窄屏正常换行。

日志为 `/private/tmp/settings-resources-{tests,build,browser,mcp,pr2,pr2-tests}.log`。新对照截图/JSON在 `/private/tmp/settings-resources-browser/`，MCP与API单次测试结果分别在 `/private/tmp/settings-resources-mcp/`、`/private/tmp/settings-resources-pr2-tests/`。

浏览器复现：

```sh
SETTINGS_RESOURCES_OUTPUT=/private/tmp/settings-resources-browser node tests/browser/settings-resources-smoke.cjs /private/tmp/webview-test-qa/node_modules/playwright '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
SETTINGS_PR4B_OUTPUT=/private/tmp/settings-resources-mcp node tests/browser/settings-pr4b-smoke.cjs /private/tmp/webview-test-qa/node_modules/playwright '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
CONNECTION_TEST_ONLY=1 SETTINGS_PR2_OUTPUT=/private/tmp/settings-resources-pr2-tests node tests/browser/settings-pr2-smoke.cjs /private/tmp/webview-test-qa/node_modules/playwright '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
```

所有请求使用 Fake API、合成资源和临时浏览器上下文，不接触真实服务、浏览器 Profile 或凭据。新增对照套件验证实际 DOM/计算样式，而非仅比较截图：标题/箭头/状态字体及右侧控件槽一致，箭头贴合首行；API 无额外 Switch；详情无卡片材质；长 URL/名称不溢出；两种 Cloudflare 元数据保留；复制确实进入合成 Clipboard，清除后配置状态更新；API 测试真实经过 Fake API，并检查编辑 Dialog 关闭后焦点返回图标。

原 PR2 全量浏览器套件本轮仍在 `settings-pr2-smoke.cjs:209` 的「Key 已复制」Toast 可见性断言超时，与先前交付中原 HEAD 对照的已知失败一致。该断言未删除，未修改 Toast，也未将此套件记为通过。其后未执行到的管理流程不能据这次运行宣称全部通过；新增对照与既有单次测试分组的结果分别记录。

## 人工验收与限制

仍需在真机 Safari、触控/软键盘、生产主题和壁纸下确认观感。浏览器宽度模拟和合成结果不等于真实 Provider/MCP 或生产配置联调；没有触发真实连接、模型发现、工具执行或配置写入。PR2 复制 Toast 既有问题留待独立排查。本轮完成后停止，等待人工验收。

## 图标、表单与刷新区收尾（2026-11-05）

本轮开始仍在 `main` / `d83bd13`，上一轮统一列表的修改已暂存；保留原暂存内容，只叠加工作区改动。按本轮后续人工反馈，将凭据图标放在配置下方的独立右对齐行，查看/隐藏位于最前，API 与 MCP 同步处理。

- `ResourceList.tsx`：字段支持独立操作行；凭据操作使用14px图标、28px按钮高度、6px横向间距，上方间距2px。仅图标仍有完整 aria-label 和 title，资源编辑图标尺寸不变。
- `ConnectionsList.tsx` / `MCPPage.tsx`：查看、隐藏、复制和 MCP 清除凭据迁入该行；API 查看先于复制。MCP 仍须主动 Reveal 后才出现复制，清除仍走原确认流程；资源删除保留在底部，不与清除凭据混淆。原请求与引用校验未改动。
- `MCPAdvanced.tsx`：数字 Input 与既有编辑控件统一为 `translucent/comfortable`，标签间距8px。可见按钮简化为「刷新」「保存」，靠右；保留明确的可访问名称、整数范围和单字段读回逻辑。
- `ConnectionDetail.tsx` / `MCPServerEditor.tsx` / `ModelDiscovery.tsx`：新增/编辑表单中的标签与 Input/Select 间距统一为8px，保留系统控件的背景、圆角、焦点和 disabled 行为。
- `MCPShared.tsx` / `ConnectionDetail.tsx`：截图中黄色信息是 Chrome 的 DOM 提示，原因是 password 输入未归属 form，并非 CRUD 接口异常。复用 DialogBody 的 render 能力，让两个编辑页的滚动正文成为原生 form，保留 password 和 new-password 属性；submit 只 preventDefault，不触发配置写入。MCP 只有编辑/新增页启用此语义，测试/确认 Dialog 不受影响。
- `MCPTools.tsx`：刷新按钮可见文字缩为「刷新」，完整宽度工具栏独立于标题的关闭按钮预留区，按钮在最右侧；标题、数量、工具列表加载与409处理保持原逻辑。

验证：156项相关测试、TypeScript/生产构建通过。最终双资源对照7组、MCP原流程7组、API单次测试8组全部通过；覆盖Classic/Editorial、320/390/1440px和合成壁纸。保留原功能断言，新增检查：图标无可见文字、查看在前、独立一行右对齐、图标14px/按钮28px、标签间距至少8px、简化按钮及工具刷新右边缘对齐、密码输入均有form祖先、submit被阻止、编辑页回车不写入。未再产生截图所示的“Password field is not contained in a form”提示。

已目视检查320px API凭据行、高级输入与右侧按钮、工具刷新栏，以及390px深色编辑 Dialog。仅使用合成API和临时浏览器上下文，不读取真实凭据或写生产配置。日志 `/private/tmp/settings-resource-polish-{tests,build,browser,mcp,api-tests}.log`；截图/JSON在对应的 `/private/tmp/settings-resource-polish-browser/`、`-mcp/`、`-api-tests/` 目录。既有PR2 Toast限制和真机/生产主题人工验收范围不变。

未重新暂存、commit、push或deploy；完成后停止，等待人工验收。
