import { describe, expect, it, vi } from "vitest";
import {
  getAppBasePath,
  getAppPathname,
  getDesktopAppId,
  getDesktopAppPath,
  getDesktopPath,
} from "./app-paths";

describe.each([
  { base: "/", home: "/", editorial: "/editorial", chat: "/app/chat", diary: "/editorial/app/diary" },
  { base: "/penumbra/", home: "/penumbra/", editorial: "/penumbra/editorial", chat: "/penumbra/app/chat", diary: "/penumbra/editorial/app/diary" },
])("desktop navigation under $base", ({ base, home, editorial, chat, diary }) => {
  it("keeps the two desktops and app links inside the same application", () => {
    expect(getDesktopPath("classic", base)).toBe(home);
    expect(getDesktopPath("editorial", base)).toBe(editorial);
    expect(getDesktopAppPath("chat", "classic", base)).toBe(chat);
    expect(getDesktopAppPath("diary", "editorial", base)).toBe(diary);
  });

  it("restores app identity from direct, refreshed and trailing-slash paths", () => {
    expect(getAppPathname(home, base)).toBe("/");
    expect(getAppPathname(editorial, base)).toBe("/editorial");
    expect(getDesktopAppId(chat, "classic", base)).toBe("chat");
    expect(getDesktopAppId(`${chat}/`, "classic", base)).toBe("chat");
    expect(getDesktopAppId(diary, "editorial", base)).toBe("diary");
    expect(getDesktopAppId(`${diary}/`, "editorial", base)).toBe("diary");
    expect(getDesktopAppId(diary, "classic", base)).toBeNull();
    expect(getDesktopAppId(chat, "editorial", base)).toBeNull();
  });
});

describe("application prefix boundaries", () => {
  it("accepts the base without a trailing slash and normalizes link generation", () => {
    expect(getAppBasePath("/penumbra")).toBe("/penumbra/");
    expect(getAppPathname("/penumbra", "/penumbra/")).toBe("/");
    expect(getDesktopAppPath("quick-notes", "classic", "/penumbra")).toBe("/penumbra/app/quick-notes");
  });

  it("does not interpret legacy, backend or sibling paths as production app routes", () => {
    for (const path of ["/", "/app/chat", "/editorial/app/chat", "/api/session", "/uploads/1700000000000.png", "/ws", "/penumbra-other/app/chat"]) {
      expect(getAppPathname(path, "/penumbra/")).toBeNull();
      expect(getDesktopAppId(path, "classic", "/penumbra/")).toBeNull();
    }
    expect(getDesktopAppId("/penumbra/app/chat/extra", "classic", "/penumbra/")).toBeNull();
  });

  it("uses Vite's injected base by default", () => {
    vi.stubEnv("BASE_URL", "/penumbra/");
    try {
      expect(getAppBasePath()).toBe("/penumbra/");
      expect(getDesktopAppPath("chat")).toBe("/penumbra/app/chat");
      expect(getDesktopAppId("/penumbra/editorial/app/diary", "editorial")).toBe("diary");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
