import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "@/components/ui/button";
import { JsonViewer } from "@/components/ui/json-viewer";
import { useCopyFeedback } from "@/components/ui/copy-feedback";
import type { RequestSnapshot, SystemLogEntry } from "@/application/chat-system-log/chat-system-log-types";
import { LogDisclosure } from "./LogDisclosure";
import { SystemLogDiagnostics, SystemLogError } from "./SystemLogDiagnostics";
import { SystemLogRequestBody } from "./SystemLogRequest";
import { WireMessages } from "./SystemLogWire";
import { elements, find, hookSession } from "../test-utils/hook-session";

vi.mock("react", async importOriginal => {
  const actual = await importOriginal<typeof React>();
  return { ...actual, useMemo: vi.fn((factory: () => unknown) => factory()), ...Object.fromEntries(["useState", "useRef", "useCallback", "useId", "useEffect", "useLayoutEffect"].map(key => [key, vi.fn(actual[key as keyof typeof actual] as never)])) };
});
vi.mock("@/components/ui/copy-feedback", () => ({ useCopyFeedback: vi.fn(() => vi.fn()) }));
afterEach(() => vi.restoreAllMocks());
const entry: SystemLogEntry = { id: "synthetic", time: 1, source: "sse", hasError: false, requests: [] };
const source = ' {"model":"m","messages":[{"role":"user","content":"first"},{"role":"developer","content":"[HEART:allowed]"}],"temperature":0} ';
const request: RequestSnapshot = { id: "capture-1", executionId: "send:one", conversationId: "a", kind: "send", time: 1, model: "m", protocol: "openai", source: "provider", endpoint: "https://synthetic.invalid", stage: "http_json_before_send", payloadJson: source, complete: true, limitations: [] };
const button = (tree: React.ReactNode, text: string) => find(tree, Button, props => props.children === text);

describe("system log detail UI", () => {
  it("renders ordinary fields/notes as compact UI with metadata kept behind its own JSON disclosure", () => {
    const details = { "话题": "synthetic topic", "召回查询": "synthetic query", "哨兵需要搜索": false, "上下文消息数": 0,
      "RAG 实际召回": [], "RAG 候选评分": [{ content: "candidate body", score: .3784, vec_sim: .572, importance: .4 }],
      "生活速记": [{ date: "2026-10-26", period_label: "上午", time_range: "05:00–13:00", output: "[私有内容已隐藏]", raw_output: "NEVER_SHOW" }],
      "Provider 返回 metadata": { events: [] } };
    const html = renderToStaticMarkup(<SystemLogDiagnostics entry={{ ...entry, details }} />);
    for (const text of ["synthetic topic", "无需搜索", "0 条", "RAG 实际召回", "RAG 候选评分", "候选不代表实际注入", "2026-10-26", "已隐藏"]) expect(html).toContain(text);
    for (const text of ["candidate body", "NEVER_SHOW", "json-viewer-tree", "json-viewer-raw"]) expect(html).not.toContain(text);
    const session = hookSession(() => SystemLogDiagnostics({ entry: { ...entry, details } }));
    const viewers = elements(session.render()).filter(element => element.type === JsonViewer);
    expect(viewers).toHaveLength(1); expect(viewers[0].props.data).toEqual({ events: [] });
  });
  it("omits empty diagnostics and only renders error details when safe error data exists", () => {
    expect(renderToStaticMarkup(<SystemLogError entry={entry} />)).toBe("");
    expect(renderToStaticMarkup(<SystemLogError entry={{ ...entry, hasError: true }} />)).toBe("");
    const html = renderToStaticMarkup(<SystemLogError entry={{ ...entry, error: "safe real upstream reason" }} />);
    expect(html).toContain("错误详情"); expect(html).toContain("safe real upstream reason"); expect(html).not.toContain("json-viewer");
    renderToStaticMarkup(<SystemLogError entry={{ ...entry, error: "safe real upstream reason", details: { "安全上游错误": { request_id: "synthetic-upstream" }, error_code: "upstream_error" } }} />);
    const copyCalls = vi.mocked(useCopyFeedback).mock.calls;
    expect(JSON.parse(copyCalls[copyCalls.length - 1][0])).toEqual({ message: "safe real upstream reason", provider_error: { request_id: "synthetic-upstream" }, error_code: "upstream_error" });
    expect(renderToStaticMarkup(<SystemLogDiagnostics entry={entry} />)).not.toContain("复制诊断");
  });
  it("keeps an expanded disclosure open when its content updates", () => {
    let text = "body one";
    const session = hookSession(() => LogDisclosure({ title: "候选 01", children: <p>{text}</p> }));
    expect(find(session.render(), Button).props["aria-expanded"]).toBe(false);
    find(session.render(), Button).props.onClick?.({} as never);
    text = "body two";
    expect(find(session.render(), Button).props["aria-expanded"]).toBe(true);
    expect(JSON.stringify(session.render())).toContain("body two");
    find(session.render(), Button).props.onClick?.({} as never);
    expect(find(session.render(), Button).props["aria-expanded"]).toBe(false);
  });
  it("defaults to protocol grouping, keeps message order and copies the entire original safe source", () => {
    const session = hookSession(() => SystemLogRequestBody({ request }));
    const tree = session.render();
    expect(find(tree, WireMessages).props.value).toEqual([{ role: "user", content: "first" }, { role: "developer", content: "[HEART:allowed]" }]);
    expect(vi.mocked(useCopyFeedback)).toHaveBeenLastCalledWith(source);
    button(tree, "原始 JSON").props.onClick?.({} as never);
    expect(find(session.render(), JsonViewer).props).toMatchObject({ rawText: source, showCopy: false, defaultMode: "raw" });
    button(session.render(), "分组").props.onClick?.({} as never);
    expect(find(session.render(), WireMessages).props.value).toEqual(find(tree, WireMessages).props.value);
  });
  it("defers parsing a large source until an explicit request and leaves copy unchanged", () => {
    const payloadJson = JSON.stringify({ messages: [{ role: "tool", content: "x".repeat(140_000) }] });
    const parse = vi.spyOn(JSON, "parse");
    const session = hookSession(() => SystemLogRequestBody({ request: { ...request, payloadJson } }));
    const tree = session.render(); expect(parse).not.toHaveBeenCalled();
    expect(vi.mocked(useCopyFeedback)).toHaveBeenLastCalledWith(payloadJson);
    button(tree, "加载分组").props.onClick?.({} as never);
    expect(find(session.render(), WireMessages).props.value).toHaveLength(1);
    expect(parse).toHaveBeenCalledOnce();
  });
  it("keeps the shared JSON viewer's default behavior and supports an initial raw view", () => {
    const raw = renderToStaticMarkup(<JsonViewer rawText='{"flag":false,"count":0}' defaultMode="raw" />);
    expect(raw).toContain('data-mode="raw"'); expect(raw).toContain("json-viewer-raw");
    const standard = renderToStaticMarkup(<JsonViewer data={{ count: 0 }} />);
    expect(standard).toContain('data-mode="tree"');
  });
});
