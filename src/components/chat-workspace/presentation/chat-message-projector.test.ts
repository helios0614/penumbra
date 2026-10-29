import { afterEach, describe, expect, it, vi } from "vitest";
import type { Message } from "@/domain/message";
import * as accumulator from "@/application/chat-send/chat-send-accumulator";
import { composeVisibleChatMessages } from "./chat-execution-composer";
import { createChatMessageProjector, presentChatMessages } from "./chat-message-presenter";

const message = (id: string, content = "body", conversationId = "A"): Message => Object.freeze({
  id, conversationId, content, rawRole: "assistant", roleKind: "assistant", createdAt: 1,
  thinking: "reason", simpleThink: null, attachments: [], mcpToolCalls: [], voice: null, cacheRegion: null, isCarryover: false,
});
afterEach(() => vi.restoreAllMocks());

describe("view-owned history projection", () => {
  it("reuses the snapshot and unchanged rows without filtering historical content again", () => {
    const append = vi.spyOn(accumulator, "appendAssistantChunk");
    const project = createChatMessageProjector(), a = message("a"), b = message("b");
    const history = [a, b];
    const first = project(history);
    const calls = append.mock.calls.length;
    expect(calls).toBeGreaterThan(0);
    expect(project(history)).toBe(first);
    const copied = project([...history]);
    expect(copied[0]).toBe(first[0]); expect(copied[1]).toBe(first[1]);
    expect(append).toHaveBeenCalledTimes(calls);
    const changed = project([a, { ...b, content: "edited", thinking: "changed" }]);
    expect(changed[0]).toBe(first[0]); expect(changed[1]).not.toBe(first[1]);
    expect(changed[1]).toMatchObject({ content: "edited", thinking: "changed" });
  });

  it("invalidates replacements including media/capabilities, does not key by id, and releases prior windows", () => {
    const project = createChatMessageProjector(), a = message("same-id"), first = project([a])[0];
    const attached = { ...a, attachments: ["/uploads/1700000000001.png"] };
    const media = project([attached])[0];
    expect(media).not.toBe(first); expect(media).toMatchObject({ attachments: [{ kind: "image" }] });
    const capabilities = { conversationId: "A", display: null, results: [], reaction: null, hasHeart: true, heartRevision: "new" };
    const enriched = project([{ ...attached, capabilities }])[0];
    expect(enriched).not.toBe(media); expect(enriched?.capabilities).toBe(capabilities);
    const b = message("same-id", "B body", "B");
    expect(project([b])[0]).toMatchObject({ content: "B body" });
    // A is no longer retained after B, even if the caller still holds A.
    expect(project([a])[0]).not.toBe(first);
    const afterClear = project([a])[0]; project([]);
    expect(project([a])[0]).not.toBe(afterClear);
    expect(createChatMessageProjector()([a])[0]).not.toBe(project([a])[0]);
  });

  it("preserves pure presentation semantics and history references through overlay composition", () => {
    const project = createChatMessageProjector(), history = [message("old")];
    const projected = project(history);
    expect(projected).toEqual(presentChatMessages(history));
    const execution = { kind: "streaming" as const, executionId: "execution:1", conversationId: "A",
      optimisticUser: { overlayId: "user", clientMessageId: "client", content: "question", createdAt: 2 },
      assistant: { overlayId: "assistant", assistantMessageId: "reply", content: "a", thinking: null, simpleThink: null, usage: null, createdAt: 2 }, executionError: null };
    const first = composeVisibleChatMessages(history, execution, "A", project);
    const next = composeVisibleChatMessages(history, { ...execution, assistant: { ...execution.assistant, content: "ab" } }, "A", project);
    expect(next[0]).toBe(first[0]); expect(next[0]).toBe(projected[0]);
    expect(next[next.length - 1]?.content).toBe("ab");
    expect(project(history)[0]).toBe(projected[0]); // overlays never mutate the cache
    const hidden = { ...history[0], roleKind: "hidden-runtime" as const };
    expect(project([hidden])).toEqual([]);
  });
});
