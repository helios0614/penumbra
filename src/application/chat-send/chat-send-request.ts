import type {
  RegenerateInput,
  SendMessageInput,
} from "@/application/chat-execution";
import type {
  ChatGenerationUiValues,
  ChatRegenerateGenerationUiValues,
} from "@/application/chat-send/chat-send-types";

export function mapChatSendExecutionInput(
  content: string,
  clientMessageId: string,
  generation: ChatGenerationUiValues = {},
): SendMessageInput {
  const input: SendMessageInput = {
    content,
    clientMessageId,
  };

  copyOwn(generation, "attachments", input);
  copyOwn(generation, "temperature", input);
  copyOwn(generation, "contextLimit", input);
  copyOwn(generation, "thinkingEffort", input);
  copyOwn(generation, "fastMode", input);
  copyOwn(generation, "whisperMode", input);

  return input;
}

export function mapChatRegenerateExecutionInput(
  generation: ChatRegenerateGenerationUiValues = {},
): RegenerateInput {
  const input: RegenerateInput = {};

  copyRegenerateOwn(generation, "temperature", input);
  copyRegenerateOwn(generation, "contextLimit", input);
  copyRegenerateOwn(generation, "thinkingEffort", input);
  copyRegenerateOwn(generation, "fastMode", input);
  copyRegenerateOwn(generation, "whisperMode", input);

  return input;
}

function copyOwn<
  Key extends keyof ChatGenerationUiValues & keyof SendMessageInput,
>(
  source: ChatGenerationUiValues,
  key: Key,
  target: SendMessageInput,
): void {
  if (
    Object.prototype.hasOwnProperty.call(source, key) &&
    source[key] !== undefined
  ) {
    (target as Record<Key, SendMessageInput[Key]>)[key] = source[key];
  }
}

function copyRegenerateOwn<Key extends keyof RegenerateInput>(
  source: ChatRegenerateGenerationUiValues,
  key: Key,
  target: RegenerateInput,
): void {
  if (
    Object.prototype.hasOwnProperty.call(source, key) &&
    source[key] !== undefined
  ) {
    (target as Record<Key, RegenerateInput[Key]>)[key] = source[key];
  }
}
