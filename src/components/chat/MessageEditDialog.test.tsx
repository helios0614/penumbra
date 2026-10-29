import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MessageEditDialog } from "./MessageEditDialog";
import { Bubble } from "./Bubble";
import { Textarea } from "@/components/ui/textarea";
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
  const original = mapMessage(messageWire({ role: "user", content: "\n  first\n\nlast  \n" }));
  const save = vi.fn(async () => {}), close = vi.fn();
  let unavailableReason: string | null = null;
  const hooks = hookSession(() => MessageEditDialog({ message: original, unavailableReason, onSave: save, onClose: close }));
  const input = () => find(hooks.render(), Textarea).props;
  const submit = () => find(hooks.render(), Button, p => p.children === "保存" || p.children === "正在保存…").props.onClick?.({} as never);
  return { ...hooks, original, save, close, input, submit, lock: () => { unavailableReason = "正在生成"; } };
}
describe("whole-message editor", () => {
  it("opens exact full source and cancels without mutation or Sender key handlers", () => {
    const s = session(); expect(s.input().value).toBe(s.original.content); expect(s.input().onKeyDown).toBeUndefined();
    s.input().onChange?.({ target: { value: "draft" } } as never);
    find(s.render(), Button, p => p.children === "取消").props.onClick?.({} as never);
    expect(s.save).not.toHaveBeenCalled(); expect(s.close).toHaveBeenCalledOnce();
  });
  it("preserves failed exact text and hides raw service details, then retries", async () => {
    const s = session(); const content = "\n  edited\n\nlast  \n";
    s.input().onChange?.({ target: { value: content } } as never);
    s.save.mockRejectedValueOnce(new Error("private upstream detail")); s.submit();
    await Promise.resolve(); await Promise.resolve();
    expect(s.save).toHaveBeenCalledWith(s.original, content); expect(s.close).not.toHaveBeenCalled();
    expect(s.input().value).toBe(content);
    const error = elements(s.render()).find(el => el.props.role === "alert");
    expect(error?.props.children).toContain("编辑内容已保留"); expect(error?.props.children).not.toContain("private");
    s.submit(); await Promise.resolve(); await Promise.resolve(); expect(s.close).toHaveBeenCalledOnce();
  });
  it("locks duplicate save and dismissal during PUT/readback", async () => {
    const s = session(); let finish!: () => void;
    s.save.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    s.input().onChange?.({ target: { value: "draft" } } as never); s.submit(); s.submit();
    expect(s.save).toHaveBeenCalledOnce(); expect(s.input().disabled).toBe(true);
    find(s.render(), Dialog).props.onOpenChange?.(false, {} as never); expect(s.close).not.toHaveBeenCalled();
    finish(); await Promise.resolve(); await Promise.resolve(); expect(s.close).toHaveBeenCalledOnce();
  });
  it("closes unchanged source without PUT and refuses a newly acquired execution lock", () => {
    const s = session(); s.submit(); expect(s.close).toHaveBeenCalledOnce(); expect(s.save).not.toHaveBeenCalled();
    s.input().onChange?.({ target: { value: "draft" } } as never); s.lock(); s.submit(); expect(s.save).not.toHaveBeenCalled();
  });
});

describe("edit action persistence boundary", () => {
  it.each(["user", "assistant"])("has one action per saved %s, regardless of visual chunks", role => {
    const message = presentChatMessage(mapMessage(messageWire({ role, content: "one\n\ntwo\nthree" })))!;
    const html = renderToStaticMarkup(<TooltipProvider><Bubble message={message} onEdit={vi.fn()} /></TooltipProvider>);
    expect(html.match(/aria-label="编辑消息"/g)).toHaveLength(1);
  });
  it.each(["optimistic", "streaming", "finalizing", "unconfirmed"] as const)("never offers edit on %s overlays, even with a callback", executionStatus => {
    const message = presentChatMessage(mapMessage(messageWire()))!;
    expect(renderToStaticMarkup(<TooltipProvider><Bubble message={{ ...message, executionStatus }} onEdit={vi.fn()} /></TooltipProvider>)).not.toContain('aria-label="编辑消息"');
  });
});
