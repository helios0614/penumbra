import { afterEach, describe, expect, it, vi } from "vitest";
import { getDesktopAppPath, getDesktopPath, type DesktopLayout } from "@/lib/app-paths";
import { backSettingsPage, closeSettingsHistory, isSettingsPath, pushSettingsHistory, pushSettingsPage, readSettingsPath, type SettingsNavigationHost } from "./settings-navigation";

function session(path: string) {
  const entries: { state: unknown; url: URL }[] = [{ state: null, url: new URL(path, "https://test.invalid") }];
  let index = 0;
  const host: SettingsNavigationHost = {
    location: { get pathname() { return entries[index].url.pathname; }, get href() { return entries[index].url.href; } },
    history: {
      get state() { return entries[index].state; },
      pushState: vi.fn((state, _, url) => { entries.splice(index + 1); entries.push({ state, url: new URL(String(url), entries[index].url) }); index++; }),
      replaceState: vi.fn((state, _, url) => { entries[index] = { state, url: new URL(String(url), entries[index].url) }; }),
      go: vi.fn(delta => { index = Math.max(0, Math.min(entries.length - 1, index + (delta ?? 0))); }),
      back: vi.fn(() => { host.history.go(-1); }),
    },
  };
  return { host, forward: () => host.history.go(1) };
}
afterEach(() => vi.unstubAllEnvs());

describe.each(["/", "/penumbra/"])("Settings history under %s", base => {
  it.each<DesktopLayout>(["classic", "editorial"])("returns categories → Settings → %s desktop and restores Forward", layout => {
    vi.stubEnv("BASE_URL", base);
    const { host, forward } = session(getDesktopPath(layout));
    pushSettingsHistory(host, layout);
    expect(host.location.pathname).toBe(getDesktopAppPath("settings", layout));
    expect(isSettingsPath(host.location.pathname, layout)).toBe(true);
    pushSettingsPage(host, ["appearance"]);
    pushSettingsPage(host, ["connections"]);
    expect(backSettingsPage(host)).toBe(true);
    expect(readSettingsPath(host.history.state, ["appearance", "connections"])).toEqual(["appearance"]);
    host.history.back();
    expect(readSettingsPath(host.history.state, ["appearance", "connections"])).toEqual([]);
    expect(backSettingsPage(host)).toBe(false);
    host.history.back(); expect(host.location.pathname).toBe(getDesktopPath(layout));
    forward(); forward();
    expect(readSettingsPath(host.history.state, ["appearance", "connections"])).toEqual(["appearance"]);
  });
  it.each<DesktopLayout>(["classic", "editorial"])("closes the whole %s Settings history with one action", layout => {
    vi.stubEnv("BASE_URL", base);
    const { host } = session(getDesktopPath(layout));
    pushSettingsHistory(host, layout);
    pushSettingsPage(host, ["connections"]);
    pushSettingsPage(host, ["connections", "nested"]);
    expect(closeSettingsHistory(host, layout)).toBe(true);
    expect(host.history.go).toHaveBeenLastCalledWith(-3);
    expect(host.location.pathname).toBe(getDesktopPath(layout));
  });
  it.each<DesktopLayout>(["classic", "editorial"])("uses the %s desktop fallback for an unowned direct Settings link", layout => {
    vi.stubEnv("BASE_URL", base);
    const { host } = session(getDesktopAppPath("settings", layout));
    expect(closeSettingsHistory(host, layout)).toBe(false);
    expect(host.history.go).not.toHaveBeenCalled();
    expect(host.location.pathname).toBe(getDesktopPath(layout));
  });
});

it("rejects stale/invalid category state and does not add category history outside Settings", () => {
  const { host } = session("/app/chat");
  pushSettingsPage(host, ["connections"]);
  expect(host.history.pushState).not.toHaveBeenCalled();
  expect(backSettingsPage(host)).toBe(false);
  for (const state of [null, { penumbraSettingsPath: "connections" }, { penumbraSettingsPath: ["removed"] }]) {
    expect(readSettingsPath(state, ["connections"])).toEqual([]);
  }
});
