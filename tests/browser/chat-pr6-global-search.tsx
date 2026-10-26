// Extend the existing real Workspace/Send fixture with synthetic global reads.
import "./chat-pr6-search";
import { messageWire } from "/src/test-fixtures/main-chat-wire.ts";
const original = window.fetch;
const calls: string[] = [];
let failNext = true;
let newestEnd: number | null = null;
Object.assign(window, { pr6c: { calls } });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
window.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.href);
  if (url.pathname === "/api/conversations/messages/search") {
    calls.push(url.pathname + url.search);
    const end = Number(url.searchParams.get("range_end") ?? 1793059200);
    newestEnd ??= end;
    const start = Number(url.searchParams.get("range_start") ?? end - 2592000);
    const cursor = url.searchParams.get("cursor");
    const q = url.searchParams.get("q")!;
    if (q === "error" && cursor && failNext) { failNext = false; return json({}, 503); }
    const pending = q === "关键词" && !cursor && end === newestEnd;
    const next = pending ? "scan" : cursor === "scan" || q === "error" && !cursor ? "match" : null;
    return json({ range_start: start, range_end: end, match_version: 1, total: null,
      next_cursor: next, has_more: !!next, page_status: pending ? "scan_pending" : next ? "ready" : "complete",
      items: pending ? [] : [{ conversation_id: "other", conversation_title: "书架与秋日 · 合成会话",
        message_id: q === "missing" ? "missing" : end < newestEnd ? "old-source" : "source",
        created_at: start + 100, role: "assistant", public_revision: "synthetic",
        snippets: [{ segment_key: "body", text: `一段带有${q}的公开正文。`, match_ranges: [[5,5+Array.from(q).length]] }],
      }] });
  }
  if (url.pathname === "/api/conversations/other/public-title") {
    calls.push(url.pathname); return json({ conversation_id: "other", conversation_title: "书架与秋日 · 当前名称" });
  }
  if (url.pathname === "/api/conversations/other/messages/window") {
    calls.push(url.pathname + url.search);
    const anchor = url.searchParams.get("anchor_id");
    if (anchor === "missing") return json({ detail: { code: "history_not_found" } }, 404);
    return json({ conversation_id: "other", anchor_id: anchor, older_cursor: null, newer_cursor: null,
      has_older: false, has_newer: false, reaches_latest: true, page_status: "ready",
      messages: Array.from({ length: 5 }, (_, i) => ({ ...messageWire({ id: i === 2 ? anchor! : `context-${i}`, conv_id: "other",
        role: i % 2 ? "user" : "assistant", created_at: 1793000000 + i,
        content: `**公开原文 ${i}** [标签](https://example.invalid/PRIVATE) ![私密图片](https://example.invalid/private.png)` }),
        search_segments: [{ segment_key: "body", text: `公开原文 ${i} 标签` }],
      })) });
  }
  return original(input, init);
};
