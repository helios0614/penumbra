import * as React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { hookSession, find } from "./test-utils/hook-session";
import { ConversationContextDialog } from "./ConversationContextDialog";
import { ReadonlyConversationDialog } from "./ReadonlyConversationDialog";
import { ReadonlyConversation, ReadonlyPublicBody } from "./ReadonlyConversation";
import { AiNameContext } from "@/components/identity/AiNameContext";
import type { ConversationContext, ConversationContextAnchor, ConversationContextReader } from "./conversation-context";
import { mapMessage } from "@/domain/message/message-mappers";
import { ApiError } from "@/lib/api";
import { messageWire } from "@/test-fixtures/main-chat-wire";

vi.mock("react", async original => {
  const actual = await original<typeof React>();
  return { ...actual, ...Object.fromEntries(["useState", "useRef", "useCallback", "useId", "useEffect", "useLayoutEffect"]
    .map(key => [key, vi.fn(actual[key as keyof typeof actual] as never)])) };
});
vi.mock("./useReadonlyDialogFrame", () => ({ useReadonlyDialogFrame: () => ({ current: null }) }));
afterEach(() => { vi.restoreAllMocks(); });
const message = (id = "a", content = "**公开**", safe = "公开") => mapMessage({ ...messageWire(),
  id, conv_id: "c", role: "assistant", content, created_at: 1, search_segments: [{ segment_key: "body", text: safe }],
});
const data = (id: string): ConversationContext => ({ conversationId: "c", messageId: id, messages: [message(id)] });
const anchor = (id: string): ConversationContextAnchor => ({ conversationId: "c", messageId: id, conversationTitle: "title" });
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

it("uses only public segments, preserves verified Markdown, removes remote media and all action controls", () => {
  const html = renderToStaticMarkup(<ReadonlyPublicBody message={message("a", "**公开** [label](https://private.invalid/SECRET) ![PRIVATE](private.png)", "公开 label")} />);
  expect(html).toContain("<strong>公开</strong>"); expect(html).toContain("label");
  for (const text of ["SECRET", "PRIVATE", "href=", "src=", "button", "audio", "img", "iframe"]) expect(html).not.toContain(text);
  const fallback = renderToStaticMarkup(<ReadonlyPublicBody message={message("a", "公开 CREDENTIAL [THINKING_START]PRIVATE", "公开 [REDACTED]")} />);
  expect(fallback).toContain("[REDACTED]"); expect(fallback).not.toContain("PRIVATE"); expect(fallback).not.toContain("CREDENTIAL");
  const conversation = renderToStaticMarkup(<AiNameContext.Provider value="合成助手">
    <ReadonlyConversation messages={[message()]} targetId="a" />
  </AiNameContext.Provider>);
  expect(conversation).toContain('aria-current="true"'); expect(conversation).toContain("合成助手"); expect(conversation).not.toContain("<button");
});

it("isolates consecutive anchors, cancels on close, and hides old data when reopening the same source", async () => {
  const resolve: ((v: ConversationContext) => void)[] = [];
  const read = vi.fn<ConversationContextReader>(() => new Promise(r => resolve.push(r)));
  let source: ConversationContextAnchor | null = anchor("a");
  const h = hookSession(() => ConversationContextDialog({ anchor: source, onClose: vi.fn(), read }));
  h.render(); h.commit(); source = anchor("b"); h.render(); h.commit();
  expect(read.mock.calls[0]![1].signal?.aborted).toBe(true);
  resolve[1]!(data("b")); await flush();
  expect(find(h.render(), ReadonlyConversation).props.targetId).toBe("b");
  resolve[0]!(data("a")); await flush();
  expect(find(h.render(), ReadonlyConversation).props.targetId).toBe("b");
  source = null; h.render(); h.commit(); source = anchor("b");
  expect(() => find(h.render(), ReadonlyConversation)).toThrow(); h.commit();
  h.dispose(); expect(read.mock.lastCall![1].signal?.aborted).toBe(true);
});

it("handles missing and forbidden sources with the same safe unavailable message", async () => {
  for (const status of [401,403,404]) {
    const read = vi.fn<ConversationContextReader>().mockRejectedValue(new ApiError("private detail", status));
    const h = hookSession(() => ConversationContextDialog({ anchor: anchor("a"), onClose: vi.fn(), read }));
    h.render(); h.commit(); await flush();
    expect(find(h.render(), ReadonlyConversationDialog).props.status).toBe("unavailable");
    expect(JSON.stringify(h.render())).not.toContain("private detail"); h.dispose();
  }
});
