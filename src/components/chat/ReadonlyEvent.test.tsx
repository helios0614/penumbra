import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { mapMessage } from "@/domain/message/message-mappers";
import { messageWire } from "@/test-fixtures/main-chat-wire";
import { readonlyMemoryWire, readonlyAlarmWire, readonlyToolWire, readonlySystemWire, memoryBody } from "@/test-fixtures/readonly-conversation-wire";
import { ReadonlyEvent } from "./ReadonlyEvent";
import { ReadonlyConversation, ReadonlyPublicBody } from "./ReadonlyConversation";
import { readonlyEventPresentation } from "./readonly-event-presentation";
import { find } from "./test-utils/hook-session";

it("uses public memory body as the primary text, with weak metadata and complete disclosed fields", () => {
  const message = mapMessage(readonlyMemoryWire());
  const view = readonlyEventPresentation(message);
  expect(view.primary?.text).toBe(memoryBody);
  expect(view.metadata).toEqual(["重要度 0.8", "关键词 8 个"]);
  expect(view.details.some(row => row.text === "synthetic-memory-28")).toBe(true);
  const html = renderToStaticMarkup(<ReadonlyEvent message={message} />);
  const beforeDetails = html.slice(0, html.indexOf("<details"));
  expect(beforeDetails).not.toContain("synthetic-memory-28"); expect(beforeDetails).not.toContain("简短提醒");
  expect(html).toContain(memoryBody); expect(html).not.toContain("<details open");
  expect(html).not.toContain("PRIVATE_RAW_COMMAND");
});

it("keeps an alarm compact, with literal operation time and reminder text rather than stacked form labels", () => {
  const html = renderToStaticMarkup(<ReadonlyEvent message={mapMessage(readonlyAlarmWire())} target />);
  expect(html).toContain("设置闹铃"); expect(html).toContain("08:55"); expect(html).toContain("出门前带上证件、钥匙和水杯。");
  expect(html).toContain("时间 "); expect(html).toContain("内容：");
  expect(html).not.toContain("<dt"); expect(html).not.toContain("<details"); expect(html).toContain("当前关注");
});

it("shows all target event text without a preview clamp and opens secondary public fields", () => {
  const html = renderToStaticMarkup(<ReadonlyEvent message={mapMessage(readonlyMemoryWire())} target />);
  expect(html).toContain('open=""'); expect(html).not.toContain("line-clamp-3");
  expect(html.slice(0, html.indexOf("<details"))).toContain(memoryBody);
  expect(html).toContain("synthetic-memory-28");
});

it("keeps failure, partial status, errors and truncation visible outside folded detail", () => {
  const html = renderToStaticMarkup(<ReadonlyEvent message={mapMessage(readonlyToolWire())} />);
  const visible = html.split("<details")[0]!;
  for (const text of ["部分完成", "调用 1 · 失败", "截断标记", "服务暂时不可用", "不代表业务操作已完成"]) expect(visible).toContain(text);
  for (const text of ["PRIVATE_ARGS", "PRIVATE_RAW_COMMAND", "复制", "重新生成", "发送", "<button", "<audio", "<img"]) expect(html).not.toContain(text);
});

it.each(["sent", "unknown", "failed", "timeout"])("does not infer success from a title when the explicit status is %s", status => {
  const wire = readonlyAlarmWire();
  const html = renderToStaticMarkup(<ReadonlyEvent message={mapMessage({ ...wire, public_display: { ...wire.public_display, status } })} />);
  expect(html).not.toContain("已完成");
  expect(html).toContain({ sent: "已发出", unknown: "结果未知", failed: "失败", timeout: "超时" }[status]!);
});

it("preserves legacy, malformed and orphan fields without inspecting raw command or capabilities field text", () => {
  const message = mapMessage({ ...messageWire({ role: "system", content: "RAW_SECRET", public_view_version: 1,
    public_display: { version: 1, kind: "operation", capability: "legacy-text", title: "PRIVATE_TITLE", status: "unknown", fields: [{ label: "调用参数", text: "PRIVATE_ARGS" }] } }),
    search_segments: [{ segment_key: "display.label:2", text: "孤立的旧标签" }, { segment_key: "display.field:4", text: "旧系统公开记录" }] });
  const html = renderToStaticMarkup(<ReadonlyEvent message={message} target />);
  expect(html).toContain("旧系统公开记录"); expect(html).toContain("孤立的旧标签"); expect(html).toContain("结果未知");
  for (const text of ["RAW_SECRET", "PRIVATE_TITLE", "PRIVATE_ARGS", "调用参数"]) expect(html).not.toContain(text);
});

it("retains mixed system messages in their persisted order and only marks the actual target", () => {
  const messages = [mapMessage(messageWire({ id: "user", role: "user" })), mapMessage(readonlyMemoryWire()),
    mapMessage(readonlyAlarmWire()), mapMessage(readonlyToolWire())];
  const html = renderToStaticMarkup(<ReadonlyConversation messages={messages} targetId="alarm" />);
  expect((html.match(/data-context-message=/g) ?? [])).toHaveLength(4);
  expect((html.match(/aria-current="true"/g) ?? [])).toHaveLength(1);
  expect(html.indexOf('data-context-message="memory"')).toBeLessThan(html.indexOf('data-context-message="alarm"'));
});

it("keeps explicit Web receipt failure visible with only safe query and source text", () => {
  const message = mapMessage({ ...messageWire({ id: "web", content: "PRIVATE_BODY", web_search_results: [{ id: "web-1", conv_id: "conv_a", source_message_id: "web", query: "PRIVATE_QUERY", status: "failed", sources: [] }] }),
    search_segments: [{ segment_key: "web:0.query", text: "公开检索词" }, { segment_key: "web:0.source:0.title", text: "公开来源标题" }] });
  const html = renderToStaticMarkup(<ReadonlyEvent message={message} />);
  expect(html.split("<details")[0]).toContain("失败"); expect(html).toContain("网页搜索");
  expect(html).toContain("公开检索词"); expect(html).toContain("公开来源标题");
  expect(html).not.toContain("PRIVATE_QUERY"); expect(html).not.toContain("PRIVATE_BODY");
});

it("keeps passive music metadata as text without introducing an execution status or media", () => {
  const message = mapMessage({ ...messageWire({ content: "PRIVATE_BODY" }), search_segments: [
    { segment_key: "music:0.name", text: "公开歌名" }, { segment_key: "music:0.artist", text: "公开歌手" },
  ] });
  const html = renderToStaticMarkup(<ReadonlyPublicBody message={message} />);
  expect(html).toContain("公开歌名"); expect(html).toContain("公开歌手");
  for (const text of ["结果未知", "系统记录", "PRIVATE_BODY", "<audio", "<button"]) expect(html).not.toContain(text);
});

it.each(["记忆正文（旧通知）", "记忆内容", "旧记录正文", "记忆正文 "])("prefers public memory prose under %s over an importance-only summary", label => {
  const wire = readonlySystemWire("legacy-memory", "写入记忆", "MEMORY_WRITE", [
    { label: "重要度 ", text: "0.5" }, { label, text: "完整公开记忆正文" },
  ]);
  const message = mapMessage({ ...wire, public_display: { ...wire.public_display, summary: "重要度 0.5" },
    search_segments: [{ segment_key: "display.summary", text: "重要度 0.5" }, ...wire.search_segments] });
  expect(readonlyEventPresentation(message).primary?.text).toBe("完整公开记忆正文");
  expect(renderToStaticMarkup(<ReadonlyEvent message={message} />).split("<details")[0]).toContain("完整公开记忆正文");
});

it("accepts an explicitly public body or unlabeled field without reading canonical system text", () => {
  const wire = readonlyMemoryWire();
  for (const key of ["body", "display.field:8"]) {
    const message = mapMessage({ ...wire, search_segments: [
      { segment_key: "display.title", text: "写入记忆" }, { segment_key: "display.summary", text: "重要度 0.5" },
      { segment_key: key, text: "只有公开投影允许的正文" },
    ] });
    expect(readonlyEventPresentation(message).primary?.text).toBe("只有公开投影允许的正文");
    expect(renderToStaticMarkup(<ReadonlyEvent message={message} target />)).not.toContain("PRIVATE_RAW_COMMAND");
  }
});

it("uses public preview or summary only when there is no readable body, skipping empty body fields", () => {
  const wire = readonlySystemWire("empty-memory", "写入记忆", "MEMORY_WRITE", [{ label: "记忆正文", text: "  " }, { label: "重要度", text: "0.5" }]);
  for (const key of ["display.preview", "display.summary"]) {
    const message = mapMessage({ ...wire, search_segments: [...wire.search_segments, { segment_key: key, text: "可靠的公开摘要" }] });
    expect(readonlyEventPresentation(message).primary?.text).toBe("可靠的公开摘要");
  }
});

it("keeps complete metadata once while retaining additional keywords, IDs and a truncated field in details", () => {
  const wire = readonlyMemoryWire();
  const normal = renderToStaticMarkup(<ReadonlyEvent message={mapMessage({ ...wire,
    search_segments: [...wire.search_segments, { segment_key: "display.summary", text: "重要度 0.8" }] })} />);
  expect(normal.match(/重要度/g)).toHaveLength(1);
  expect(normal).toContain("synthetic-memory-28"); expect(normal).toContain("简短提醒");
  const longValue = "0.6 " + "公开附加说明".repeat(30);
  const longWire = readonlySystemWire("long-metadata", "写入记忆", "MEMORY_WRITE", [
    { label: "记忆正文", text: "公开正文" }, { label: "重要度", text: longValue },
  ]);
  const truncated = renderToStaticMarkup(<ReadonlyEvent message={mapMessage(longWire)} target />);
  expect(truncated).toContain("<dt"); expect(truncated).toContain(longValue); expect(truncated).toContain('open=""');
});

it("separates a literal reminder target time from the persisted recording time without guessing tomorrow", () => {
  const html = renderToStaticMarkup(<ReadonlyEvent message={mapMessage(readonlyAlarmWire())} />);
  expect(html).toContain("提醒时间"); expect(html).toContain("08:55"); expect(html).toContain("记录于 "); expect(html).not.toContain("明早");
});

it("does not relabel an explicit execution timestamp as a reminder target", () => {
  const wire = readonlySystemWire("executed", "设置闹铃", "ALARM", [{ label: "执行时间 ", text: "2026-10-26 00:59" }]);
  const html = renderToStaticMarkup(<ReadonlyEvent message={mapMessage(wire)} />);
  expect(html).toContain("执行时间"); expect(html).not.toContain("提醒时间"); expect(html).toContain("2026-10-26 00:59");
});

it.each(["记忆正文", "记忆正文（旧通知）", "记忆内容"])("omits the UI-generated %s prefix for target memory prose", label => {
  const wire = readonlySystemWire("prefix", "写入记忆", "MEMORY_WRITE", [
    { label, text: "2026年10月26日，公开保存的正文。" }, { label: "重要度", text: "0.6" }, { label: "记忆 ID", text: "persisted-memory" },
  ]);
  const html = renderToStaticMarkup(<ReadonlyEvent message={mapMessage(wire)} target />);
  const main = html.split("<details")[0]!;
  expect(main).toContain("2026年10月26日，公开保存的正文。"); expect(main).not.toContain(`${label}：`);
  expect(html).toContain("persisted-memory"); expect(html.match(/重要度/g)).toHaveLength(1);
});

it("preserves a memory prefix literally stored inside public body text", () => {
  const text = "记忆正文：这是持久内容本身，不得删改。";
  const wire = readonlySystemWire("literal-prefix", "写入记忆", "MEMORY_WRITE", [{ label: "记忆正文", text }]);
  const html = renderToStaticMarkup(<ReadonlyEvent message={mapMessage(wire)} target />);
  expect(html).toContain(text); expect(html.match(/记忆正文：/g)).toHaveLength(1);
});

it("keeps explicitly public body/preview structures unchanged and does not add a memory prefix", () => {
  for (const key of ["body", "display.preview"]) {
    const wire = readonlyMemoryWire();
    const message = mapMessage({ ...wire, search_segments: [{ segment_key: "display.title", text: "写入记忆" }, { segment_key: key, text: "公开正文" }] });
    const html = renderToStaticMarkup(<ReadonlyEvent message={message} target />);
    expect(html).toContain("公开正文"); expect(html).not.toContain("记忆正文：");
  }
});

it("groups the reading target with its timestamp separately from business completion status", () => {
  const tree = ReadonlyEvent({ message: mapMessage(readonlyMemoryWire()), target: true });
  const position = find(tree, "span", props => (props as Record<string, unknown>)["data-context-reading-position"] === true);
  const html = renderToStaticMarkup(position);
  expect(html).toContain("当前关注"); expect(html).toContain("记录于"); expect(html).toContain("阅读定位");
  expect(html).not.toContain("已完成");
});
