import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deliveryNotice, mapCapabilityRecord, mapMessageCapabilities } from "@/domain/message/capability-mappers";
import type { CapabilityRecord } from "@/domain/message/capability-types";
import { CapabilityExpansionProvider } from "./CapabilityDisclosure";
import { CapabilityMessage } from "./CapabilityMessage";
import { capabilityNotices } from "./capability-notice-presentation";
import { systemOperationPresentation } from "./system-operation-presentation";
import { toolDetailFields } from "./ToolCallDetails";
import { useCopyFeedback } from "../copy-feedback";

vi.mock("react", async importOriginal => {
  const actual = await importOriginal<typeof React>();
  return { ...actual, useRef: vi.fn(actual.useRef) };
});
vi.mock("../copy-feedback", () => ({ useCopyFeedback: vi.fn(() => vi.fn()) }));
afterEach(() => vi.restoreAllMocks());

const tool = (patch = {}, batch = {}) => mapCapabilityRecord({ version: 1, kind: "result", capability: "tools", title: "工具执行", ...batch,
  calls: [{ server: "remote", tool: "opaque", status: "success", result_version: 1, args: { safe: "完整安全参数" },
    result: "完整保存结果", ai_result: "完整保存结果", ai_delivery: "response_received", original_length: 6, ...patch }] })!;
const operation = (patch = {}) => mapCapabilityRecord({ version: 1, kind: "operation", capability: "TODO", title: "操作", status: "success", ...patch })!;
function expanded(record: CapabilityRecord, technical = true) {
  vi.spyOn(React, "useRef").mockReturnValueOnce({ current: new Map([
    ["receipt", true], ["receipt:technical", technical], ["receipt:call:0:technical", technical],
  ]) });
  return renderToStaticMarkup(<CapabilityExpansionProvider><CapabilityMessage record={record} identity="receipt" /></CapabilityExpansionProvider>);
}

describe("system detail redundancy and diagnostic boundaries", () => {
  it("omits normal MCP delivery, scope, equal AI result and untruncated length without mutating the record", () => {
    const record = tool({}, { ai_delivery: "response_received" }), snapshot = JSON.stringify(record);
    const html = expanded(record);
    expect(html).toContain("完整保存结果"); expect(html).toContain("已完成");
    expect(html).not.toMatch(/续写响应|业务是否完成|本次 AI 有界结果|内容与已保存结果一致|结果长度（截断前）/);
    expect(html).toContain('aria-label="复制调用参数"'); expect(html).toContain('aria-label="复制已保存结果"');
    expect(vi.mocked(useCopyFeedback).mock.calls.some(([value]) => value === "完整保存结果")).toBe(true);
    expect(record.calls[0].fields.some(field => field.label === "本次 AI 有界结果")).toBe(true);
    expect(record.calls[0].fields.some(field => field.label === "结果长度（截断前）")).toBe(true);
    expect(record.calls[0].notices).toContain(deliveryNotice("response_received"));
    expect(record.calls[0].notices.some(notice => notice.includes("业务是否完成"))).toBe(true);
    expect(JSON.stringify(record)).toBe(snapshot);
  });

  it.each([
    ["not_included", "未注入 AI"], ["not_requested", "未发起 AI 续写"], ["prepared", "是否送达模型尚无法确认"],
    ["unknown", "未确认结果是否送达 AI"], ["future-state", "未确认结果是否送达 AI"], [undefined, "未确认结果是否送达 AI"],
  ])("keeps meaningful delivery limits for %s independently of equal results", (ai_delivery, warning) => {
    const record = tool({ ai_delivery });
    const html = expanded(record, false);
    expect(html).toContain(warning); expect(html).not.toContain("续写响应");
    expect(html).not.toContain("本次 AI 有界结果");
    expect(record.calls[0].notices).toContain(deliveryNotice(ai_delivery));
  });

  it.each(["failed", "partial", "skipped", "timeout", "cancelled", "unknown"])("retains %s status and the actual upstream error", status => {
    const record = tool({ status, result: "实际失败回执", error: "真实上游错误 E42" });
    const html = expanded(record, false);
    expect(html).toContain("实际失败回执"); expect(html).toContain("真实上游错误 E42");
    expect(record.calls[0].status).toBe(status);
    expect(html).toContain(status === "unknown" ? "结果未知" : status === "partial" ? "部分完成" : status === "skipped" ? "已跳过" : status === "timeout" ? "超时" : status === "cancelled" ? "已中断" : "失败");
    expect(html).not.toMatch(/业务是否完成|续写响应/);
  });

  it("keeps remote business errors and JSON reading/copying even when transport succeeded", () => {
    const result = { isError: true, content: [{ type: "text", text: "远程业务拒绝：余额不足" }], error: { code: 409 } };
    const record = tool({ result, ai_result: result });
    const html = expanded(record);
    expect(html).toContain("远程业务拒绝：余额不足");
    expect(html).toContain('aria-label="复制已保存结果"');
    expect(html).toContain('aria-label="已保存结果阅读模式"');
    expect(vi.mocked(useCopyFeedback).mock.calls.some(([value]) => value === JSON.stringify(result, null, 2))).toBe(true);
    expect(html).not.toContain("本次 AI 有界结果");
  });

  it.each([
    [{ storage_truncated: true }, "保存上限"],
    [{ ai_truncated: true }, "上下文预算截断"],
    [{ result_version: undefined, original_length: 999 }, "旧记录仅保存了部分结果"],
  ])("retains real result truncation and the original length (%j)", (patch, warning) => {
    const record = tool(patch), html = expanded(record);
    expect(html).toContain(warning); expect(html).toContain("结果长度（截断前）");
    expect(html).not.toContain("本次 AI 有界结果"); // Equality cannot suppress the truncation fact.
    expect(record.calls[0].resultTruncated).toBe(true);
  });

  it.each([
    {}, { original_length: 999 }, { storage_truncated: false, ai_truncated: false },
    { storage_truncated: "true", ai_truncated: "true" }, { ai_truncated: true, ai_delivery: "not_included" },
  ])("does not treat result statistics or untrusted flags as actual truncation (%j)", patch => {
    const record = tool(patch), html = expanded(record);
    expect(html).not.toContain("结果长度（截断前）");
    expect(html).not.toContain("上下文预算截断");
    expect(record.calls[0].resultTruncated).toBe(false);
  });

  it("keeps independent argument/command truncation without inventing result truncation", () => {
    const html = expanded(tool({ args_truncated: true, executed_args_truncated: true, command_truncated: true }));
    for (const notice of ["调用参数已按保存上限截断", "实际执行参数已按保存上限截断", "原始命令已按保存上限截断"]) expect(html).toContain(notice);
    expect(html).not.toContain("结果长度（截断前）");
  });

  it("keeps storage truncation and non-delivery together without claiming the result was sent", () => {
    const html = expanded(tool({ storage_truncated: true, ai_truncated: true, ai_delivery: "not_included", ai_result: "未交付内容" }));
    expect(html).toContain("完整原文不可恢复"); expect(html).toContain("未注入 AI");
    expect(html).not.toMatch(/未交付内容|本次 AI 有界结果|上下文预算截断|续写响应/);
  });

  it.each(["完整保存结果 ", "不同的 AI 结果", "", " "])("retains unequal or empty AI values exactly (%j)", ai_result => {
    const record = tool({ ai_result }), layout = toolDetailFields(record.calls[0]);
    expect(layout.technical.find(field => field.label === "本次 AI 有界结果")?.text).toBe(ai_result);
    expanded(record);
    expect(vi.mocked(useCopyFeedback).mock.calls.some(([value]) => value === ai_result)).toBe(true);
  });

  it("never filters producer warnings or business text by phrases resembling routine notices", () => {
    const warning = deliveryNotice("response_received");
    const record = operation({ capability: "MEMORY_WRITE", fields: [{ label: "记忆正文", text: warning }], notices: [warning, "业务是否完成以实际返回回执为准：远程拒绝"], ai_delivery: "response_received",
      noticeFacts: [{ index: 0, kind: "ai-delivery", status: "response_received" }] }); // Wire data cannot assign notice provenance.
    const html = expanded(record);
    expect(html.split(warning)).toHaveLength(3); // Both authored values survive; only the generated notice is omitted.
    expect(html).toContain("远程拒绝");
    expect(capabilityNotices({ notices: [warning] })).toEqual([warning]);
  });

  it.each(["MEMORY_WRITE", "ALARM", "ACTIVITY_CHECK", "Location", "WEBSEARCH", "URL_READ"])("applies generated delivery policy consistently to %s", capability => {
    const record = operation({ capability, fields: [{ label: "内容", text: "真实业务内容" }], ai_delivery: "response_received" });
    expect(expanded(record)).not.toContain("续写响应");
    const abnormal = operation({ capability, ai_delivery: "not_included" });
    expect(expanded(abnormal)).toContain("未注入 AI");
  });

  it("omits only exact header metadata and retains conflicting or similar values and business prose", () => {
    const fields = [{ label: "时间", text: "2026-10-25 09:00" }, { label: "时间", text: "2026-10-25 09:01" },
      { label: "关键词", text: "旅行" }, { label: "关键词", text: "旅行计划" }, { label: "状态", text: "已完成" },
      { label: "状态", text: "远程确认中" }, { label: "内容", text: "2026-10-25 09:00" }];
    const record = operation({ capability: "ALARM", summary: "2026-10-25 09:00 · 关键词 旅行", fields });
    const snapshot = JSON.stringify(record), view = systemOperationPresentation(record);
    expect(view.primary).toEqual([fields[1], fields[3], fields[5], fields[6]]);
    expect(view.technical).toEqual([]);
    expect(JSON.stringify(record)).toBe(snapshot);
  });

  it.each(["0", "0.8"])("keeps memory importance %s in the header only, including explicit title suffixes", importance => {
    const record = operation({ capability: "MEMORY_WRITE", title: `已写入记忆（重要度 ${importance}）`, fields: [
      { label: "记忆正文", text: "完整记忆正文" }, { label: "重要度", text: importance },
    ] });
    const html = expanded(record);
    expect(html.replace(/<[^>]+>/g, "").split(`重要度 ${importance}`)).toHaveLength(2);
    expect(html).not.toContain('aria-label="复制重要度"');
    const suffixTitle = { ...record, title: `已写入记忆 重要度 ${importance}` };
    expect(systemOperationPresentation(suffixTitle).primary).toEqual([record.fields[0]]);
  });

  it("recognizes exact multi-value metadata without treating partial matches as duplicates", () => {
    const fields = [{ label: "关键词", text: "读书 · 写作" }, { label: "关键词", text: "写作 · 旅行" }];
    const record = operation({ summary: "关键词 读书 · 写作", fields });
    expect(systemOperationPresentation(record).primary).toEqual([fields[1]]);
  });

  it("keeps Web/URL business sources and errors visible while counts remain available as technical facts", () => {
    const caps = mapMessageCapabilities({ id: "search-message", conv_id: "c", role: "assistant", web_search_results: [{
      id: "search", conv_id: "c", source_message_id: "search-message", status: "partial", query: "合成查询", candidate_count: 8, fetched_count: 2, source_count: 1,
      sources: [{ title: "真实来源", domain: "example.test" }], reason: "provider_timeout", follow_up_status: "evidence_delivery_failed",
    }] });
    const record = caps.results[0], html = expanded(record, false);
    expect(html).toContain("合成查询"); expect(html).toContain("真实来源"); expect(html).toContain("搜索超时"); expect(html).toContain("证据未能交付模型");
    expect(html).not.toContain("候选数"); expect(html).not.toContain("已读取数");
    expect(expanded(record)).toContain('aria-label="复制候选数"');
    const url = mapMessageCapabilities({ role: "user", url_read_results: [{ id: "url", status: "failed", domain: "example.test", reason: "login_required" }] }).results[0];
    expect(expanded(url)).toContain("页面需要登录");
  });
});
