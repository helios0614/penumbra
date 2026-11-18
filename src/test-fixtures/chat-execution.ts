import type { MainChatExecution } from "@/application/chat-execution/chat-execution-status";

/** Explicit fake persistent server fact for contracts predating the execution API. */
export function executionReader(facts: Partial<MainChatExecution> = {}) {
  return async (conversationId: string, executionId: string): Promise<MainChatExecution> => {
    const [kind, encoded] = executionId.split(".");
    const bytes = Uint8Array.from(atob(encoded.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
    return { conversationId, executionId, kind: kind as MainChatExecution["kind"], requestId: new TextDecoder().decode(bytes),
      phase: "terminal", terminal: true, outcome: "completed", reason: null, cancelRequested: false,
      userMessageId: null, targetMessageId: null, assistantMessageId: null, partialText: "", ownerAvailable: false, cancelable: false, ...facts };
  };
}
export const pendingExecutionReader = executionReader({ phase: "generating", terminal: false, outcome: null, ownerAvailable: true, cancelable: true });
