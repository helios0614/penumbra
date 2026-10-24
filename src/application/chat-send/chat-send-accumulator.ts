import type {
  ChatExecutionEvent,
  ChatProviderFailureCode,
} from "@/application/chat-execution";
import type { StreamingAssistantMessage } from "@/application/chat-send/chat-send-types";
import { ASSISTANT_FAILURE_PREFIXES, assistantFailureIndex, assistantFailureCode, formatAssistantFailure } from "@/domain/message/assistant-failure";

const THINKING_START = "[THINKING_START]";
const THINKING_END = "[THINKING_END]";
const SIMPLE_THINK_START = "[SIMPLETHINK:";
const DRIFT_START = "[DRIFT:";
// Display filtering only. Commands remain exclusively owned/executed by AionHome.
const HIDDEN_MARKERS = [THINKING_END, "[HEART:", "[MCP:", "[MUSIC:", "[TOY:", "[CAM_CHECK]", "[查看动态:",
  "[POI_SEARCH:", "[WEBSEARCH:", "[ROUTE_PLAN:", "[Location]", "[REACTION:", "[ALARM:",
  "[REMINDER:", "[Monitor:", "[SCHEDULE_DEL:", "[SCHEDULE_LIST]", "[TODO:", "[TODO_DONE:",
  "[MEMORY_WRITE:", "[请求出错:", "<meta>"];
const CONTENT_MARKERS = [THINKING_START, SIMPLE_THINK_START, DRIFT_START, ...HIDDEN_MARKERS];
const PROVIDER_FAILURE_MARKERS = [
  ...ASSISTANT_FAILURE_PREFIXES,
  "provider_request_failed", "provider_execution_failed",
] as const;

type AccumulatorMode = "content" | "thinking" | "simple-think" | "hidden" | "meta";

export type StreamingAssistantAccumulator = {
  readonly message: StreamingAssistantMessage;
  readonly mode: AccumulatorMode;
  readonly pending: string;
  readonly providerPending: string;
  readonly failureText: string | null;
  readonly hiddenDepth: number;
  readonly hiddenQuote: boolean;
  readonly hiddenEscape: boolean;
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
    providerPending: "",
    failureText: null,
    hiddenDepth: 0,
    hiddenQuote: false,
    hiddenEscape: false,
  };
}

export function reduceChatExecutionEvent(
  accumulator: StreamingAssistantAccumulator,
  event: ChatExecutionEvent,
): ChatExecutionReduction {
  switch (event.type) {
    case "failure":
      return { accumulator: { ...accumulator, providerPending: "", message: {
        ...accumulator.message, assistantMessageId: accumulator.message.assistantMessageId ?? event.messageId,
        error: detailedError(accumulator.message.error, event.error),
      } }, failure: event.code ?? "provider-failure" };
    case "start":
      return unchanged({
        ...accumulator,
        message: {
          ...accumulator.message,
          assistantMessageId: event.assistantMessageId,
        },
      });
    case "chunk": {
      const input = accumulator.providerPending + event.content;
      const index = assistantFailureIndex(input);
      if (accumulator.failureText !== null || index >= 0) {
        const rawFailure = (accumulator.failureText ?? "") + (index >= 0 && accumulator.failureText === null ? input.slice(index) : input);
        const failureText = ASSISTANT_FAILURE_PREFIXES.some(prefix => rawFailure.startsWith(prefix))
          ? rawFailure : assistantFailureCode(rawFailure) ?? "";
        const next = accumulator.failureText === null && index > 0
          ? appendAssistantChunk(accumulator, input.slice(0, index)) : accumulator;
        return {
          accumulator: { ...next, providerPending: "", failureText,
            message: { ...next.message, error: formatAssistantFailure(failureText) } },
          failure: assistantFailureCode(failureText),
        };
      }
      const providerPending = retainedMarkerPrefix(
        input,
        PROVIDER_FAILURE_MARKERS,
      );
      const emitted = input.slice(0, input.length - providerPending.length);
      return unchanged({
        ...appendAssistantChunk(
          { ...accumulator, providerPending: "" },
          emitted,
        ),
        providerPending,
      });
    }
    case "debug-summary":
      return {
        accumulator: {
          ...accumulator,
          providerPending: event.hasError ? "" : accumulator.providerPending,
          message: { ...accumulator.message, usage: event.usage, error: detailedError(accumulator.message.error, event.error) },
        },
        failure: event.hasError
          ? event.failureCode ?? "provider-failure"
          : null,
      };
    case "mcp-loading":
      return unchanged(event.messageId === accumulator.message.assistantMessageId
        ? { ...accumulator, message: { ...accumulator.message, toolPending: true } } : accumulator);
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
  let hiddenDepth = accumulator.hiddenDepth;
  let hiddenQuote = accumulator.hiddenQuote;
  let hiddenEscape = accumulator.hiddenEscape;

  while (input.length > 0) {
    if (mode === "content") {
      const marker = firstMarker(input, CONTENT_MARKERS);
      if (marker !== null) {
        content += input.slice(0, marker.index);
        input = input.slice(marker.index + marker.value.length);
        mode = marker.value === THINKING_START ? "thinking"
          : marker.value === DRIFT_START || marker.value === SIMPLE_THINK_START ? "simple-think"
          : marker.value === "<meta>" ? "meta"
          : marker.value.endsWith("]") ? "content" : "hidden";
        hiddenDepth = mode === "hidden" ? 1 : 0;
        hiddenQuote = false; hiddenEscape = false;
        continue;
      }

      const retained = retainedMarkerPrefix(input, CONTENT_MARKERS);
      content += input.slice(0, input.length - retained.length);
      input = retained;
      break;
    }

    if (mode === "hidden") {
      let index = 0;
      for (; index < input.length; index += 1) {
        const character = input[index];
        if (hiddenEscape) { hiddenEscape = false; continue; }
        if (hiddenQuote && character === "\\") { hiddenEscape = true; continue; }
        if (character === '"') { hiddenQuote = !hiddenQuote; continue; }
        if (hiddenQuote) continue;
        if (input[index] === "[") hiddenDepth += 1;
        if (input[index] === "]" && --hiddenDepth === 0) { index += 1; mode = "content"; break; }
      }
      input = input.slice(index);
      continue;
    }
    const endMarker = mode === "thinking" ? THINKING_END : mode === "meta" ? "</meta>" : "]";
    const endIndex = input.indexOf(endMarker);
    if (endIndex >= 0) {
      if (mode === "thinking") {
        thinking += input.slice(0, endIndex);
      } else if (mode === "simple-think") {
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
    } else if (mode === "simple-think") {
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
    providerPending: accumulator.providerPending,
    failureText: accumulator.failureText,
    hiddenDepth,
    hiddenQuote,
    hiddenEscape,
  };
}

export function flushAssistantAccumulator(
  accumulator: StreamingAssistantAccumulator,
): StreamingAssistantAccumulator {
  if (accumulator.providerPending.length > 0) {
    return flushAssistantAccumulator(appendAssistantChunk(
      { ...accumulator, providerPending: "" },
      accumulator.providerPending,
    ));
  }
  if (accumulator.pending.length === 0) return accumulator;

  // An incomplete control prefix must never flash into the body at EOF.
  const pending = accumulator.mode === "content" ? "" : accumulator.pending;
  const message = accumulator.message;
  return {
    message: accumulator.mode === "content"
      ? { ...message, content: message.content + pending }
      : accumulator.mode === "thinking"
        ? { ...message, thinking: (message.thinking ?? "") + pending }
        : accumulator.mode === "simple-think" ? { ...message, simpleThink: (message.simpleThink ?? "") + pending } : message,
    mode: accumulator.mode,
    pending: "",
    providerPending: "",
    hiddenDepth: accumulator.hiddenDepth,
    hiddenQuote: accumulator.hiddenQuote,
    hiddenEscape: accumulator.hiddenEscape,
    failureText: accumulator.failureText,
  };
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

function detailedError(previous: string | undefined, next: string | undefined): string | undefined {
  return next && (!previous || next.includes("\n")) ? next : previous;
}
