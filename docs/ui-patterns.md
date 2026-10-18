# Penumbra UI Patterns & Troubleshooting

本文记录已通过实际页面与 runtime 验证的 UI 模式、常见陷阱和排查方法。

## Dialog / AlertDialog 的成熟组合约定

以 `MemoryCreateDialog` 和 Quick Note V2.3 为现有参考。共享 `components/ui/dialog.tsx`、`alert-dialog.tsx` 提供语义、焦点和关闭机制；它们的默认 padding、标题和移动端 Footer 不等于成熟页面的最终排版。使用原语后，仍需在 feature 内明确组合以下结构，勿复制另一个 feature 的业务组件或创建新的全局弹框框架。

- 外层使用现有 `mist-glass-strong` 材质，延续其边框、阴影；参考当前成熟弹框的 28px 圆角、移动端 20px / 桌面端 24px 横向留白。不重新组合透明度、blur 或 shadow，不改共享 token。
- Header、Content、Footer 为兄弟区域。外壳 `flex flex-col`、`overflow: hidden`，最大高度不超过动态视口扣除安全边距后的空间；Header / Footer `shrink-0`，正文 `min-height: 0`、`flex: 1`、`overflow-y: auto`，避免弹框与正文双重滚动。
- Header 左对齐：可选装饰性 eyebrow 使用现有 `font-decorative`，11px / 400、大写、0.14em 字距；中文标题使用功能字体 18px / 600 / 28px 行高；说明使用 13px / 20px 行高。右上角关闭使用 44px 点击区域及明确的可访问名称；保存期间应阻止关闭。
- `DialogTitle` / `AlertDialogTitle` 默认使用 `font-sans`、18px / 600 / 28px，不再默认继承 `font-heading` 的文楷／衬线字形。装饰字体仅用于显式标记的英文 eyebrow；已有页面的局部标题样式仍可覆盖基础字号与间距。
- 表单字段间距参考 16px，输入和 Select 复用现有 translucent 变体。Footer 采用 `row wrap`、右对齐、8px 按钮间距，取消为 ghost，保存为现有主题主按钮；移动端也不默认改成两个全宽大按钮。按钮保留至少 44px 触摸高度，短视口时正文滚动、操作保持可达。
- 长内容阅读弹框保留固定 Header，只让正文滚动；没有实际底部操作时不添加 Footer。破坏性确认继续使用 AlertDialog、取消及 destructive action；极短视口可让确认说明滚动，按钮留在滚动区外。
- 涉及软键盘的密集编辑可参考 Quick Note 的 `visualViewport` 局部适配；这是编辑器的现有处理，不要求所有普通阅读弹框复制整套逻辑。

UI Foundation PR1 已提供公共 `Switch`（见下文），替代 Activity 和 Location 的局部轨道实现。仓库仍无共享 Toast / Notification 设施；设计文档中的 Toast z-index 仅是层级预留，不代表已有通知设施，不应为单页扩展全局通知系统。

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

按钮配色由 variant 承担，不在 feature 内重复 `bg-primary/90 hover:bg-primary`：主操作用 default，查询和重新读取可用 soft-primary，轻工具用 ghost，中性描边用 outline，危险操作用 destructive。主色状态引用 primary / primary-hover / primary-active；浅主题色文字引用 primary-ink。secondary 的 Hover 引用真实的 color-secondary-hover，不引入第二套主题变量。

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
