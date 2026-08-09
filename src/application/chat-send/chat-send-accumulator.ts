import type {
  ChatExecutionEvent,
  ChatProviderFailureCode,
} from "@/application/chat-execution";
import type { StreamingAssistantMessage } from "@/application/chat-send/chat-send-types";

const THINKING_START = "[THINKING_START]";
const THINKING_END = "[THINKING_END]";
const SIMPLE_THINK_START = "[SIMPLETHINK:";
const CONTENT_MARKERS = [THINKING_START, SIMPLE_THINK_START] as const;

type AccumulatorMode = "content" | "thinking" | "simple-think";

export type StreamingAssistantAccumulator = {
  readonly message: StreamingAssistantMessage;
  readonly mode: AccumulatorMode;
  readonly pending: string;
};

export type ChatExecutionReduction = {
  readonly accumulator: StreamingAssistantAccumulator;
  readonly failure: ChatProviderFailureCode | "provider-failure" | null;
};

export function createStreamingAssistantAccumulator(
  executionId: string,
  createdAt: number,
): StreamingAssistantAccumulator {
  return {
    message: {
      overlayId: `${executionId}:assistant`,
      assistantMessageId: null,
      content: "",
      thinking: null,
      simpleThink: null,
      usage: null,
      createdAt,
    },
    mode: "content",
    pending: "",
  };
}

export function reduceChatExecutionEvent(
  accumulator: StreamingAssistantAccumulator,
  event: ChatExecutionEvent,
): ChatExecutionReduction {
  switch (event.type) {
    case "start":
      return unchanged({
        ...accumulator,
        message: {
          ...accumulator.message,
          assistantMessageId: event.assistantMessageId,
        },
      });
    case "chunk": {
      const failure = providerFailureFromText(event.content);
      if (failure !== null) {
        return { accumulator, failure };
      }
      return unchanged(appendAssistantChunk(accumulator, event.content));
    }
    case "debug-summary":
      return {
        accumulator: {
          ...accumulator,
          message: { ...accumulator.message, usage: event.usage },
        },
        failure: event.hasError
          ? event.failureCode ?? "provider-failure"
          : null,
      };
    default:
      return unchanged(accumulator);
  }
}

export function appendAssistantChunk(
  accumulator: StreamingAssistantAccumulator,
  chunk: string,
): StreamingAssistantAccumulator {
  let input = accumulator.pending + chunk;
  let mode = accumulator.mode;
  let content = accumulator.message.content;
  let thinking = accumulator.message.thinking ?? "";
  let simpleThink = accumulator.message.simpleThink ?? "";

  while (input.length > 0) {
    if (mode === "content") {
      const marker = firstMarker(input, CONTENT_MARKERS);
      if (marker !== null) {
        content += input.slice(0, marker.index);
        input = input.slice(marker.index + marker.value.length);
        mode = marker.value === THINKING_START ? "thinking" : "simple-think";
        continue;
      }

      const retained = retainedMarkerPrefix(input, CONTENT_MARKERS);
      content += input.slice(0, input.length - retained.length);
      input = retained;
      break;
    }

    const endMarker = mode === "thinking" ? THINKING_END : "]";
    const endIndex = input.indexOf(endMarker);
    if (endIndex >= 0) {
      if (mode === "thinking") {
        thinking += input.slice(0, endIndex);
      } else {
        simpleThink += input.slice(0, endIndex);
      }
      input = input.slice(endIndex + endMarker.length);
      mode = "content";
      continue;
    }

    const retained = retainedMarkerPrefix(input, [endMarker]);
    const emitted = input.slice(0, input.length - retained.length);
    if (mode === "thinking") {
      thinking += emitted;
    } else {
      simpleThink += emitted;
    }
    input = retained;
    break;
  }

  return {
    message: {
      ...accumulator.message,
      content,
      thinking: thinking.length > 0 ? thinking : null,
      simpleThink: simpleThink.length > 0 ? simpleThink : null,
    },
    mode,
    pending: input,
  };
}

export function flushAssistantAccumulator(
  accumulator: StreamingAssistantAccumulator,
): StreamingAssistantAccumulator {
  if (accumulator.pending.length === 0) return accumulator;

  const pending = accumulator.pending;
  const message = accumulator.message;
  return {
    message: accumulator.mode === "content"
      ? { ...message, content: message.content + pending }
      : accumulator.mode === "thinking"
        ? { ...message, thinking: (message.thinking ?? "") + pending }
        : { ...message, simpleThink: (message.simpleThink ?? "") + pending },
    mode: accumulator.mode,
    pending: "",
  };
}

function providerFailureFromText(
  value: string,
): ChatProviderFailureCode | null {
  if (value.includes("provider_request_failed")) {
    return "provider_request_failed";
  }
  if (value.includes("provider_execution_failed")) {
    return "provider_execution_failed";
  }
  return null;
}

function firstMarker(
  input: string,
  markers: readonly string[],
): { readonly index: number; readonly value: string } | null {
  let match: { readonly index: number; readonly value: string } | null = null;
  for (const marker of markers) {
    const index = input.indexOf(marker);
    if (index >= 0 && (match === null || index < match.index)) {
      match = { index, value: marker };
    }
  }
  return match;
}

function retainedMarkerPrefix(
  input: string,
  markers: readonly string[],
): string {
  const maxLength = Math.min(
    input.length,
    Math.max(...markers.map((marker) => marker.length - 1)),
  );
  for (let length = maxLength; length > 0; length -= 1) {
    const suffix = input.slice(-length);
    if (markers.some((marker) => marker.startsWith(suffix))) {
      return suffix;
    }
  }
  return "";
}

function unchanged(
  accumulator: StreamingAssistantAccumulator,
): ChatExecutionReduction {
  return { accumulator, failure: null };
}
