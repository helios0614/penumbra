import {
  mapChatExecutionEvent,
  mapDuplicateSendAcknowledgement,
} from "@/application/chat-execution/chat-execution-events";
import {
  mapRegenerateQuery,
  mapSendMessageRequest,
} from "@/application/chat-execution/chat-execution-request";
import {
  ChatExecutionContractError,
  type ChatExecutionEvent,
  type ChatExecutionRequestOptions,
  type ChatExecutionStream,
  type RegenerateInput,
  type SendExecutionResult,
  type SendMessageInput,
} from "@/application/chat-execution/chat-execution-types";
import { openApiStream } from "@/lib/api";
import { parseSseJsonData, parseSseStream } from "@/lib/sse";

const DUPLICATE_ACKNOWLEDGEMENT_MAX_BYTES = 64 * 1024;

export async function openSendExecution(
  conversationId: string,
  input: SendMessageInput,
  options?: ChatExecutionRequestOptions,
): Promise<SendExecutionResult> {
  const path = chatExecutionPath(conversationId, "send");
  const body = mapSendMessageRequest(input);
  const response = await openApiStream(path, {
    ...options,
    method: "POST",
    body,
  });
  const mediaType = normalizeMediaType(response.contentType);

  if (mediaType === "text/event-stream") {
    return streamResult(response.body);
  }
  if (mediaType === "application/json") {
    const acknowledgement = await readLimitedJsonBody(response.body);
    return mapDuplicateSendAcknowledgement(acknowledgement);
  }

  await cancelUnreadBody(response.body);
  throw new ChatExecutionContractError(
    "Chat send response has a missing or unsupported media type",
  );
}

export async function openRegenerateExecution(
  conversationId: string,
  messageId: string,
  input: RegenerateInput = {},
  options?: ChatExecutionRequestOptions,
): Promise<ChatExecutionStream> {
  const path = regenerateExecutionPath(conversationId, messageId);
  const query = mapRegenerateQuery(input);
  const response = await openApiStream(path, {
    ...options,
    method: "POST",
    query,
    body: undefined,
  });

  if (normalizeMediaType(response.contentType) === "text/event-stream") {
    return streamResult(response.body);
  }

  await cancelUnreadBody(response.body);
  throw new ChatExecutionContractError(
    "Chat regenerate response has a missing or unsupported media type",
  );
}

function chatExecutionPath(
  conversationId: string,
  operation: "send",
): string {
  if (
    typeof conversationId !== "string" ||
    conversationId.trim().length === 0
  ) {
    throw new ChatExecutionContractError(
      "Chat execution conversation ID must be a non-empty string",
    );
  }

  return `/api/conversations/${encodeURIComponent(conversationId)}/${operation}`;
}

function regenerateExecutionPath(
  conversationId: string,
  messageId: string,
): string {
  if (
    typeof conversationId !== "string" ||
    conversationId.trim().length === 0 ||
    typeof messageId !== "string" ||
    messageId.trim().length === 0
  ) {
    throw new ChatExecutionContractError(
      "Chat regenerate conversation and target IDs must be non-empty strings",
    );
  }

  return `/api/conversations/${encodeURIComponent(conversationId)}` +
    `/messages/${encodeURIComponent(messageId)}/regenerate`;
}

function streamResult(body: ReadableStream<Uint8Array>): ChatExecutionStream {
  return {
    kind: "stream",
    events: mapChatExecutionStream(body),
  };
}

async function* mapChatExecutionStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<ChatExecutionEvent, void, void> {
  for await (const frame of parseSseStream(body)) {
    yield mapChatExecutionEvent(parseSseJsonData(frame));
  }
}

function normalizeMediaType(contentType: string | null): string | null {
  if (contentType === null) {
    return null;
  }

  const separator = contentType.indexOf(";");
  const mediaType = (separator < 0
    ? contentType
    : contentType.slice(0, separator)
  )
    .trim()
    .toLowerCase();

  return mediaType || null;
}

async function readLimitedJsonBody(
  body: ReadableStream<Uint8Array>,
): Promise<unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let byteLength = 0;
  let text = "";
  let reachedEof = false;
  let failure: unknown;

  try {
    while (true) {
      const result = await reader.read();
      if (result.done) {
        reachedEof = true;
        break;
      }

      byteLength += result.value.byteLength;
      if (byteLength > DUPLICATE_ACKNOWLEDGEMENT_MAX_BYTES) {
        throw new ChatExecutionContractError(
          "Duplicate send acknowledgement exceeds the safe body limit",
        );
      }

      text += decodeJsonBytes(decoder, result.value, true);
    }

    text += decodeJsonBytes(decoder, undefined, false);
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new ChatExecutionContractError(
        "Duplicate send acknowledgement is not valid JSON",
      );
    }
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    if (!reachedEof) {
      try {
        await reader.cancel(failure);
      } catch {
        // Preserve the primary transport or contract error.
      }
    }
    reader.releaseLock();
  }
}

function decodeJsonBytes(
  decoder: TextDecoder,
  chunk: Uint8Array | undefined,
  stream: boolean,
): string {
  try {
    return chunk === undefined
      ? decoder.decode()
      : decoder.decode(chunk, { stream });
  } catch {
    throw new ChatExecutionContractError(
      "Duplicate send acknowledgement is not valid UTF-8",
    );
  }
}

async function cancelUnreadBody(
  body: ReadableStream<Uint8Array>,
): Promise<void> {
  try {
    await body.cancel(
      new DOMException("Unsupported Chat response body", "AbortError"),
    );
  } catch {
    // Media type mismatch remains the actionable contract error.
  }
}
