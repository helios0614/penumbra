import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { JsonViewer } from "./json-viewer";
import { canRenderJsonTree, initiallyExpandJson, JSON_AUTO_TREE_CHARS, JSON_MAX_TREE_CHARS, jsonSource, readJson, type JsonValue } from "./json-viewer-model";
import { readFileSync } from "node:fs";
const styles = readFileSync(new URL("./json-viewer.css", import.meta.url), "utf8");

describe("shared read-only JsonViewer", () => {
  const values: JsonValue[] = [{}, [], { title: "中文", count: 0, enabled: false, empty: null }, ["中文", 0, false, null], "多行中文\n第二行", 0, false, null];
  it.each(values.map(data => ({ data })))("renders a JSON value ($data)", ({ data }) => {
    const html = renderToStaticMarkup(<JsonViewer data={data} />);
    expect(html).toContain('role="tree"');
    expect(html).toContain("结构化"); expect(html).toContain("原文");
    expect(readJson(jsonSource(data, undefined), data).kind).toBe("json");
  });

  it("shows counts, distinct primitives and only the first level initially", () => {
    const html = renderToStaticMarkup(<JsonViewer data={{ zero: 0, off: false, nil: null, nested: { hidden: "DEEP_LEAF" }, list: ["ARRAY_LEAF"] }} />);
    expect(html).toContain("5 个字段");
    for (const type of ["number", "boolean", "null", "key"]) expect(html).toContain(`json-viewer-${type}`);
    expect(html).not.toMatch(/DEEP_LEAF|ARRAY_LEAF/);
    expect(html.match(/aria-expanded="false"/g)).toHaveLength(4); // node + its arrow
    expect(initiallyExpandJson(0, Array(201).fill(0))).toBe(false);
    expect(initiallyExpandJson(1, { a: 1 })).toBe(false);
  });

  it.each(["普通文本 {\"a\":1} 只是示例", "{ invalid JSON }", "[1,]", "", "```json\n{}\n```"])("falls back to safe text with no unavailable mode (%s)", rawText => {
    const html = renderToStaticMarkup(<JsonViewer rawText={rawText} />);
    expect(html).not.toMatch(/role="tree"|结构化|解析错误/);
    expect(html).toContain("json-viewer-raw");
  });

  it("accepts entire legal JSON source strings and preserves exact raw/copy bytes", () => {
    const raw = ' \r\n{ "中文字段": "第一行\\n第二行", "n": 0 }\n ';
    expect(readJson(raw)).toMatchObject({ kind: "json", value: { 中文字段: "第一行\n第二行", n: 0 } });
    expect(jsonSource(undefined, raw)).toBe(raw);
    expect(renderToStaticMarkup(<JsonViewer rawText={raw} />)).toContain("第一行\n第二行");
    expect(readJson('"合法 JSON 字符串"')).toMatchObject({ kind: "json", value: "合法 JSON 字符串" });
  });

  it("does not execute HTML, follow URLs or load images", () => {
    const html = renderToStaticMarkup(<JsonViewer data={{ html: '<script>alert(1)</script><img src="https://example.test/private">', url: "javascript:alert(1)" }} />);
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toMatch(/<script|<img|<a\b|href=/);
  });

  it("does not parse large JSON or ordinary prose until structure is requested", () => {
    const raw = JSON.stringify({ text: "长".repeat(JSON_AUTO_TREE_CHARS) });
    const parse = vi.spyOn(JSON, "parse");
    try {
      const html = renderToStaticMarkup(<JsonViewer rawText={raw} />);
      expect(parse).not.toHaveBeenCalled();
      expect(html).toContain("查看结构"); expect(html).toContain("长".repeat(100));
      expect(html).not.toContain('role="tree"');
      const plain = renderToStaticMarkup(<JsonViewer rawText={"普通文本".repeat(JSON_AUTO_TREE_CHARS)} />);
      expect(plain).not.toMatch(/查看结构|结构化/);
      expect(parse).not.toHaveBeenCalled();
    } finally { parse.mockRestore(); }
  });

  it("bounds breadth, total nodes and extreme depth without modifying or truncating the input", () => {
    let deep: JsonValue = "leaf";
    for (let i = 0; i < 40; i++) deep = { child: deep };
    const values: JsonValue[] = [deep, Array(1001).fill(0), Array.from({ length: 30 }, () => Array(1000).fill(0))];
    for (const value of values) {
      const raw = JSON.stringify(value);
      expect(canRenderJsonTree(value)).toBe(false);
      expect(readJson(raw).kind).toBe("limited");
      expect(JSON.stringify(value)).toBe(raw);
    }
    expect(readJson('"' + "x".repeat(JSON_MAX_TREE_CHARS) + '"').kind).toBe("limited");
    const shared = Object.freeze({ name: "只读" });
    const frozen = Object.freeze({ first: shared, second: shared });
    expect(canRenderJsonTree(frozen)).toBe(true);
    expect(jsonSource(frozen, undefined)).toBe(JSON.stringify(frozen, null, 2));
  });

  it("has no internal scroll surface, wraps long keys/strings and fully replaces library styles", () => {
    expect(styles).toContain("overflow-wrap: anywhere");
    expect(styles).toContain("white-space: pre-wrap");
    expect(styles).toContain("var(--json-viewer-accent, var(--color-theme))");
    expect(styles).not.toMatch(/overflow(?:-y)?:\s*(auto|scroll)|max-height|#[0-9a-f]{3,8}\b|color-ai|backdrop-filter/);
    const html = renderToStaticMarkup(<JsonViewer data={{ field: "value" }} className="custom-json" />);
    expect(html).toContain("custom-json"); expect(html).not.toMatch(/_container|_label|container-light/);
  });
});
