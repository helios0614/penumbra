import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatRequestParametersMenu, ChatSettingSlider, ChatThinkingSetting } from "./ChatRequestParametersMenu";
import { createChatSettingsController } from "@/components/chat-workspace/chat-settings-controller";
import type { ChatDefaultsRead } from "@/domain/runtime/chat-defaults";
import { addedChatDefaults } from "@/test-fixtures/chat-defaults";
import { Popover, PopoverTitle, PopoverDescription } from "@/components/ui/popover";
import { Dialog } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { SegmentedControlItem } from "@/components/ui/selection-control";
import { elements, find, hookSession } from "./test-utils/hook-session";
vi.mock("react", async original => {
  const actual = await original<typeof React>();
  return { ...actual, ...Object.fromEntries(["useState", "useRef", "useCallback", "useId", "useEffect", "useLayoutEffect"].map(key => [key, vi.fn(actual[key as keyof typeof actual] as never)])) };
});
afterEach(() => vi.restoreAllMocks());
async function fixture() {
  const scope = { conversationId: "a", selection: { connectionId: "c", protocol: "openai_chat_completions", model: "literal" } };
  const data: ChatDefaultsRead = { ...addedChatDefaults(), revision: 0, protocol: scope.selection.protocol, selection: scope.selection, conversationId: "a",
    context_limit: { value: 30, source: "backend_default", defaultValue: 30, min: 1, max: 100 },
    temperature: { value: 1, source: "backend_default", defaultValue: 1, min: 0, max: 2 } };
  const load = vi.fn(async () => data), save = vi.fn(async () => data);
  const controller = createChatSettingsController({ load, save, canEdit: () => true }); controller.select(scope); await controller.open();
  return { controller, data, load, save, settings: () => ({ state: controller.getState(), controller }) };
}
describe("lightweight Chat settings", () => {
  it("explains unsupported Thinking, keeps unknown models quiet and locks all five efforts during execution", async () => {
    const s = await fixture();
    expect(find(ChatThinkingSetting({ settings: s.settings(), disabled: false }), Switch).props.disabled).toBe(true);
    const settings = { ...s.settings(), state: { ...s.settings().state, data: { ...s.data, ...addedChatDefaults(true),
      thinking: { ...addedChatDefaults(true).thinking, value: { enabled: true, effort: "max" as const } } } } };
    const tree = ChatThinkingSetting({ settings, disabled: true });
    expect(JSON.stringify(tree)).not.toContain("模型能力未验证，可尝试");
    const efforts = elements(tree).filter(node => node.type === SegmentedControlItem);
    expect(efforts.map(node => node.props.children)).toEqual(["low", "medium", "high", "xhigh", "max"]);
    expect(efforts.every(node => node.props.disabled)).toBe(true);
    expect(efforts.filter(node => node.props.selected).map(node => node.props.children)).toEqual(["max"]);
  });
  it("uses a Popover on both surfaces, correct three-dot label and real read on open", async () => {
    const s = await fixture(), hooks = hookSession(() => ChatRequestParametersMenu({ settings: s.settings(), disabled: false }));
    const tree = hooks.render(); expect(elements(tree).some(node => node.type === Dialog)).toBe(false);
    const trigger = elements(tree).find(node => node.type === Popover)!.props.children as React.ReactNode;
    expect(JSON.stringify(trigger)).toContain("聊天设置"); expect(JSON.stringify(tree)).not.toContain("应用到后续请求");
    const title = find(tree, PopoverTitle);
    expect(elements(tree).some(node => node.type === PopoverDescription)).toBe(false);
    expect(title.props.children).toBe("聊天设置");
    for (const text of ["自动保存", "生成参数", "上下文与记忆", "Chat 与 Diary 共用", "0 为不携带"]) {
      expect(JSON.stringify(tree)).not.toContain(text);
    }
    find(tree, Popover).props.onOpenChange?.(true, {} as never); await Promise.resolve(); expect(s.load).toHaveBeenCalledTimes(2);
    hooks.dispose();
  });
  it.each(["temperature", "thinking"] as const)("retains %s failure feedback and its retry action in the compact layout", async field => {
    const s = await fixture(), commit = vi.spyOn(s.controller, "commit");
    const settings = { ...s.settings(), state: { ...s.settings().state,
      data: { ...s.data, ...addedChatDefaults(true) }, drafts: { [field]: field === "thinking" ? { enabled: true, effort: "max" as const } : 0 },
      errors: { [field]: "未确认保存，当前编辑已保留。" } } };
    const hooks = hookSession(() => field === "thinking" ? ChatThinkingSetting({ settings, disabled: false }) :
      ChatSettingSlider({ settings, field, label: "Temperature", metadata: s.data.temperature!, disabled: false }));
    const tree = hooks.render();
    expect(JSON.stringify(tree)).toContain("未确认保存，当前编辑已保留。");
    const retry = find(tree, Button, props => props.children === "重试");
    expect(retry.props.disabled).toBe(false); retry.props.onClick?.({} as never);
    expect(commit).toHaveBeenCalledWith(settings.state.scope, field);
    hooks.dispose();
  });
  it("previews many drag changes without saving and commits only on pointer end", async () => {
    const s = await fixture(), hooks = hookSession(() => ChatSettingSlider({ settings: s.settings(), field: "context_limit", label: "上下文消息数", metadata: s.data.context_limit, disabled: false }));
    const slider = () => find(hooks.render(), Slider).props;
    for (let n = 31; n < 80; n++) slider().onValueChange?.(n, {} as never);
    expect(s.save).not.toHaveBeenCalled(); expect(slider().value).toBe(79);
    slider().onValueCommitted?.(79, { reason: "drag" } as never); expect(s.save).toHaveBeenCalledOnce(); hooks.dispose();
  });
  it("groups repeated keyboard changes until keyup and uses a low-emphasis single-field reset", async () => {
    const s = await fixture(); const hooks = hookSession(() => ChatSettingSlider({ settings: s.settings(), field: "temperature", label: "Temperature", metadata: { ...s.data.temperature!, source: "saved" }, disabled: false }));
    const slider = () => find(hooks.render(), Slider).props;
    slider().onKeyDownCapture?.({ key: "ArrowLeft" } as never);
    for (const n of [.9, .8, .7]) { slider().onValueChange?.(n, {} as never); slider().onValueCommitted?.(n, { reason: "keyboard" } as never); }
    expect(s.save).not.toHaveBeenCalled(); slider().onKeyUp?.({ key: "ArrowLeft" } as never); expect(s.save).toHaveBeenCalledOnce();
    expect(find(hooks.render(), Button).props["aria-label"]).toBe("恢复Temperature默认值"); hooks.dispose();
  });
});
