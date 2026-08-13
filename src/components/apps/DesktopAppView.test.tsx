import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  DESKTOP_APP_META,
  DesktopAppView,
  isDesktopAppId,
} from "@/components/apps/DesktopAppView";
import { DesktopApps } from "@/components/desktop/DesktopApps";

describe("desktop memory route and navigation", () => {
  it("registers memory as a real desktop app route", () => {
    expect(isDesktopAppId("memory")).toBe(true);
    expect(DESKTOP_APP_META.memory).toMatchObject({
      name: "记忆库",
      description: "翻阅被留下来的片段",
    });
    expect(isDesktopAppId("memories")).toBe(false);
  });

  it("renders the memory navigation entry without emoji controls", () => {
    const html = renderToStaticMarkup(
      <DesktopApps onLaunch={vi.fn()} onSettings={vi.fn()} />,
    );
    expect(html).toContain('aria-label="打开记忆库"');
    expect(html).toContain("记忆库");
    expect(html).not.toMatch(/[📌🔍🧠✏️🗑️]/u);
  });

  it("routes memory to its lazy page instead of the placeholder", () => {
    const html = renderToStaticMarkup(
      <DesktopAppView appId="memory" onBack={vi.fn()} />,
    );
    expect(html).not.toContain("页面还在搭建中");
    expect(html).not.toContain("打开和管理");
  });
});
