import type { Message } from "@/domain/message";
import { mapMediaAttachments } from "@/domain/media/media-mappers";
import { assistantFailureIndex, formatAssistantFailure } from "@/domain/message/assistant-failure";
import { appendAssistantChunk, createStreamingAssistantAccumulator, flushAssistantAccumulator, filterThinkingDisplay } from "@/application/chat-send/chat-send-accumulator";

import type {
  ChatMessageViewModel,
} from "@/components/chat-workspace/presentation/chat-presentation-types";

const SAFE_UNKNOWN_ROLE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,47}$/;
const SENSITIVE_UNKNOWN_ROLE = /(?:api[-_]?key|authorization|bearer|cookie|secret|token|https?[:/])/i;

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
    ...(message.capabilities ? { capabilities: message.capabilities } : {}),
  };

  switch (message.roleKind) {
    case "user":
      return Object.freeze({
        ...base,
        kind: "user",
        attachments: mapMediaAttachments(message.attachments, "user"),
      });
    case "assistant":
      return Object.freeze({
        ...base,
        ...presentAssistantContent(message.content),
        kind: "assistant",
        thinking: filterThinkingDisplay(message.thinking),
        simpleThink: message.simpleThink,
        attachments: mapMediaAttachments(message.attachments, "assistant"),
      });
    case "system":
      return Object.freeze({ ...base, content: "", kind: "system" });
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

function presentAssistantContent(content: string) {
  const index = assistantFailureIndex(content);
  const body = index < 0 ? content : content.slice(0, index);
  return {
    content: flushAssistantAccumulator(appendAssistantChunk(createStreamingAssistantAccumulator("display", 0), body)).message.content,
    ...(index < 0 ? {} : { error: formatAssistantFailure(content.slice(index)), insertable: false }),
  };
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
