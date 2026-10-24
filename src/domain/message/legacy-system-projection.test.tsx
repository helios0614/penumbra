import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import matrix from "../../../tests/browser/chat-pr4-legacy-matrix.json";
import { mapMessage } from "./message-mappers";
import { projectLegacySystemText, LEGACY_TEXT_LIMIT } from "./legacy-system-projection";
import { presentChatMessage } from "@/components/chat-workspace/presentation/chat-message-presenter";
import { CapabilityDetails } from "@/components/chat/capabilities/CapabilityDetails";
import { CapabilityMessage } from "@/components/chat/capabilities/CapabilityMessage";

describe("old history readability matrix against legacy renderMessages", () => {
  it.each(matrix.cases)("preserves $id through paired HTTP mapping", test => {
    const shown = presentChatMessage(mapMessage(test.paired));
    if (test.hidden) { expect(shown).toBeNull(); expect(test.legacyHtml).toBe(""); return; }
    const record = shown?.capabilities?.display;
    const text = JSON.stringify(record);
    for (const expected of test.expected) expect(text).toContain(expected);
    for (const forbidden of test.forbidden ?? []) expect(text).not.toContain(forbidden);
    if (test.unknown) expect(record).toMatchObject({ capability:test.parsed_capability ?? "legacy-text", status:"unknown" });
    expect(record?.capability === "legacy").toBe(test.placeholder === true);
    // Old HTML was produced by the actual old renderMessages + McpResultUI.
    if (test.expected.length) expect(test.legacyHtml.length).toBeGreaterThan(0);
    if (test.id !== "new-display") for (const expected of test.expected) {
      const escaped = expected.replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
      expect(test.legacyHtml).toContain(escaped);
    }
  });
  it("has zero old readable records reduced to placeholders", () => {
    expect(matrix.report.legacyReadable).toBe(23);
    expect(matrix.report.penumbraReadable).toBe(23);
    expect(matrix.report.remainingPlaceholders).toEqual([]);
    expect(matrix.report.excluded).toHaveLength(2);
  });
  it("escapes old HTML as text, leaves Markdown inert and uses a neutral collapsed row", () => {
    const test = matrix.cases.find(test=>test.id === "html")!;
    const record = mapMessage(test.paired).capabilities!.display!;
    const details = renderToStaticMarkup(<CapabilityDetails fields={record.fields} notices={record.notices} />);
    expect(details).toContain("&lt;script&gt;");
    expect(details).not.toMatch(/<script|<img|href="javascript:/);
    const closed = renderToStaticMarkup(<CapabilityMessage record={record} identity="old-html" />);
    expect(closed).toContain('aria-expanded="false"');
    expect(closed).not.toMatch(/结果未知|已完成|<script|<img/);
    expect(closed).toContain("&lt;script&gt;");
  });
  it("reads stale backend prose including Prompt keys, while keeping credentials and hidden roles safe", () => {
    for (const test of matrix.cases.filter(test=>test.unknown)) {
      const shown = presentChatMessage(mapMessage(test.raw));
      const text = JSON.stringify(shown?.capabilities?.display);
      expect(shown?.capabilities?.display?.capability).toBe("legacy-text");
      for (const expected of test.expected) expect(text).toContain(expected);
      for (const forbidden of test.forbidden ?? []) expect(text).not.toContain(forbidden);
    }
    const bounded = projectLegacySystemText("长正文".repeat(LEGACY_TEXT_LIMIT))!;
    expect(bounded.fields[0].text.length).toBe(LEGACY_TEXT_LIMIT);
    expect(bounded.notices.join()).toContain("展示上限");
    const hidden = matrix.cases.find(test=>test.hidden)!;
    expect(presentChatMessage(mapMessage(hidden.raw))).toBeNull();
  });
  it("fails safely on unprocessable nesting instead of exposing raw credential objects", () => {
    const record = projectLegacySystemText('['.repeat(20000) + '{"cookie":{"raw":"SECRET"}}' + ']'.repeat(20000));
    expect(record?.notices.join()).toContain("无法安全处理");
    expect(JSON.stringify(record)).not.toContain("SECRET");
  });
});
