import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  DESKTOP_APP_META,
  DesktopAppView,
  isDesktopAppId,
} from "@/components/apps/DesktopAppView";
import { DesktopApps } from "@/components/desktop/DesktopApps";
import { EditorialQuickApps } from "@/components/desktop-v2/EditorialQuickApps";
import { widgetRegistry } from "@/widgets/registry";
import { isDesktopShortcutVisible, isDesktopWidgetVisible } from "@/lib/desktop-entry-visibility";

const desktopStyles = readFileSync(
  new URL("../../index.css", import.meta.url),
  "utf8",
);

describe("desktop memory route and navigation", () => {
  it("registers a real shared Diary app while preserving the notes identity", () => {
    expect(isDesktopAppId("diary")).toBe(true);
    expect(DESKTOP_APP_META.diary.name).toBe("日记");
    expect(DESKTOP_APP_META.notes.name).toBe("笔记");
    const classic = renderToStaticMarkup(<DesktopApps onLaunch={vi.fn()} onSettings={vi.fn()} />);
    const editorial = renderToStaticMarkup(<EditorialQuickApps onLaunch={vi.fn()} onSettings={vi.fn()} />);
    expect(classic).toContain('aria-label="打开日记"'); expect(classic).not.toContain('aria-label="打开笔记"');
    expect(editorial).toContain('aria-label="打开日记"');
    const source = readFileSync(new URL("../desktop-v2/EditorialQuickApps.tsx", import.meta.url), "utf8");
    expect(source).toContain('id: "diary", label: "日记"'); expect(source).not.toContain('id: "notes", label: "日记"');
    const html = renderToStaticMarkup(<DesktopAppView appId="diary" onBack={vi.fn()} />);
    expect(html).not.toContain("页面还在搭建中"); expect(html).not.toContain("desktop-app-mini-icon");
  });
  it("registers Activity as its own lazy app with a desktop shortcut and shared close behavior", () => {
    expect(isDesktopAppId("activity")).toBe(true);
    expect(DESKTOP_APP_META.activity.name).toBe("活动日志");
    expect(renderToStaticMarkup(<DesktopApps onLaunch={vi.fn()} onSettings={vi.fn()} />)).toContain('aria-label="打开活动日志"');
    const html = renderToStaticMarkup(<DesktopAppView appId="activity" onBack={vi.fn()} />);
    expect(html).not.toContain("页面还在搭建中");
    expect(html).not.toContain("desktop-app-mini-icon");
  });
  it("adds a separate Quick Note app and preserves ordinary notes", () => {
    expect(isDesktopAppId("quick-notes")).toBe(true);
    expect(DESKTOP_APP_META["quick-notes"].name).toBe("速记");
    expect(DESKTOP_APP_META.notes.name).toBe("笔记");
    const html = renderToStaticMarkup(<DesktopApps onLaunch={vi.fn()} onSettings={vi.fn()} />);
    expect(html).toContain('aria-label="打开速记"');
    expect(html).not.toContain('aria-label="打开笔记"');
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

  it("hides placeholder shortcuts in both desktops without removing their routes", () => {
    const classic = renderToStaticMarkup(<DesktopApps onLaunch={vi.fn()} onSettings={vi.fn()} />);
    const editorial = renderToStaticMarkup(<EditorialQuickApps onLaunch={vi.fn()} onSettings={vi.fn()} />);
    for (const id of ["notes", "music", "weather"] as const) {
      expect(isDesktopAppId(id)).toBe(true);
      expect(isDesktopShortcutVisible(id)).toBe(false);
      expect(widgetRegistry[id]).toBeDefined();
      for (const html of [classic, editorial]) expect(html).not.toContain(`aria-label="打开${DESKTOP_APP_META[id].name}"`);
      expect(renderToStaticMarkup(<DesktopAppView appId={id} onBack={vi.fn()} />)).toContain("页面还在搭建中");
    }
    for (const id of ["chat", "calendar", "todo", "diary", "clock", "memory", "quick-notes", "activity", "location"] as const) {
      expect(isDesktopShortcutVisible(id)).toBe(true);
      expect(classic).toContain(`aria-label="打开${DESKTOP_APP_META[id].name}"`);
    }
  });

  it("hides demo widget previews while preserving real shortcuts and widget registrations", () => {
    for (const id of ["chat", "calendar", "todo", "notes", "music", "weather"]) {
      expect(isDesktopWidgetVisible(id)).toBe(false);
      expect(widgetRegistry[id]).toBeDefined();
    }
    for (const id of ["clock", "sticker", "signature"]) expect(isDesktopWidgetVisible(id)).toBe(true);
    for (const id of ["chat", "calendar", "todo"]) expect(isDesktopShortcutVisible(id)).toBe(true);
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
