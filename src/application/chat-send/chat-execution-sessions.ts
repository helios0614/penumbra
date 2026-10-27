import { createChatSendController, isChatExecutionActive, type ChatSendControllerDependencies } from "./chat-send-controller";
import { INITIAL_CHAT_SEND_STATE } from "./chat-send-types";

/** Each conversation owns its requests. Navigation never disposes an execution. */
export function createChatExecutionSessions(dependencies: ChatSendControllerDependencies) {
  const controllers = new Map<string, ReturnType<typeof createChatSendController>>();
  const listeners = new Set<() => void>();
  return {
    get(conversationId: string) {
      let controller = controllers.get(conversationId);
      if (!controller) {
        controller = createChatSendController(dependencies);
        controllers.set(conversationId, controller);
        controller.subscribe(() => listeners.forEach(listener => listener()));
      }
      return controller;
    },
    state(conversationId: string | null | undefined) { return conversationId ? controllers.get(conversationId)?.getState() ?? INITIAL_CHAT_SEND_STATE : INITIAL_CHAT_SEND_STATE; },
    active(conversationId: string) { return isChatExecutionActive(this.state(conversationId)); },
    async reconcileUserPersistence(conversationId: string) { await controllers.get(conversationId)?.reconcileUserPersistence(); },
    async reconcilePending() {
      await Promise.all([...controllers.values()].map(controller => {
        const state = controller.getState();
        return state.kind === "finalization-uncertain" || state.kind === "regenerate-finalization-uncertain" ? controller.retryFinalization() : controller.reconcileUserPersistence();
      }));
    },
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}
