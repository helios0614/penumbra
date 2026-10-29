import * as React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ApiError } from "@/lib/api";
import type { MemoryOriginalSource } from "@/domain/memory";
import { MemorySourceDialog, MemorySourceMessages } from "./MemorySourceDialog";
import { MemoryItem } from "./MemoryItem";
import { ReadonlyConversationDialog } from "@/components/chat/ReadonlyConversationDialog";
import { hookSession, find } from "@/components/chat/test-utils/hook-session";
vi.mock("react", async original => { const actual = await original<typeof React>(); return { ...actual, ...Object.fromEntries(["useState", "useRef", "useCallback", "useId", "useEffect", "useLayoutEffect"].map(key => [key, vi.fn(actual[key as keyof typeof actual] as never)])) }; });
vi.mock("@/components/chat/useReadonlyDialogFrame", () => ({ useReadonlyDialogFrame: () => ({ current: null }) }));
afterEach(() => vi.restoreAllMocks());
const data: MemoryOriginalSource = { available: true, messages: [{ role: "user", name: "用户", content: "<script>inert</script>\nhttps://example.invalid", createdAt: 1 }, { role: "system", name: "事件", content: "合成系统记录", createdAt: 2 }] };
const tick = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { resolve, promise }; }
it("renders exact readonly bubbles and compact system records with no message actions or invented target", () => {
  const html = renderToStaticMarkup(<MemorySourceMessages messages={data.available ? data.messages : []} />);
  expect(html).toContain("context-message"); expect(html).toContain("data-context-event"); expect(html).toContain("合成系统记录"); expect(html).toContain("&lt;script&gt;");
  for (const marker of ["<button", "href=", "src=", "<script", "textarea", "aria-current", "data-context-message"]) expect(html).not.toContain(marker);
});
it.each([{ available: false } as const, { available: true, messages: [] } as const, data])("distinguishes absent, empty and available sources: %j", async result => {
  const read = vi.fn(async () => result);
  const h = hookSession(() => MemorySourceDialog({ memoryId: "m", onClose: vi.fn(), read }));
  expect(find(h.render(), ReadonlyConversationDialog).props.status).toBe("loading"); h.commit(); await tick();
  expect(find(h.render(), ReadonlyConversationDialog).props.status).toBe(!result.available ? "unavailable" : result.messages.length ? "ready" : "empty"); h.dispose();
});
it("offers retry after failure, clears stale rows and cancels superseded/unmounted reads", async () => {
  const late = deferred<MemoryOriginalSource>(); const read = vi.fn().mockImplementationOnce(() => late.promise).mockRejectedValueOnce(new ApiError("private", 503)).mockResolvedValue(data);
  let id = "old"; const close = vi.fn(); const h = hookSession(() => MemorySourceDialog({ memoryId: id, onClose: close, read }));
  h.render(); h.commit(); id = "new"; h.render(); h.commit(); await tick();
  expect(read.mock.calls[0][1].signal.aborted).toBe(true);
  late.resolve(data); await tick(); expect(find(h.render(), ReadonlyConversationDialog).props.status).toBe("failed"); expect(JSON.stringify(h.render())).not.toContain("private");
  find(h.render(), ReadonlyConversationDialog).props.onRetry(); expect(find(h.render(), ReadonlyConversationDialog).props.status).toBe("loading"); h.commit(); await tick();
  expect(find(h.render(), ReadonlyConversationDialog).props.status).toBe("ready"); find(h.render(), ReadonlyConversationDialog).props.onClose(); expect(close).toHaveBeenCalledOnce();
  h.dispose(); expect(read.mock.lastCall![1].signal.aborted).toBe(true);
});
it.each([401, 403, 404])("handles unavailable HTTP %s without leaking server details", async status => {
  const h = hookSession(() => MemorySourceDialog({ memoryId: "m", onClose: vi.fn(), read: async () => { throw new ApiError("private", status); } }));
  h.render(); h.commit(); await tick(); expect(find(h.render(), ReadonlyConversationDialog).props.status).toBe("unavailable"); h.dispose();
});
it("aborts an in-flight source on unmount and ignores a transport that resolves after cancellation", async () => {
  const late = deferred<MemoryOriginalSource>(); const read = vi.fn(() => late.promise);
  const h = hookSession(() => MemorySourceDialog({ memoryId: "m", onClose: vi.fn(), read }));
  h.render(); h.commit(); h.dispose(); expect((read.mock.calls[0] as unknown as [string, { signal: AbortSignal }])[1].signal.aborted).toBe(true);
  late.resolve(data); await tick(); expect(find(h.render(), ReadonlyConversationDialog).props.status).toBe("loading");
});
it("puts a discoverable icon in the existing metadata action group even when source metadata is absent", () => {
  const onViewSource = vi.fn(); const h = hookSession(() => MemoryItem({ memory: { id: "m", content: "body", type: null, createdAt: 1, sourceConversationId: null, sourceStartedAt: null, sourceEndedAt: null, importance: null, tags: [], isPinned: false }, pending: false, onSetUnresolved: vi.fn(), onViewSource }));
  const tree = h.render(); const group = find(tree, "div", p => p["data-memory-item-actions" as keyof typeof p] === "true");
  const button = find(group, "button", p => p["aria-label"] === "查看原文"); expect(button.props.title).toBe("查看原文"); expect(button.props.children).not.toBe("查看原文");
  button.props.onClick?.({} as never); expect(onViewSource).toHaveBeenCalledWith("m");
});
it.each([["unavailable", "原文已不可用"], ["empty", "没有可显示的原文消息"], ["failed", "原文读取失败"]] as const)("shared reader gives lightweight %s feedback", (status, text) => {
  const retry = vi.fn(); const tree = ReadonlyConversationDialog({ open: true, description: "source", status, onClose: vi.fn(), onRetry: retry });
  expect(JSON.stringify(tree)).toContain(text);
});
