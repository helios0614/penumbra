import { useEffect, useRef, useState } from "react";
import { createChatSettingsController, INITIAL_CHAT_SETTINGS } from "./chat-settings-controller";
import { chatSettingsScope, chatSettingsScopeKey } from "./chat-request-parameters";
import type { UseChatWorkspaceResult } from "./useChatWorkspace";
import type { UseChatSendResult } from "./useChatSend";

export function useChatSettings(workspace: UseChatWorkspaceResult, send: UseChatSendResult) {
  const latest = useRef({ workspace, send }); latest.current = { workspace, send };
  const [state, setState] = useState(INITIAL_CHAT_SETTINGS);
  const [controller] = useState(() => createChatSettingsController({ canEdit: scope => {
    const { workspace: current } = latest.current, now = current.getState();
    return now.status === "ready" && !now.pendingConversationId && !now.configurationPending &&
      !now.conversationMutation && chatSettingsScopeKey(chatSettingsScope(now.workspace)) === chatSettingsScopeKey(scope);
  } }));
  useEffect(() => controller.subscribe(setState), [controller]);
  const scope = workspace.state.status === "ready" ? chatSettingsScope(workspace.state.workspace) : null;
  const key = chatSettingsScopeKey(scope);
  useEffect(() => { controller.select(scope); }, [controller, key]);
  useEffect(() => () => { controller.select(null); }, [controller]);
  return { state, controller };
}
export type ChatSettingsUi = ReturnType<typeof useChatSettings>;
