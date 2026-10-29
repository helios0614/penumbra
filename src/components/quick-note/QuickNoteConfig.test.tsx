import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { INITIAL_CONFIG_STATE, type QuickNoteConfigState } from "@/application/quick-note/quick-note-config-controller";
import { QuickNoteConfigForm } from "./QuickNoteConfig";

const state: QuickNoteConfigState = { ...INITIAL_CONFIG_STATE, phase: "ready", config: { hours: [5, 12, 20], labels: { "5": "夜晚", "12": "上午", "20": "下午" }, timeZone: "Asia/Shanghai", dayBoundaryHour: 5 }, draft: [{ hour: "5", label: "夜晚" }, { hour: "12", label: "上午" }, { hour: "20", label: "下午" }] };
const render = (value: QuickNoteConfigState) => renderToStaticMarkup(<QuickNoteConfigForm state={value} controller={null} onClose={() => {}} />);
describe("Quick Note inline configuration form", () => {
  it("uses labelled hour selects, native names and the existing translucent controls", () => {
    const html = render(state);
    expect(html).toContain('aria-label="编辑时段配置"');
    expect(html.match(/data-slot="input"/g)).toHaveLength(3);
    expect(html.match(/data-slot="select-trigger"/g)).toHaveLength(3);
    expect(html).toContain('aria-label="时段 1 截止小时"');
    expect(html).toContain('for="quick-note-config-name-0"');
    expect(html).toContain('data-surface="translucent"');
    expect(html).toContain("截止小时须依次递增");
    expect(html).not.toMatch(/添加时段|删除时段|type="number"/);
  });
  it("exposes loading, retry, draft errors and GET-only verification", () => {
    expect(render(INITIAL_CONFIG_STATE)).toContain("正在读取服务端配置");
    const failed = render({ ...INITIAL_CONFIG_STATE, phase: "ready", error: "读取失败" });
    expect(failed).toContain("重试加载"); expect(failed).not.toContain('data-slot="input"');
    const uncertain = render({ ...state, error: "草稿已保留", needsReadback: true });
    expect(uncertain).toContain('role="alert"'); expect(uncertain).toContain("核对保存结果");
    expect(uncertain.match(/<input\b[^>]*>/g)?.filter((input) => input.includes('data-slot="input"') && input.includes("disabled"))).toHaveLength(3);
    expect(render({ ...state, phase: "saving" })).toContain("保存中…");
    expect(render({ ...state, phase: "verifying" })).toContain("正在读回…");
    expect(render({ ...state, saved: true })).toContain("配置已保存，并已重新读取服务端结果");
  });
});
