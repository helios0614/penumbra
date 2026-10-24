import { describe, expect, it } from "vitest";
import { mapCapabilityRecord, mapMessageCapabilities } from "./capability-mappers";
import { mapMessage } from "./message-mappers";
import { presentChatMessage } from "@/components/chat-workspace/presentation/chat-message-presenter";
import { toolBatchStatus } from "@/components/chat/capabilities/ToolResult";

const wire = (patch = {}) => ({ id: "m", conv_id: "c", role: "system", content: "PRIVATE PROMPT", created_at: 1,
  drift: null, thinking: null, is_carryover: 0, attachments: [], mcp_tool_calls: [], cache_region: null, ...patch });
const tool = (patch = {}) => ({ version: 1, kind: "result", capability: "tools", title: "工具执行", status: "unknown", calls: [
  { server: "forum", tool: "submit", args: { content: "实际提交正文" }, result: '{"data":"实际返回"}', status: "success", ...patch },
] });

describe("PR4-B public capability adapters", () => {
  it("keeps legacy system text readable without inferring emoji success or IDs", () => {
    const shown = presentChatMessage(mapMessage(wire({ content: "✅ [记忆写入] memory_id=made-up PRIVATE" })));
    expect(shown?.content).toBe("");
    expect(shown?.capabilities?.display?.capability).toBe("legacy-text");
    expect(shown?.capabilities?.display?.status).toBe("unknown");
    expect(shown?.capabilities?.display?.fields[0].text).toContain("memory_id=made-up");
    const publicRecord = mapCapabilityRecord({ version: 1, kind: "operation", title: "写入记忆", capability: "MEMORY_WRITE", status: "success",
      fields: [{ label: "记忆 ID", text: "actual-id" }, { label: "记忆正文", text: "真实正文" }], raw_prompt: "private" });
    expect(JSON.stringify(publicRecord)).not.toContain("private");
    expect(publicRecord?.fields[0].text).toBe("actual-id");
  });
  it("reads old structured MCP fields through an allowlist without trusting system text", () => {
    const call = { server: "forum", tool: "submit", success: true, args: { content: "实际调用正文", token: "private-secret", prompt: "PRIVATE_PROMPT" },
      executed_args: { content: "实际调用正文", device_id: "PRIVATE_DEVICE" }, raw_command: "PRIVATE_RAW_COMMAND", result_version: 1,
      result: '{"data":"safe result","context":"PRIVATE_CONTEXT","api_key":"private-secret"}',
      ai_result: "bounded result", ai_truncated: true, storage_truncated: true, original_length: 99999 };
    const mapped = mapMessage(wire({ content: "PRIVATE_SYSTEM_PROMPT", mcp_tool_calls: [call] }));
    const shown = presentChatMessage(mapped)!;
    expect(shown.capabilities?.display?.calls[0].status).toBe("success");
    expect(shown.capabilities?.display?.calls[0].fields.some(f => f.text.includes("safe result"))).toBe(true);
    expect(shown.capabilities?.display?.calls[0].notices.join()).toContain("未确认");
    expect(shown.capabilities?.display?.calls[0].notices.join()).toContain("保存上限");
    expect(JSON.stringify(shown)).not.toMatch(/PRIVATE_|private-secret/);
    const assistant = presentChatMessage(mapMessage(wire({ role: "assistant", content: "公开回复", mcp_tool_calls: [call] })))!;
    expect(assistant.capabilities?.results[0].calls[0].status).toBe("success");
    expect(assistant.capabilities?.results[0].calls[0].fields.some(f => f.text.includes("safe result"))).toBe(true);
    const paired = mapMessage(wire({ content: "", public_view_version: 1, public_display: { version: 1, kind: "operation", capability: "TODO", title: "可信投影", status: "skipped" }, mcp_tool_calls: [call] }));
    expect(paired.capabilities?.display?.title).toBe("可信投影");
  });
  it("reads old HTTP text safely while keeping cleared paired responses explicit", () => {
    const old = mapMessage(wire({ content: '旧提示 token=secret-value password="two secret words"\nCookie: session=aaa; second=bbb', public_display: null }));
    expect(old.capabilities?.display?.fields[0].text).toContain("旧提示");
    expect(JSON.stringify(old.capabilities)).not.toMatch(/secret-value|two secret words|aaa|bbb/);
    expect(presentChatMessage(old)?.content).toBe("");
    const paired = mapMessage(wire({ content: "", public_view_version: 1, public_display: null }));
    expect(paired.capabilities?.display).toBeNull();
  });
  it("preserves supplied trigger conditions, and never invents absent elapsed times", () => {
    const base = { version: 1, kind: "trigger", title: "自由活动时间", capability: "keepalive_day", status: "success" };
    const known = mapCapabilityRecord({ ...base, facts: { last_assistant_ts: 200, last_user_ts: 100, threshold_minutes: 50, elapsed_seconds: 3000 } });
    expect(known?.fields.find(f => f.label === "触发阈值")?.text).toBe("50 分钟");
    expect(known?.fields.find(f => f.label === "AI 回复已间隔")?.text).toBe("约 50 分钟");
    expect(mapCapabilityRecord(base)?.fields).toEqual([]);
  });
  it("extracts reliable content and keeps the generic full saved result for unknown tools", () => {
    const known = mapCapabilityRecord(tool());
    expect(known?.calls[0].fields).toContainEqual({ label: "调用正文", text: "实际提交正文" });
    expect(known?.calls[0].fields.some(f => f.label === "已保存结果" && f.text.includes("实际返回"))).toBe(true);
    const long = "超长安全结果".repeat(40000);
    const generic = mapCapabilityRecord(tool({ args: { opaque: [1, 2] }, result: long }));
    expect(generic?.calls[0].fields.find(f => f.label === "已保存结果")?.text).toBe(long);
    expect(generic?.calls[0].fields.some(f => f.label === "调用参数")).toBe(true);
    expect(generic?.calls[0].notices.join()).toContain("未确认");
  });
  it.each(["success", "failed", "skipped", "timeout", "cancelled", "unknown"])("keeps %s distinct from follow-up delivery", status => {
    const call = mapCapabilityRecord(tool({ status, ai_included: false, ai_delivery: "not_included", storage_truncated: true, ai_truncated: true, ai_result: "not delivered" }))?.calls[0];
    expect(call?.status).toBe(status);
    expect(call?.notices.join()).toContain("未注入 AI");
    expect(call?.notices.join()).toContain("完整原文不可恢复");
    expect(call?.fields.some(f => f.label === "本次 AI 有界结果")).toBe(false);
  });
  it("handles partial failures and legacy truncation without claiming full delivery", () => {
    expect(toolBatchStatus(["success", "failed", "skipped"])).toBe("partial");
    expect(toolBatchStatus(["success", "unknown"])).toBe("unknown");
    expect(toolBatchStatus(["skipped"])).toBe("skipped");
    const call = mapCapabilityRecord(tool({ original_length: 9000, ai_result: "budgeted", ai_delivery: "prepared", ai_truncated: true }))?.calls[0];
    expect(call?.notices.join()).toContain("旧记录");
    expect(call?.notices.join()).toContain("是否送达模型尚无法确认");
    expect(call?.fields.find(f => f.label === "本次 AI 有界结果")?.text).toBe("budgeted");
  });
  it("attaches only a real reaction target and real HEART availability", () => {
    const reaction = { id: "r", type: "reaction", conv_id: "c", target_message_id: "m", source_message_id: "a", emoji: "💙" };
    const user = wire({ role: "user", reaction });
    expect(mapMessageCapabilities(user).reaction?.sourceMessageId).toBe("a");
    expect(mapMessageCapabilities({ ...user, id: "last-user" }).reaction).toBeNull();
    expect(mapMessageCapabilities({ ...user, conv_id: "other" }).reaction).toBeNull();
    expect(mapMessageCapabilities(wire({ role: "assistant", content: "[HEART:guess]" })).hasHeart).toBe(false);
    expect(mapMessageCapabilities(wire({ role: "assistant", has_heart: true })).hasHeart).toBe(true);
  });
  it("uses separate Web Search and URL receipt anchors, ignores evidence and deduplicates IDs", () => {
    const receipt = { id: "search", source_message_id: "m", conv_id: "c", query: "safe query", status: "partial", source_count: 1,
      sources: [{ title: "来源标题", domain: "example.com", url: "PRIVATE_URL" }], follow_up_status: "generation_failed", evidence: "PRIVATE_EVIDENCE" };
    const results = mapMessageCapabilities(wire({ role: "assistant", web_search_results: [receipt, receipt, { ...receipt, id: "wrong", source_message_id: "x" }] })).results;
    expect(results).toHaveLength(1);
    expect(results[0].notices.join()).toContain("模型续写失败");
    expect(JSON.stringify(results)).not.toContain("PRIVATE");
    const urls = mapMessageCapabilities(wire({ role: "user", url_read_results: [{ id: "url-event", domain: "example.org", status: "failed", reason: "timeout", sequence: 0, evidence: "PRIVATE" }] })).results;
    expect(urls[0]).toMatchObject({ id: "url-event", title: "链接读取", status: "failed" });
    expect(JSON.stringify(urls)).not.toContain("PRIVATE");
  });
});
