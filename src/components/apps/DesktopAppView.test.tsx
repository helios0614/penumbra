import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  DESKTOP_APP_META,
  DesktopAppView,
  isDesktopAppId,
} from "@/components/apps/DesktopAppView";
import { DesktopApps } from "@/components/desktop/DesktopApps";

const desktopStyles = readFileSync(
  new URL("../../index.css", import.meta.url),
  "utf8",
);

describe("desktop memory route and navigation", () => {
  it("adds a separate Quick Note app and preserves ordinary notes", () => {
    expect(isDesktopAppId("quick-notes")).toBe(true);
    expect(DESKTOP_APP_META["quick-notes"].name).toBe("速记");
    expect(DESKTOP_APP_META.notes.name).toBe("笔记");
    const html = renderToStaticMarkup(<DesktopApps onLaunch={vi.fn()} onSettings={vi.fn()} />);
    expect(html).toContain('aria-label="打开速记"');
    expect(html).toContain('aria-label="打开笔记"');
    expect(renderToStaticMarkup(<DesktopAppView appId="quick-notes" onBack={vi.fn()} />)).not.toContain("页面还在搭建中");
  });
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

  it("does not retain the desktop app entrance animation after its active phase", () => {
    const html = renderToStaticMarkup(
      <DesktopAppView appId="memory" onBack={vi.fn()} />,
    );
    const shell = html.match(
      /<section[^>]*data-testid="desktop-app-view"[^>]*>/,
    )?.[0];

    expect(shell).toBeDefined();
    expect(shell).not.toContain("style=");
    expect(shell).not.toMatch(/\b(?:opacity|scale|translate|transform)-/);
    expect(desktopStyles).toMatch(
      /\[data-testid="desktop-app-view"\]\s*\{\s*animation:\s*desktop-surface-enter 0\.22s ease-out;\s*\}/,
    );
  });

  it("continues to disable the desktop app animation for reduced motion", () => {
    expect(desktopStyles).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\[data-testid="desktop-app-view"\]\s*\{\s*animation:\s*none;\s*\}/,
    );
  });
});
