import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SettingsView } from "./SettingsView";

describe("Settings page structure", () => {
  it("retains the shared glass header and separates categories from page containers", () => {
    const html = renderToStaticMarkup(<SettingsView onBack={vi.fn()} />);
    expect(html).toContain('data-slot="page-header"');
    expect(html).toContain('aria-label="返回桌面"');
    expect(html).toContain('aria-label="设置分类"');
    expect(html).toContain("外观与本机偏好");
    expect(html).toContain("系统状态");
    expect(html).toContain("界面外观");
    expect(html).toContain("桌面背景");
    expect(html).toContain("运行状态概览");
    expect(html).not.toContain("日历设置");
    expect(html).toContain("后续开放");
    expect(html).toContain("MCP 工具（独立页面）");
    expect(html).toContain("API 与连接");
    expect(html).not.toContain("Session、模型目录");
  });
  it("omits only desktop close when there is no host callback", () => {
    const html = renderToStaticMarkup(<SettingsView />);
    expect(html).not.toContain('aria-label="返回桌面"');
    expect(html).toContain("返回旧版知远");
  });
});
