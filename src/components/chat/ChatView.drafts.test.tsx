import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatWorkspaceView } from "./ChatView";
import { ChatShell } from "./ChatShell";
import { Sender } from "./Sender";
import { AttachmentDrafts, AttachmentDrop, AttachmentPicker } from "./AttachmentDrafts";
import { SubmissionRecovery } from "./SubmissionRecovery";
import { BubbleList } from "./BubbleList";
import { find, hookSession } from "./test-utils/hook-session";
import type { ChatWorkspaceControllerState } from "@/components/chat-workspace";
import type { ChatSendState } from "@/application/chat-send";
import { uploadMedia } from "@/domain/media/media-client";

vi.mock("react", async original => {
  const actual = await original<typeof React>();
  return { ...actual, ...Object.fromEntries(["useState", "useRef", "useCallback", "useId", "useEffect", "useLayoutEffect", "useSyncExternalStore"].map(key => [key, vi.fn(actual[key as keyof typeof actual] as never)])) };
});
vi.mock("@/domain/media/media-client", async original => ({ ...await original<typeof import("@/domain/media/media-client")>(), uploadMedia: vi.fn() }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const file = (name = "first.png") => new File(["synthetic"], name, { type: "image/png" });
function ready(owner = "A"): Extract<ChatWorkspaceControllerState, { status: "ready" }> {
  const conversations = ["A", "B"].map(id => ({ id, title: id, modelKey: "fixture", createdAt: 1, updatedAt: 1, messageCount: 0 }));
  return { status: "ready", pendingConversationId: null, switchError: null, workspace: {
    conversations, selectedConversationId: owner, selectedConversation: conversations.find(item => item.id === owner)!,
    history: { conversationId: owner, messages: [], pageSize: 50, oldestCursor: null, olderPageStatus: "exhausted" },
    setup: { conversationId: owner, conversationTitle: owner, modelKey: "fixture", modelLabel: "fixture", modelKnown: true,
      models: [], status: "ready", setupActionRequired: false,
      readiness: { kind: "available", value: { ready: true, reason: "ready", modelKey: "fixture", setupActionRequired: false } } },
  } };
}
function pending(): Extract<ChatSendState, { kind: "sending-user" }> {
  return { kind: "sending-user", executionId: "execution:1", conversationId: "A", optimisticUser: {
    overlayId: "optimistic:1", clientMessageId: "client:1", content: "原提交", createdAt: 1, attachments: ["/uploads/1700000000001.png"],
  } };
}
function setup(onSend: (content: string, attachments?: readonly string[], owner?: string) => Promise<boolean>) {
  let n = 0, state = ready(), sendState: ChatSendState = { kind: "idle" };
  vi.mocked(uploadMedia).mockReset().mockImplementation(async uploaded => ({ url: `/uploads/${1700000000000 + ++n}.png`, name: uploaded.name, type: "image/png" }));
  vi.spyOn(URL, "createObjectURL").mockImplementation(blob => `blob:${(blob as File).name}`);
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const hooks = hookSession(() => ChatWorkspaceView({ state, sendState, onSend, onRetry: vi.fn(), onSelectConversation: vi.fn(), onRetryConversationSwitch: vi.fn() }));
  const shell = () => find(hooks.render(), ChatShell).props;
  const sender = () => find(shell().composer, Sender).props;
  const media = () => find(sender().attachments, AttachmentDrafts).props;
  const recovery = () => find(sender().feedback, SubmissionRecovery).props;
  hooks.render(); hooks.commit();
  return { ...hooks, shell, sender, media, recovery, revoke,
    select: (owner: string) => { state = ready(owner); hooks.render(); hooks.commit(); },
    setState: (next: typeof state) => { state = next; hooks.render(); hooks.commit(); },
    execute: (next: ChatSendState) => { sendState = next; hooks.render(); hooks.commit(); },
  };
}

describe("Main Chat submission snapshots and next drafts", () => {
  it("detaches submitted attachments immediately, keeps optimistic URLs and new attachments, and releases only its own leases", async () => {
    let finish!: (value: boolean) => void;
    const send = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; })), s = setup(send);
    s.sender().onFiles!([file()]); await Promise.resolve();
    const old = s.media().items[0], viewer = s.media().store.retain([old.id]);
    const accepted = s.sender().onSend!("原提交");
    expect(s.media().items).toEqual([]); expect(s.revoke).not.toHaveBeenCalled();
    s.execute(pending());
    expect(s.sender().disabled).toBe(false); expect(s.sender().submitDisabled).toBe(true);
    expect(find(s.shell().composer, AttachmentDrop).props.disabled).toBe(false);
    expect(find(s.sender().tools, AttachmentPicker).props.disabled).toBe(false);
    expect(find(s.shell().children, BubbleList).props.messages[0]).toMatchObject({ kind: "user", attachments: [{ kind: "image", url: old.uploaded!.url }] });
    s.sender().onFiles!([file("next.png")]); await Promise.resolve(); finish(true); expect(await accepted).toBe(true);
    expect(s.media().items.map(item => item.file.name)).toEqual(["next.png"]);
    expect(send).toHaveBeenCalledWith("原提交", [old.uploaded!.url], "A");
    expect(s.revoke).not.toHaveBeenCalled(); viewer(); expect(s.revoke).toHaveBeenCalledWith("blob:first.png"); s.dispose();
  });
  it.each([false, "throw"])("freezes a failed/unknown snapshot (%s), blocks recovery while active, and restores explicitly without overwriting new drafts", async outcome => {
    let finish!: () => void;
    const s = setup(() => new Promise<boolean>((resolve, reject) => { finish = () => outcome === "throw" ? reject(new Error("synthetic")) : resolve(false); }));
    s.sender().onFiles!([file()]); await Promise.resolve(); const result = s.sender().onSend!("原提交");
    s.sender().onFiles!([file("next.png")]); await Promise.resolve(); finish(); expect(await result).toBe("retained");
    expect(s.media().items.map(item => item.file.name)).toEqual(["next.png"]);
    const snapshot = s.recovery().items[0], append = vi.fn(() => true); s.sender().apiRef!.current = { append };
    const active = pending(); s.execute({ ...active, kind: "finalization-uncertain", assistant: { overlayId: "ai", assistantMessageId: null, content: "", thinking: null, simpleThink: null, usage: null, createdAt: 1 }, executionError: null, error: { code: "network", message: "unknown", field: null, providerFailure: null } });
    expect(s.recovery().locked).toBe(true); s.recovery().onRestore(snapshot); expect(append).not.toHaveBeenCalled();
    s.execute({ kind: "idle" }); const restore = s.recovery().onRestore; restore(snapshot); restore(snapshot);
    expect(append).toHaveBeenCalledExactlyOnceWith("原提交"); expect(s.recovery().items).toEqual([]);
    expect(s.media().items.map(item => item.file.name)).toEqual(["first.png", "next.png"]);
    expect(vi.mocked(uploadMedia)).toHaveBeenCalledTimes(2); s.dispose();
  });
  it("isolates A/B text and attachments and does not redirect a late rejected submission into B", async () => {
    let finish!: (value: boolean) => void;
    const s = setup(() => new Promise(resolve => { finish = resolve; }));
    s.sender().onDraftChange!({ value: "A 下一轮", recoveryDrafts: [] });
    s.sender().onFiles!([file()]); await Promise.resolve(); const original = s.sender().onSend!("A 原提交");
    s.select("B"); expect(s.sender().initialDraft).toBeUndefined();
    s.sender().onDraftChange!({ value: "B 草稿", recoveryDrafts: [] }); s.sender().onFiles!([file("b.png")]); await Promise.resolve();
    finish(false); await original;
    expect(s.media().items.map(item => item.file.name)).toEqual(["b.png"]); expect(s.recovery().items).toEqual([]);
    s.select("A"); expect(s.sender().initialDraft?.value).toBe("A 下一轮"); expect(s.recovery().items[0].content).toBe("A 原提交");
    s.select("B"); expect(s.sender().initialDraft?.value).toBe("B 草稿"); s.dispose();
  });
  it("does not resurrect an owner removed before a delayed rejection", async () => {
    let finish!: (value: boolean) => void;
    const s = setup(() => new Promise(resolve => { finish = resolve; }));
    s.sender().onFiles!([file()]); await Promise.resolve(); const result = s.sender().onSend!("");
    const store = s.media().store, state = ready("B"); s.setState({ ...state, workspace: { ...state.workspace, conversations: state.workspace.conversations.filter(item => item.id !== "A") } });
    finish(false); await result; expect(store.get("A")).toEqual([]); expect(store.getRecoveries("A")).toEqual([]);
    expect(s.revoke).toHaveBeenCalledExactlyOnceWith("blob:first.png"); s.dispose();
  });
});
