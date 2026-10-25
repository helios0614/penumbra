import { describe, expect, it, vi } from "vitest";
import { createChatSendController } from "./chat-send-controller";
import type { ChatExecutionEvent } from "@/application/chat-execution";
import { composeVisibleChatMessages } from "@/components/chat-workspace/presentation/chat-execution-composer";
import { createAttachmentDraftStore } from "@/application/chat-media/attachment-drafts";

const url = "/uploads/1700000000000.png";
async function tick() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
describe("attachments through the existing send owner", () => {
  it("sends textless media once, keeps UUID/URL and optimistic media, then confirms via HTTP", async () => {
    let complete!: () => void;
    const wait = new Promise<void>(resolve => { complete = resolve; });
    async function* events(): AsyncGenerator<ChatExecutionEvent> { yield { type: "start", assistantMessageId: "saved-ai" }; await wait; }
    const open = vi.fn(async () => ({ kind: "stream" as const, events: events() }));
    const controller = createChatSendController({ openExecution: open, createUuid: () => "uuid-media", reconcileHistory: vi.fn(async () => ({ persistedMessageIds: ["user", "saved-ai"], regenerateTarget: null })) });
    expect(await controller.send({ conversationId: "A", content: "", generation: { attachments: [url] } })).toBe(true);
    expect(open).toHaveBeenCalledWith("A", { content: "", clientMessageId: "uuid-media", attachments: [url] }, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    const visible = composeVisibleChatMessages([], controller.getState(), "A");
    expect(visible[0]).toMatchObject({ kind: "user", content: "", attachments: [{ kind: "image" }] });
    complete(); await tick(); expect(controller.getState().kind).toBe("idle"); expect(open).toHaveBeenCalledOnce(); controller.dispose();
  });
  it("uploaded URL survives response-header failure, unknown remains locked and retries only read history", async () => {
    const upload = vi.fn(async () => ({ url, type: "image/png" as const, name: "a.png" }));
    const drafts = createAttachmentDraftStore({ upload, id: () => "1", createUrl: () => "blob:local", revokeUrl: vi.fn() });
    drafts.add("A", [{ name: "a.png", type: "image/png", size: 100 } as File]); await tick();
    const snapshot = drafts.capture("A")!;
    const open = vi.fn(async () => { throw new Error("transport disconnected after server may have accepted"); });
    const reconcile = vi.fn(async () => ({ persistedMessageIds: ["user"], regenerateTarget: null }));
    const controller = createChatSendController({ openExecution: open, createUuid: () => "unknown-media", reconcileHistory: reconcile });
    expect(await controller.send({ conversationId: "A", content: "", generation: { attachments: snapshot.urls } })).toBe(false);
    snapshot.preserve(""); snapshot.release(); await tick(); expect(controller.getState().kind).toBe("finalization-uncertain");
    await controller.retryFinalization();
    expect(await controller.send({ conversationId: "A", content: "", generation: { attachments: [url] } })).toBe(false);
    expect(drafts.get("A")).toEqual([]); expect(drafts.getRecoveries("A")[0].items[0].uploaded?.url).toBe(url);
    expect(upload).toHaveBeenCalledOnce(); expect(open).toHaveBeenCalledOnce(); expect(reconcile).toHaveBeenCalledTimes(2);
    drafts.dispose(); controller.dispose();
  });
});
