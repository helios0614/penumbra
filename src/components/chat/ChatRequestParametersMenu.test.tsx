import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatRequestParametersMenu, ChatSettingSlider } from "./ChatRequestParametersMenu";
import { createChatSettingsController } from "@/components/chat-workspace/chat-settings-controller";
import type { ChatDefaultsRead } from "@/domain/runtime/chat-defaults";
import { Popover } from "@/components/ui/popover";
import { Dialog } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { elements, find, hookSession } from "./test-utils/hook-session";
vi.mock("react", async original => {
  const actual = await original<typeof React>();
  return { ...actual, ...Object.fromEntries(["useState", "useRef", "useCallback", "useId", "useEffect", "useLayoutEffect"].map(key => [key, vi.fn(actual[key as keyof typeof actual] as never)])) };
});
afterEach(() => vi.restoreAllMocks());
async function fixture() {
  const scope = { conversationId: "a", selection: { connectionId: "c", protocol: "openai_chat_completions", model: "literal" } };
  const data: ChatDefaultsRead = { revision: 0, protocol: scope.selection.protocol, selection: scope.selection, conversationId: "a",
    context_limit: { value: 30, source: "backend_default", defaultValue: 30, min: 1, max: 100 },
    temperature: { value: 1, source: "backend_default", defaultValue: 1, min: 0, max: 2 } };
  const load = vi.fn(async () => data), save = vi.fn(async () => data);
  const controller = createChatSettingsController({ load, save, canEdit: () => true }); controller.select(scope); await controller.open();
  return { controller, data, load, save, settings: () => ({ state: controller.getState(), controller }) };
}
describe("lightweight Chat settings", () => {
  it("uses a Popover on both surfaces, correct three-dot label and real read on open", async () => {
    const s = await fixture(), hooks = hookSession(() => ChatRequestParametersMenu({ settings: s.settings(), disabled: false }));
    const tree = hooks.render(); expect(elements(tree).some(node => node.type === Dialog)).toBe(false);
    const trigger = elements(tree).find(node => node.type === Popover)!.props.children as React.ReactNode;
    expect(JSON.stringify(trigger)).toContain("聊天设置"); expect(JSON.stringify(tree)).not.toContain("应用到后续请求");
    find(tree, Popover).props.onOpenChange?.(true, {} as never); await Promise.resolve(); expect(s.load).toHaveBeenCalledTimes(2);
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
