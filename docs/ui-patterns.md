# Penumbra UI Patterns & Troubleshooting

本文记录已通过实际页面与 runtime 验证的 UI 模式、常见陷阱和排查方法。

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
