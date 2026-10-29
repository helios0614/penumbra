import { afterEach, describe, expect, it, vi } from "vitest";
import { backfillQuickNote, getTriggerConfig, listQuickNotes, readQuickNote, rerunQuickNote, saveQuickNote, saveTriggerConfig, streamQuickNoteLogs } from "./quick-note-client";
import { triggerConfigInput, triggerConfigRows } from "./quick-note-config";
import { normalizeOutput, normalizeSummary, parseIncomplete, parseQuickNote, parseQuickNoteLog, parseTriggerConfig } from "./quick-note-mappers";

const configDto = { hours: [20, 5, 13], labels: { "5": "夜晚", "13": "上午", "20": "下午" }, day_boundary_hour: 5, time_zone: "Asia/Shanghai", date_contract_error: null };
const noteDto = { id: "qn_1", period_start: 1792098000, period_end: 1792126800, period_label: "旧时段", summary: "", output: "", created_at: 1792130000 };
const note = parseQuickNote(noteDto);
const query = { page: 2, pageSize: 10, periodFrom: 1792098000, periodTo: 1792184400 };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
afterEach(() => vi.unstubAllGlobals());

describe("Quick Note DTOs and saved content", () => {
  it("preserves server order and hour-keyed labels without substituting historical labels", () => {
    const config = parseTriggerConfig(configDto);
    expect(config.hours).toEqual([20, 5, 13]);
    expect(config.labels).toEqual(configDto.labels);
    expect(note.periodLabel).toBe("旧时段");
  });
  it.each([
    { ...configDto, labels: ["夜晚", "上午", "下午"] },
    { ...configDto, labels: { "5": "夜晚" } },
    { ...configDto, day_boundary_hour: null },
    { ...configDto, day_boundary_hour: 4 },
    { ...configDto, time_zone: "Invalid/Zone" },
    { ...configDto, hours: [5, 5] },
    { ...configDto, hours: [5, 24] },
    { ...configDto, date_contract_error: { code: "invalid" } },
    { hours: [5], labels: { "5": "夜晚" } },
  ])("rejects unavailable date contracts instead of falling back", (value) => {
    expect(() => parseTriggerConfig(value)).toThrow();
  });
  it("normalizes only Step 1 summary fields, including legacy dialogue names and unknown data", () => {
    const sections = normalizeSummary(JSON.stringify({ "事件归纳": "一天<br>两件事", "关键对话": [{ time: "09:00", content: ["原句1", "原句2"], reason: "原因" }, { "时间范围": "10:00", "对话": "旧原文" }], extra: { count: 2 } }));
    expect(sections[0]).toEqual({ title: "事件归纳", text: "一天\n两件事" });
    expect(sections[1].text).toContain("time：09:00\ncontent：原句1\n\n原句2\nreason：原因");
    expect(sections[1].text).toContain("时间范围：10:00\n对话：旧原文");
    expect(sections[2]).toEqual({ title: "extra", text: "count：2" });
  });
  it.each(["旧的纯文本", "{broken", "null", '"旧格式"', '["第一条", {"unknown": true}]', ""])("tolerates malformed and old summaries: %s", (value) => {
    expect(() => normalizeSummary(value)).not.toThrow();
    if (value && value !== "null") expect(normalizeSummary(value).length).toBeGreaterThan(0);
  });
  it("does not project HEART or thinking fields into the Step 1 summary", () => {
    const value = parseQuickNote({ ...noteDto, summary: '{"事件归纳":"事件"}', heart_content: "HEART", thinking: "Step 2 thinking" });
    expect(Object.keys(value)).not.toContain("heart_content");
    expect(normalizeSummary(value.summary)).toEqual([{ title: "事件归纳", text: "事件" }]);
  });
  it("preserves complete output, markers, and literal HTML while converting legacy line breaks", () => {
    const text = "[DRIFT:test]\r\n[HEART:keep]<BR />第二行<br>第三行<script>alert(1)</script>";
    expect(normalizeOutput(text)).toBe("[DRIFT:test]\n[HEART:keep]\n第二行\n第三行<script>alert(1)</script>");
    expect(parseQuickNote({ ...noteDto, summary: null, output: null }).output).toBe("");
  });
  it("rejects invalid records and log DTOs without inventing generation status", () => {
    expect(() => parseQuickNote({ ...noteDto, period_end: noteDto.period_start })).toThrow();
    expect(() => parseQuickNoteLog({ seq: 1, ts: "today", level: "info", msg: "Step 1" })).toThrow();
    expect(parseQuickNoteLog({ seq: 1, ts: 1234, level: "future-level", msg: "── Step 2 ──" }).message).toBe("── Step 2 ──");
    expect(parseIncomplete({ items: [{ key: "k", date: "2026-10-16", period_label: "上午", period_start: 10, period_end: 20, end_hour: 13, status: "missing" }] })[0].endHour).toBe(13);
  });
});

describe("Quick Note HTTP and SSE contracts", () => {
  it("saves only hours and their remapped names, permitting repeated and empty names", async () => {
    const fetch = vi.fn().mockResolvedValue(json({ hours: [6, 14, 21], labels: { "6": "记录", "14": "记录", "21": "" } }));
    vi.stubGlobal("fetch", fetch);
    const input = triggerConfigInput([{ hour: "6", label: "记录" }, { hour: "14", label: "记录" }, { hour: "21", label: "" }]);
    await saveTriggerConfig(input);
    expect(String(fetch.mock.calls[0][0])).toContain("/api/quick-notes/trigger-config");
    expect(fetch.mock.calls[0][1].method).toBe("PUT");
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(input);
    expect(triggerConfigRows(parseTriggerConfig(configDto)).map((row) => row.hour)).toEqual(["20", "5", "13"]);
  });
  it.each(["", " ", "-1", "24", "1.5", "NaN", "1e1", "0x5"])("rejects invalid cutoff %s before sending", async (hour) => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    expect(() => triggerConfigInput([{ hour, label: "夜" }, { hour: "20", label: "日" }])).toThrow("整数");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects duplicates, crossing order, too few hours and mismatched label keys", async () => {
    vi.stubGlobal("fetch", vi.fn());
    for (const [hours, labels] of [
      [[5, 5], { "5": "重复" }], [[20, 5], { "20": "夜", "5": "日" }],
      [[5], { "5": "夜" }], [[5, 12], { "5": "夜", "13": "日" }],
      [[5, 12.5], { "5": "夜", "12.5": "日" }],
    ] as const) await expect(saveTriggerConfig({ hours, labels })).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("reads real config and requests paginated period_start bounds in Unix seconds", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(json(configDto)).mockResolvedValueOnce(json({ items: [noteDto], page: 2, page_size: 10, total: 11, has_more: false }));
    vi.stubGlobal("fetch", fetch);
    expect((await getTriggerConfig()).dayBoundaryHour).toBe(5);
    const page = await listQuickNotes(query);
    expect(page.items[0].periodLabel).toBe("旧时段");
    const url = new URL(String(fetch.mock.calls[1][0]), "http://localhost");
    expect(url.pathname).toBe("/api/quick-notes");
    expect(Object.fromEntries(url.searchParams)).toEqual({ page: "2", page_size: "10", period_from: "1792098000", period_to: "1792184400" });
  });
  it("keeps transport errors and invalid config responses observable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json({ error: "unavailable" }, 503)).mockResolvedValueOnce(json({ ...configDto, date_contract_error: "bad" })));
    await expect(getTriggerConfig()).rejects.toMatchObject({ status: 503 });
    await expect(getTriggerConfig()).rejects.toThrow("配置");
  });
  it("does not accept a legacy non-paginated response or inconsistent page", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json([noteDto])).mockResolvedValueOnce(json({ items: [], page: 1, page_size: 10, total: 0, has_more: false })));
    await expect(listQuickNotes(query)).rejects.toThrow();
    await expect(listQuickNotes(query)).rejects.toThrow("分页");
  });
  it("finds the saved record across exact-period pages for edit reconciliation", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(json({ items: [{ ...noteDto, id: "other" }], page: 1, page_size: 200, total: 201, has_more: true })).mockResolvedValueOnce(json({ items: [noteDto], page: 2, page_size: 200, total: 201, has_more: false }));
    vi.stubGlobal("fetch", fetch);
    expect((await readQuickNote(note))?.id).toBe("qn_1");
    const url = new URL(String(fetch.mock.calls[1][0]), "http://localhost");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("period_to")).toBe(String(note.periodStart + 1));
  });
  it("distinguishes ordinary retry from explicit overwrite, and accepted from completed", async () => {
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(json({ ok: true, accepted: true })));
    vi.stubGlobal("fetch", fetch);
    const input = { date: "2026-10-16", periodLabel: "上午", endHour: 13, overwrite: false };
    await backfillQuickNote(input);
    await backfillQuickNote({ ...input, overwrite: true });
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ date: "2026-10-16", period_label: "上午", end_hour: 13, overwrite: false });
    expect(JSON.parse(fetch.mock.calls[1][1].body).overwrite).toBe(true);
    fetch.mockResolvedValueOnce(json({ ok: true }));
    await expect(backfillQuickNote(input)).rejects.toThrow("结果");
  });
  it("wires Step 1 / Step 2 and save to the exact endpoints and preserves the full draft", async () => {
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(json({ ok: true })));
    vi.stubGlobal("fetch", fetch);
    await rerunQuickNote("id/1", "step1");
    await rerunQuickNote("id/1", "step2");
    await saveQuickNote("id/1", "[HEART:keep]\n正文");
    expect(String(fetch.mock.calls[0][0])).toContain("/api/quick-notes/id%2F1/re_step1");
    expect(String(fetch.mock.calls[1][0])).toContain("/api/quick-notes/id%2F1/re_step2");
    expect(fetch.mock.calls[2][1].method).toBe("PUT");
    expect(JSON.parse(fetch.mock.calls[2][1].body)).toEqual({ output: "[HEART:keep]\n正文" });
    fetch.mockResolvedValueOnce(json({ detail: "generation incomplete" }, 502));
    await expect(rerunQuickNote("qn_1", "step2")).rejects.toMatchObject({ status: 502 });
  });
  it("uses the shared SSE parser, replays from zero, and cancels its body on exit", async () => {
    const cancelled = vi.fn();
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode('id:1\ndata:{"seq":1,"ts":123,"level":"info","msg":"Step 1 开始"}\n\n')); }, cancel: cancelled });
    const fetch = vi.fn().mockResolvedValue(new Response(body, { headers: { "content-type": "text/event-stream; charset=utf-8" } }));
    vi.stubGlobal("fetch", fetch);
    const connected = vi.fn();
    const entries = [];
    for await (const entry of streamQuickNoteLogs(new AbortController().signal, connected)) { entries.push(entry); break; }
    expect(connected).toHaveBeenCalledOnce();
    expect(entries[0].message).toBe("Step 1 开始");
    expect(String(fetch.mock.calls[0][0])).toContain("last_seq=0");
    expect(cancelled).toHaveBeenCalledOnce();
  });
  it("rejects and cancels non-SSE log responses", async () => {
    const cancel = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new ReadableStream({ cancel }), { headers: { "content-type": "application/json" } })));
    const stream = streamQuickNoteLogs(new AbortController().signal, vi.fn());
    await expect(stream.next()).rejects.toThrow("SSE");
    expect(cancel).toHaveBeenCalledOnce();
  });
});
