// Synthetic public-history examples shared by reading tests. No instance data.
import { messageWire } from "./main-chat-wire";

export const memoryBody = "你喜欢在周末早晨留一点不被打扰的时间，先泡茶，再慢慢整理一周的读书笔记。需要准备出行时，提醒应尽量简短清楚，把必须携带的证件、钥匙和水杯放在最前面。".repeat(5);
export const memoryKeywords = ["周末", "泡茶", "读书笔记", "出行", "证件", "钥匙", "水杯", "简短提醒"];
export function readonlySystemWire(id: string, title: string, capability: string,
  fields: readonly { label: string; text: string }[], status = "success", notices: readonly string[] = []) {
  const public_display = { version: 1, kind: "operation", title, capability, status, fields, notices };
  return { ...messageWire({ id, conv_id: "other", role: "system", content: "PRIVATE_RAW_COMMAND", created_at: 1792976100,
    public_view_version: 1 }), public_display,
    search_segments: [{ segment_key: "display.title", text: title },
      ...fields.flatMap((field, i) => [{ segment_key: `display.label:${i}`, text: field.label }, { segment_key: `display.field:${i}`, text: field.text }]),
      ...notices.map((text, i) => ({ segment_key: `display.notice:${i}`, text }))] };
}
export const readonlyMemoryWire = (id = "memory") => readonlySystemWire(id, "写入记忆", "MEMORY_WRITE", [
  { label: "记忆正文", text: memoryBody }, { label: "重要度", text: "0.8" },
  { label: "关键词", text: JSON.stringify(memoryKeywords) }, { label: "记忆 ID", text: "synthetic-memory-28" },
]);
export const readonlyAlarmWire = (id = "alarm") => readonlySystemWire(id, "设置闹铃", "ALARM", [
  { label: "内容", text: "出门前带上证件、钥匙和水杯。" }, { label: "时间", text: "08:55" },
]);
export function readonlyToolWire(id = "tool") {
  return { ...messageWire({ id, conv_id: "other", role: "system", content: "PRIVATE_RAW_COMMAND", created_at: 1792976160,
    public_view_version: 1, public_display: { version: 1, kind: "result", title: "远程工具结果", capability: "tools", status: "partial",
      calls: [{ server: "notes", tool: "append", status: "failed", args: { token: "PRIVATE_ARGS" }, error: "服务暂时不可用", storage_truncated: true }], notices: [] } }),
    search_segments: [{ segment_key: "display.title", text: "远程工具结果" },
      { segment_key: "tool:0.server", text: "notes" }, { segment_key: "tool:0.tool", text: "append" },
      { segment_key: "tool:0.error", text: "服务暂时不可用" }, { segment_key: "tool:0.result", text: "本次未能写入，已有内容未受影响。" }] };
}
function ordinary(id: string, role: string, text: string, stamp: number) {
  return { ...messageWire({ id, conv_id: "other", role, content: text, created_at: stamp, drift: null, thinking: null }),
    search_segments: [{ segment_key: "body", text }] };
}
export function readonlyReadingWindow(anchor: string, mixed = false) {
  if (mixed) return [
    ordinary("context-0", "user", "帮我记住周末的习惯，再设一个明早出门前的提醒。", 1792976000),
    readonlyMemoryWire(), readonlyAlarmWire(anchor),
    ordinary("context-3", "assistant", "提醒已经保存。周末的那段习惯也留在记忆里了，下次安排出行时可以再一起看看。", 1792976120), readonlyToolWire(),
  ];
  return [
    ordinary("context-0", "user", "今天把书架整理好了，发现好多以前做过标记的书。", 1792976000),
    ordinary("context-1", "assistant", "翻到以前留下的标记，像是碰见了过去的自己。有没有哪一段，现在读起来有了新的感觉？", 1792976030),
    ordinary(anchor, "user", "有一句关于日常生活的话。以前只觉得好听，现在慢慢明白，能安静地喝茶、读完几页书，其实就已经很好。", 1792976060),
    ordinary("context-3", "assistant", "那就把这些小事留在今天吧。不必急着把每一个下午都填满，书架整理好以后，也给自己留一处舒服的位置。", 1792976090),
    ordinary("context-4", "user", "嗯，明天早上想泡一壶茶，再把这一章读完。", 1792976120),
  ];
}
