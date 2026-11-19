import { executionReader, pendingExecutionReader } from "@/test-fixtures/chat-execution";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createChatSendController, createRegeneratePersistenceProjection } from "@/application/chat-send";
import { openRegenerateExecution } from "@/application/chat-execution";
import { composeVisibleChatMessages } from "@/components/chat-workspace/presentation";
import { mapMessage } from "@/domain/message";
import { messageWire } from "@/test-fixtures/main-chat-wire";
import { Bubble } from "./Bubble";

afterEach(() => vi.unstubAllGlobals());

function wireStream() {
  let writer!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({ start(controller) { writer = controller; } });
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => new Response(stream, { headers: { "content-type": "text/event-stream" } }));
  // PR7-B may drain diagnostics asynchronously; it is not a generation retry.
  vi.stubGlobal("fetch", (url: RequestInfo | URL, options?: RequestInit) => String(url).includes("/api/chat/debug/drain")
    ? Promise.resolve(new Response("{}", { status: 403 })) : fetch(url, options));
  return {
    fetch,
    emit: (payload: object, event?: string) => writer.enqueue(new TextEncoder().encode(
      `${event ? `event: ${event}\n` : ""}data: ${JSON.stringify(payload)}\n\n`,
    )),
    close: () => writer.close(),
    disconnect: () => writer.error(new TypeError("synthetic relay lost")),
  };
}
async function waitFor(predicate: () => boolean) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("Synthetic Chat did not reach the expected state");
}

describe("Main wire → controller → UI generation states", () => {
  it.each(["completed", "failed"] as const)("does not restore cached target after commit and SSE loss while %s history is pending", async outcome => {
    const wire = wireStream();
    const original = Object.freeze(mapMessage(messageWire({ content: "old target", thinking: null, drift: null })));
    const committed = mapMessage(messageWire({ content: "committed new body", thinking: null, drift: null }));
    let history = [original], release!: () => void;
    const read = new Promise<void>(resolve => { release = resolve; });
    const reconcileHistory = vi.fn(async () => {
      await read; history = [committed];
      return { persistedMessageIds: [committed.id], regenerateTarget: committed, assistants: history };
    });
    const controller = createChatSendController({ createUuid: () => "commit-before-loss", readExecution: executionReader({ outcome, assistantMessageId: original.id }), reconcileHistory });
    const visible = () => composeVisibleChatMessages(history, controller.getState(), "conv_a");
    const frames: string[][] = [];
    controller.subscribe(() => frames.push(visible().map(row => row.content)));
    await controller.regenerate({ conversationId: "conv_a", targetMessageId: original.id, targetCreatedAt: original.createdAt });
    wire.emit({ type: "start", id: original.id }); wire.emit({ type: "chunk", content: committed.content });
    wire.emit({ id: original.id, content: committed.content, thinking: null, drift: null }, "persisted");
    await waitFor(() => visible().some(row => row.content === committed.content));
    wire.disconnect();
    await vi.waitFor(() => expect(reconcileHistory).toHaveBeenCalledOnce());
    expect(controller.getState()).toMatchObject({ kind: "regenerate-finalizing", serverExecution: { terminal: true, outcome } });
    expect(frames.every(frame => !frame.includes(original.content))).toBe(true);
    expect(visible().some(row => row.id === original.id)).toBe(false);
    release(); await waitFor(() => controller.getState().kind === "idle");
    expect(visible()).toMatchObject([{ id: committed.id, content: committed.content }]);
    expect(original.content).toBe("old target");
    expect(wire.fetch).toHaveBeenCalledOnce(); expect(reconcileHistory).toHaveBeenCalledOnce(); controller.dispose();
  });

  it.each(["original", "edited", "deleted"] as const)("waits for authoritative history before restoring a failed regenerate target: %s", async target => {
    const wire = wireStream();
    const original = Object.freeze(mapMessage(messageWire({ content: "old target", thinking: null, drift: null })));
    const edited = Object.freeze({ ...original, content: "saved edit" });
    let history = [original], release!: () => void;
    const read = new Promise<void>(resolve => { release = resolve; });
    const reconcileHistory = vi.fn(async () => {
      await read; history = target === "deleted" ? [] : [target === "edited" ? edited : original];
      return { persistedMessageIds: history.map(row => row.id), regenerateTarget: history[0] ?? null, assistants: history };
    });
    const controller = createChatSendController({ createUuid: () => "replacement-failed", readExecution: executionReader({ outcome: "failed" }), reconcileHistory });
    const visible = () => composeVisibleChatMessages(history, controller.getState(), "conv_a");
    await controller.regenerate({ conversationId: "conv_a", targetMessageId: original.id, targetCreatedAt: original.createdAt });
    wire.emit({ type: "start", id: original.id }); wire.emit({ type: "chunk", content: "attempt body" });
    wire.emit({ type: "chunk", content: "\n[请求出错: provider_execution_failed]" });
    wire.emit({ type: "error", id: original.id, code: "provider_execution_failed" }); wire.close();
    await vi.waitFor(() => expect(reconcileHistory).toHaveBeenCalledOnce());
    expect(visible().some(row => row.id === original.id)).toBe(false);
    expect(visible()).toContainEqual(expect.objectContaining({ content: "attempt body\n", error: "当前回复生成失败。" }));
    release(); await waitFor(() => controller.getState().kind === "error");
    if (target === "deleted") expect(visible().some(row => row.id === original.id)).toBe(false);
    else {
      expect(visible().find(row => row.id === original.id)).toMatchObject({ content: target === "edited" ? edited.content : original.content, error: "当前回复生成失败。" });
      expect(visible().find(row => row.id === original.id)).not.toHaveProperty("executionStatus");
    }
    expect(original.content).toBe("old target"); expect(edited.content).toBe("saved edit");
    expect(wire.fetch).toHaveBeenCalledOnce(); controller.dispose();
  });

  it.each([true, false])("keeps cached target hidden when history fails, until manual history recovery: terminal=%s", async terminal => {
    const wire = wireStream();
    const original = mapMessage(messageWire({ content: "old target", thinking: null, drift: null }));
    const committed = { ...original, content: "committed body" };
    let history = [original], unavailable = true;
    const reconcileHistory = vi.fn(async () => {
      if (unavailable) throw new Error("synthetic history unavailable");
      history = [committed];
      return { persistedMessageIds: [committed.id], regenerateTarget: committed, assistants: history };
    });
    const readExecution = vi.fn(terminal ? executionReader({ assistantMessageId: original.id }) : pendingExecutionReader);
    const controller = createChatSendController({ createUuid: () => "history-unavailable", readExecution, reconcileHistory });
    const visible = () => composeVisibleChatMessages(history, controller.getState(), "conv_a");
    await controller.regenerate({ conversationId: "conv_a", targetMessageId: original.id, targetCreatedAt: original.createdAt });
    wire.emit({ type: "start", id: original.id }); wire.emit({ type: "chunk", content: committed.content });
    await waitFor(() => visible().some(row => row.content === committed.content)); wire.disconnect();
    await waitFor(() => terminal ? !!controller.getState().recoveries?.length : controller.getState().kind === "regenerate-finalization-uncertain");
    expect(visible().some(row => row.id === original.id)).toBe(false);
    expect(visible()).toContainEqual(expect.objectContaining({ content: committed.content, executionStatus: "unconfirmed" }));
    expect(renderToStaticMarkup(<>{visible().map(row => <Bubble key={row.id} message={row} />)}</>)).toContain("结果待确认");
    expect(reconcileHistory).toHaveBeenCalledOnce();
    unavailable = false; readExecution.mockImplementation(executionReader({ assistantMessageId: original.id }));
    await controller.retryFinalization({ manual: true });
    expect(visible()).toMatchObject([{ id: original.id, content: committed.content }]);
    // Retained terminal recovery already performs a final workspace refresh;
    // this presentation change does not add another read or generation POST.
    expect(reconcileHistory).toHaveBeenCalledTimes(terminal ? 3 : 2); expect(wire.fetch).toHaveBeenCalledOnce(); controller.dispose();
  });

  it.each([true, false])("a retired regenerate history result cannot mask the next committed target: failedRead=%s", async failedRead => {
    const firstWire = wireStream();
    const original = mapMessage(messageWire({ content: "old target", thinking: null, drift: null }));
    const latest = { ...original, content: "latest committed reply" };
    let history = [original], release!: () => void, reads = 0, attempt = 0, firstReturned = false;
    const oldRead = new Promise<void>(resolve => { release = resolve; });
    const reconcileHistory = vi.fn(async () => {
      if (++reads === 1) { await oldRead; firstReturned = true; if (failedRead) throw new Error("old history failed"); }
      // Both successful reads return current authority; navigation/old HTTP
      // snapshot ordering is a separate contract outside this repair.
      history = [latest];
      return { persistedMessageIds: [latest.id], regenerateTarget: latest, assistants: history };
    });
    const controller = createChatSendController({ createUuid: () => `attempt-${++attempt}`, readExecution: executionReader({ assistantMessageId: original.id }), reconcileHistory });
    const visible = () => composeVisibleChatMessages(history, controller.getState(), "conv_a");
    await controller.regenerate({ conversationId: "conv_a", targetMessageId: original.id, targetCreatedAt: original.createdAt });
    firstWire.emit({ type: "start", id: original.id }); firstWire.emit({ type: "chunk", content: "first attempt" }); firstWire.disconnect();
    await vi.waitFor(() => expect(reconcileHistory).toHaveBeenCalledOnce());
    const nextWire = wireStream();
    expect(await controller.regenerate({ conversationId: "conv_a", targetMessageId: original.id, targetCreatedAt: original.createdAt })).toBe(true);
    nextWire.emit({ type: "start", id: original.id }); nextWire.emit({ type: "chunk", content: latest.content }); nextWire.close();
    await waitFor(() => controller.getState().kind === "idle");
    const nextId = controller.getState().serverExecution?.executionId;
    expect(visible().find(row => row.id === original.id)?.content).toBe(latest.content);
    release(); await waitFor(() => firstReturned && (failedRead ? !!controller.getState().recoveries?.length : !controller.getState().recoveries?.length));
    expect(controller.getState()).toMatchObject({ kind: "idle", serverExecution: { executionId: nextId } });
    expect(controller.getState().controlError).toBeUndefined();
    expect(visible().find(row => row.id === original.id)?.content).toBe(latest.content);
    expect(firstWire.fetch).toHaveBeenCalledOnce(); expect(nextWire.fetch).toHaveBeenCalledOnce(); controller.dispose();
  });

  it.each(["send", "regenerate"] as const)("keeps %s Thinking/DRIFT consistent through A/B selection and HTTP recovery", async kind => {
    const wire = wireStream();
    const original = mapMessage(messageWire({ content: "old", thinking: null, drift: null }));
    const saved = mapMessage(messageWire({ content: "body", thinking: "one\n\ntwo", drift: "authorized drift" }));
    let history = kind === "regenerate" ? [original] : [];
    const controller = createChatSendController({ readExecution: executionReader(), openRegenerateExecution,
      createUuid: () => "synthetic-thinking",
      reconcileHistory: async () => {
        history = [saved];
        return { persistedMessageIds: [saved.id], regenerateTarget: createRegeneratePersistenceProjection(saved) };
      },
    });
    const visible = (owner = "conv_a") => composeVisibleChatMessages(owner === "conv_a" ? history : [], controller.getState(), owner);
    if (kind === "send") await controller.send({ conversationId: "conv_a", content: "question" });
    else await controller.regenerate({ conversationId: "conv_a", targetMessageId: original.id, targetCreatedAt: 1 });
    wire.emit({ type: "start", id: saved.id, drift_enabled: true, include_drift: false });
    wire.emit({ type: "chunk", content: "[THINKING_START] one [HEART:SYNTH_PRIVATE][THINKING_END]body[THINKING_START]two[THINKING_END][DRIFT:authorized drift]" });
    await waitFor(() => JSON.stringify(visible()).includes("authorized drift"));
    expect(visible().slice(-1)[0]).toMatchObject({ content: "body", thinking: saved.thinking, simpleThink: saved.simpleThink });
    expect(JSON.stringify(visible())).not.toContain("SYNTH_PRIVATE");
    expect(visible("conv_b")).toEqual([]);
    if (kind === "regenerate") wire.emit({ id: saved.id, content: saved.content, thinking: saved.thinking, drift: saved.simpleThink }, "persisted");
    wire.close(); await waitFor(() => controller.getState().kind === "idle");
    expect(visible()).toEqual(composeVisibleChatMessages([saved], { kind: "idle" }, "conv_a"));
    expect(visible()[0]).toMatchObject({ thinking: "one\n\ntwo", simpleThink: "authorized drift" });
    controller.dispose();
  });

  it("shows waiting, separate Thinking/DRIFT, visible streaming and authoritative send completion", async () => {
    const wire = wireStream();
    let history = [mapMessage(messageWire({ id: "prior", content: "prior reply" }))];
    const controller = createChatSendController({ readExecution: executionReader(),
      createUuid: () => "synthetic-send",
      reconcileHistory: async () => {
        history = [...history,
          mapMessage(messageWire({ id: "saved-user", role: "user", content: "question", thinking: null, drift: null })),
          mapMessage(messageWire({ id: "new-reply", content: "visible body", thinking: "separate thinking", drift: "separate drift" })),
        ];
        return { persistedMessageIds: history.map(({ id }) => id), regenerateTarget: null };
      },
    });
    const messages = () => composeVisibleChatMessages(history, controller.getState(), "conv_a");
    const html = () => renderToStaticMarkup(<>{messages().map((message) => <Bubble key={message.id} message={message} />)}</>);
    expect(await controller.send({ conversationId: "conv_a", content: "question" })).toBe(true);
    expect(html()).toContain("思考中");
    const overlayId = messages().slice(-1)[0]?.id;
    wire.emit({ type: "start", id: "new-reply", drift_enabled: true });
    wire.emit({ type: "chunk", content: "[THINKING_START]separate thinking[THINKING_END][DRIFT:separate drift][HEART:private][TODO:private]" });
    await waitFor(() => JSON.stringify(messages()).includes("separate drift"));
    expect(html()).toContain("思考中"); expect(JSON.stringify(messages())).not.toMatch(/private|THINKING_START|HEART|TODO:/);
    wire.emit({ type: "chunk", content: "visible body" });
    await waitFor(() => html().includes("visible body"));
    expect(messages().slice(-1)[0]?.id).toBe(overlayId); expect(html()).not.toContain("chat-generation");
    wire.close(); await waitFor(() => controller.getState().kind === "idle");
    expect(messages().map(({ id }) => id)).toEqual(["prior", "saved-user", "new-reply"]);
    expect(html()).not.toContain("chat-generation"); expect(html()).toContain("复制");
    expect(wire.fetch).toHaveBeenCalledOnce(); expect(wire.fetch.mock.calls[0]?.[0]).toBe("/api/conversations/conv_a/send");
    controller.dispose();
  });

  it.each(["success", "failure", "unknown"] as const)("keeps canonical target identity through %s and never retries generation during recovery", async (outcome) => {
    const wire = wireStream();
    const original = mapMessage(messageWire({ content: "original persisted body", thinking: null, drift: null }));
    const committed = mapMessage(messageWire({ content: "replacement body", thinking: null, drift: null }));
    let history = [original], readable = outcome !== "unknown";
    const controller = createChatSendController({ readExecution: outcome === "unknown" ? pendingExecutionReader : executionReader({ outcome: outcome === "failure" ? "failed" : "completed", assistantMessageId: outcome === "success" ? original.id : null }),
      openRegenerateExecution,
      createUuid: () => `synthetic-${outcome}`,
      reconcileHistory: async () => {
        if (!readable) throw new Error("synthetic HTTP unavailable");
        history = [outcome === "success" ? committed : original];
        return { persistedMessageIds: [original.id], regenerateTarget: createRegeneratePersistenceProjection(history[0]) };
      },
    });
    const messages = () => composeVisibleChatMessages(history, controller.getState(), "conv_a");
    const html = () => renderToStaticMarkup(<>{messages().map(m => <Bubble key={m.id} message={m} />)}</>);
    await controller.regenerate({ conversationId: "conv_a", targetMessageId: original.id, targetCreatedAt: original.createdAt });
    expect(messages()).toHaveLength(1); expect(messages()[0].id).not.toBe(original.id);
    expect(html()).toContain("思考中"); expect(html()).not.toContain("original persisted body");
    wire.emit({ type: "start", id: original.id, drift_enabled: false, include_drift: true });
    wire.emit({ type: "chunk", content: "replacement body[DRIFT:SYNTH_PRIVATE][THINKING_START]safe[HEART:SYNTH_PRIVATE][THINKING_END]" });
    await waitFor(() => html().includes("replacement body")); expect(html()).not.toContain("chat-generation");
    expect(JSON.stringify(messages())).not.toMatch(/SYNTH_PRIVATE|HEART:|DRIFT:/);
    if (outcome === "success") wire.emit({ id: original.id, content: committed.content, thinking: null, drift: null }, "persisted");
    if (outcome === "failure") wire.emit({ type: "error", id: original.id, code: "provider_execution_failed" });
    wire.close();
    await waitFor(() => controller.getState().kind === (outcome === "success" ? "idle" : outcome === "failure" ? "error" : "regenerate-finalization-uncertain"));
    expect(JSON.stringify(messages())).not.toContain("SYNTH_PRIVATE");
    expect(messages()).toHaveLength(outcome === "failure" ? 2 : 1);
    expect(messages()[0].id === original.id).toBe(outcome !== "unknown");
    expect(original.content).toBe("original persisted body");
    if (outcome === "success") {
      expect(messages()[0].content).toBe(committed.content); expect(html()).not.toContain("chat-generation");
    } else if (outcome === "failure") {
      expect(messages()[0].content).toBe(original.content); expect(html()).not.toContain("chat-generation");
      expect(messages()[1]).toMatchObject({ content: "replacement body", executionStatus: "unconfirmed" });
    } else {
      expect(html()).toContain("结果待确认"); expect(html()).not.toContain(original.content);
      readable = true; await controller.retryFinalization();
      expect(controller.getState()).toMatchObject({ kind: "regenerate-finalization-uncertain", recoveryReadSucceeded: true });
      expect(messages()[0].content).toBe(original.content); // PR1 read-only recovery displays HTTP authority.
    }
    expect(wire.fetch).toHaveBeenCalledOnce();
    expect(wire.fetch.mock.calls[0]?.[0]).toBe(`/api/conversations/conv_a/messages/${original.id}/regenerate`);
    controller.dispose();
  });
});
