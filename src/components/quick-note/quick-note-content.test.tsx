import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import * as client from "@/domain/quick-note";
import { normalizeOutput, type QuickNote } from "@/domain/quick-note";
import { createQuickNoteController } from "@/application/quick-note/quick-note-controller";
import { QuickNoteOutput } from "./QuickNoteSection";
import { QuickNoteProse } from "./QuickNoteProse";
import { QuickNoteSummary, collapseQuickNoteDialogue } from "./QuickNoteSummary";
import { QuickNoteEditorFields } from "./QuickNoteEditor";
import { quickNoteFragments, quickNoteLinePrefix, quickNoteSummaryPanels } from "./quick-note-content-presentation";

describe("Quick Note saved Step 2 annotations", () => {
  it("recognizes complete fragments anywhere and preserves all source text for reconstruction", () => {
    const raw = "开头\r\n[HEART: 温暖的一刻\n第二行 ]\n普通段落\n[DRIFT:冷静想法]后文[HEART:再次出现]<br>结尾";
    const parts = quickNoteFragments(raw);
    expect(parts.filter((part) => part.kind !== "text").map((part) => part.kind)).toEqual(["HEART", "DRIFT", "HEART"]);
    expect(parts.map((part) => part.kind === "text" ? part.text : part.raw).join("")).toBe(normalizeOutput(raw));
    const html = renderToStaticMarkup(<QuickNoteOutput output={raw} />);
    expect((html.match(/data-quick-note-fragment=/g) ?? []).length).toBe(3);
    for (const text of ["开头", "温暖的一刻\n第二行", "普通段落", "冷静想法", "后文", "再次出现", "结尾"]) expect(html).toContain(text);
    expect(html).toContain("text-rose-foreground");
    expect(html).toContain("text-lavender-foreground");
    expect(html).toContain("border-l-2");
    expect(html).not.toMatch(/mist-|shadow-|bg-/);
    expect(raw).toContain("[HEART:");
  });

  it.each([
    "[HEART:没有结束", "[DRIFT:没有结束\n[HEART:看似完整]", "[HEART:外层[DRIFT:内层]尾]",
    "[其他[HEART:嵌套]]", "[HEART:空边界]]", "[HEART:]", "[DRIFT:   ]", "[heart:小写]", "[HEART：全角冒号]",
    "\\[HEART:转义]", "[HEART:转义结尾\\]还有内容]", "普通 [方括号] 与原文",
  ])("keeps uncertain or unsupported fragment syntax intact: %s", (raw) => {
    expect(quickNoteFragments(raw)).toEqual([{ kind: "text", text: raw }]);
    const html = renderToStaticMarkup(<QuickNoteOutput output={raw} />);
    expect(html).toContain(raw);
    expect(html).not.toContain("data-quick-note-fragment");
  });

  it("does not promote nested markers but can still recognize a following independent fragment", () => {
    const parts = quickNoteFragments("[HEART:外[DRIFT:内]尾] 原文 [DRIFT:明确]");
    expect(parts).toEqual([{ kind: "text", text: "[HEART:外[DRIFT:内]尾] 原文 " }, { kind: "DRIFT", text: "明确", raw: "[DRIFT:明确]" }]);
  });

  it("escapes HTML in annotations, prefixes and surrounding prose", () => {
    const html = renderToStaticMarkup(<QuickNoteOutput output={'<script>恶意()</script>\n[HEART:<img src=x onerror="坏()">]\n我：<b>原话</b>'} />);
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img");
    expect(html).toContain("&lt;b&gt;原话&lt;/b&gt;");
    expect(html).not.toMatch(/<script|<img|<b>/);
  });
});

describe("Quick Note conservative prefix colors", () => {
  it.each([
    ["情绪状态变化：", "user"], ["  饮食与作息:", "user"], ["苏轩：原话", "user"], ["另一人: 原话", "user"],
    ["Alice: Original", "user"], ["我：原话", "ai"], ["\t我 : 原话", "ai"], ["- 我：原话", "ai"],
    ["我的想法：原话", "user"], ["我自己：原话", "user"],
  ] as const)("classifies only the prefix of %s as %s", (line, tone) => {
    const prefix = quickNoteLinePrefix(line);
    expect(prefix?.tone).toBe(tone);
    expect(prefix && prefix.leading + prefix.prefix + prefix.body).toBe(line);
    const html = renderToStaticMarkup(<QuickNoteProse text={line} />);
    expect(html).toContain(`data-quick-note-prefix="${tone}"`);
    expect(html).toContain(tone === "ai" ? "quick-note-ai-prefix" : "text-primary-ink");
    if (prefix?.body) expect(html).toContain(`</strong>${prefix.body}`);
  });

  it.each([
    "20:24", "20:24–20:34", "2026-10-16 20:24", "她说，苏轩：原话", "这是一段普通的叙述：保留", "句子中间提到时间 20:24",
    "https://example.com", "C:\\notes\\today", "“我”：被引用的标签", '"我": JSON 原文', "没有冒号的普通段落",
  ])("leaves timestamps, URLs and uncertain/inline colons unstyled: %s", (line) => {
    expect(quickNoteLinePrefix(line)).toBeNull();
    expect(renderToStaticMarkup(<QuickNoteProse text={line} />)).not.toContain("data-quick-note-prefix");
  });

  it("preserves original paragraph spacing and uses live theme variables", () => {
    const html = renderToStaticMarkup(<QuickNoteProse text={"情绪状态变化：\n\n我：第一句\n苏轩：第二句\n\n普通段落"} />);
    expect(html).toContain("</strong>\n\n");
    expect(html).toContain("第二句\n\n普通段落");
    const css = readFileSync(new URL("./quick-note.css", import.meta.url), "utf8");
    expect(css).toContain("var(--color-ai) 65%, var(--color-foreground) 35%");
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});

describe("Quick Note independent Step 1 disclosures", () => {
  it("renders two closed sibling disclosures with no required outer fold", () => {
    const html = renderToStaticMarkup(<QuickNoteSummary summary={'{"事件归纳":"事件正文","关键对话":"我：对话正文"}'} />);
    expect((html.match(/<details\b/g) ?? []).length).toBe(2);
    expect(html).toContain('data-quick-note-summary-kind="events"');
    expect(html).toContain('data-quick-note-summary-kind="dialogue"');
    expect(html).not.toMatch(/<details[^>]*\sopen(?:=|>)/);
    let depth = 0;
    for (const match of html.matchAll(/<details\b|<\/details>/g)) {
      depth += match[0] === "</details>" ? -1 : 1;
      expect(depth).toBeLessThanOrEqual(1);
    }
    expect(depth).toBe(0);
    expect(html).not.toContain("对话摘要（辅助整理");
    expect(html).toContain("收起关键对话");
    expect(html).not.toMatch(/overflow-y|max-h|mist-|shadow-/);
  });

  it("omits absent/empty known parts while preserving unknown fields and their order", () => {
    expect(quickNoteSummaryPanels('{"事件归纳":null,"关键对话":[],"unknown":null}')).toEqual([{ title: "unknown", kind: "fallback", value: null }]);
    for (const summary of ["", "  ", "{}", '{"事件归纳":"","关键对话":{}}']) expect(renderToStaticMarkup(<QuickNoteSummary summary={summary} />)).toBe("");
    const panels = quickNoteSummaryPanels('{"before":"前","关键对话":"原话","extra":{"zero":0,"flag":false,"empty":[]},"事件归纳":"事件"}');
    expect(panels.map((panel) => panel.title)).toEqual(["before", "关键对话", "extra", "事件归纳"]);
    const html = renderToStaticMarkup(<QuickNoteSummary summary={JSON.stringify(Object.fromEntries(panels.map((panel) => [panel.title, panel.value])))} />);
    for (const value of ["前", "原话", "zero", "0", "flag", "false", "empty", "[]", "事件"]) expect(html).toContain(value);
  });

  it("formats explicit time/original/note fields and speaker/text pairs without reordering content", () => {
    const summary = JSON.stringify({ "关键对话": [
      { time: "20:24–20:34", content: [{ speaker: "苏轩", text: "第一句" }, { speaker: "我", text: "第二句" }], reason: "可靠字段里的说明", extra: "未知字段仍保留" },
      { "时间范围": "次日 00:02 至 00:08", "原文": "没有标签的连续原文\n下一行", "补充说明": "另一段说明" },
    ] });
    const html = renderToStaticMarkup(<QuickNoteSummary summary={summary} />);
    expect(html).toContain("text-xs text-muted-foreground\">20:24–20:34");
    expect(html).toContain('data-quick-note-prefix="user">苏轩</strong>：');
    expect(html).toContain('data-quick-note-prefix="ai">我</strong>：');
    expect(html).toContain("border-l border-border pl-3");
    const ordered = ["20:24–20:34", "第一句", "第二句", "可靠字段里的说明", "未知字段仍保留", "次日 00:02 至 00:08", "没有标签的连续原文\n下一行", "另一段说明"];
    let previous = -1;
    for (const value of ordered) { const index = html.indexOf(value); expect(index).toBeGreaterThan(previous); previous = index; }
  });

  it("keeps free text, unusual field shapes and non-adjacent text/speaker fields intact", () => {
    const summary = JSON.stringify({ "关键对话": [
      "20:24 到 20:34\n自由叙述，没有标准标签\n原文与说明无法区分",
      { text: "先出现的文字", unknown: { nested: [true, null, 42] }, speaker: "后出现的说话者", time_range: ["不稳定", "格式"] },
    ] });
    const html = renderToStaticMarkup(<QuickNoteSummary summary={summary} />);
    for (const value of ["20:24 到 20:34\n自由叙述，没有标准标签\n原文与说明无法区分", "nested", "true", "null", "42", "不稳定", "格式"]) expect(html).toContain(value);
    expect(html.indexOf("先出现的文字")).toBeLessThan(html.indexOf("后出现的说话者"));
    expect(html).not.toContain("border-l border-border pl-3");
  });

  it.each(["旧摘要\n第二行", "{非法JSON\n完整原文", "null", '"旧 JSON 字符串"', '["旧原文",{"未知":false}]', '{"未知字段":"<script>恶意()</script>"}'])("retains safe legacy fallback: %s", (summary) => {
    const html = renderToStaticMarkup(<QuickNoteSummary summary={summary} />);
    expect(html).toContain("<details");
    expect(html).not.toContain("<script");
    expect(html).not.toContain('data-quick-note-summary-kind="events"');
    expect(html).not.toContain('data-quick-note-summary-kind="dialogue"');
    if (summary.includes("非法JSON")) expect(html).toContain("{非法JSON\n完整原文");
    if (summary.includes("script")) expect(html).toContain("&lt;script&gt;恶意()&lt;/script&gt;");
  });

  it("bounds recursive rendering and keeps deeply nested saved data as text", () => {
    const raw = "[".repeat(10_000) + '"深层原文"' + "]".repeat(10_000);
    const html = renderToStaticMarkup(<QuickNoteSummary summary={raw} />);
    expect(html).toContain("深层原文");
    expect(html).not.toContain("overflow-y");
  });

  it("collapses only the requested dialogue and returns focus without animated page scrolling", () => {
    const dialogue = { open: true };
    const events = { open: true };
    const trigger = { focus: vi.fn(), scrollIntoView: vi.fn() };
    collapseQuickNoteDialogue(dialogue, trigger);
    expect(dialogue.open).toBe(false);
    expect(events.open).toBe(true);
    expect(trigger.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(trigger.scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "instant" });
    expect(() => collapseQuickNoteDialogue(null, null)).not.toThrow();
  });
});

it("keeps annotation delimiters and original prefix text in the editor and save payload", async () => {
  const output = "[HEART:原始片段]\n我：原话\n[DRIFT:想法]\n不完整 [HEART:保留";
  const note: QuickNote = { id: "raw-note", periodStart: 1792098000, periodEnd: 1792126800, periodLabel: "历史时段", summary: "", output, createdAt: 1792130000 };
  const save = vi.fn().mockResolvedValue(undefined);
  const controller = createQuickNoteController({ ...client,
    getTriggerConfig: vi.fn().mockResolvedValue({ hours: [5, 13], labels: { "5": "夜晚", "13": "上午" }, dayBoundaryHour: 5, timeZone: "Asia/Shanghai" }),
    listQuickNotes: vi.fn().mockResolvedValue({ items: [note], page: 1, pageSize: 10, total: 1, hasMore: false }),
    readQuickNote: vi.fn().mockResolvedValue(note), saveQuickNote: save,
  }, () => Date.parse("2026-10-16T02:00:00Z"));
  try {
    await controller.loadConfig();
    renderToStaticMarkup(<QuickNoteOutput output={note.output} />);
    controller.beginEdit(note);
    expect(controller.getState().editor?.draft).toBe(output);
    const html = renderToStaticMarkup(<QuickNoteEditorFields editor={controller.getState().editor!} busy={false} onChange={vi.fn()} />);
    expect(html).toContain(output);
    const draft = output + "\n苏轩：新原文";
    controller.changeDraft(draft);
    await controller.saveEditor();
    expect(save).toHaveBeenCalledWith(note.id, draft, expect.any(Object));
    expect(note.output).toBe(output);
  } finally { controller.dispose(); }
});
