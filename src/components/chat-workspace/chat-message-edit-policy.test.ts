import { describe, expect, it } from "vitest";
import { mapMessage } from "@/domain/message";
import { messageWire } from "@/test-fixtures/main-chat-wire";
import type { ChatSendState } from "@/application/chat-send";
import type { ChatWorkspaceControllerState } from "./chat-workspace-controller";
import { messageEditContentReason, messageEditWorkspaceReason } from "./chat-message-edit-policy";

const ready = { status: "ready", pendingConversationId: null, workspace: { selectedConversationId: "conv_a", history: { messages: [] } } } as unknown as ChatWorkspaceControllerState;
describe("saved message editing safety", () => {
  it.each(["user", "assistant"])("allows complete %s source with independent thinking, drift, heart and attachments", role => {
    expect(messageEditContentReason(mapMessage(messageWire({ role, content: "\n  plain\n\nsource  ", attachments: [{ type: "file", name: "kept" }] })))).toBeNull();
  });
  it.each(["[THINKING_START]private[THINKING_END]body", "[DRIFT:private]body", "[HEART:private]body", "provider_execution_failed: synthetic"])("protects legacy inline content %s", content => {
    expect(messageEditContentReason(mapMessage(messageWire({ content })))).toContain("内嵌控制");
  });
  it.each(["system", "tool", "cam_trigger"])("denies %s messages", role => {
    expect(messageEditContentReason(mapMessage(messageWire({ role })))).not.toBeNull();
  });
  it.each(["sending-user", "streaming", "finalizing", "finalization-uncertain", "regenerate-streaming", "regenerate-finalizing", "regenerate-finalization-uncertain"])("locks %s while allowing another conversation", kind => {
    expect(messageEditWorkspaceReason(ready, { kind, conversationId: "conv_a" } as ChatSendState)).not.toBeNull();
    expect(messageEditWorkspaceReason(ready, { kind, conversationId: "conv_b" } as ChatSendState)).toBeNull();
  });
  it("allows confirmed execution completion/failure and denies unknown failure", () => {
    expect(messageEditWorkspaceReason(ready, { kind: "idle" })).toBeNull();
    expect(messageEditWorkspaceReason(ready, { kind: "error", confirmedFailure: true } as ChatSendState)).toBeNull();
    expect(messageEditWorkspaceReason(ready, { kind: "error" } as ChatSendState)).not.toBeNull();
    expect(messageEditWorkspaceReason({ status: "loading" }, { kind: "idle" })).not.toBeNull();
  });
});
