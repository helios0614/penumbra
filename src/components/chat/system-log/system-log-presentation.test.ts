import { describe, expect, it } from "vitest";
import { projectDiagnostic } from "@/application/chat-system-log/chat-system-log-projection";
import { diagnosticPresentation, requestPresentation, requestParameters, cacheSummary, displayBody } from "./system-log-presentation";

describe("system log detail presentation", () => {
  it("keeps zero/false and omits absent fields without inventing data", () => {
    const d = diagnosticPresentation({ "话题": "synthetic topic", "召回查询": "synthetic query", "哨兵需要搜索": false, "上下文消息数": 0 });
    expect(d.fields.map(field => [field.label, field.text])).toEqual([["话题", "synthetic topic"], ["召回查询", "synthetic query"], ["哨兵判断", "无需搜索"], ["上下文消息数", "0 条"]]);
    expect(d.actual).toBeUndefined(); expect(d.candidates).toBeUndefined(); expect(d.notes).toBeUndefined();
    expect(diagnosticPresentation(undefined).fields).toEqual([]);
  });
  it("keeps candidate scores distinct from actual recall, including genuine zero", () => {
    const d = diagnosticPresentation({ "RAG 实际召回": [], "RAG 候选评分": [{ content: "candidate only", score: 0, vec_sim: .572, importance: .4, kw_score: null }] });
    expect(d.actual?.count).toBe(0); expect(d.candidates?.count).toBe(1);
    expect(d.candidates?.items[0].scores).toEqual([{ key: "score", label: "score", text: "0.0000" }, { key: "vec_sim", label: "vec_sim", text: "0.572" }, { key: "importance", label: "importance", text: "0.4" }]);
    expect(d.candidates?.items[0].body).toEqual({ kind: "text", text: "candidate only" });
  });
  it("formats only UI scores, preserving sub-score precision and the original copy values", () => {
    const details = { "RAG 实际召回": [{ score: .4, vec_sim: 0, kw_score: .123456789, importance: .4 }] };
    const before = JSON.stringify(details);
    const fields = diagnosticPresentation(details).actual!.items[0].scores;
    expect(fields.map(field => field.text)).toEqual(["0.4000", "0", "0.123456789", "0.4"]);
    expect(JSON.stringify(details)).toBe(before);
  });
  it("uses only the safe note body and preserves date/period order", () => {
    const details = projectDiagnostic({ quick_notes: [
      { date: "2026-10-26", period_label: "上午", time_range: "05:00–13:00", output: "[HEART:must hide]", raw_output: "NEVER_SHOW" },
      { date: "2026-10-27", period_label: "下午", output: "safe synthetic note" },
      { date: "2026-10-27", period_label: "夜晚", raw_output: "NEVER_SHOW" },
    ] })?.details;
    const d = diagnosticPresentation(details);
    expect(d.notes?.map(note => [note.date, note.period, note.body.kind])).toEqual([["2026-10-26", "上午", "hidden"], ["2026-10-27", "下午", "text"], ["2026-10-27", "夜晚", "missing"]]);
    expect(JSON.stringify(d)).not.toContain("NEVER_SHOW"); expect(JSON.stringify(d)).not.toContain("must hide");
    expect(displayBody("<redacted>").kind).toBe("hidden"); expect(displayBody("").kind).toBe("empty");
  });
  it("leaves Provider metadata intact and presents safe errors as ordinary fields", () => {
    const metadata = { events: [{ event: "message_start", data: { usage: { input_tokens: 0 } } }] };
    const d = diagnosticPresentation({ "Provider 返回 metadata": metadata, "安全上游错误": { status: 403, error: { type: "permission_error", message: "synthetic policy reason" } } });
    expect(d.metadata).toBe(metadata);
    expect(d.errorFields.map(field => field.text)).toContain("synthetic policy reason");
    expect(diagnosticPresentation({}).errorFields).toEqual([]);
    expect(diagnosticPresentation({ "安全上游错误": { errors: [{ message: "nested synthetic reason" }] } }).errorFields[0]).toMatchObject({ key: "errors[0].message", text: "nested synthetic reason" });
  });
  it("groups actual wire fields without sorting or extracting OpenAI system/developer messages", () => {
    const payload = { model: "literal", messages: [{ role: "user", content: "one" }, { role: "developer", content: "two" }, { role: "assistant", content: null }], tools: [{ type: "function", function: { name: "read", parameters: { type: "object" } } }], tool_choice: "auto", temperature: 0 };
    const source = JSON.stringify(payload);
    const view = requestPresentation(source);
    expect(view.kind).toBe("grouped"); if (view.kind !== "grouped") return;
    expect(view.sections.flatMap(section => section.entries.map(([key]) => key))).toEqual(Object.keys(payload));
    expect(view.sections.map(section => section.kind)).toEqual(["parameters", "messages", "tools", "parameters"]);
    expect(view.sections.find(section => section.kind === "messages")?.entries[0][1]).toEqual(payload.messages);
    expect(JSON.stringify(payload)).toBe(source);
  });
  it("preserves Anthropic and Gemini structures, private authorized text, cache and Thinking configuration", () => {
    for (const payload of [
      { system: [{ type: "text", text: "[HEART:allowed] [DRIFT:allowed]", cache_control: { type: "ephemeral" } }], messages: [{ role: "user", content: "history" }], thinking: { type: "adaptive" }, output_config: { effort: "high" } },
      { systemInstruction: { parts: [{ text: "system" }] }, contents: [{ role: "model", parts: [{ text: "history" }] }], generationConfig: { temperature: 0, thinkingConfig: { thinkingBudget: 512 } } },
    ]) {
      const view = requestPresentation(JSON.stringify(payload));
      expect(view.kind).toBe("grouped"); if (view.kind !== "grouped") continue;
      expect(view.sections.flatMap(section => section.entries.map(([key]) => key))).toEqual(Object.keys(payload));
      expect(view.sections[0].kind).toBe("system");
    }
    expect(JSON.stringify(requestPresentation('{"system":"[HEART:allowed] [DRIFT:allowed]"}'))).toContain("[HEART:allowed]");
  });
  it("defers large requests and safely falls back for invalid, primitive or excessive root structures", () => {
    const source = JSON.stringify({ messages: [{ content: "x".repeat(140_000) }] });
    expect(requestPresentation(source).kind).toBe("deferred");
    expect(requestPresentation(source, true).kind).toBe("grouped");
    for (const raw of ["not json", "null", "[]", '"text"']) expect(requestPresentation(raw).kind).toBe("raw");
    const many = JSON.stringify(Object.fromEntries(Array.from({ length: 81 }, (_, i) => [String(i), i])));
    expect(requestPresentation(many).kind).toBe("raw");
  });
});

describe("captured request semantic parameters", () => {
  it("groups Anthropic Thinking leaves together without mutating or dropping unknown nested fields", () => {
    const payload = { model: "captured", temperature: 0, max_tokens: 16384, stream: false,
      thinking: { type: "adaptive", display: "summarized", future: { enabled: true } }, output_config: { effort: "max", format: { type: "json" } }, metadata: { user_id: "safe" }, custom: null };
    const source = JSON.stringify(payload);
    const view = requestParameters(Object.entries(payload), "anthropic");
    expect(view.groups.flatMap(group => group.fields.map(field => [field.path, field.value]))).toEqual([
      ["model", "captured"], ["temperature", 0], ["max_tokens", 16384], ["stream", false], ["thinking.type", "adaptive"], ["output_config.effort", "max"], ["thinking.display", "summarized"],
    ]);
    expect(Object.fromEntries(view.other)).toEqual({ thinking: { future: { enabled: true } }, output_config: { format: { type: "json" } }, metadata: payload.metadata, custom: null });
    expect(JSON.stringify(payload)).toBe(source);
    expect(view.groups.find(group => group.label === "Thinking · Anthropic")?.fields).toHaveLength(3);
  });
  it("keeps OpenAI reasoning and completion limits distinct from Anthropic Thinking", () => {
    const payload = { max_completion_tokens: 0, reasoning_effort: "high", thinking: { type: "adaptive" }, output_config: { effort: "max" }, prompt_cache_retention: "24h", metadata: { future: true } };
    const view = requestParameters(Object.entries(payload), "openai");
    expect(view.groups.flatMap(group => group.fields.map(field => field.path))).toEqual(["max_completion_tokens", "reasoning_effort", "prompt_cache_retention"]);
    expect(Object.fromEntries(view.other)).toEqual({ thinking: payload.thinking, output_config: payload.output_config, metadata: payload.metadata });
    expect(requestParameters(Object.entries(payload), "future-protocol").other).toEqual(Object.entries(payload));
  });
  it("uses actual Gemini config names and preserves false, zero, null and unknown fields", () => {
    const payload = { generationConfig: { temperature: 0, maxOutputTokens: 0, thinkingConfig: { thinkingBudget: 0, includeThoughts: false, thinkingLevel: null, extension: 7 }, responseMimeType: "application/json" }, cachedContent: "captured-cache" };
    const view = requestParameters(Object.entries(payload), "gemini");
    expect(view.groups.flatMap(group => group.fields.map(field => field.value))).toEqual([0, 0, 0, null, false, "captured-cache"]);
    expect(Object.fromEntries(view.other)).toEqual({ generationConfig: { thinkingConfig: { extension: 7 }, responseMimeType: "application/json" } });
    expect(requestParameters([["generation_config", { thinking_config: { thinking_budget: -1 } }]], "gemini").groups[0].fields[0]).toMatchObject({ path: "generation_config.thinking_config.thinking_budget", value: -1 });
    const aliases = requestParameters([["generationConfig", { temperature: 0 }], ["generation_config", { temperature: 1 }]], "gemini");
    expect(aliases.groups).toHaveLength(1);
    expect(aliases.groups[0].fields.map(field => field.path)).toEqual(["generationConfig.temperature", "generation_config.temperature"]);
  });
  it("leaves objects in known scalar slots accessible without inventing a readable value", () => {
    const payload = { temperature: { future: 2 }, thinking: { type: ["future"] } };
    expect(requestParameters(Object.entries(payload), "anthropic")).toEqual({ groups: [], other: Object.entries(payload) });
  });
});

describe("cache summary only", () => {
  it.each([
    [{ cache_read_input_tokens: 2 }, { read: 2, write: undefined }],
    [{ cache_creation_input_tokens: 3 }, { read: undefined, write: 3 }],
    [{ cache_read_input_tokens: 2, cache_write_tokens: 4 }, { read: 2, write: 4 }],
    [{ cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }, { read: undefined, write: undefined }],
    [{}, { read: undefined, write: undefined }],
    [{ cache_read_input_tokens: null, cache_creation_input_tokens: null }, { read: undefined, write: undefined }],
  ])("shows only positive captured counts: %j", (usage, expected) => {
    const before = JSON.stringify(usage);
    expect(cacheSummary(usage)).toEqual(expected);
    expect(JSON.stringify(usage)).toBe(before);
  });
});
