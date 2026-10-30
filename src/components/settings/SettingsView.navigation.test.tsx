import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsView } from "./SettingsView";
import { INITIAL_SETTINGS_OVERVIEW_STATE } from "./settings-overview-controller";
import { find, hookSession } from "@/components/chat/test-utils/hook-session";
import { saveCustomWallpaper } from "@/lib/wallpaper";

vi.mock("react", async original => {
  const actual = await original<typeof React>();
  return { ...actual, ...Object.fromEntries(["useState", "useRef", "useCallback", "useId", "useEffect", "useLayoutEffect", "useSyncExternalStore"].map(key => [key, vi.fn(actual[key as keyof typeof actual] as never)])) };
});
vi.mock("./useSettingsOverview", () => ({ useSettingsOverview: () => ({ state: INITIAL_SETTINGS_OVERVIEW_STATE, retry: vi.fn() }) }));
vi.mock("@/lib/wallpaper", async original => ({
  ...await original<typeof import("@/lib/wallpaper")>(),
  getCustomWallpaper: vi.fn(async () => null),
  saveCustomWallpaper: vi.fn(async () => {}),
}));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Settings version switch", () => {
  it("uses a native root link and keeps ordinary settings available", () => {
    const hooks = hookSession(() => SettingsView({}));
    const tree = hooks.render();
    const link = find(tree, "a", props => props.href === "/");
    expect(link.props.target).toBe("_top");
    expect(link.props.onClick).toBeUndefined();
    expect(link.props["aria-describedby"]).toBe("frontend-version-note");
    expect(find(tree, "input", props => props.type === "file")).toBeDefined();
    hooks.dispose();
  });

  it("protects an in-flight wallpaper save, then removes the leave guard", async () => {
    const host = new EventTarget();
    vi.stubGlobal("window", host);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:synthetic-wallpaper");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    let finish!: () => void;
    vi.mocked(saveCustomWallpaper).mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    const hooks = hookSession(() => SettingsView({}));
    const input = find(hooks.render(), "input", props => props.type === "file");
    hooks.commit();
    const idle = new Event("beforeunload", { cancelable: true }); host.dispatchEvent(idle);
    expect(idle.defaultPrevented).toBe(false);
    const saving = input.props.onChange!({ target: { files: [{ type: "image/png", size: 10 }], value: "" } } as unknown as React.ChangeEvent<HTMLInputElement>);
    hooks.render(); hooks.commit();
    const busy = new Event("beforeunload", { cancelable: true }); host.dispatchEvent(busy);
    expect(busy.defaultPrevented).toBe(true);
    finish(); await saving;
    hooks.render(); hooks.commit();
    const saved = new Event("beforeunload", { cancelable: true }); host.dispatchEvent(saved);
    expect(saved.defaultPrevented).toBe(false);
    hooks.dispose();
  });
});
