# Penumbra UI Patterns & Troubleshooting

本文记录已通过实际页面与 runtime 验证的 UI 模式、常见陷阱和排查方法。

## Dialog / AlertDialog 的成熟组合约定

UI Foundation PR2 已将 Memory、Quick Note、Activity、Location 的成熟布局收敛到共享 `components/ui/dialog.tsx`、`alert-dialog.tsx`。新消费者直接组合公共区域，不再复制 feature 的外壳、标题、Footer 或关闭按钮 CSS。Base UI 继续负责模态、可访问性、焦点和取消语义。

公共默认保证：

- `DialogContent` / `AlertDialogContent` 使用原有 `mist-glass-strong`，28px 圆角、默认最大宽度 32rem。外壳为无 padding 的纵向 Flex，隐藏溢出；四边至少保留 16px 视口间距并避让安全区，最大高度受 `100dvh` 扣除上下安全间距限制，按可用区域居中。材质、边框、阴影 token 不变。
- Header / Body / Footer 的横向 padding 为移动端 20px、桌面端 24px。普通 Header 固定、左对齐并带轻分隔线；默认标题 `font-sans`、18px / 600 / 28px，描述 13px / 20px、muted。英文 eyebrow 按需显式使用 `font-decorative`（11px / 400、大写、0.14em 字距），中文标题不使用 `font-heading`。
- 可选 `DialogBody` 提供 `min-h-0`、`flex-auto`、独立纵向滚动及 overscroll containment；短内容自然收缩，没有固定高度。不需要滚动组合的短弹框无需强制创建 Body。外壳不再叠加纵向滚动。
- Footer 固定、透明、带轻分隔线，水平右对齐、8px 间距、空间不足时换行；移动端不反转顺序、不强制按钮全宽。不渲染 Footer 就没有底部操作区。
- Footer 不改变 Button 密度；普通确认保留默认 min 36px，Memory、Wi-Fi、Quick Note 表单显式 `size="comfortable"` 保留 min 44px。按钮使用最小高度，文字可换行、自然增高。取消通常为 ghost，保存／确认为 default，危险操作为 destructive；`AlertDialogCancel` 默认为 ghost。
- Dialog 默认有一个 Lucide X：图标 16px、独立点击区域 44px、默认可访问名称“关闭”。通过 `closeButtonProps` 指定业务名称、disabled 等原生关闭属性。已有自定义 Header 可选择 `showCloseButton={false}` 并组合公共 `DialogCloseButton`；两种方式只选一种，避免两个 X。Header 仅在有关闭按钮时预留右侧空间。

三类用途的组合：

```tsx
// 表单：Header / Body / Footer 可放在同一个受限 Flex form 内。
<DialogContent showCloseButton={false}>
  <form className="flex min-h-0 flex-1 flex-col" onSubmit={save}>
    <DialogHeader>
      <DialogTitle>编辑内容</DialogTitle>
      <DialogCloseButton aria-label="关闭编辑" disabled={saving} />
    </DialogHeader>
    <DialogBody>{/* 字段和区域内错误 */}</DialogBody>
    <DialogFooter>{/* ghost 取消、primary 保存 */}</DialogFooter>
  </form>
</DialogContent>

// 阅读：只有正文滚动，不加仅用于“关闭”的 Footer。
<DialogContent closeButtonProps={{ "aria-label": "关闭详情" }}>
  <DialogHeader><DialogTitle>详情</DialogTitle></DialogHeader>
  <DialogBody render={<dl />}>{/* 内容 */}</DialogBody>
</DialogContent>

// 确认：说明区在极短视口可滚动，Footer 保持在外。
<AlertDialogContent>
  <AlertDialogHeader>
    <AlertDialogTitle>放弃草稿？</AlertDialogTitle>
    <AlertDialogDescription>尚未保存的修改会被放弃。</AlertDialogDescription>
  </AlertDialogHeader>
  <AlertDialogFooter>
    <AlertDialogCancel>返回编辑</AlertDialogCancel>
    <AlertDialogAction variant="destructive" onClick={discard}>放弃草稿</AlertDialogAction>
  </AlertDialogFooter>
</AlertDialogContent>
```

`DialogBody render={<form ... />}` / `render={<dl />}` 可保留语义元素和其原生属性；字段间距通常参考 16px，输入和 Select 沿用 translucent。宽度继续由业务通过 `className` 选择，AlertDialog 的 `size="sm"` 保留较窄的 20rem。Location 时间选择器保留两列独立滚动，POI 保留紧凑字段节奏；Quick Note 保留编辑器高度、textarea 与冲突预览的并行滚动，以及 `visualViewport` 的高度／偏移适配和短视口纵向间距压缩。公共几何可接收 `--dialog-viewport-height` / `--dialog-viewport-top`，只有 Quick Note 将现有局部变量接入，不要求普通 Dialog 复制监听逻辑。

关闭与焦点约定：

- X、取消、Escape、遮罩应进入同一业务关闭规则。保存中禁用 X／取消，按业务设置 `disablePointerDismissal`；`onOpenChange` 拒绝关闭时调用底层 `eventDetails.cancel()`，不要只依赖受控 open 不变。草稿确认和保存状态仍由 feature 管理。
- AlertDialog 继续使用 Base UI 的独立 primitive，遮罩不关闭；Escape 表示取消，不能触发危险 action。Action 的业务提交与关闭仍由消费者控制。
- 从 Popover 打开 Dialog 后，Popover 项可能卸载；通过原生 `finalFocus` 返回仍存在的页面菜单按钮或阅读区域。直接 `DialogTrigger` 继续使用底层默认恢复，不额外改写焦点设施。
- 编辑器内的确认 AlertDialog 应嵌套在父 Dialog 的 React 根节点内，让 Base UI 识别层级、只让最上层处理关闭与焦点陷阱。不要为弹框新增全局键盘监听；关闭手势不能穿透到底层页面。
- 公共外壳和遮罩在 Reduced Motion 下禁用动画与过渡；自定义主题和深色模式沿用现有语义颜色。移动端软键盘、字体放大及极短横屏仍需人工验证具体内容与按钮的可达性。

UI Foundation PR1 已提供公共 `Switch`（见下文），替代 Activity 和 Location 的局部轨道实现。PR3 的公共 Toast / Feedback 规则见下文。

## Toast / Feedback

`components/ui/toast.tsx`、`toast-store.ts`、`toast-viewport.ts`、`toast.css` 提供轻量本地 Host 和 API，无新依赖。已检查现有依赖（包括 Base UI 的 Toast 能力）；本轮采用限定容量的本地队列，直接支持 feature 生命周期、过期异步结果和应用视口，不建立全局通知服务或传输层错误中心。

```tsx
// DesktopAppView 为经典／Editorial 的共享入口，提供当前应用边界与独立 Host。
<ToastProvider key={appId} viewportRef={appViewportRef} mobileClearance={16}>
  {/* 当前应用；Host 自动 portal 至 body，不占据内容滚动布局 */}
</ToastProvider>

const toast = useToast(`${date}:${device}`);
// 必须先得到实际写入确认，业务失败继续保留表单及草稿。
toast.show({ type: "success", text: "已保存", dedupeKey: "save" });
toast.show({ type: "info", text: "已提交补写请求" });
```

- `ToastInput`：`type: success | info | error`、必填 `text`，可选 `description`、`dedupeKey`、`duration`（毫秒，至少 1 秒）。`description` 必须有实际解释价值，不能自动添加“操作已完成”等空副标题。默认严格单行，无截断；仅窄屏必要换行。
- `useToast(scopeKey?)`：返回 `show`（得到 id）、`dismiss(id)`、`clear()`；每个 hook 持有独立页面／操作作用域。相同作用域内同一 key 或同类型相同文案更新计时而不叠加；相同播报文本不重复修改 live region。最多两条，溢出立即清理最早通知及 timer，不建立无限等待队列。
- 默认成功 3000ms、信息 4000ms、临时失败 5000ms。悬停、键盘焦点、后台页面和模态弹框期间暂停计时；模态打开时也暂缓展示和播报。卸载清理 timer／订阅，作用域切换清理该作用域通知，晚到的异步 `show` 失效。`useFeedbackToast` 仅桥接业务层显式标记的短暂结果，按结果对象防止重复消费。
- 移动端底部居中，desktop（640px 起）在应用边界的右上角。通过 `visualViewport` 交集处理键盘高度与平移，通过安全区变量避让系统区域。Provider 默认预留 112px 给 Dock，当前应用隐藏 Dock 后显式使用 16px；固定操作区可标记 `data-toast-obstacle`（Chat Sender 已接入），尺寸变化重新测量。动态 style 仅用于测量后的视口几何。
- z-index 为 100，Host 不捕获空白区指针，不自动聚焦、不建立焦点陷阱；关闭为原生 button、44px 点击区域。单独预先挂载的 `role=status`／`aria-live=polite`／`aria-atomic=true` 负责播报，视觉消息不再次设置 live role。Mist、语义色及阴影跟随明暗／自定义主题，Reduced Motion 禁用非必要动画。

反馈归属：

| 结果 | 出口 |
|---|---|
| 创建／保存／删除／复制已确认 | 短 Toast；不另写同义成功 notice |
| 后台任务请求已接受 | 准确的“已提交／已安排” Toast；进度仍在内容／日志区域 |
| 字段校验／表单写入失败 | 字段／Dialog 内，可保留输入和有效的读取恢复入口 |
| 写入未知、冲突、草稿仍未保存 | 持续内联；不能因 Toast 消失而丢失必要状态 |
| 连接中断、服务不可用、读取失败 | 页面／模块 Surface；失败不能伪装为空结果 |
| 读取成功 | 清除已经失效的读取错误；不推断后台生成或未知写入已经完成 |

Activity 用结构化失败类型判断共同 HTTP 故障，合并同源错误与恢复入口；诊断置于折叠 details，独立错误保留局部重试，连接恢复后的 GET 清理各自错误。WebSocket 状态独立，统一恢复按钮仅显式调用既有 GET／reconnect，不增加自动重试。Wi-Fi Dialog 的失败只在表单内，列表标记操作的失败在 Wi-Fi 区域，不同时出现在页面 notice。

Quick Note 的重试 Dialog 打开时独占操作 notice，关闭后必要的持续错误回到页面；成功只走 Toast。日期／阅读内容切换使旧 notice 及旧异步反馈失效；已接受但重新读取失败的提示随读取恢复清理，结果未知和编辑冲突继续保留。Location 的 `section` 成功全部由公共 Toast 消费，区域失败继续使用 `LocationSaveError`，保留独立保存与多区域草稿。Chat 消息和代码复制都等待剪贴板 Promise，仅有 Toast 一条结果路径，失败明确显示且无“已复制”局部状态。

## 基础控件：密度、状态与组合

控件可见尺寸不等于交互目标尺寸；Penumbra 不要求所有移动端控件视觉高度达到 44px。避免把已经验收的紧凑工具栏和列表操作统一增高。目标之间不得重叠；默认不添加超出布局盒的隐形点击区。

| 控件 | 紧凑 | 常规默认 | 宽松／主要操作 |
|---|---|---|---|
| Button `size` | `compact`：min 32px | `default`：min 36px | `lg`：min 40px；`comfortable`：min 44px |
| Input / AppSelect `controlSize` | `compact`：min 32px，仅紧凑组合 | `default`：min 40px | `comfortable`：min 44px |
| AppSelect 选项 | min 36px，可换行 | min 36px，可换行 | comfortable：min 44px |
| Textarea `controlSize` | 较小内边距 | 常规内边距 | 较宽松内边距，不强设单行高度 |
| FilterChip / SegmentedControlItem | 约 36px 可见表面 | min 44px 的布局／点击区域 | 文字换行时自然增高 |
| Switch | 44×24px 轨道，18px thumb | 44×44px 点击区域 | busy 不扩大轨道 |

Button 旧 `xs` / `sm`（min 24 / 28px）及 icon 24 / 28 / 32 / 36px 保持兼容，供 Chat 工具栏、日历等密集组合使用；这不是常规表单默认，也不表示这些旧目标已完成触屏验收。PageHeaderAction 与成熟弹框关闭按钮保留现有 44px。Memory 搜索／重要度与已验收的 Memory、Wi-Fi、Quick Note 表单显式选择 comfortable；Location 普通输入及查询采用 40px，主要保存仍为 44px。

按钮配色由 variant 承担，不在 feature 内重复 `bg-primary/90 hover:bg-primary`：主操作用 default，页面级辅助查询和重新读取可用 soft-primary，轻工具用 ghost，中性描边用 outline，危险操作用 destructive。Button 的视觉优先级由当前交互场景决定，不仅由操作名称决定；弹框中的主要操作可以使用 Primary（`variant="default"`），即使它执行的是读取、刷新或重试。例如 Quick Note「重试未完成速记」的「重新读取」使用实心主题色，读取中仍禁用，空列表仍允许再次获取；Location 页面级辅助「查询」继续使用 soft-primary。主色状态引用 primary / primary-hover / primary-active；浅主题色文字引用 primary-ink。secondary 的 Hover 引用真实的 color-secondary-hover，不引入第二套主题变量。

`Button loading` 是可选的基础状态：禁用点击、设置 aria-busy，在保留标签布局的同时显示居中 spinner；传入稳定的操作标签，避免 loading 时额外改变文字宽度。已有业务的“保存中…”文案及 aria-busy 可以继续使用。Focus 使用 ring token 的克制外环，Disabled 明确降权，非必要过渡和 spinner 响应 Reduced Motion。

FilterChip 和 SegmentedControlItem 接收 `selected`、标准按钮属性及回调，不管理筛选状态或路由。FilterChip 选中为轻主题底与描边，Hover 进一步强调，不回退到 ghost 中性色。SegmentedControlItem 选中为实心主题色；Quick Note 保留四列等宽，日期项继续组合现有 Popover。样式表面在 button 内部，点击目标不向邻居扩张。

AppSelect 的触发器可收缩，长选中值截断并保留完整名称；下拉宽度受可用视口约束，选项完整换行（包含长连续字符串），选中与键盘 highlighted 状态可区分。筛选默认 12px；表单通过 className 与 contentClassName 同时选择 text-sm，选项继承 popup 字号，避免触发器 14px、选项却固定 12px。可禁用单个选项；回调只转发当前存在、未禁用的选项。不要借 className 再强加同一套固定高度。

Switch 使用 `checked` / `onCheckedChange`，`disabled` 或 `busy` 时阻止切换；busy 同步 aria-busy 并在 thumb 内显示小型等待标记。消费者必须提供 aria-label 或 aria-labelledby；可见文字通过 label 的 htmlFor 关联同一 id。Activity 权限保持服务端确认后更新，Location 定位／静默保持编辑草稿并由保存按钮统一提交；公共控件不请求 API、不缓存或推测保存成功。

基础圆角使用 `--radius-control: 12px`，不改旧 radius-md / radius-xl 的计算关系；局部已验收的圆角仍可保留。`error` 系列是 destructive 的兼容别名，保留 Memory 等既有调用，并跟随明暗主题，不进行大范围变量重命名。

## Backdrop / Glass Pitfalls

### Memory 真实案例

Settings / Chat 中，`.mist-glass` 能正常呈现磨砂效果；Memory 使用相同的
`.mist-glass`，DevTools 中的 `background`、`backdrop-filter`、`border` 和
`shadow` 也一致，但实际效果只像一层半透明白膜，wallpaper 中的人脸、头发、
门框等细节仍明显可辨。

这个现象很容易被误判为 Mist alpha 或 blur 不够、wallpaper 区域不同、surface
composition 不同，甚至需要新增第四种 Mist primitive。最终通过当前目标浏览器中的
runtime 单变量 A/B，确认视觉差异与 Memory 的 animated ancestor 持久 fill 直接相关：

```css
[data-testid="desktop-app-view"] {
  animation: desktop-surface-enter 0.22s ease-out both;
}
```

对应 keyframes 同时包含 `opacity: 0 -> 1` 和 `transform: ... -> identity`。

### Runtime A/B 证据

在 DevTools 中临时加入以下单变量 override：

```css
[data-testid="desktop-app-view"] {
  animation-fill-mode: none !important;
}
```

Memory 的 Header / Filters 磨砂效果立即恢复，视觉表现重新接近 Settings / Chat。
这是 **runtime single-variable A/B confirmed**，不是单纯的理论推测。正式修复方向
应是移除 persistent fill，而不是继续增加 surface 的白色覆盖。

### 本案例最终修复

`desktop-surface-enter` 的 keyframes 包含 `opacity: 0 -> 1` 和
`transform: ... -> identity`，而 `DesktopAppView` 的基础样式本身已经是最终稳定的
`opacity: 1` 和 `transform: none`，动画结束后无需继续保留 keyframe fill。

因此，DevTools 中的 `animation-fill-mode: none !important` 只用于 single-variable
runtime A/B；正式代码修复则是将：

```css
animation: desktop-surface-enter 0.22s ease-out both;
```

改为：

```css
animation: desktop-surface-enter 0.22s ease-out;
```

这个修复只移除了不必要的 persistent fill，没有删除入场动画。原有约 220ms 的
active phase 仍正常执行；动画结束后元素回到自身基础样式，descendant
`.mist-glass` 的磨砂效果恢复正常。不需要继续增加 Header tint、提高 Mist alpha，
也不需要新增 `mist-panel`。

> 这次真正修的是 animation lifecycle，而不是 glass surface 参数。

### 排查规则

#### Rule A — 相同 glass class 不代表相同最终渲染

不要只检查目标元素自身的 `background`、`backdrop-filter`、`border` 和
`shadow`。还要检查从目标元素到 backdrop/root 之间的完整 ancestor chain；
祖先的合成状态可能改变 descendant 的 backdrop sampling。

> 不要因为 `.mist-glass` 在两个元素上的 computed declarations 相同，就直接断定
> 视觉差异来自 wallpaper。`backdrop-filter` 的最终结果还依赖祖先合成与 backdrop
> sampling 条件。

#### Rule B — 排查祖先合成属性

当 `backdrop-filter` 表现异常时，优先检查祖先的以下属性：

- `opacity`
- `animation` / `animation-fill-mode`
- `will-change`
- `filter` / `backdrop-filter`
- `transform`
- `isolation`
- `contain`
- `mask` / `clip-path`
- `overflow`

不要混淆 stacking context 与 Backdrop Root；二者并不等价。普通 `transform` 本身
不应被简单判定为根因，应通过完整 ancestor chain 和单变量实验确认。

#### Rule C — 特别警惕 opacity animation + persistent fill

遇到类似 `animation: xxx 220ms ease-out both` 的动画时，如果 keyframes 包含
`opacity`，需要特别谨慎。动画肉眼已经结束，不等于它对合成状态的影响一定已经
消失；`animation-fill-mode: both` 仍可能影响 descendant 的 backdrop sampling。

如果最终基础样式本身已经是 `opacity: 1` 和 `transform: none`，通常不需要依赖
`fill-mode: both` 维持页面最终状态。

#### Rule D — 不要先用视觉补丁掩盖 backdrop bug

本次排查曾尝试或考虑给 Header 叠加 background tint、增加 surface opacity、改用
更强 Mist 或新增 `mist-panel`。这些做法只能改变“白不白”，无法真正恢复“背景细节
被磨掉”。

当玻璃表现像透明白膜时，先确认 backdrop blur 是否真的在工作，再调整 surface
参数。

### 推荐排查顺序

1. 找一个视觉正常的同类 glass 页面作为 control。
2. 确认目标元素使用的 Mist primitive。
3. 比较完整 ancestor chain，而不是只比较 class。
4. 检查 `animation`、`opacity`、`will-change` 等合成属性。
5. 用 DevTools 做单变量 override。
6. A/B 成功后再做正式代码修复。
7. 最后才考虑调整 alpha、blur 或新增 surface。

### Layout 附注

页面布局排查也应检查完整 ancestor chain。App shell 已提供 desktop gutter 时，
页面内部再次添加同级 `sm:px-*` 会形成 double padding。移动端和桌面端的 padding
ownership 应分别确认。
