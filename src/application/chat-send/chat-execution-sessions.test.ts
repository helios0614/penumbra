import { describe, expect, it, vi } from "vitest";
import { createChatExecutionSessions } from "./chat-execution-sessions";
import { isDefiniteChatRejection } from "./chat-send-rejection";
import { ApiError } from "@/lib/api";
import type { ChatExecutionEvent } from "@/application/chat-execution";

const wait = async (predicate: () => boolean) => vi.waitFor(() => expect(predicate()).toBe(true), { interval: 1 });
function channel() {
  let wake: (() => void) | undefined, closed = false;
  const values: ChatExecutionEvent[] = [];
  return {
    emit(value: ChatExecutionEvent) { values.push(value); wake?.(); },
    close() { closed = true; wake?.(); },
    async *events() {
      while (!closed || values.length) {
        if (values.length) yield values.shift()!;
        else await new Promise<void>(resolve => { wake = resolve; });
      }
    },
  };
}
describe("conversation-owned executions and acceptance evidence", () => {
  it("isolates A and B streams, finalization, errors and duplicate-submit locks", async () => {
    const wires = { A: channel(), B: channel() };
    const stored = new Set<string>(), open = vi.fn(async (id: string) => ({ kind: "stream" as const, events: wires[id as keyof typeof wires].events() }));
    let uuid = 0;
    const sessions = createChatExecutionSessions({ createUuid: () => String(++uuid), openExecution: open,
      reconcileHistory: async id => ({ persistedMessageIds: stored.has(id) ? [id + "-reply"] : [], regenerateTarget: null, assistants: stored.has(id) ? [{ id: id + "-reply", content: id + " saved", thinking: null, simpleThink: null }] : [] }),
    });
    const a = sessions.get("A"), b = sessions.get("B");
    await a.send({ conversationId: "A", content: "A input" });
    expect(sessions.state("B")).toEqual({ kind: "idle" });
    expect(await a.send({ conversationId: "A", content: "duplicate" })).toBe(false);
    await b.send({ conversationId: "B", content: "B input" });
    wires.A.emit({ type: "start", assistantMessageId: "A-reply" });
    wires.B.emit({ type: "start", assistantMessageId: "B-reply" });
    wires.A.emit({ type: "chunk", content: "A partial" });
    wires.B.emit({ type: "chunk", content: "B partial" });
    await wait(() => JSON.stringify(sessions.state("A")).includes("A partial"));
    expect(JSON.stringify(sessions.state("B"))).not.toContain("A partial");
    wires.A.close(); await wait(() => sessions.state("A").kind === "finalization-uncertain");
    expect(sessions.active("B")).toBe(true);
    stored.add("B"); wires.B.close(); await wait(() => sessions.state("B").kind === "idle");
    expect(sessions.state("A").kind).toBe("finalization-uncertain");
    stored.add("A"); await sessions.reconcilePending();
    expect(sessions.state("A").kind).toBe("idle"); expect(open).toHaveBeenCalledTimes(2);
    a.dispose(); b.dispose();
  });

  it.each([400, 401, 403, 408, 422, 429, 499, 524])("keeps bare HTTP %s unknown without another POST", async status => {
    const open = vi.fn(async () => { throw new ApiError("proxy", status, "<html>proxy response</html>"); });
    const sessions = createChatExecutionSessions({ createUuid: () => "client-a", openExecution: open,
      reconcileHistory: async () => ({ persistedMessageIds: [], regenerateTarget: null, assistants: [] }),
    });
    await sessions.get("A").send({ conversationId: "A", content: "input" });
    await wait(() => sessions.state("A").kind === "finalization-uncertain");
    await sessions.reconcilePending();
    expect(sessions.state("B")).toEqual({ kind: "idle" }); expect(open).toHaveBeenCalledOnce();
    sessions.get("A").dispose();
  });

  it("rejects only known preflight evidence and retains the original input identity for editing", async () => {
    const error = new ApiError("validation", 422, { detail: { code: "invalid_generation_options", field: "temperature" } });
    expect(isDefiniteChatRejection(error)).toBe(true);
    expect(isDefiniteChatRejection(new ApiError("proxy", 499, { detail: { code: "invalid_generation_options" } }))).toBe(false);
    expect(isDefiniteChatRejection(new ApiError("upstream", 400, { detail: { code: "provider_request_failed" } }))).toBe(false);
    const read = vi.fn(), open = vi.fn(async () => { throw error; });
    let uuid = 0;
    const sessions = createChatExecutionSessions({ createUuid: () => "client-" + ++uuid, openExecution: open, reconcileHistory: read });
    const controller = sessions.get("A");
    await controller.send({ conversationId: "A", content: "input", generation: { attachments: ["/uploads/a.png"] } });
    expect(controller.getState()).toMatchObject({ kind: "error", rejectedSubmission: { clientMessageId: "client-1", content: "input", attachments: ["/uploads/a.png"] } });
    expect(read).not.toHaveBeenCalled();
    await controller.send({ conversationId: "A", content: "edited input" });
    expect(open).toHaveBeenCalledTimes(2); // explicit retry, after proof of rejection
    controller.dispose();
  });
});
