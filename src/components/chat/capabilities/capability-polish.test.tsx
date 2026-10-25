import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mapCapabilityRecord } from "@/domain/message/capability-mappers";
import type { CapabilityRecord } from "@/domain/message/capability-types";
import { CapabilityMessage } from "./CapabilityMessage";
import { CapabilityDisclosure, CapabilityExpansionProvider } from "./CapabilityDisclosure";
import { CapabilityDetails, DetailField } from "./CapabilityDetails";
import { ToolCallDetails, toolDetailFields } from "./ToolCallDetails";
import { TriggerAnnotation } from "./TriggerAnnotation";
import { useCopyFeedback } from "../copy-feedback";
import { elements, find, hookSession } from "../test-utils/hook-session";
import { Button } from "@/components/ui/button";
import { CapabilityTechnicalDetails } from "./CapabilityTechnicalDetails";
import { systemOperationPresentation } from "./system-operation-presentation";
import matrix from "../../../../tests/browser/chat-pr4-legacy-matrix.json";

vi.mock("react", async importOriginal => {
  const actual = await importOriginal<typeof React>();
  return { ...actual, ...Object.fromEntries(["useState", "useRef", "useCallback", "useId", "useEffect", "useLayoutEffect", "useContext"].map(key => [key, vi.fn(actual[key as keyof typeof actual] as never)])) };
});
vi.mock("../copy-feedback", () => ({ useCopyFeedback: vi.fn(() => vi.fn()) }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const tool = (calls: Record<string, unknown>[] = [{}]) => mapCapabilityRecord({
  version: 1, kind: "result", capability: "tools", title: "工具执行",
  calls: calls.map(call => ({ server: "community", tool: "forum_write", status: "success",
    args: { content: "实际提交正文", thread_id: 3502 }, result: '{"success":true,"message_id":"45304"}', ...call })),
})!;

function expanded(record: CapabilityRecord, identities = ["batch"]) {
  // Seed the real provider's existing per-message UI cache; all children render.
  vi.spyOn(React, "useRef").mockReturnValueOnce({ current: new Map(identities.map(id => [id, true])) });
  return renderToStaticMarkup(<CapabilityExpansionProvider><CapabilityMessage record={record} identity="batch" /></CapabilityExpansionProvider>);
}

describe("system and MCP reading hierarchy", () => {
  it("shares the quiet folded row between memory, TODO, MCP and unknown legacy text", () => {
    const records = [
      mapCapabilityRecord({ version: 1, kind: "operation", capability: "MEMORY_WRITE", title: "记忆写入", status: "unknown", fields: [{ label: "旧版系统原文", text: "旧正文" }] })!,
      mapCapabilityRecord({ version: 1, kind: "operation", capability: "TODO", title: "添加待办", status: "success", fields: [{ label: "内容", text: "补货" }] })!,
      tool(),
      mapCapabilityRecord({ version: 1, kind: "operation", capability: "legacy-text", title: "旧版系统内容", fields: [{ label: "旧版系统原文", text: "正文包含 Location 和 MEMORY_WRITE，仅为说明" }] })!,
    ];
    for (const [index, record] of records.entries()) {
      const html = renderToStaticMarkup(<CapabilityMessage record={record} identity={`mixed:${index}`} />);
      expect(html).toContain('class="capability-disclosure');
      expect(html).toContain('class="capability-header');
      expect(html).toContain('aria-expanded="false"');
      expect(html).not.toMatch(/mist-solid|shadow|bg-surface|capability-detail-surface/);
    }
    const unknown = renderToStaticMarkup(<CapabilityMessage record={records[3]} identity="unknown" />);
    expect(unknown).toContain("lucide-file-text");
    expect(unknown).toContain("仅为说明");
    expect(unknown).not.toMatch(/lucide-map-pin|lucide-book-heart|已完成|结果未知/);
    expect(renderToStaticMarkup(<CapabilityMessage record={records[0]} identity="typed" />)).toContain("结果未知");
  });

  it.each([
    ["MEMORY_WRITE", "book-heart"], ["TODO", "list-checks"], ["TODO_DONE", "list-checks"],
    ["ALARM", "calendar-clock"], ["REMINDER", "calendar-clock"], ["Monitor", "calendar-clock"],
    ["schedule_wake", "calendar-clock"], ["ACTIVITY_CHECK", "activity"], ["Location", "map-pin"],
    ["camera_legacy", "camera"], ["CAM_CHECK", "camera"], ["tools", "wrench"], ["MCP", "wrench"],
    ["WEBSEARCH", "globe"], ["URL_READ", "globe"], ["MUSIC", "music"], ["unknown", "file-text"],
    ["schedule_alarm", "calendar-clock"], ["camera_sentinel", "camera"], ["activity_location", "map-pin"], ["keepalive_day", "sparkles"],
  ])("uses the authoritative %s type for the %s icon", (capability, icon) => {
    const html = renderToStaticMarkup(<CapabilityDisclosure identity="icon" title="通知" capability={capability} hasDetails={false} />);
    expect(html).toContain(`lucide-${icon}`);
  });

  it("opens one MCP directly to submitted prose and saved result with no second call toggle", () => {
    const html = expanded(tool());
    expect(html).toContain("实际提交正文");
    expect(html).toContain("45304");
    expect(html).toContain("community:forum_write");
    expect(html).not.toContain('data-capability="batch:call:0"');
    expect(html).not.toContain("远程调用");
    expect(html.match(/capability-detail-scroll/g)).toHaveLength(1);
    expect(html).toContain("技术详情");
    expect(html).not.toContain("thread_id");
  });

  it("keeps batch fields/notices and each call's independent status and expansion", () => {
    const record = { ...tool([{}, { status: "failed", error: "明确失败", result: "失败回执" }]),
      fields: [{ label: "批次说明", text: "独立批次元信息" }], notices: ["批次交付未知"] };
    const html = expanded(record, ["batch", "batch:call:1"]);
    expect(html).toContain("2 项调用");
    expect(html).toContain("部分完成");
    expect(html).toMatch(/data-capability="batch:call:0"[\s\S]*?aria-expanded="false"/);
    expect(html).toMatch(/data-capability="batch:call:1"[\s\S]*?aria-expanded="true"/);
    expect(html).toContain("明确失败");
    expect(html.match(/实际提交正文/g)).toHaveLength(1); // Only the second call is mounted.
    expect(html).not.toContain("45304");
    expect(html).toContain("独立批次元信息");
    expect(html).toContain("批次交付未知");
    expect(html.match(/capability-detail-scroll/g)).toHaveLength(1);
    expect(html.match(/capability-contained-details/g)).toHaveLength(1);
  });

  it("moves only known technical fields and duplicate result wrappers out of the primary reading area", () => {
    const record = tool([{ result: { content: [{ type: "text", text: "主要返回正文" }], diagnostic: 42 }, ai_result: "不同的 AI 有界结果" }]);
    const fields = record.calls[0].fields;
    const layout = toolDetailFields(fields);
    expect(layout.primary.map(field => field.label)).toEqual(["调用正文", "结果正文"]);
    expect(layout.technical.map(field => field.label)).toEqual(["调用参数", "已保存结果", "本次 AI 有界结果"]);
    expect([...layout.primary, ...layout.technical]).toHaveLength(fields.length);
    const closedTechnical = expanded(record);
    expect(closedTechnical).toContain("主要返回正文");
    expect(closedTechnical).not.toContain("diagnostic");
    const full = expanded(record, ["batch", "batch:call:0:technical"]);
    expect(full).toContain("diagnostic");
    expect(full).toContain("不同的 AI 有界结果");
    expect(full).not.toContain("内容与已保存结果一致");
  });

  it.each(["unknown", "prepared", "response_received", "not_requested"])("compacts exactly equal safe results without inferring AI delivery (%s)", ai_delivery => {
    const result = '{"success":true,"message_id":"45304"}';
    const record = tool([{ result, ai_result: result, ai_delivery }]);
    const html = expanded(record, ["batch", "batch:call:0:technical"]);
    expect(html).toContain("内容与已保存结果一致");
    expect(html.match(/45304/g)).toHaveLength(1);
    expect(html).toContain(record.calls[0].notices[0]);
    if (ai_delivery !== "response_received") expect(html).not.toContain("已收到使用本次结果的续写响应");
  });

  it("retains unequal whitespace and every diagnostic field for heterogeneous MCP", () => {
    const record = tool([{ args: { opaque: [1, 2] }, executed_args: { opaque: [3] }, result: "safe result", ai_result: "safe result ",
      original_length: 9999, storage_truncated: true, ai_truncated: true, args_truncated: true, error: "安全错误" }]);
    const html = expanded(record, ["batch", "batch:call:0:technical"]);
    // Nested values may now be collapsed; every field and full clipboard payload remains.
    for (const field of record.calls[0].fields) {
      expect(html).toContain(`aria-label="复制${field.label}"`);
      expect(vi.mocked(useCopyFeedback).mock.calls.some(([text]) => text === field.text)).toBe(true);
    }
    for (const notice of record.calls[0].notices) expect(html).toContain(notice);
    expect(html).not.toContain("内容与已保存结果一致");
  });

  it("keeps complete long text selectable and copies full values even when the AI result is compacted", async () => {
    const text = "长正文 <script>不执行</script>\n".repeat(6000);
    const fields = [{ label: "调用正文", text }, { label: "已保存结果", text }, { label: "本次 AI 有界结果", text }];
    const html = renderToStaticMarkup(<CapabilityDetails fields={fields.slice(0, 1)} />);
    expect(html).toContain(text.replace(/</g, "&lt;").replace(/>/g, "&gt;"));
    expect(/<script|max-h-|overflow-auto|<pre[^>]*tabindex/.test(html)).toBe(false);
    const write = vi.fn();
    vi.mocked(useCopyFeedback).mockImplementation(value => async () => { write(value); return true; });
    const compact = DetailField({ field: fields[2], sameAsSaved: true });
    await find(compact, Button).props.onClick?.({} as never);
    expect(write).toHaveBeenCalledExactlyOnceWith(text);
    expect(renderToStaticMarkup(compact)).not.toContain("长正文");
  });

  it("keeps triggers as separate timeline notes", () => {
    const record = { ...tool(), kind: "trigger" as const, title: "自由活动时间", fields: [{ label: "阈值", text: "50 分钟" }] };
    expect(CapabilityMessage({ record, identity: "trigger" }).type).toBe(TriggerAnnotation);
    const html = renderToStaticMarkup(<CapabilityMessage record={record} identity="trigger" />);
    expect(html).toContain('role="note"'); expect(html).not.toContain("capability-header");
  });
});

describe("capability expansion identities", () => {
  it("preserves independent call state through rerender and remount, and releases automatic follow before toggling", () => {
    const cache = new Map<string, boolean>();
    vi.spyOn(React, "useContext").mockReturnValue(cache);
    let identity = "batch:call:0";
    const s = hookSession(() => CapabilityDisclosure({ identity, title: "远程调用", children: <p>详情</p>, contained: true }));
    const target = new EventTarget(), events = vi.fn();
    target.addEventListener("chat-capability-toggle", events);
    find(s.render(), "button").props.onClick?.({ currentTarget: target } as never);
    expect(events).toHaveBeenCalledOnce();
    expect(find(s.render(), "button").props["aria-expanded"]).toBe(true);
    identity = "batch:call:1";
    expect(find(s.render(), "button").props["aria-expanded"]).toBe(false);
    identity = "batch:call:0";
    expect(find(s.render(), "button").props["aria-expanded"]).toBe(true);
    s.dispose();
    const remount = hookSession(() => CapabilityDisclosure({ identity, title: "远程调用", contained: true }));
    expect(find(remount.render(), "button").props["aria-expanded"]).toBe(true);
    expect(elements(remount.render()).some(node => node.props.className === "capability-contained-details")).toBe(true);
  });
  it("preserves technical disclosure state independently for each call", () => {
    const cache = new Map<string, boolean>();
    vi.spyOn(React, "useContext").mockReturnValue(cache);
    const call = tool().calls[0];
    const props = find(ToolCallDetails({ call, identity: "batch:call:0" }), CapabilityTechnicalDetails).props;
    const first = hookSession(() => CapabilityTechnicalDetails(props));
    expect(find(first.render(), "button").props["aria-expanded"]).toBe(false);
    find(first.render(), "button").props.onClick?.({ currentTarget: new EventTarget() } as never);
    expect(find(first.render(), "button").props["aria-expanded"]).toBe(true);
    expect(find(first.render(), DetailField).props.field.label).toBe("调用参数");
    expect(cache.get("batch:call:0:technical")).toBe(true);
    first.dispose();
    const second = hookSession(() => CapabilityTechnicalDetails({ ...props, identity: "batch:call:1" }));
    expect(find(second.render(), "button").props["aria-expanded"]).toBe(false); second.dispose();
    const returned = hookSession(() => CapabilityTechnicalDetails(props));
    expect(find(returned.render(), "button").props["aria-expanded"]).toBe(true);
    find(returned.render(), "button").props.onClick?.({ currentTarget: new EventTarget() } as never);
    expect(find(returned.render(), "button").props["aria-expanded"]).toBe(false);
  });
});

describe("PR4 follow-up display deduplication", () => {
  it("shows full memory once when open, with importance in its header and a short missing-ID fact", () => {
    const record = mapCapabilityRecord(matrix.cases.find(test => test.id === "memory")!.paired.public_display)!;
    const snapshot = JSON.stringify(record);
    const html = expanded(record);
    expect(html.match(/旧记忆正文，保留必要细节/g)).toHaveLength(1);
    expect(html).not.toContain("data-capability-preview");
    expect(html).toContain("重要度 0.8");
    expect(html).not.toContain('aria-label="重要度"');
    expect(html).toContain("旧记录未保存可靠记忆 ID。");
    const technical = expanded(record, ["batch", "batch:technical"]);
    expect(technical).toContain('aria-label="复制重要度"');
    expect(JSON.stringify(record)).toBe(snapshot);
  });

  it("uses the provided importance including zero when old display metadata is missing", () => {
    const record = mapCapabilityRecord({ version: 1, kind: "operation", capability: "MEMORY_WRITE", title: "写入记忆", status: "success",
      fields: [{ label: "记忆 ID", text: "real-id" }, { label: "重要度", text: "0" }, { label: "记忆正文", text: "正文预览" }] })!;
    const view = systemOperationPresentation(record);
    expect(view.summary).toBe("重要度 0"); expect(view.preview).toBe("正文预览"); expect(view.previewLines).toBe(2);
    expect(view.notices).toEqual([]);
    expect(expanded(record)).toContain("real-id");
  });

  it.each(["ACTIVITY_CHECK", "Location", "CAM_CHECK"])("keeps extracted %s facts readable and the complete old record copyable on demand", async capability => {
    const body = "精确的提取正文\n含换行、<标签>及结尾。";
    const raw = `[旧通知] 原包装\n${body}\n旧指令仍须可查`;
    const record = mapCapabilityRecord({ version: 1, kind: "operation", capability, title: "查询记录", status: "unknown", preview: body,
      fields: [{ label: capability === "ACTIVITY_CHECK" ? "动态摘要" : capability === "CAM_CHECK" ? "查看说明" : "位置结果", text: body }, { label: "旧通知全文", text: raw }] })!;
    const snapshot = JSON.stringify(record);
    const primary = expanded(record);
    expect(primary.match(/精确的提取正文/g)).toHaveLength(1);
    expect(primary).not.toContain("旧指令仍须可查");
    expect(primary).toContain("原始记录 / 技术详情"); expect(primary).toContain("结果未知");
    const full = expanded(record, ["batch", "batch:technical"]);
    expect(full).toContain("旧指令仍须可查"); expect(full).toContain('aria-label="复制旧通知全文"');
    const write = vi.fn(); vi.mocked(useCopyFeedback).mockImplementation(value => async () => { write(value); return true; });
    await find(DetailField({ field: record.fields[1] }), Button).props.onClick?.({} as never);
    expect(write).toHaveBeenCalledWith(raw);
    expect(JSON.stringify(record)).toBe(snapshot);
  });

  it.each(["separate", "inside", "formatter"])("shows a coverage range once in the default view (%s)", placement => {
    const range = "2026-10-24 09:00–10:00";
    const prefix = placement === "formatter" ? `摘要覆盖区间：${range}（服务端本地时间，不含当前未结束窗口）\n`
      : placement === "inside" ? `覆盖 ${range}\n` : "";
    const body = prefix + "阅读 20 分钟，步行 10 分钟。";
    const record = mapCapabilityRecord({ version: 1, kind: "operation", capability: "ACTIVITY_CHECK", title: "查看动态", summary: `覆盖 ${range}`, preview: body,
      fields: [{ label: "动态摘要", text: body }, { label: "摘要覆盖区间", text: range }, { label: "旧通知全文", text: `原始包装 ${range}\n${body}` }] })!;
    const closed = renderToStaticMarkup(<CapabilityMessage record={record} identity="batch" />);
    expect(closed.split(range)).toHaveLength(2);
    expect(expanded(record).split(range)).toHaveLength(2);
    const view = systemOperationPresentation(record);
    expect([...view.primary, ...view.technical]).toHaveLength(record.fields.length);
  });

  it("does not merge similar but different ranges or parse generic old text", () => {
    const record = mapCapabilityRecord({ version: 1, kind: "operation", capability: "ACTIVITY_CHECK", title: "查看动态", status: "unknown",
      fields: [{ label: "动态摘要", text: "覆盖 09:00–10:00，阅读" }, { label: "摘要覆盖区间", text: "09:00–10:01" }] })!;
    expect(systemOperationPresentation(record).primary).toEqual(record.fields);
    const partialMatch = { ...record, fields: [{ label: "动态摘要", text: "覆盖 09:00–10:00:30\n阅读" }, { label: "摘要覆盖区间", text: "09:00–10:00" }] };
    expect(systemOperationPresentation(partialMatch).primary).toEqual(partialMatch.fields);
    const fallback = mapCapabilityRecord(matrix.cases.find(test => test.id === "activity")!.paired.public_display)!;
    expect(systemOperationPresentation(fallback).primary).toEqual(fallback.fields);
    expect(expanded(fallback)).toContain("请结合这些记录继续回复。");
    expect(expanded(fallback)).toContain("结果未知");
  });

  it("keeps long submitted MCP text once by default and retains full args, receipts and AI facts", () => {
    const body = "唯一正文起始\n" + "长正文\n".repeat(3000);
    const record = tool([{ args: { content: body, thread_id: 3502 }, ai_result: "实际返回的另一份 AI 内容", ai_delivery: "prepared" }]);
    const snapshot = JSON.stringify(record);
    expect(expanded(record).match(/唯一正文起始/g)).toHaveLength(1);
    const technical = expanded(record, ["batch", "batch:call:0:technical"]);
    expect(technical.match(/唯一正文起始/g)).toHaveLength(2);
    expect(technical).toContain("thread_id"); expect(technical).toContain("45304");
    expect(technical).toContain("实际返回的另一份 AI 内容"); expect(technical).toContain("是否送达模型尚无法确认");
    expect(JSON.stringify(record)).toBe(snapshot);
  });

  it("leaves MUSIC preview, fields and notices intact and adds no player control", () => {
    const record = mapCapabilityRecord(matrix.cases.find(test => test.id === "music")!.paired.public_display)!;
    const view = systemOperationPresentation(record);
    expect(view.primary).toEqual(record.fields); expect(view.technical).toEqual([]); expect(view.notices).toEqual(record.notices);
    const html = expanded(record);
    expect(html).toContain("data-capability-preview"); expect(html).toContain("旧选曲通知不代表已开始播放。");
    expect(html).not.toMatch(/<audio|播放按钮|lucide-play/);
  });
});
