import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { mapCapabilityRecord } from "@/domain/message/capability-mappers";
import { projectLegacySystemText } from "@/domain/message/legacy-system-projection";
import { CapabilityMessage } from "./CapabilityMessage";
import { CapabilityDetails } from "./CapabilityDetails";
import matrix from "../../../../tests/browser/chat-pr4-legacy-matrix.json";

describe("legacy semantic rows and folded previews", () => {
  it("shows memory operation, importance and two-line text while retaining full detail", () => {
    const body = '正文有「嵌套“引号”」\n第二行。' + "长正文".repeat(200);
    const record = mapCapabilityRecord({ version:1, kind:"operation", capability:"MEMORY_WRITE", title:"已写入记忆", status:"success",
      summary:"重要度 0.8", preview:body.slice(0,240), preview_lines:2,
      fields:[{label:"记忆正文（旧通知）",text:body},{label:"重要度",text:"0.8"}] })!;
    const closed = renderToStaticMarkup(<CapabilityMessage record={record} identity="memory" />);
    expect(closed.replace(/<[^>]+>/g, "")).toContain("已写入记忆 · 重要度 0.8");
    expect(closed).toContain("正文有「嵌套“引号”」");
    expect(closed).toContain("line-clamp-2");
    expect(closed).toContain('aria-expanded="false"');
    expect(record.fields[0].text).toBe(body);
    expect(renderToStaticMarkup(<CapabilityDetails fields={record.fields} />)).toContain(body);
  });
  it.each(["memory", "alarm", "music", "camera"])("uses real backend %s metadata without business parsing in React", id => {
    const test = matrix.cases.find(test=>test.id === id)!;
    const record = mapCapabilityRecord(test.paired.public_display)!;
    const closed = renderToStaticMarkup(<CapabilityMessage record={record} identity={id} />);
    expect(record.previewLines).toBe(2);
    expect(closed).toContain("data-capability-preview");
    expect(closed).toContain("line-clamp-2");
    if (id === "memory") expect(closed).toContain("重要度 0.8");
    if (id === "alarm") expect(closed).toContain("2026-10-24 18:15");
    if (id === "music") expect(closed).toContain("纸间 · 示例歌手");
    if (id === "camera") expect(record.status).toBe("unknown");
  });
  it("gives old and new legacy-text DTOs a safe preview, including when preview metadata is absent", () => {
    const original = '自定义说明 <script>alert(1)</script>\n第二行 token=secret-value';
    const record = projectLegacySystemText(original)!;
    const old = { ...record, preview:undefined, previewLines:undefined };
    for (const display of [record, old]) {
      const html = renderToStaticMarkup(<CapabilityMessage record={display} identity="unknown" />);
      expect(html).toContain("旧版系统内容");
      expect(html).toContain("自定义说明 &lt;script&gt;");
      expect(html).toContain("第二行 token=&lt;redacted&gt;");
      expect(html).not.toMatch(/secret-value|<script|结果未知|已完成/);
      expect(html).toContain("line-clamp-2");
    }
  });
  it("accepts only supported preview shapes and keeps full detail separate", () => {
    const record = mapCapabilityRecord({ version:1,kind:"operation",title:"操作",summary:{raw:"no"},preview:42,preview_lines:100,
      fields:[{label:"详情",text:"完整内容"}] })!;
    expect(record.summary).toBeUndefined();
    expect(record.preview).toBeUndefined();
    expect(record.previewLines).toBeUndefined();
    expect(record.fields[0].text).toBe("完整内容");
  });
});
