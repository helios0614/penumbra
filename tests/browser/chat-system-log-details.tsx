import { useState } from "react";
import { createRoot } from "react-dom/client";
import { SystemLogDialog } from "../../src/components/chat/SystemLogDialog";
import { ToastProvider } from "../../src/components/ui/toast";
import { systemLog } from "../../src/application/chat-system-log/chat-system-log-store";
import "../../src/index.css";
const context = { executionId: "send:synthetic-ui", conversationId: "a", kind: "send" as const };
const payload = JSON.stringify({ model: "synthetic-wire", messages: [{ role: "user", content: "SYNTHETIC_FIRST" }, { role: "developer", content: "[HEART:ALLOWED_SYNTHETIC]" }, { role: "assistant", content: null }], tools: [{ type: "function", function: { name: "synthetic-read", description: "safe tool description", parameters: { type: "object", properties: { n: { type: "integer" } } } } }], temperature: 0, tool_choice: "auto" });
systemLog.begin(context);
systemLog.diagnostic({ msg_id: "synthetic-msg", model: "synthetic-model", api_format: "openai", has_error: false, usage: { prompt_tokens: 0, completion_tokens: 5, total_tokens: 5 },
  recall_topic: "synthetic topic", recall_query: "q".repeat(300), is_search_needed: false, prompt_count: 0,
  recalled_memories: [], debug_top6: [{ content: "SYNTHETIC_CANDIDATE_" + "x".repeat(5000), score: .3784, vec_sim: .572, kw_score: null, importance: .4 }],
  quick_notes: [{ date: "2026-10-26", period_label: "上午", time_range: "05:00–13:00", output: "[HEART:NEVER_SHOW]" }, { date: "2026-10-27", period_label: "下午", output: "synthetic safe note" }],
  api_response: { events: [{ event: "message_start", data: { message: { model: "synthetic-return", usage: { input_tokens: 0 } } } }] } }, "sse", context);
systemLog.snapshots([{ id: "ui-request", execution_id: context.executionId, conversation_id: "a", kind: "send", created_at: Date.now() / 1000, model: "synthetic-wire", protocol: "openai", source: "provider", stage: "http_json_before_send", endpoint: "https://synthetic.invalid", payload_json: payload, complete: true, limitations: [] }]);
Object.assign(window, { __detailPayload: payload, __detailAppend: () => systemLog.diagnostic({ task_id: `task-${Date.now()}`, has_error: true, error_text: "synthetic background failure", created_at: Date.now() / 1000 }, "ws") });
function App() {
  const [open, setOpen] = useState(true);
  return <ToastProvider><button onClick={() => setOpen(true)}>系统日志</button><SystemLogDialog open={open} onClose={() => setOpen(false)} /></ToastProvider>;
}
createRoot(document.getElementById("root")!).render(<App />);
