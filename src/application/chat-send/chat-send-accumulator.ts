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
const THINKING_FAMILY = "[THINKING_";
// Display filtering only. Commands remain exclusively owned/executed by AionHome.
const HIDDEN_MARKERS = [THINKING_END, "[HEART:", "[MCP:", "[MUSIC:", "[TOY:", "[CAM_CHECK]", "[查看动态:",
  "[POI_SEARCH:", "[WEBSEARCH:", "[ROUTE_PLAN:", "[Location]", "[REACTION:", "[ALARM:",
  "[REMINDER:", "[Monitor:", "[SCHEDULE_DEL:", "[SCHEDULE_LIST]", "[TODO:", "[TODO_DONE:",
  "[MEMORY_WRITE:", "[请求出错:", "<meta>"];
const CONTENT_MARKERS = [THINKING_START, SIMPLE_THINK_START, DRIFT_START, ...HIDDEN_MARKERS, THINKING_FAMILY];
const PROVIDER_FAILURE_MARKERS = [
  ...ASSISTANT_FAILURE_PREFIXES,
  "provider_request_failed", "provider_execution_failed",
] as const;

type AccumulatorMode = "content" | "thinking" | "hidden" | "meta";

export type StreamingAssistantAccumulator = {
  readonly message: StreamingAssistantMessage;
  readonly mode: AccumulatorMode;
  readonly pending: string;
  readonly providerPending: string;
  readonly failureText: string | null;
  readonly hiddenDepth: number;
  readonly hiddenQuote: boolean;
  readonly hiddenEscape: boolean;
  readonly hiddenReturnMode: "content" | "thinking";
  readonly metaDepth: number;
  readonly thinkingDepth: number;
  readonly thinkingMalformed: boolean;
  readonly completedThinking: string;
  readonly currentThinking: string;
  readonly driftEnabled: boolean;
  readonly driftSeen: boolean;
  readonly currentDrift: string | null;
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
    hiddenReturnMode: "content",
    metaDepth: 0,
    thinkingDepth: 0,
    thinkingMalformed: false,
    completedThinking: "",
    currentThinking: "",
    driftEnabled: false,
    driftSeen: false,
    currentDrift: null,
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
        // This is the backend feature gate, never the AI history echo setting.
        driftEnabled: event.driftEnabled === true,
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
  let { mode, hiddenDepth, hiddenQuote, hiddenEscape, hiddenReturnMode, metaDepth,
    thinkingDepth, thinkingMalformed, completedThinking, currentThinking, driftSeen, currentDrift } = accumulator;
  let { content, simpleThink } = accumulator.message;
  const emit = (text: string) => {
    if (mode === "content") content += text;
    else if (mode === "thinking" && !thinkingMalformed) currentThinking += text;
  };

  while (input.length > 0) {
    if (mode === "hidden") {
      let index = 0;
      for (; index < input.length; index += 1) {
        const character = input[index];
        // Only a complete, flat DRIFT can be previewed. Nested/quoted brackets
        // remain isolated and await the existing authoritative HTTP projection.
        if (character === "[" || (character === "]" && (hiddenQuote || hiddenDepth > 1))) currentDrift = null;
        if (hiddenEscape) { hiddenEscape = false; continue; }
        if (hiddenQuote && character === "\\") { hiddenEscape = true; continue; }
        if (character === '"') hiddenQuote = !hiddenQuote;
        if (!hiddenQuote) {
          if (character === "[") hiddenDepth += 1;
          if (character === "]" && --hiddenDepth === 0) {
            if (currentDrift && accumulator.driftEnabled) simpleThink = currentDrift;
            currentDrift = null;
            index += 1;
            mode = hiddenReturnMode;
            break;
          }
        }
        if (currentDrift !== null) currentDrift += character;
      }
      input = input.slice(index);
      continue;
    }
    if (mode === "meta") {
      const marker = firstMarker(input, ["<meta>", "</meta>"]);
      if (marker === null) { input = retainedMarkerPrefix(input, ["<meta>", "</meta>"]); break; }
      metaDepth += marker.value === "<meta>" ? 1 : -1;
      input = input.slice(marker.index + marker.value.length);
      if (metaDepth === 0) mode = hiddenReturnMode;
      continue;
    }

    const marker = firstMarker(input, CONTENT_MARKERS);
    if (marker === null) {
      const retained = retainedMarkerPrefix(input, CONTENT_MARKERS);
      emit(input.slice(0, input.length - retained.length));
      input = retained;
      break;
    }
    emit(input.slice(0, marker.index));
    input = input.slice(marker.index);
    // Wait for a split START/END before classifying a known but malformed tag.
    if (marker.value === THINKING_FAMILY && [THINKING_START, THINKING_END].some(value => value.startsWith(input))) break;
    const malformedStart = input.startsWith("[THINKING_START");
    input = input.slice(marker.value.length);
    if (marker.value === THINKING_START || marker.value === THINKING_FAMILY) {
      if (mode === "content") {
        thinkingDepth = 1;
        currentThinking = "";
        thinkingMalformed = marker.value === THINKING_FAMILY;
      } else {
        if (marker.value === THINKING_START || malformedStart) thinkingDepth += 1;
        thinkingMalformed = true;
        currentThinking = "";
      }
      mode = "thinking";
    } else if (marker.value === THINKING_END) {
      if (mode === "thinking" && --thinkingDepth === 0) {
        if (!thinkingMalformed && currentThinking.trim()) {
          completedThinking = joinThinking(completedThinking, currentThinking.trim());
        }
        currentThinking = "";
        thinkingMalformed = false;
        mode = "content";
      }
    } else {
      hiddenReturnMode = mode;
      if (marker.value === "<meta>") {
        mode = "meta";
        metaDepth = 1;
      } else if (!marker.value.endsWith("]")) {
        const drift = marker.value === DRIFT_START || marker.value === SIMPLE_THINK_START;
        currentDrift = drift && mode === "content" && !driftSeen ? "" : null;
        if (drift && mode === "content") driftSeen = true;
        mode = "hidden";
        hiddenDepth = 1;
        hiddenQuote = false;
        hiddenEscape = false;
      }
    }
  }

  return {
    ...accumulator,
    message: { ...accumulator.message, content, simpleThink,
      thinking: joinThinking(completedThinking, thinkingMalformed ? "" : currentThinking.trim()) || null },
    mode, pending: input, hiddenDepth, hiddenQuote, hiddenEscape, hiddenReturnMode, metaDepth,
    thinkingDepth, thinkingMalformed, completedThinking, currentThinking, driftSeen, currentDrift,
  };
}

export function flushAssistantAccumulator(
  accumulator: StreamingAssistantAccumulator,
): StreamingAssistantAccumulator {
  if (accumulator.providerPending.length > 0) {
    accumulator = appendAssistantChunk({ ...accumulator, providerPending: "" }, accumulator.providerPending);
  }
  // Keep legitimate open Thinking as temporary output for PR7-A recovery, but
  // never synthesize a closing tag or flush an incomplete control prefix.
  return { ...accumulator, pending: "", providerPending: "" };
}

/** Filter persisted Thinking at presentation only; receipt values stay intact. */
export function filterThinkingDisplay(content: string | null): string | null {
  if (!content) return content;
  const initial = createStreamingAssistantAccumulator("display-thinking", 0);
  return appendAssistantChunk({ ...initial, mode: "thinking", thinkingDepth: 1 }, content).message.thinking;
}

function joinThinking(complete: string, current: string): string {
  return complete && current ? complete + "\n\n" + current : complete || current;
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
