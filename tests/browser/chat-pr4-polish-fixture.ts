/** Disposable public DTOs for manual UI review. No model, tools or user data. */
import matrix from "./chat-pr4-legacy-matrix.json";

export function polishFixture() {
  const body = Array.from({ length: 90 }, (_, index) => `第 ${index + 1} 段：这是实际提交的合成论坛正文。\n正文包含「嵌套“引号”」和自然换行，用来检查阅读、选择与完整复制。`).join("\n\n");
  const result = JSON.stringify({ success: true, message_id: "synthetic-45304", event_points: { awarded: true, earned: 2, reason: "reply" } });
  const base = matrix.cases[0].raw;
  const row = (id: string, display: Record<string, unknown>) => ({ ...base, id, content: "", public_display: display });
  const call = (overrides: Record<string, unknown> = {}) => ({ server: "community", tool: "forum_write", status: "success", result_version: 1,
    args: { action: "reply", thread_id: 3502, content: body }, result, ai_result: result, ai_delivery: "unknown", original_length: result.length, ...overrides });
  return [
    matrix.cases.find(test => test.id === "memory")!.paired,
    matrix.cases.find(test => test.id === "todo")!.paired,
    row("polish-single", { version: 1, kind: "result", capability: "tools", title: "工具执行", calls: [call()] }),
    matrix.cases.find(test => test.id === "activity")!.paired,
    matrix.cases.find(test => test.id === "location")!.paired,
    row("polish-multiple", { version: 1, kind: "result", capability: "tools", title: "工具执行", notices: ["此批次包含成功、失败和未知结果，分别查看实际回执。"], calls: [
      call({ result: { content: [{ type: "text", text: "主要返回正文\n" + body }], diagnostic: "完整结构仅在技术详情显示" }, ai_result: "为 AI 准备的短结果", ai_truncated: true, ai_delivery: "prepared" }),
      call({ tool: "opaque_schema", status: "failed", args: { nested: Array.from({ length: 100 }, (_, i) => ({ id: i, payload: "长参数".repeat(20) })) },
        executed_args: { retry: false }, result: "实际失败回执\n".repeat(400), error: "合成失败，工具未返回预期回执", ai_result: "失败摘要", ai_delivery: "not_requested", storage_truncated: true }),
      call({ tool: "unknown_result", status: "unknown", result: "结果仍待确认", ai_result: "不同的 AI 内容", ai_delivery: "unknown" }),
    ] }),
    matrix.cases.find(test => test.id === "unknown")!.paired,
    { ...base, id: "polish-tail", role: "assistant", content: "展开和收起上方不同卡片，检查阅读位置是否保持；再滚到详情末尾核对复制入口及 Composer 的间距。", public_display: null },
  ];
}
