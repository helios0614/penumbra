import { describe, expect, it } from "vitest";
import { appendAssistantChunk, createStreamingAssistantAccumulator, flushAssistantAccumulator,
  reduceChatExecutionEvent } from "./chat-send-accumulator";
import { mapMessage } from "@/domain/message";
import { messageWire } from "@/test-fixtures/main-chat-wire";
import { presentChatMessage } from "@/components/chat-workspace/presentation/chat-message-presenter";
import { mapChatExecutionEvent } from "@/application/chat-execution";

function partitions(input: string): string[][] {
  return [Array.from(input), ...Array.from({ length: input.length + 1 }, (_, i) => [input.slice(0, i), input.slice(i)])];
}

describe("Thinking display isolation (synthetic controls only)", () => {
  it.each([false, true])("reads backend feature permission=%s independently of echo", enabled => {
    expect(mapChatExecutionEvent({ type: "start", id: "a", drift_enabled: enabled, include_drift: !enabled }))
      .toMatchObject({ type: "start", assistantMessageId: "a", driftEnabled: enabled });
    expect(mapChatExecutionEvent({ type: "start", id: "a", drift_enabled: "true", include_drift: true }))
      .not.toHaveProperty("driftEnabled");
  });
  it.each([
    "[THINKING_START]outer[THINKING_START]SYNTH_PRIVATE[THINKING_END]SYNTH_PRIVATE[THINKING_END]",
    "[THINKING_START][THINKING_START][THINKING_START]SYNTH_PRIVATE[THINKING_END][THINKING_END][THINKING_END]",
    "[DRIFT:note[HEART:SYNTH_PRIVATE]SYNTH_PRIVATE]",
    '[SIMPLETHINK:note [a[b]] [MCP:t|{"text":"]","x":[1,2]}] SYNTH_PRIVATE]',
    "[HEART:outer[THINKING_END]SYNTH_PRIVATE]",
  ])("keeps the entire control range out of the body at every split: %s", control => {
    for (const chunks of partitions(`before${control}after`)) {
      let state = createStreamingAssistantAccumulator("synthetic", 0);
      for (const chunk of chunks) {
        state = appendAssistantChunk(state, chunk);
        expect(state.message.content).not.toContain("SYNTH_PRIVATE");
        expect(state.message.thinking ?? "").not.toContain("SYNTH_PRIVATE");
        expect(state.message.simpleThink).toBeNull();
      }
      expect(flushAssistantAccumulator(state).message.content).toBe("beforeafter");
    }
  });

  it.each([
    "[HEART:SYNTH_PRIVATE]", "[DRIFT:SYNTH_PRIVATE]", "[SIMPLETHINK:SYNTH_PRIVATE]",
    '[MCP:t|{"list":[1,2],"text":"] SYNTH_PRIVATE"}]', "[MEMORY_WRITE:SYNTH_PRIVATE]",
    "[TODO:SYNTH_PRIVATE]", "<meta>nested<meta>SYNTH_PRIVATE</meta>SYNTH_PRIVATE</meta>",
  ])("filters private ranges inside visible Thinking at every split: %s", control => {
    for (const chunks of partitions(`[THINKING_START]safe${control}tail[THINKING_END]body`)) {
      let state = createStreamingAssistantAccumulator("synthetic", 0);
      for (const chunk of chunks) {
        state = appendAssistantChunk(state, chunk);
        expect(JSON.stringify(state.message)).not.toMatch(/SYNTH_PRIVATE|HEART:|DRIFT:|SIMPLETHINK:|MCP:|<meta>/);
      }
      expect(flushAssistantAccumulator(state).message).toMatchObject({ content: "body", thinking: "safetail", simpleThink: null });
    }
  });

  it.each(["[THINKING_EN", "[THINKING_START", "[HEART:SYNTH_PRIVATE", "[DRIFT:SYNTH_PRIVATE", "<meta>SYNTH_PRIVATE"])(
    "does not flush truncated control bytes into an open Thinking: %s", suffix => {
      for (const chunks of partitions(`[THINKING_START]safe${suffix}`)) {
        let state = createStreamingAssistantAccumulator("synthetic", 0);
        for (const chunk of chunks) state = appendAssistantChunk(state, chunk);
        expect(flushAssistantAccumulator(state).message).toMatchObject({ content: "", thinking: "safe", simpleThink: null });
      }
    });

  it("joins complete trimmed blocks like persistence and keeps open output explicitly unclosed", () => {
    let state = createStreamingAssistantAccumulator("synthetic", 0);
    for (const c of "[THINKING_END]before[THINKING_START] one \n[THINKING_END]middle[THINKING_START] two [THINKING_END][THINKING_END]after") {
      state = appendAssistantChunk(state, c);
    }
    expect(flushAssistantAccumulator(state).message).toMatchObject({ content: "beforemiddleafter", thinking: "one\n\ntwo" });
    const open = appendAssistantChunk(state, "[THINKING_START]partial[THINKING_EN");
    const ended = flushAssistantAccumulator(open);
    expect(ended.message.thinking).toBe("one\n\ntwo\n\npartial");
    expect(ended.mode).toBe("thinking"); // Temporary output remains unknown, never a fabricated completed block.
    const saved = presentChatMessage(mapMessage(messageWire({ content: "beforemiddleafter", thinking: "one\n\ntwo", drift: null })))!;
    expect(saved).toMatchObject({ thinking: state.message.thinking, simpleThink: null });
  });

  it("quarantines malformed known Thinking markers until an explicit boundary", () => {
    for (const chunks of partitions("before[THINKING_START broken]SYNTH_PRIVATE[THINKING_END]after")) {
      let state = createStreamingAssistantAccumulator("synthetic", 0);
      for (const c of chunks) state = appendAssistantChunk(state, c);
      expect(flushAssistantAccumulator(state).message).toMatchObject({ content: "beforeafter", thinking: null });
    }
  });

  it.each(["failure", "debug-summary"] as const)("never releases unconfirmed drift on %s", type => {
    let state = appendAssistantChunk(createStreamingAssistantAccumulator("synthetic", 0), "body[DRIFT:SYNTH_PRIVATE][SIMPLETHINK:SYNTH_PRIVATE]");
    state = reduceChatExecutionEvent(state, type === "failure"
      ? { type, messageId: "a", code: "provider_execution_failed" }
      : { type, messageId: "a", modelKey: "synthetic", hasError: true, failureCode: "provider_execution_failed", usage: null }).accumulator;
    expect(JSON.stringify(flushAssistantAccumulator(state).message)).not.toContain("SYNTH_PRIVATE");
  });

  it.each([undefined, false, true])("streams only complete legal DRIFT with backend feature permission=%s", driftEnabled => {
    for (const chunks of partitions("body[DRIFT:authorized drift]tail[SIMPLETHINK:second]")) {
      let state = reduceChatExecutionEvent(createStreamingAssistantAccumulator("synthetic", 0),
        { type: "start", assistantMessageId: "a", driftEnabled }).accumulator;
      let input = "";
      for (const chunk of chunks) {
        input += chunk;
        state = appendAssistantChunk(state, chunk);
        expect(state.message.simpleThink).toBe(driftEnabled && input.includes("[DRIFT:authorized drift]") ? "authorized drift" : null);
        expect(state.message.content).not.toMatch(/authorized drift|second/);
        expect(state.message.thinking).toBeNull();
      }
      expect(state.message.content).toBe("bodytail");
    }
  });

  it("never previews malformed or unclosed drift even when enabled", () => {
    for (const value of ["[DRIFT:note[HEART:SYNTH_PRIVATE]tail]", "[DRIFT:SYNTH_PRIVATE"]) {
      for (const chunks of partitions(value)) {
        let state = reduceChatExecutionEvent(createStreamingAssistantAccumulator("synthetic", 0),
          { type: "start", assistantMessageId: "a", driftEnabled: true }).accumulator;
        for (const c of chunks) {
          state = appendAssistantChunk(state, c);
          expect(JSON.stringify(state.message)).not.toContain("SYNTH_PRIVATE");
        }
        expect(flushAssistantAccumulator(state).message.simpleThink).toBeNull();
      }
    }
  });

  it.each(["DRIFT", "SIMPLETHINK"])("does not release %s through provider error details", marker => {
    for (const chunks of partitions(`[错误] provider_execution_failed\n上游信息：[${marker}:SYNTH_PRIVATE]`)) {
      let state = createStreamingAssistantAccumulator("synthetic", 0);
      for (const content of chunks) {
        state = reduceChatExecutionEvent(state, { type: "chunk", content }).accumulator;
        expect(JSON.stringify(state.message)).not.toContain("SYNTH_PRIVATE");
      }
    }
  });

  it("filters authoritative Thinking only at presentation, preserving raw receipt fields and authorized drift", () => {
    const raw = mapMessage(messageWire({ thinking: "safe[HEART:SYNTH_PRIVATE][DRIFT:SYNTH_PRIVATE]tail", drift: "authorized drift" }));
    expect(presentChatMessage(raw)).toMatchObject({ thinking: "safetail", simpleThink: "authorized drift" });
    expect(raw.thinking).toContain("SYNTH_PRIVATE");
  });

  it("does not infer Thinking from ordinary prose, brackets or think XML", () => {
    const body = "正文 [ordinary] <think>ordinary text</think> reasoning_content";
    expect(flushAssistantAccumulator(appendAssistantChunk(createStreamingAssistantAccumulator("synthetic", 0), body)).message)
      .toMatchObject({ content: body, thinking: null, simpleThink: null });
  });
});
