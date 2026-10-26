import { afterEach, expect, it, vi } from "vitest";
import { readConversationContext } from "./conversation-context";
const wire = vi.hoisted(() => ({ window: vi.fn(), get: vi.fn() }));
vi.mock("@/domain/message/message-window", () => ({ readMessageWindow: wire.window }));
vi.mock("@/lib/api", () => ({ apiGet: wire.get }));
afterEach(() => { wire.window.mockReset(); wire.get.mockReset(); });
it("reads a small independent ID window and fresh redacted title with one cancellation signal", async () => {
  const controller = new AbortController();
  wire.window.mockResolvedValue({ conversationId: "c/1", messages: [] });
  wire.get.mockResolvedValue({ conversation_id: "c/1", conversation_title: "当前公开标题" });
  const result = await readConversationContext({ conversationId: "c/1", messageId: "persisted", conversationTitle: "旧标题" }, { signal: controller.signal });
  expect(wire.window).toHaveBeenCalledWith("c/1", { anchorId: "persisted", beforeLimit: 2, afterLimit: 2 }, { signal: controller.signal });
  expect(wire.get).toHaveBeenCalledWith("/api/conversations/c%2F1/public-title", { signal: controller.signal });
  expect(result.conversationTitle).toBe("当前公开标题"); expect(result.messageId).toBe("persisted");
});
