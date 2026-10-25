/** Disposable public DTOs for manual UI review. No model, tools or user data. */
import matrix from "./chat-pr4-legacy-matrix.json";

export function polishFixture() {
  const body = Array.from({ length: 90 }, (_, index) => `第 ${index + 1} 段：这是实际提交的合成论坛正文。\n正文包含「嵌套“引号”」和自然换行，用来检查阅读、选择与完整复制。`).join("\n\n");
  const result = JSON.stringify({ success: true, message_id: "synthetic-45304", event_points: { awarded: true, earned: 2, reason: "reply" } });
  const base = matrix.cases[0].raw;
  const row = (id: string, display: Record<string, unknown>) => ({ ...base, id, content: "", public_display: display });
  const range = "2026-10-24 09:00–10:00";
  const activity = "09:00–09:20 阅读文档；09:20–09:30 步行；其余时段缺少观测。";
  const position = "位置状态：在外面\n地址：示例街道\n距家 800 米（旧记录，不代表当前位置）";
  const call = (overrides: Record<string, unknown> = {}) => ({ server: "community", tool: "forum_write", status: "success", result_version: 1,
    args: { action: "reply", thread_id: 3502, content: body }, result, ai_result: result, ai_delivery: "response_received", original_length: result.length, ...overrides });
  return [
    matrix.cases.find(test => test.id === "memory")!.paired,
    row("polish-memory-long", { version: 1, kind: "operation", capability: "MEMORY_WRITE", title: "写入记忆", status: "success",
      fields: [{ label: "记忆 ID", text: "synthetic-memory-id" }, { label: "重要度", text: "0.6" }, { label: "记忆正文", text: body }] }),
    matrix.cases.find(test => test.id === "todo")!.paired,
    matrix.cases.find(test => test.id === "alarm")!.paired,
    row("polish-single", { version: 1, kind: "result", capability: "tools", title: "工具执行", calls: [call()] }),
    row("polish-undelivered", { version: 1, kind: "result", capability: "tools", title: "工具执行", calls: [
      call({ ai_delivery: "not_included", ai_truncated: true, storage_truncated: true, original_length: 40000, ai_result: "未交付的合成内容" }),
    ] }),
    matrix.cases.find(test => test.id === "activity")!.paired,
    matrix.cases.find(test => test.id === "location")!.paired,
    row("polish-activity-structured", { version: 1, kind: "operation", capability: "ACTIVITY_CHECK", title: "查看动态", status: "success", summary: `覆盖 ${range}`, preview: activity, preview_lines: 2,
      fields: [{ label: "动态摘要", text: activity }, { label: "摘要覆盖区间", text: range },
        { label: "旧通知全文", text: `[ACTIVITY_CHECK 成功]\n合成设备活动动态，摘要覆盖区间为${range}（按十分钟窗口整理）：\n\n【设备活动动态】\n${activity}` }] }),
    row("polish-activity-range-in-body", { version: 1, kind: "operation", capability: "ACTIVITY_CHECK", title: "查看动态", status: "unknown", summary: `覆盖 ${range}`, preview: `覆盖 ${range}\n${activity}`, preview_lines: 2,
      fields: [{ label: "动态结果", text: `覆盖 ${range}\n${activity}` }, { label: "摘要覆盖区间", text: range }, { label: "查询区间", text: "2026-10-24 09:00–10:01" }] }),
    row("polish-location-structured", { version: 1, kind: "operation", capability: "Location", title: "查询位置", status: "success", preview: position, preview_lines: 2,
      fields: [{ label: "位置结果", text: position }, { label: "旧通知全文", text: `[Location 成功]\n合成实时位置信息：\n\n${position}` }],
      notices: ["位置结果来自旧通知，不代表当前实时位置。"] }),
    matrix.cases.find(test => test.id === "music")!.paired,
    row("polish-multiple", { version: 1, kind: "result", capability: "tools", title: "工具执行", notices: ["此批次包含成功、失败和未知结果，分别查看实际回执。"], calls: [
      call({ result: { content: [{ type: "text", text: "主要返回正文\n" + body }], diagnostic: "完整结构仅在技术详情显示" }, ai_result: "为 AI 准备的短结果", ai_truncated: true, ai_delivery: "prepared" }),
      call({ tool: "opaque_schema", status: "failed", args: { nested: Array.from({ length: 100 }, (_, i) => ({ id: i, payload: "长参数".repeat(20) })) },
        executed_args: { retry: false }, result: "实际失败回执\n".repeat(400), error: "合成失败，工具未返回预期回执", ai_result: "失败摘要", ai_delivery: "not_requested", storage_truncated: true, original_length: 40000 }),
      call({ tool: "unknown_result", status: "unknown", result: "结果仍待确认", ai_result: "不同的 AI 内容", ai_delivery: "unknown" }),
    ] }),
    matrix.cases.find(test => test.id === "unknown")!.paired,
    { ...base, id: "polish-tail", role: "assistant", content: "展开和收起上方不同卡片，检查阅读位置是否保持；再滚到详情末尾核对复制入口及 Composer 的间距。", public_display: null },
  ];
}
