import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MessageDeleteDialog } from "./MessageDeleteDialog";
import { Bubble } from "./Bubble";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Dialog } from "@/components/ui/dialog";
import { elements, find, hookSession } from "./test-utils/hook-session";
import { mapMessage } from "@/domain/message";
import { messageWire } from "@/test-fixtures/main-chat-wire";
import { presentChatMessage } from "@/components/chat-workspace/presentation/chat-message-presenter";

vi.mock("react", async original => {
  const actual = await original<typeof React>();
  return { ...actual, ...Object.fromEntries(["useState", "useRef", "useCallback", "useId", "useEffect", "useLayoutEffect"].map(key => [key, vi.fn(actual[key as keyof typeof actual] as never)])) };
});
afterEach(() => vi.restoreAllMocks());
function session() {
  const message = mapMessage(messageWire({ role: "system" }));
  const remove = vi.fn(async () => {}), close = vi.fn();
  let unavailableReason: string | null = null;
  const hooks = hookSession(() => MessageDeleteDialog({ message, unavailableReason, onDelete: remove, onClose: close }));
  const submit = () => find(hooks.render(), Button, p => p.children === "确认删除" || p.children === "正在删除…").props.onClick?.({} as never);
  return { ...hooks, message, remove, close, submit, lock: () => { unavailableReason = "正在生成"; } };
}
describe("single-message confirmation", () => {
  it("cancels without deleting and locks dismissal and duplicate submission in flight", async () => {
    const s = session();
    find(s.render(), Button, p => p.children === "取消").props.onClick?.({} as never);
    expect(s.remove).not.toHaveBeenCalled(); s.close.mockClear();
    let finish!: () => void; s.remove.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    s.submit(); s.submit(); expect(s.remove).toHaveBeenCalledExactlyOnceWith(s.message);
    find(s.render(), Dialog).props.onOpenChange?.(false, {} as never); expect(s.close).not.toHaveBeenCalled();
    finish(); await Promise.resolve(); await Promise.resolve(); expect(s.close).toHaveBeenCalledOnce();
  });
  it("keeps confirmation open with actual error and permits retry", async () => {
    const s = session(); s.remove.mockRejectedValueOnce(new Error("synthetic delete denied"));
    s.submit(); await Promise.resolve(); await Promise.resolve();
    expect(s.close).not.toHaveBeenCalled();
    expect(elements(s.render()).find(el => el.props.role === "alert")?.props.children).toContain("synthetic delete denied");
    s.submit(); await Promise.resolve(); await Promise.resolve(); expect(s.close).toHaveBeenCalledOnce();
  });
  it("honors a newly acquired execution lock", () => {
    const s = session(); s.lock(); s.submit(); expect(s.remove).not.toHaveBeenCalled();
  });
});
describe("deletion action identity", () => {
  it.each(["user", "assistant", "system"])("exposes one delete action for persisted %s including legacy system fallback", role => {
    const message = presentChatMessage(mapMessage(messageWire({ role, content: "one\n\ntwo\nthree" })))!;
    const html = renderToStaticMarkup(<TooltipProvider><Bubble message={message} onDelete={vi.fn()} /></TooltipProvider>);
    expect(html.match(/aria-label="删除(?:消息|系统通知)"/g)).toHaveLength(1);
    expect(html).toContain(`data-message-id="${message.id}"`);
  });
  it("keeps temporary execution overlays and readonly views inert", () => {
    const message = { ...presentChatMessage(mapMessage(messageWire()))!, executionStatus: "streaming" as const };
    for (const props of [{ message }, { message: presentChatMessage(mapMessage(messageWire({ role: "system" })))!, showActions: false }]) {
      const html = renderToStaticMarkup(<TooltipProvider><Bubble {...props} onDelete={vi.fn()} /></TooltipProvider>);
      expect(html).not.toMatch(/aria-label="删除(?:消息|系统通知)"/);
    }
  });
});
