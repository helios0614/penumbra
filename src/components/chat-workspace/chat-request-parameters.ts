import type { ChatWorkspaceSnapshot } from "@/application/chat-workspace";
import type { MainSelection } from "@/domain/runtime/main-configuration";

export type ChatSettingsScope = { readonly conversationId: string; readonly selection: MainSelection };
export function chatSettingsScope(workspace: ChatWorkspaceSnapshot): ChatSettingsScope | null {
  const selection = workspace.setup.configuration?.selection, id = workspace.selectedConversationId;
  return selection && id && workspace.setup.conversationId === id ? { conversationId: id, selection } : null;
}
export function chatSettingsScopeKey(scope: ChatSettingsScope | null): string {
  return JSON.stringify(scope ? [scope.conversationId, scope.selection.connectionId ?? null, scope.selection.profileId ?? null,
    scope.selection.protocol ?? null, scope.selection.model] : null);
}
