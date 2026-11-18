import { afterEach, describe, expect, it, vi } from "vitest";
import { cancelChatExecution, encodeChatExecutionId, readActiveChatExecution, readChatExecution } from "./chat-execution-status";

const wire = { conv_id: "A", execution_id: "send.Y2xpZW50LTE", kind: "send", request_id: "client-1", phase: "preparing",
  terminal: false, outcome: null, reason: null, cancel_requested: false, user_message_id: "u", target_message_id: null,
  assistant_message_id: null, partial_text: "", owner_available: true, cancelable: true };
afterEach(() => vi.unstubAllGlobals());
describe("Main execution public adapter", () => {
  it("uses the backend UTF-8 base64url identity, not message IDs", () => {
    expect(encodeChatExecutionId("send", "client-1")).toBe(wire.execution_id);
    expect(encodeChatExecutionId("send", "中文 /+" )).toBe("send.5Lit5paHIC8r");
  });
  it("GETs are no-store, scoped, and project only public fields", async () => {
    const fetch = vi.fn(async (_url: unknown, _options?: RequestInit) => Response.json({ execution: { ...wire, secret: "hidden" } })); vi.stubGlobal("fetch", fetch);
    expect(await readChatExecution("A", wire.execution_id)).toMatchObject({ terminal: false, executionId: wire.execution_id });
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ method: "GET", cache: "no-store" });
    expect(JSON.stringify(await readActiveChatExecution("A"))).not.toContain("hidden");
    expect(String(fetch.mock.calls[1]?.[0])).toContain("/executions/active");
  });
  it.each([200, 202])("preserves nonterminal HTTP %s and uses only explicit cancel POST", async status => {
    const fetch = vi.fn(async (_url: unknown, _options?: RequestInit) => Response.json({ execution: wire, cancel_accepted: status === 202 }, { status })); vi.stubGlobal("fetch", fetch);
    expect(await cancelChatExecution("A", wire.execution_id)).toMatchObject({ execution: { terminal: false }, cancelAccepted: status === 202 });
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ method: "POST", cache: "no-store" });
  });
  it("rejects foreign identities and inconsistent terminal projections", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: unknown, _options?: RequestInit) => Response.json({ execution: { ...wire, conv_id: "B" } })));
    await expect(readChatExecution("A", wire.execution_id)).rejects.toThrow();
    vi.stubGlobal("fetch", vi.fn(async (_url: unknown, _options?: RequestInit) => Response.json({ execution: { ...wire, terminal: true } })));
    await expect(readChatExecution("A", wire.execution_id)).rejects.toThrow();
  });
});
