import { useState } from "react";
import { createRoot } from "react-dom/client";
import { SystemLogDialog } from "../../src/components/chat/SystemLogDialog";
import { ToastProvider } from "../../src/components/ui/toast";
import { systemLog } from "../../src/application/chat-system-log/chat-system-log-store";
import "../../src/index.css";
const context = { executionId: "send:synthetic-ui", conversationId: "a", kind: "send" as const };
const messages: object[] = Array.from({ length: 28 }, (_, index) => ({ role: index % 2 ? "assistant" : "user", content: `SYNTHETIC_HISTORY_${index + 1}` }));
messages[23] = { role: "assistant", content: "SYNTHETIC_RECENT_TEXT_" + "long recent message. ".repeat(100) };
messages[24] = { role: "assistant", content: [{ type: "text", text: "SYNTHETIC_RECENT_BLOCK" }, { type: "tool_use", id: "safe-tool", name: "synthetic-read", input: { n: 0 } }] };
messages[25] = { role: "user", content: [{ type: "tool_result", tool_use_id: "safe-tool", content: "SYNTHETIC_TOOL_RESULT" }] };
messages[26] = { role: "user", content: [{ type: "image", source: { _capture: "media placeholder", media_type: "image/png", estimated_bytes: 1234 } }, { type: "audio", source: { _capture: "media placeholder", media_type: "audio/wav", estimated_bytes: 2345 } }] };
messages[27] = { role: "assistant", content: [{ type: "text", text: "SYNTHETIC_LAST_TEXT" }, { type: "future_object", extension: { safe: "SYNTHETIC_COMPLEX_BLOCK" } }] };
const payload = JSON.stringify({ model: "synthetic-wire", system: [{ type: "text", text: "SYNTHETIC_LONG_PROMPT_[HEART:ALLOWED_SYNTHETIC] " + "long text\n".repeat(500) }, { type: "text", text: "SYNTHETIC_SECOND_SYSTEM", cache_control: { type: "ephemeral", ttl: "5m" } }], messages,
  tools: [{ type: "function", function: { name: "synthetic-read", description: "safe tool description", parameters: { type: "object", properties: { n: { type: "integer" } } } } }],
  temperature: 0, max_tokens: 16384, stream: true, thinking: { type: "adaptive", display: "summarized" }, output_config: { effort: "max", format: { type: "json_schema" } }, metadata: { user_id: "synthetic metadata" }, ["synthetic-long-parameter-".repeat(12)]: { nested: { enabled: true } }, tool_choice: "auto" });
const gemini = JSON.stringify({ systemInstruction: { parts: [{ text: "SYNTHETIC_GEMINI_SYSTEM" }] }, contents: [{ role: "model", parts: [{ text: "SYNTHETIC_GEMINI_REPLY" }] }], generationConfig: { temperature: 0, maxOutputTokens: 128, thinkingConfig: { thinkingBudget: 0, includeThoughts: false } } });
const capture = (id: string, payload_json: string, model: string, protocol: string) => ({ id, execution_id: context.executionId, conversation_id: "a", kind: "send", created_at: Date.now() / 1000, model, protocol, source: "provider", stage: "http_json_before_send", endpoint: "https://synthetic.invalid", payload_json, complete: true, limitations: [] });
systemLog.begin(context);
systemLog.diagnostic({ msg_id: "synthetic-msg", model: "synthetic-model-" + "long-name-".repeat(35), api_format: "anthropic", has_error: false, usage: { prompt_tokens: 0, completion_tokens: 5, total_tokens: 5, cache_read_input_tokens: 12, cache_creation_input_tokens: 4 },
  recall_topic: "synthetic topic", recall_query: "q".repeat(300), is_search_needed: false, prompt_count: 0,
  recalled_memories: [{ content: "SYNTHETIC_ACTUAL_LONG_" + "memory text ".repeat(500), type: "digest", score: 0, vec_sim: 0, importance: .5 }, { content: "SYNTHETIC_ACTUAL_SECOND", score: .7 }],
  debug_top6: [{ content: "SYNTHETIC_CANDIDATE_" + "x".repeat(5000), score: .3784, vec_sim: .572, kw_score: null, importance: .4 }],
  quick_notes: [{ date: "2026-10-26", period_label: "上午", time_range: "05:00–13:00", output: "[HEART:NEVER_SHOW]" }, { date: "2026-10-27", period_label: "下午", output: "synthetic safe note" }],
  api_response: { events: [{ event: "message_start", data: { message: { model: "synthetic-return", usage: { input_tokens: 0, cache_read_input_tokens: 0 } } } }] } }, "sse", context);
systemLog.snapshots([capture("ui-request", payload, "synthetic-wire", "anthropic")]);
Object.assign(window, {
  __detailPayload: payload, __detailGemini: gemini,
  __detailHiddenNotes: () => systemLog.diagnostic({ msg_id: "synthetic-msg", quick_notes: [
    { date: "2026-10-26", period_label: "上午", time_range: "05:00–13:00", output: "[HEART:NEVER_SHOW]" },
    { date: "2026-10-27", period_label: "下午", time_range: "13:00–18:00", output: "[已隐藏]" },
  ] }, "sse", context),
  __detailAppend: () => systemLog.diagnostic({ task_id: `task-${Date.now()}`, has_error: true, error_text: "synthetic background failure " + "long-error-".repeat(600), recalled_memories: [], created_at: Date.now() / 1000 }, "ws"),
  __detailAppendRequest: () => systemLog.snapshots([capture("gemini-request", gemini, "gemini-wire-" + "long-model-name-".repeat(20), "gemini")]),
});
function App() {
  const [open, setOpen] = useState(true);
  return <ToastProvider><button onClick={() => setOpen(true)}>系统日志</button><SystemLogDialog open={open} onClose={() => setOpen(false)} /></ToastProvider>;
}
createRoot(document.getElementById("root")!).render(<App />);
