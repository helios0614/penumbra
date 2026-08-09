import type { Message } from "@/domain/message";

import type {
  ChatAttachmentViewModel,
  ChatMessageViewModel,
} from "@/components/chat-workspace/presentation/chat-presentation-types";

const SAFE_UNKNOWN_ROLE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,47}$/;
const SENSITIVE_UNKNOWN_ROLE = /(?:api[-_]?key|authorization|bearer|cookie|secret|token|https?[:/])/i;
const PROVIDER_FAILURE_MARKERS = [
  "provider_request_failed",
  "provider_execution_failed",
] as const;

export function presentChatMessages(
  messages: readonly Message[],
): readonly ChatMessageViewModel[] {
  const visible: ChatMessageViewModel[] = [];

  for (const message of messages) {
    const presented = presentChatMessage(message);
    if (presented !== null) {
      visible.push(presented);
    }
  }

  return visible;
}

export function presentChatMessage(
  message: Message,
): ChatMessageViewModel | null {
  const base = {
    id: message.id,
    content: message.content,
    createdAt: message.createdAt,
  };

  switch (message.roleKind) {
    case "user":
      return Object.freeze({
        ...base,
        kind: "user",
        attachments: presentUnsupportedAttachments(message),
      });
    case "assistant":
      return Object.freeze({
        ...base,
        content: presentSafeAssistantContent(message.content),
        kind: "assistant",
        thinking: message.thinking,
        simpleThink: message.simpleThink,
        attachments: presentUnsupportedAttachments(message),
      });
    case "system":
      return Object.freeze({ ...base, kind: "system" });
    case "hidden-runtime":
      return null;
    case "unknown":
      return Object.freeze({
        ...base,
        kind: "unknown",
        rawRole: presentSafeUnknownRole(message.rawRole),
      });
  }
}

function presentSafeAssistantContent(content: string): string {
  return PROVIDER_FAILURE_MARKERS.some((marker) => content.includes(marker))
    ? "当前回复生成失败。"
    : content;
}

export function presentSafeUnknownRole(rawRole: string): string {
  const candidate = rawRole.trim();
  if (
    !SAFE_UNKNOWN_ROLE.test(candidate) ||
    SENSITIVE_UNKNOWN_ROLE.test(candidate)
  ) {
    return "unknown";
  }
  return candidate;
}

function presentUnsupportedAttachments(
  message: Message,
): readonly ChatAttachmentViewModel[] {
  return Object.freeze(
    message.attachments.map(() =>
      Object.freeze({
        kind: "unsupported" as const,
        label: "附件暂不支持" as const,
      }),
    ),
  );
}
