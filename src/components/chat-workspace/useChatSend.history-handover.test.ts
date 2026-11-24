import * as React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { useChatSend } from "./useChatSend";
import { getChatComposerAction } from "./chat-sender-policy";
import { composeVisibleChatMessages } from "./presentation";
import type { ChatHistoryReconciliationResult } from "@/application/chat-send/chat-regenerate-persistence";
import { hookSession } from "@/components/chat/test-utils/hook-session";
import { mapMessage, type Message } from "@/domain/message";
import { messageWire } from "@/test-fixtures/main-chat-wire";

vi.mock("react", async original => {
  const actual = await original<typeof React>();
  return { ...actual, ...Object.fromEntries(["useState", "useRef", "useCallback", "useId", "useEffect", "useLayoutEffect", "useSyncExternalStore"].map(key => [key, vi.fn(actual[key as keyof typeof actual] as never)])) };
});
vi.mock("@/application/chat-system-log/request-snapshot-drain", () => ({
  createRequestSnapshotDrain: () => ({ start: () => () => {}, request: () => {}, drain: async () => {}, resume: () => {}, hasDemand: () => false }),
}));
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });

/** How the selected Workspace finishes one history request. */
type WorkspaceRead = "unavailable" | "superseded" | readonly Message[];

/**
 * Real useChatSend/controller/HTTP wiring. Only the selected Workspace reader is
 * synthetic: it publishes `history` exactly when it applies a successful read.
 */
async function sendHarness(conversationId: string, options: {
  readonly holdReceipt?: boolean;
  readonly holdDetached?: boolean;
  readonly detachedUnavailable?: boolean;
} = {}) {
  vi.useFakeTimers();
  vi.stubGlobal("window", new EventTarget());
  const user = mapMessage(messageWire({ conv_id: conversationId, id: `${conversationId}-user`, role: "user", content: "question" }));
  const assistant = mapMessage(messageWire({ conv_id: conversationId, id: `${conversationId}-assistant`, content: "reply", thinking: null, drift: null }));
  let history: readonly Message[] = [];
  let selected = conversationId;
  let requestId = "", executionId = "", terminal = false;
  let relay!: ReadableStreamDefaultController<Uint8Array>;
  let releaseReceipt: (() => void) | undefined;
  let releaseTerminal: (() => void) | undefined, releaseDetached: (() => void) | undefined;
  const receipts: number[] = [];
  let detachedReads = 0;
  const fact = () => ({
    conv_id: conversationId, execution_id: executionId, kind: "send", request_id: requestId,
    phase: terminal ? "terminal" : "generating", terminal, outcome: terminal ? "completed" : null,
    reason: null, cancel_requested: false, user_message_id: user.id, target_message_id: null,
    assistant_message_id: terminal ? assistant.id : null, partial_text: "", owner_available: !terminal, cancelable: !terminal,
  });
  const fetch = vi.fn<typeof globalThis.fetch>(async (url, init) => {
    const path = String(url);
    if (path.endsWith("/send") && init?.method === "POST") {
      requestId = JSON.parse(String(init.body)).client_msg_id;
      executionId = `send.${btoa(requestId).replace(/=+$/, "")}`;
      return new Response(new ReadableStream<Uint8Array>({ start(controller) { relay = controller; } }),
        { headers: { "content-type": "text/event-stream" } });
    }
    if (path.endsWith("/executions/active")) return Response.json({ execution: null });
    if (path.includes("/executions/results")) return Response.json({ results: [], next_cursor: null });
    if (path.endsWith(`/send-results/${requestId}`)) {
      if (options.holdReceipt) await new Promise<void>(resolve => { releaseReceipt = resolve; });
      receipts.push(200);
      return Response.json({ conv_id: conversationId, client_msg_id: requestId, user_message_id: user.id,
        assistant_message_id: terminal ? assistant.id : null, execution: fact() });
    }
    if (path.endsWith(`/executions/${executionId}`)) {
      if (terminal) await new Promise<void>(resolve => { releaseTerminal = resolve; });
      return Response.json({ execution: fact() });
    }
    if (path.includes("/messages/window")) {
      // A detached read never touches the selected Workspace list.
      detachedReads++;
      if (options.holdDetached) await new Promise<void>(resolve => { releaseDetached = resolve; });
      if (options.detachedUnavailable) return Response.json({}, { status: 503 });
      return Response.json({ conversation_id: conversationId, anchor_id: null,
        messages: [messageWire({ conv_id: conversationId, id: user.id, role: "user", content: "question" }),
          messageWire({ conv_id: conversationId, id: assistant.id, content: "reply" })],
        older_cursor: null, newer_cursor: null, has_older: false, has_newer: false, reaches_latest: true });
    }
    return Response.json({}, { status: 404 });
  });
  vi.stubGlobal("fetch", fetch);

  const pendingReads: { readonly owner: string; readonly finish: (read: WorkspaceRead) => void }[] = [];
  const reconcileHistory = vi.fn((owner: string) => new Promise<ChatHistoryReconciliationResult>((resolve, reject) => {
    pendingReads.push({ owner, finish: read => {
      if (read === "unavailable") return reject(new Error("HTTP 503"));
      if (read === "superseded") return reject(new Error("History reconciliation became stale"));
      if (selected === owner) history = read;
      resolve({ persistedMessageIds: read.map(row => row.id), regenerateTarget: null,
        assistants: read.filter(row => row.roleKind === "assistant") });
    } });
  }));
  const hooks = hookSession(() => useChatSend(reconcileHistory, selected, history));
  const render = () => { const current = hooks.render(); hooks.commit(); return current; };
  const settle = () => vi.advanceTimersByTimeAsync(0);
  const rows = () => composeVisibleChatMessages(history, render().state, conversationId)
    .map(row => `${row.kind}:${row.id === user.id || row.id === assistant.id ? "saved" : "temp"}:${row.content}`);
  const expectRows = (expected: readonly string[]) => {
    const visible = rows();
    expect(visible).toEqual(expected);
    // This turn's user is never absent or doubled; its reply is never doubled.
    expect(visible.filter(row => row.startsWith("user:"))).toHaveLength(1);
    expect(visible.filter(row => row.startsWith("assistant:")).length).toBeLessThanOrEqual(1);
  };
  const finishRead = async (read: WorkspaceRead) => {
    const next = pendingReads.shift();
    expect(next?.owner).toBe(conversationId);
    next!.finish(read);
    await settle();
  };
  /** Another Workspace path (realtime/list refresh) applied this history. */
  const applyWorkspace = async (read: readonly Message[]) => { history = read; render(); await settle(); };
  const unlocked = () => {
    const current = render();
    expect(current.state.kind).toBe("idle");
    expect(current.isExecutionActive()).toBe(false);
    expect(getChatComposerAction(current.state)).toBe("send");
  };
  const posts = () => fetch.mock.calls.filter(([url, init]) => String(url).endsWith("/send") && init?.method === "POST").length;

  render();
  await settle();
  expect(await render().send({ conversationId, content: "question" })).toBe(true);
  await settle();
  const emit = (event: object) => relay.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
  emit({ type: "start", id: assistant.id });
  emit({ type: "chunk", content: "reply" });
  await settle();
  expectRows(["user:temp:question", "assistant:temp:reply"]);
  const beginFinalization = async () => {
    terminal = true;
    relay.close();
    await settle();
    expect(render().state.kind).toBe("finalizing");
    expectRows(["user:temp:question", "assistant:temp:reply"]);
  };
  const finishStream = async () => {
    await beginFinalization();
    releaseTerminal!();
    await settle();
    expect(pendingReads).toHaveLength(1);
    unlocked();
  };
  return {
    user, assistant, render, settle, rows, expectRows, finishRead, beginFinalization, finishStream, applyWorkspace, unlocked, posts,
    reconcileHistory, pendingReads, receipts, detachedReads: () => detachedReads,
    releaseReceipt: async () => { releaseReceipt!(); await settle(); },
    releaseTerminal: async () => { releaseTerminal!(); await settle(); },
    releaseDetached: async () => { releaseDetached!(); await settle(); },
    select: async (id: string, read: readonly Message[]) => { selected = id; history = read; render(); await settle(); },
    dispose: () => hooks.dispose(),
  };
}

it("keeps both temporary rows after a Workspace 503 and a detached 200 until the Workspace applies them", async () => {
  const chat = await sendHarness("handover-503-detached", { holdReceipt: true, holdDetached: true });
  await chat.finishStream();
  await chat.finishRead("unavailable");
  // Generation is over: the Composer unlocks without waiting for history.
  chat.unlocked();
  chat.expectRows(["user:temp:question", "assistant:temp:reply"]);
  await chat.releaseReceipt();
  expect(chat.receipts).toEqual([200]);
  expect(chat.render().state.recoveries?.[0]).toMatchObject({ optimisticUser: { persistedMessageId: chat.user.id } });
  chat.expectRows(["user:temp:question", "assistant:temp:reply"]);
  expect(chat.detachedReads()).toBe(1);
  await chat.releaseDetached();
  chat.unlocked();
  chat.expectRows(["user:temp:question", "assistant:temp:reply"]);
  await chat.applyWorkspace([chat.user, chat.assistant]);
  chat.expectRows(["user:saved:question", "assistant:saved:reply"]);
  const state = chat.render().state;
  expect(state.recoveries).toBeUndefined();
  expect(state.controlError).toBeUndefined();
  chat.unlocked();
  expect(chat.posts()).toBe(1);
  chat.dispose();
});

it("hands over at once when history arrives before the receipt", async () => {
  const chat = await sendHarness("handover-history-first", { holdReceipt: true });
  await chat.finishStream();
  await chat.finishRead([chat.user, chat.assistant]);
  chat.unlocked();
  chat.expectRows(["user:saved:question", "assistant:saved:reply"]);
  await chat.releaseReceipt();
  chat.expectRows(["user:saved:question", "assistant:saved:reply"]);
  expect(chat.render().state.recoveries).toBeUndefined();
  expect(chat.posts()).toBe(1);
  chat.dispose();
});

it("unlocks on a terminal receipt even while the exact execution GET is pending", async () => {
  const chat = await sendHarness("handover-terminal-receipt", { holdReceipt: true });
  await chat.beginFinalization();
  await chat.releaseReceipt();
  chat.unlocked();
  chat.expectRows(["user:temp:question", "assistant:temp:reply"]);
  expect(chat.pendingReads).toHaveLength(0);
  await chat.releaseTerminal();
  await chat.finishRead([chat.user, chat.assistant]);
  chat.expectRows(["user:saved:question", "assistant:saved:reply"]);
  expect(chat.posts()).toBe(1);
  chat.dispose();
});

it("keeps temporary rows bound to the receipt until a later history read applies them", async () => {
  const chat = await sendHarness("handover-receipt-first");
  expect(chat.receipts).toEqual([200]);
  expect(chat.render().state).toMatchObject({ optimisticUser: { persistedMessageId: chat.user.id } });
  await chat.finishStream();
  chat.expectRows(["user:temp:question", "assistant:temp:reply"]);
  await chat.finishRead([chat.user, chat.assistant]);
  chat.unlocked();
  chat.expectRows(["user:saved:question", "assistant:saved:reply"]);
  expect(chat.posts()).toBe(1);
  chat.dispose();
});

it.each([
  ["user", ["user:saved:question", "assistant:temp:reply"]],
  ["assistant", ["user:temp:question", "assistant:saved:reply"]],
] as const)("hands over the user and assistant separately when history holds only the %s", async (only, partial) => {
  const chat = await sendHarness(`handover-only-${only}`);
  await chat.finishStream();
  await chat.finishRead([only === "user" ? chat.user : chat.assistant]);
  chat.unlocked();
  chat.expectRows(partial);
  await chat.applyWorkspace([chat.user, chat.assistant]);
  chat.expectRows(["user:saved:question", "assistant:saved:reply"]);
  expect(chat.render().state.recoveries).toBeUndefined();
  expect(chat.posts()).toBe(1);
  chat.dispose();
});

it("keeps temporary rows while history keeps failing, then hands over when it recovers", async () => {
  const chat = await sendHarness("handover-persistent-failure", { detachedUnavailable: true });
  await chat.finishStream();
  await chat.finishRead("unavailable");
  chat.unlocked();
  for (let attempt = 0; attempt < 2; attempt++) {
    const retry = chat.render().retryFinalization({ manual: true });
    await chat.settle();
    await chat.finishRead("unavailable");
    await retry;
    chat.unlocked();
    chat.expectRows(["user:temp:question", "assistant:temp:reply"]);
  }
  const retry = chat.render().retryFinalization({ manual: true });
  await chat.settle();
  await chat.finishRead([chat.user, chat.assistant]);
  await retry;
  chat.unlocked();
  chat.expectRows(["user:saved:question", "assistant:saved:reply"]);
  expect(chat.render().state.recoveries).toBeUndefined();
  expect(chat.render().state.controlError).toBeUndefined();
  expect(chat.posts()).toBe(1);
  chat.dispose();
});

it.each(["detached", "workspace"] as const)("preserves the handoff when the %s history returns first", async first => {
  const chat = await sendHarness(`handover-interleaved-${first}`, { holdDetached: true });
  await chat.finishStream();
  await chat.finishRead("superseded");
  if (first === "detached") {
    await chat.releaseDetached();
    chat.expectRows(["user:temp:question", "assistant:temp:reply"]);
    await chat.applyWorkspace([chat.user, chat.assistant]);
  } else {
    await chat.applyWorkspace([chat.user, chat.assistant]);
    chat.expectRows(["user:saved:question", "assistant:saved:reply"]);
    await chat.releaseDetached();
  }
  chat.unlocked();
  chat.expectRows(["user:saved:question", "assistant:saved:reply"]);
  const state = chat.render().state;
  expect(state.recoveries).toBeUndefined();
  expect(state.controlError).toBeUndefined();
  expect(chat.detachedReads()).toBe(1);
  expect(chat.posts()).toBe(1);
  chat.dispose();
});

it("keeps retained rows owned by their conversation across a switch and back", async () => {
  const chat = await sendHarness("handover-switch", { holdDetached: true });
  await chat.finishStream();
  await chat.finishRead("unavailable");
  await chat.select("handover-switch-other", []);
  expect(composeVisibleChatMessages([], chat.render().state, "handover-switch-other")).toEqual([]);
  await chat.releaseDetached();
  expect(composeVisibleChatMessages([], chat.render().state, "handover-switch-other")).toEqual([]);
  await chat.select("handover-switch", []);
  chat.expectRows(["user:temp:question", "assistant:temp:reply"]);
  await chat.applyWorkspace([chat.user, chat.assistant]);
  chat.expectRows(["user:saved:question", "assistant:saved:reply"]);
  expect(chat.posts()).toBe(1);
  chat.dispose();
});

it.each(["user", "assistant"] as const)("an exact deletion retires only the retained %s row", async role => {
  const conversation = `handover-delete-${role}`;
  const chat = await sendHarness(conversation);
  await chat.finishStream();
  await chat.finishRead("unavailable");
  chat.unlocked();
  chat.render().recordMessageDeletion("other-conversation", chat[role].id);
  chat.expectRows(["user:temp:question", "assistant:temp:reply"]);
  chat.render().recordMessageDeletion(conversation, chat[role].id);
  const remaining = role === "user" ? "assistant" : "user";
  expect(chat.rows()).toEqual([remaining === "user" ? "user:temp:question" : "assistant:temp:reply"]);
  await chat.applyWorkspace([chat[remaining]]);
  expect(chat.rows()).toEqual([remaining === "user" ? "user:saved:question" : "assistant:saved:reply"]);
  expect(chat.render().state.recoveries).toBeUndefined();
  expect(chat.posts()).toBe(1);
  chat.dispose();
});
