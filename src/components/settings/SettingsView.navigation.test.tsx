import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsAppearance } from "./SettingsAppearance";
import { SettingsShell, type SettingsPage } from "./SettingsShell";
import { PageHeader, PageHeaderAction } from "@/components/ui/page-header";
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
  it("uses a native legacy root link under a base path", () => {
    const hooks = hookSession(() => SettingsShell({ pages: [] }));
    const link = find(hooks.render(), "a", props => props.href === "/");
    expect(link.props.target).toBe("_top");
    expect(link.props.onClick).toBeUndefined();
    hooks.dispose();
  });

  it("returns through nested pages and categories before closing, resets when reopened", () => {
    vi.stubGlobal("requestAnimationFrame", (callback: () => void) => { callback(); return 1; });
    const close = vi.fn();
    let context!: import("./SettingsShell").SettingsPageContext;
    const pages: SettingsPage[] = [
      { id: "appearance", title: "外观", description: "", icon: () => null, render: value => { if (value.active) context = value; return null; } },
      { id: "nested", title: "子页", description: "", icon: () => null, nested: true, render: value => { if (value.active) context = value; return null; } },
    ];
    const hooks = hookSession(() => SettingsShell({ pages, onClose: close }));
    find(hooks.render(), "button", props => props.children !== undefined && props["aria-current"] === undefined).props.onClick!({} as never);
    hooks.render(); context.navigate("nested");
    find(hooks.render(), "button", props => props["aria-label"] === "返回上级设置").props.onClick!({} as never);
    find(hooks.render(), "button", props => props["aria-label"] === "返回设置分类").props.onClick!({} as never);
    expect(close).not.toHaveBeenCalled();
    const tree = hooks.render();
    const header = find(tree, PageHeader);
    const action = header.props.actions as React.ReactElement<React.ComponentProps<typeof PageHeaderAction>>;
    action.props.onClick!({} as never); expect(close).toHaveBeenCalledOnce();
    hooks.dispose();
    const reopened = hookSession(() => SettingsShell({ pages, onClose: close }));
    expect(() => find(reopened.render(), "button", props => props["aria-label"] === "返回设置分类")).toThrow();
    reopened.dispose();
  });

  it("protects an in-flight wallpaper save, then removes the leave guard", async () => {
    const host = new EventTarget();
    vi.stubGlobal("window", host);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:synthetic-wallpaper");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    let finish!: () => void;
    vi.mocked(saveCustomWallpaper).mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    const hooks = hookSession(() => SettingsAppearance());
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
