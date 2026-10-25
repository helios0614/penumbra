import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mapCapabilityRecord, mapMessageCapabilities } from "@/domain/message/capability-mappers";
import { CapabilityExpansionProvider } from "./CapabilityDisclosure";
import { CapabilityMessage } from "./CapabilityMessage";
import { toolDetailFields } from "./ToolCallDetails";

vi.mock("react", async importOriginal => {
  const actual = await importOriginal<typeof React>();
  return { ...actual, useRef: vi.fn(actual.useRef) };
});
afterEach(() => vi.restoreAllMocks());
const tool = (result: unknown, patch = {}) => mapCapabilityRecord({ version: 1, kind: "result", capability: "tools", title: "工具执行",
  calls: [{ server: "forum", tool: "profile", status: "unknown", result, ...patch }] })!;
function expanded(record: ReturnType<typeof tool>, technical = false) {
  vi.spyOn(React, "useRef").mockReturnValueOnce({ current: new Map([["json", true], ["json:call:0:technical", technical]]) });
  return renderToStaticMarkup(<CapabilityExpansionProvider><CapabilityMessage record={record} identity="json" /></CapabilityExpansionProvider>);
}

describe("MCP structured reading adapter", () => {
  it("preserves source formatting and does not parse modern history in the mapper or closed detail", () => {
    const result = ' \n{ "profile": { "name": "中文" }, "active": false }\n';
    const parse = vi.spyOn(JSON, "parse");
    const record = tool(result);
    expect(record.calls[0].fields.find(field => field.label === "已保存结果")?.text).toBe(result);
    renderToStaticMarkup(<CapabilityMessage record={record} identity="json" />);
    expect(parse).not.toHaveBeenCalled();
  });

  it("keeps reliable submitted prose once and JSON params/results in their existing levels", () => {
    const record = tool({ content: [{ type: "text", text: "唯一返回正文" }], id: 12 }, { args: { content: "唯一写入正文", thread_id: 1 }, executed_args: { content: "唯一写入正文", thread_id: 2 }, ai_result: '{"bounded":true}' });
    const html = expanded(record);
    expect(html.match(/唯一写入正文/g)).toHaveLength(1);
    expect(html.match(/唯一返回正文/g)).toHaveLength(1);
    expect(html).not.toContain("thread_id"); expect(html).toContain("技术详情");
    const technical = expanded(record, true);
    expect(technical).toContain('aria-label="调用参数阅读模式"');
    expect(technical).toContain('aria-label="实际执行参数阅读模式"');
    expect(technical).toContain('aria-label="本次 AI 有界结果阅读模式"');
    expect(technical).toContain('aria-label="复制已保存结果"');
    expect(technical).toContain("结果未知");
  });

  it("lazily extracts old string content[] wrappers and treats mixed blocks independently", () => {
    const raw = JSON.stringify({ content: [{ type: "text", text: "自然语言 {\"示例\":1}" }, { type: "text", text: '{"profile":{"name":"测试"}}' }, { type: "image", data: "SAFE_IGNORED_IMAGE_BLOCK" }] });
    const record = tool(raw), fields = record.calls[0].fields;
    expect(fields.some(field => field.label === "结果正文")).toBe(false);
    const layout = toolDetailFields(fields);
    expect(layout.primary[0].textBlocks).toEqual(['自然语言 {"示例":1}', '{"profile":{"name":"测试"}}']);
    expect(layout.technical.find(field => field.label === "已保存结果")?.text).toBe(raw);
    expect(toolDetailFields(fields)).toBe(layout);
    const html = expanded(record);
    expect(html.match(/role="tree"/g)).toHaveLength(1);
    expect(html).toContain("自然语言"); expect(html).not.toContain("SAFE_IGNORED_IMAGE_BLOCK");
    expect(html).not.toMatch(/<img|<script/);
  });

  it.each([0, false, null, "not JSON", "{invalid}"])("retains actual result and status for %j", value => {
    const record = tool(value, { status: "failed", storage_truncated: true, ai_delivery: "not_included", ai_result: "UNDISPATCHED" });
    const html = expanded(record);
    expect(html).toContain("失败"); expect(html).toContain("保存上限"); expect(html).toContain("未注入 AI");
    expect(html).not.toContain("UNDISPATCHED");
    expect(record.calls[0].fields.some(field => field.label === "已保存结果")).toBe(true);
  });

  it("keeps legacy credential filtering before the shared viewer", () => {
    const caps = mapMessageCapabilities({ id: "old", conv_id: "c", role: "assistant", mcp_tool_calls: [{ server: "forum", tool: "profile", success: true,
      args: { token: "PRIVATE_CREDENTIAL", content: "公开正文" }, result: '{"api_key":"PRIVATE_CREDENTIAL","name":"可见"}', result_version: 1 }] });
    const record = caps.results[0];
    const html = expanded(record, true);
    expect(html).not.toContain("PRIVATE_CREDENTIAL"); expect(html).toContain("[已隐藏]");
    expect(html).toContain("可见"); expect(html).toContain("已完成");
  });
});
