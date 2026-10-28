import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JsonViewer } from "@/components/ui/json-viewer";
import { useCopyFeedback } from "@/components/ui/copy-feedback";
import type { RequestSnapshot, SystemLogEntry } from "@/application/chat-system-log/chat-system-log-types";
import { LogDisclosure } from "./LogDisclosure";
import { SystemLogDiagnostics, SystemLogError } from "./SystemLogDiagnostics";
import { SystemLogRequest, SystemLogRequestBody } from "./SystemLogRequest";
import { LogViewSwitch } from "./LogViewSwitch";
import { LogTextPreview } from "./LogTextPreview";
import { SystemLogSummary, SystemLogDetails } from "../SystemLogDialog";
import { SystemLogRequests } from "./SystemLogRequest";
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
    const tree = find(session.render(), LogViewSwitch).props.views[0].content;
    expect(find(tree, WireMessages).props.value).toEqual([{ role: "user", content: "first" }, { role: "developer", content: "[HEART:allowed]" }]);
    expect(vi.mocked(useCopyFeedback)).toHaveBeenLastCalledWith(source);
    const views = find(session.render(), LogViewSwitch).props.views;
    expect(find(views[1].content, JsonViewer).props).toMatchObject({ rawText: source, showCopy: false, defaultMode: "raw" });
    expect(find(views[0].content, WireMessages).props.value).toEqual(find(tree, WireMessages).props.value);
  });
  it("defers parsing a large source until an explicit request and leaves copy unchanged", () => {
    const payloadJson = JSON.stringify({ messages: [{ role: "tool", content: "x".repeat(140_000) }] });
    const parse = vi.spyOn(JSON, "parse");
    const session = hookSession(() => SystemLogRequestBody({ request: { ...request, payloadJson } }));
    const tree = find(session.render(), LogViewSwitch).props.views[0].content; expect(parse).not.toHaveBeenCalled();
    expect(vi.mocked(useCopyFeedback)).toHaveBeenLastCalledWith(payloadJson);
    button(tree, "加载分组").props.onClick?.({} as never);
    expect(find(find(session.render(), LogViewSwitch).props.views[0].content, WireMessages).props.value).toHaveLength(1);
    expect(parse).toHaveBeenCalledOnce();
  });
  it("keeps the shared JSON viewer's default behavior and supports an initial raw view", () => {
    const raw = renderToStaticMarkup(<JsonViewer rawText='{"flag":false,"count":0}' defaultMode="raw" />);
    expect(raw).toContain('data-mode="raw"'); expect(raw).toContain("json-viewer-raw");
    const standard = renderToStaticMarkup(<JsonViewer data={{ count: 0 }} />);
    expect(standard).toContain('data-mode="tree"');
  });
  it("shows actual recall bodies/scores immediately and keeps candidates behind one boundary", () => {
    const details = { "RAG 实际召回": [{ content: "actual visible body", type: "digest", score: 0, vec_sim: 0, importance: .5 }], "RAG 候选评分": [{ content: "candidate private until expanded", score: .7 }] };
    const html = renderToStaticMarkup(<SystemLogDiagnostics entry={{ ...entry, details }} />);
    expect(html).toContain("actual visible body"); expect(html).toContain("score 0.0000");
    expect(html).toContain("vec_sim"); expect(html).toContain("0.0000"); expect(html).not.toContain("kw_score");
    expect(html).toContain("RAG 候选评分 · 1 条"); expect(html).not.toContain("candidate private until expanded");
  });
  it("keeps plain-text copy complete while the DOM uses line clipping", () => {
    const text = "full text\n".repeat(300);
    const session = hookSession(() => LogTextPreview({ text, copyable: true, label: "safe content" }));
    expect(renderToStaticMarkup(session.render())).toContain("system-log-clamp");
    expect(vi.mocked(useCopyFeedback)).toHaveBeenLastCalledWith(text);
  });
  it("uses fixed cache classes, omits cache zero, and retains input/RAG zero and unknown counts", () => {
    const html = renderToStaticMarkup(<SystemLogSummary entry={{ ...entry, kind: "send", recallCount: 0, usage: { prompt_tokens: 0, cache_read_input_tokens: 3, cache_creation_input_tokens: 4 } }} />);
    expect(html).toContain('class="system-log-cache-read"'); expect(html).toContain('class="system-log-cache-write"');
    expect(html).toContain("发送"); expect(html).toContain("输入 <b>0</b>"); expect(html).toContain("RAG <b>0</b>"); expect(html).toContain("输出 <b>—</b>");
    expect(renderToStaticMarkup(<SystemLogSummary entry={{ ...entry, usage: { cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }} />)).not.toContain("缓存读");
  });
  it("mounts only diagnostics on first visit and retains visited panels across switches", () => {
    const session = hookSession(() => LogViewSwitch({ label: "日志详情视图", views: [
      { id: "diagnostics", label: "生成诊断", content: <p>diagnostic body</p> }, { id: "requests", label: "模型请求", content: <p>request body</p> },
    ] }));
    expect(renderToStaticMarkup(session.render())).not.toContain("request body");
    button(session.render(), "模型请求").props.onClick?.({} as never);
    let html = renderToStaticMarkup(session.render()); expect(html).toContain("request body"); expect(html).toContain('data-log-panel="diagnostics" hidden=""');
    button(session.render(), "生成诊断").props.onClick?.({} as never);
    html = renderToStaticMarkup(session.render()); expect(html).toContain('data-log-panel="requests" hidden=""');
    const detail = renderToStaticMarkup(<SystemLogDetails entry={{ ...entry, requests: [request] }} />);
    expect(detail).toContain("生成诊断"); expect(detail).not.toContain("data-private-request-body");
  });
  it("renders one request without a selection fold and selects multiple requests by id", () => {
    const single = renderToStaticMarkup(<SystemLogRequests requests={[request]} />);
    expect(single).not.toContain('aria-label="选择 Provider 请求"'); expect(single).toContain("data-private-request-body");
    const multiple = renderToStaticMarkup(<SystemLogRequests requests={[request, { ...request, id: "another-id" }]} />);
    expect(multiple).toContain('aria-label="选择 Provider 请求"'); expect(multiple).toContain('data-request-id="capture-1"'); expect(multiple).not.toContain('data-request-id="another-id"');
  });

  it("puts the title before a trailing right/down chevron and keeps a full-width button", () => {
    const session = hookSession(() => LogDisclosure({ title: "System · long title", children: <p>body</p> }));
    const closed = find(session.render(), Button);
    expect(closed.props.className).toContain("w-full");
    const children = React.Children.toArray(closed.props.children);
    expect((children[0] as React.ReactElement<{ children: string }>).props.children).toBe("System · long title");
    expect((children[1] as React.ReactElement).type).toBe(ChevronRight);
    expect(find(session.render(), ChevronRight).props.className).not.toContain("rotate-90");
    closed.props.onClick?.({} as never);
    expect(find(session.render(), ChevronRight).props.className).toContain("rotate-90");
    expect(find(session.render(), Button).props["aria-expanded"]).toBe(true);
  });
  it("shows one hidden notice for entirely hidden notes and keeps mixed status truthful", () => {
    const hidden: Record<string, string>[] = [{ date: "2026-10-26", period_label: "上午", time_range: "05:00–13:00", output: "[私有内容已隐藏]", raw_output: "NEVER_READ" }, { date: "2026-10-27", period_label: "下午", output: "[已隐藏]" }];
    const html = renderToStaticMarkup(<SystemLogDiagnostics entry={{ ...entry, details: { "生活速记": hidden } }} />);
    expect(html.match(/已隐藏/g)).toHaveLength(1); expect(html).toContain("05:00–13:00"); expect(html).not.toContain("NEVER_READ");
    const mixed = renderToStaticMarkup(<SystemLogDiagnostics entry={{ ...entry, details: { "生活速记": [...hidden, { date: "2026-10-28", output: "authorized safe body" }, { date: "2026-10-28" }] } }} />);
    expect(mixed).not.toContain("正文已隐藏"); expect(mixed).toContain("正文未提供");
    expect(mixed).toContain("authorized safe body"); expect(mixed).toContain("复制 速记 3 正文");
  });
  it("puts technical request details after the body, folded by default, with capture warnings visible", () => {
    const tree = SystemLogRequest({ request: { ...request, complete: false, limitations: ["captured limit"] } });
    const nodes = elements(tree);
    expect(nodes.findIndex(node => node.type === SystemLogRequestBody)).toBeLessThan(nodes.findIndex(node => node.type === LogDisclosure));
    const html = renderToStaticMarkup(tree);
    expect(html).toContain("请求辅助信息"); expect(html).toContain("captured limit"); expect(html).not.toContain(request.endpoint); expect(html).not.toContain(request.stage);
    const auxiliary = find(tree, LogDisclosure, props => props.title === "请求辅助信息");
    const full = renderToStaticMarkup(<>{auxiliary.props.children}</>);
    expect(full).toContain(request.endpoint); expect(full).toContain(request.stage); expect(full).toContain("OPENAI");
  });

});
