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
    for (const field of record.calls[0].fields) expect(html).toContain(field.text.replace(/"/g, "&quot;"));
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
    const first = hookSession(() => ToolCallDetails({ call, identity: "batch:call:0" }));
    expect(find(first.render(), "details").props.open).toBe(false);
    find(first.render(), "details").props.onToggle?.({ currentTarget: { open: true } } as never);
    expect(find(first.render(), "details").props.open).toBe(true);
    expect(find(first.render(), DetailField).props.field.label).toBe("调用参数");
    expect(cache.get("batch:call:0:technical")).toBe(true);
    first.dispose();
    const second = hookSession(() => ToolCallDetails({ call, identity: "batch:call:1" }));
    expect(find(second.render(), "details").props.open).toBe(false); second.dispose();
    const returned = hookSession(() => ToolCallDetails({ call, identity: "batch:call:0" }));
    expect(find(returned.render(), "details").props.open).toBe(true);
    find(returned.render(), "details").props.onToggle?.({ currentTarget: { open: false } } as never);
    expect(find(returned.render(), "details").props.open).toBe(false);
  });
});
