# Penumbra 静态产物发布（Phase 6D）

本阶段只建立从 GitHub 源码到 `deploy` 分支的手动产物发布流程。Ubuntu 主动拉取指定版本、生产服务映射和 SPA fallback 属于后续阶段；本工作流不连接服务器，不需要 SSH、生产凭据或生产数据目录。

## 已核对的基线

- 源码基线：`eafe9116d2b9f067e1105a4e9d97941db83957a2`。
- [第二次 Build validation](https://github.com/helios0614/penumbra/actions/runs/41383306887) 已核实为 `completed / success`，对应同一源码 SHA。
- `package.json`：`npm test` 为 `vitest run`；`npm run build` 为 `tsc -b && vite build`；有提交的 lockfile，使用 `npm ci`。
- `vite.config.ts` 的生产/preview base 已是 `/penumbra/`，开发仍是 `/`。沿用 `tests/browser/production-subpath-smoke.cjs` 导出的 `checkBuild()`，检查 JS/CSS 入口、资源存在性、字体等 CSS URL 子路径及开发验收页面排除。
- 既有约定见 [local-remote-development.md](./local-remote-development.md)。本轮不增加另一套 base/proxy 配置，不修改业务代码或 `build.yml`。

## 版本标识

必须分别记录源码、工具、构建和产物标识：

| 标识 | 含义 | 位置 |
| --- | --- | --- |
| `sourceSha` | 用户明确输入、实际测试与构建的完整源码 Commit | `release.json` |
| `workflowSha` | 此次手动运行的 `main` 工作流及发布工具版本 | `release.json` |
| `buildId` | `actions-<run_id>-<run_attempt>`，重新运行有独立 attempt | `release.json`、产物提交信息 |
| `artifactSha` | `deploy` 上此次发布产生的 Commit；后续服务器应固定此版本 | 发布 Job 的 Summary 和 `deploy` 历史 |

产物 Commit SHA 只有提交后才能确定，因此不写回自身 `release.json`，避免循环依赖。源码与产物的 SHA 不可互换；重新构建同一源码也会产生新的构建记录。

## 手动发布流程

`.github/workflows/deploy.yml` 只响应 `workflow_dispatch`，必须选择 `main` 运行，`source_sha` 必填 40 位小写十六进制 SHA，不接受分支名、Tag、短 SHA 或空输入。该 Commit 必须在本次取到的 `origin/main` 历史中。

1. `build` Job（Ubuntu 24.04 / Node 22）：分别 checkout 工作流工具和 `main` 源码历史，核验来源后 detach 到输入的 SHA。
2. 依次运行 `npm ci`、`npm test`、`npm run build -- --manifest`，然后让发布工具回归测试检查本次真实构建的临时副本。发布构建使用 Vite 6 官方 CLI 参数生成 `dist/.vite/manifest.json`，不修改普通构建命令或 Vite 配置。任一步失败，后续发布不会执行。
3. 确认源码 HEAD 未变且已跟踪源码/配置没有被安装/构建过程修改。仓库已跟踪的 `tsconfig.tsbuildinfo` 会由正常构建更新，只豁免这个明确路径的构建缓存；缓存不进入产物。在实际打包入口强制调用**工作流工具版本**中的 `checkBuild()`，同时检查 Manifest、原有 HTML/CSS 资源和最终文件集合，再复制可服务内容并生成元数据。选定旧源码 SHA 时也不能加载旧检查器绕过新门禁。
4. 构建 Job 输出 `release.json` 的 SHA-256，并上传仅属于本 run/attempt 的中间 Artifact（保留 7 天）。
5. `publish` Job（独立 Ubuntu 24.04 / Node 22）下载该 Artifact，重新检查完整文件清单、每个文件大小和哈希、总数/总大小、清单汇总哈希、元数据摘要以及 source/workflow/run 标识。
6. 发布 Job 在独立临时 Git 仓库中读取远端 `deploy`；不存在才创建 orphan 历史根，存在则以当前远端头为父提交。清除上版已跟踪产物，复制已验证的新产物，正常 fast-forward push 到固定 `refs/heads/deploy`，不 force push。
7. Summary 给出源码 SHA、工作流 SHA、构建标识、产物 Commit SHA、静态文件数/字节数和汇总哈希。

发布 Job 不安装依赖、不执行选定源码或下载产物中的程序。GitHub token 只在发布步骤临时提供，通过进程环境传递 Git 认证头，不写进 remote URL、Git 配置、元数据或静态文件。Action 均固定完整 Commit SHA。

## deploy 内容与完整性校验

```text
deploy Commit
├── dist/                  # 唯一可服务的静态目录
│   ├── index.html
│   ├── assets/...
│   └── fonts/...
├── release.json           # 来源、构建、环境与逐文件记录
└── SHA256SUMS             # dist 中所有文件及 release.json
```

服务端后续应只映射 `dist/` 到 `/penumbra/`。Git checkout 的 `.git/` 在静态目录外；Git 历史、元数据和校验文件不能随整个仓库根目录一起服务。Git 仓库、测试、工作流、源码、lockfile 和凭据不复制进 `dist/`。

包装规则采用当前产物布局的允许清单：根 `index.html`、`assets/` 下 JS/CSS/图片/字体，以及既有 Cormorant 字体与 `OFL.txt`。拒绝点文件/目录、符号链接、特殊文件、测试命名文件、source map、未知扩展名和未知路径；仅允许构建时临时存在 `.vite/manifest.json`，并在复制前排除它。`fonts/cormorant-garamond/SOURCE.md` 也被明确排除，许可证保留。未来新增合法公共资源时，应先审查并更新允许清单，不能跳过校验直接发布。

Manifest 校验遵循 [Vite 6 官方格式](https://v6.vite.dev/guide/backend-integration)：遍历所有入口和非入口条目，核对每个 `file`；`imports` / `dynamicImports` 的值必须是存在的 Manifest 键，并核对对应文件；`css` / `assets` 列表也逐个核对。每个真实目标必须存在、是普通文件，并属于**排除校验材料和来源说明后的最终发布集合**。Manifest 缺失、格式不合法或依赖缺失会在创建发布目录前失败。Manifest 本身不进入最终 `dist/`、文件清单或 `SHA256SUMS`，仅在元数据记录排除路径和校验统计。

同一个检查器保留 HTML 的 JS/CSS 入口及 src/href 引用、开发页面排除、CSS `url()` 和字符串形式 `@import` 检查，用于覆盖 Manifest 不管理的 public 字体等引用。资源 URL 的 query/fragment 不参与文件查找，但必须有合法编码；标准 URL 解析、百分号解码后检查 `/penumbra/` 命名空间，并用 `path.relative` 与 `realpath` 检查 dist 包含关系。显式拒绝 `..` 段（包括编码形式）、编码分隔符、双重编码、反斜线、非法编码、外部资源和符号链接。合法 `/penumbra/` 引用、普通 query/fragment、字符编码及现有内联 CSS `data:` 资源继续支持。

Manifest 覆盖 Vite 记录的构建图；它不证明任意 JavaScript 字符串或运行时计算 URL 都是静态资源。API、上传媒体等运行时 URL 不属于这份静态文件清单，也不会把它们伪装成已通过构建资源校验。

`release.json` 包含 `sourceSha`、`workflowSha`、`buildId`、Actions run URL/编号/attempt、UTC 构建时间、Node 版本、`basePath`、原生产检查结果、排除文件，以及逐文件的 `path`、`sizeBytes`、`sha256`。`fileCount` / `sizeBytes` 仅统计最终 `dist/`，不含元数据；`distSha256` 是按路径排序的静态文件 SHA256SUMS 文本的 SHA-256。

`SHA256SUMS` 同时覆盖静态文件和 `release.json`，不自校验。发布 Job 另外使用构建 Job 输出的元数据摘要绑定两个 Job。哈希用于检测内容变化，不能替代受信任的源码/工作流、Git 历史与审查，也不是独立签名。

在后续已授权拉取的指定版本根目录中可离线执行：

```bash
sha256sum --check SHA256SUMS
```

这条命令检查清单列出的字节；如需同时拒绝多余文件，可使用 `main` 上受信任版本的 `scripts/deploy/artifact.cjs verify <产物目录>`，不执行产物中的脚本。

## 权限、并发与失败行为

- 工作流默认只有 `contents: read`。仅 `publish` Job 设置 `contents: write`，由 GitHub 自动提供 `GITHUB_TOKEN`；不需要 PAT、SSH key、`actions: write`、`id-token` 或生产 secrets。Token 的内容写权限在仓库级别，脚本的写入目标固定为 `deploy`。
- 现有 `.github/workflows/build.yml` 保持只读。发布到 `deploy` 不命中其仅 `main` 的 push 触发条件。
- 所有源码版本共用 `penumbra-deploy` 并发组，`cancel-in-progress: false`，运行中的发布不被新 dispatch 取消。GitHub 默认只保留一个 pending run，连续提交多个请求可能替换旧 pending；不承诺排队顺序。[GitHub 并发规则](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)
- 读取/认证/拉取失败视为失败，不能当作分支不存在。抓取期间远端变化立即失败；push 期间出现外部写入，由普通 fast-forward 检查拒绝覆盖。人工核对后重新运行。
- 仓库规则如禁止创建或更新 `deploy`，发布会失败，不能通过 force push 或额外凭据绕过规则。服务器状态不受这个产物发布工作流影响。

## 首次手动运行（需要用户后续批准）

1. 审查并自行提交本轮文件，建议 Commit：`ci(penumbra): add manual deploy artifact publishing`；自行 Push 到 `main`，等待现有 Build validation 成功。GitHub 只有在默认分支上存在该文件后才会提供手动工作流入口。[手动触发规则](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_dispatch)
2. 获得首次远端产物发布批准后，进入 GitHub → Actions → **Publish deploy artifact** → **Run workflow**，运行分支选 `main`。
3. `source_sha` 填此次明确批准的完整源码 Commit。若批准发布当前基线，填 `eafe9116d2b9f067e1105a4e9d97941db83957a2`；也可在本轮提交后批准那个新源码 SHA。工作流工具仍取本次运行的 `main` 工作流 Commit。
4. 点击运行后，先检查 `build` 再检查 `publish` 均成功。首次成功 push 才会创建远端 `deploy`，本轮本地实现不会预先创建。
5. 保存 Summary 中的 `artifactSha`，检查 `deploy` 树结构和 `release.json`，以固定产物版本交给后续服务器拉取阶段。本次发布本身不会改变生产服务。

## 回滚与历史

每次产物发布都有独立 Commit，后续发布以原头为父提交，旧文件可从历史恢复。后续 Ubuntu 回滚应拉取并校验已批准的旧 **产物 Commit SHA**，将其 `dist/` 作为目标版本；具体服务器操作留到下一阶段。

不回退或 force push `deploy` 分支头。若需要让 `deploy` 最新版本恢复旧源码的行为，重新手动选择旧完整 `sourceSha`，运行全部测试、构建和校验，追加一个新发布 Commit。该做法是重新构建；需要字节完全相同的回滚时，应使用先前保存的 `artifactSha`。

## 本地验证入口

```bash
npm test
npm run build -- --manifest
PENUMBRA_DEPLOY_TEST_SOURCE="$PWD" node --test tests/deploy/*.node.cjs
actionlint .github/workflows/deploy.yml .github/workflows/build.yml
git diff --check
```

`PENUMBRA_DEPLOY_TEST_SOURCE` 指向已完成带 Manifest 构建的源码目录。工作流在构建后自动设置它；省略该变量的本地运行只执行合成样例回归，真实构建副本测试会标记 skipped，不能作为完整发布验证结果。

发布回归使用临时本地 bare Git 仓库，覆盖首次建分支、追加历史、旧资源清理、历史读取、外部写入竞态拒绝、远端读取失败和产物篡改/缺失/额外文件/错误来源等拒绝路径。不会访问 GitHub 写接口或生产服务器。Ubuntu runner 的实际执行和首次远端 push 仍须以后经批准手动验证。

## Phase 6D 初版验证与自审记录

2026-11-02，在隔离的本地源码副本上使用 Node `22.23.4`：

- `npm ci` 成功，lockfile 未修改；`npm test` 为 209 个文件、2746 项测试全部通过；`npm run build` 成功。
- 加入本轮文件后再次执行现有测试，仍是 209 个文件、2746 项通过。发布回归使用独立的 `*.node.cjs` 文件显式执行，避免混入 Vitest 的 `*.test.*` 自动发现；19 项全部通过。
- 原有 `checkBuild()`：11 个静态资源引用校验通过，开发页面排除，原始 dist 为 72 文件、55,918,020 字节。
- 过滤唯一的字体来源说明后，发布目录为 **71 个静态文件、55,916,553 字节**。本地模拟构建的 `distSha256`：`09b9b7b063a2de53dd7728e8cdfea08ae183450d8ea5cb865943036a1e72fcad`。模拟 run/workflow 标识仅用于本地验证，不是远端发布记录。
- `artifact.cjs verify` 成功；`shasum -a 256 -c SHA256SUMS` 的 72 项（71 静态文件 + 元数据）全部通过。
- `actionlint 1.7.12` 同时检查新工作流和原 `build.yml` 通过；Node 脚本语法与新增文件空白检查通过。
- 自审核对了源码/工作流/产物版本隔离、两个 Job 的权限、run/attempt 传输绑定、唯一并发组、分支读取失败处理、无 force 的历史追加，以及静态目录允许清单。实际构建发现并修正了已跟踪 `tsconfig.tsbuildinfo` 导致的误阻断，回归确认其他源码改动仍会被拒绝。

依赖基线另有待处理事项：此次 `npm ci` / `npm audit` 报告 **28 项告警（1 low、9 moderate、15 high、3 critical）**，critical 涉及 `proxy-addr`、`tinypool` 和 `vitest`；其中后两项的 npm 建议涉及 Vitest 跨大版本升级。本轮未新增、升级依赖，未执行 `npm audit fix`，也未增加或绕过审计门禁。这是依赖树的审计结果，不能直接推定静态产物的实际可利用性；建议首次真实发布前单独评估依赖用途、可达性与升级回归，避免在 CI 工作流阶段夹带业务/依赖变更。

本轮未修改业务代码、`build.yml`、Vite 配置或 lockfile，未暂存、Commit 或 Push 项目改动，未创建远端 `deploy` 分支、连接 Ubuntu、修改 AionHome 或执行生产部署。

## Phase 6D-C：资源校验阻断修复

2026-11-02，使用现有锁定依赖和 Node `22.23.4`，修复 6D-B 发现的 P1（打包前缺少懒加载 chunk 仍通过）和 P2（资源引用越过 dist 边界）。复用同一个 `checkBuild()`，没有建立独立的第二套资源校验器，也没有升级依赖。

- `npm test`：209 个文件、2746 项全部通过。
- `npm run build -- --manifest`：完整 TypeScript/Vite 构建成功，生成 18,680 字节的临时 Manifest。普通无 Manifest 的既有构建产物也通过新 HTML/CSS 检查；发布入口则强制要求 Manifest。
- 带真实构建副本的发布回归：**52 项通过，0 失败、0 skipped**。负例直接走 `createRelease()`；样例源码中的旧检查器即使无条件通过，也不能绕过工作流工具版本的门禁。
- Manifest：62 个条目，220 条静态导入、16 条动态导入、8 条 CSS 引用、9 条其他资源引用；原有 HTML/CSS 检查为 11 条静态引用。
- 真实构建副本分别删除 `ChatView-B2Y-qBYP.js`、`sse-stream-CLZs8Y42.js`、`ModelSelectionPanel-Bu0rU2fy.css`、`avatar-ai-placeholder-CX4bqwqe.png` 后，均报 `Resource absent from final release`；删除被引用键报 `Missing manifest key`。普通 `../` 和 `%2e%2e` 越界引用即使 dist 外有同名文件，也均报 `Resource traversal`，并且未创建发布输出目录。
- 另覆盖缺失/非法 Manifest、非入口条目、最终集合中被排除的文件、非法与双重百分号编码、编码分隔符、非预期外部 URL、CSS 越界和外部符号链接；合法字体、query/fragment、编码文件名、相对 CSS 引用和内联 data URL 保持通过。
- 使用完整源码 SHA `eafe9116d2b9f067e1105a4e9d97941db83957a2` 的隔离副本与当前工作区发布工具完成实际 CLI 打包。最终仍为 71 个静态文件、55,916,553 字节，`distSha256` 仍是 `09b9b7b063a2de53dd7728e8cdfea08ae183450d8ea5cb865943036a1e72fcad`，说明静态应用内容未变；本地模拟 run/workflow 标识不是远端发布记录。
- `artifact.cjs verify` 与 `shasum -a 256 -c SHA256SUMS` 全部通过，共校验 72 文件；Manifest 和字体来源说明均不在最终服务目录或哈希文件条目中。
- `actionlint` 同时检查两个 Workflow、全部相关 CJS 语法、Git 工作区及暂存区 diff 空白检查通过。

两个资源校验阻断已在本地解除。尚未执行新工作流的远端运行或首次发布；依赖安全维护仍按 6D-B 评估另行处理。本轮修改 Workflow、打包器、既有生产检查器、发布测试和本文共五个文件；保留进入本轮前已有的暂存状态，没有自动暂存修复，也没有 Commit、Push 或服务器操作。
