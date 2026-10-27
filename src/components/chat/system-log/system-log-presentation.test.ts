import { describe, expect, it } from "vitest";
import { projectDiagnostic } from "@/application/chat-system-log/chat-system-log-projection";
import { diagnosticPresentation, requestPresentation, displayBody } from "./system-log-presentation";

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
    expect(d.candidates?.items[0].scores).toEqual([{ key: "score", label: "score", text: "0.0000" }, { key: "vec_sim", label: "vec_sim", text: "0.5720" }, { key: "importance", label: "importance", text: "0.4000" }]);
    expect(d.candidates?.items[0].body).toEqual({ kind: "text", text: "candidate only" });
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
