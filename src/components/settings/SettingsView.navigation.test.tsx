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
  it("labels the legacy link with the configured AI name", async () => {
    const fetch = vi.fn(async () => Response.json({ ai_name: " 合成助手 ", user_name: "合成用户" }));
    vi.stubGlobal("fetch", fetch);
    const hooks = hookSession(() => SettingsShell({ pages: [] }));
    try {
      hooks.render();
      hooks.commit();
      await vi.waitFor(() => {
        const link = find(hooks.render(), "a", props => props.target === "_top");
        expect(React.Children.toArray(link.props.children)[0]).toBe("返回旧版合成助手");
        expect(link.props.href).toBe("/");
      });
      expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/\/api\/worldbook$/), expect.objectContaining({ method: "GET" }));
    } finally {
      hooks.dispose();
    }
  });

  it("restores Web and task bindings on browser Back/Forward without a service group entry", () => {
    vi.stubGlobal("requestAnimationFrame", (callback: () => void) => { callback(); return 1; });
    const host = new EventTarget();
    const entries: { penumbraSettingsPath: string[]; penumbraSettingsDepth: number }[] = [{ penumbraSettingsPath: [], penumbraSettingsDepth: 0 }];
    let index = 0;
    const history = {
      get state() { return entries[index]; },
      pushState(state: (typeof entries)[number]) { entries.splice(index + 1); entries.push(state); index++; },
      back() { index--; host.dispatchEvent(new Event("popstate")); },
    };
    vi.stubGlobal("window", Object.assign(host, { history, location: { pathname: "/app/settings", href: "https://test.invalid/app/settings" } }));
    const remove = vi.spyOn(host, "removeEventListener");
    let context!: import("./SettingsShell").SettingsPageContext;
    const pages: SettingsPage[] = [
      { id: "web", title: "Web 服务", description: "", icon: () => null, group: "服务集成", render: value => { if (value.active) context = value; return null; } },
      { id: "features", title: "模型与任务分配", description: "", icon: () => null, render: value => { if (value.active) context = value; return null; } },
    ];
    const hooks = hookSession(() => SettingsShell({ pages }));
    find(hooks.render(), "button", props => props.children !== undefined && props["aria-current"] === undefined).props.onClick!({} as never);
    hooks.render(); hooks.commit(); context.navigate("features"); hooks.render(); hooks.commit();
    expect(entries.map(entry => entry.penumbraSettingsPath)).toEqual([[], ["web"], ["web", "features"]]);
    expect(context.previousPageId).toBe("web");
    history.back();
    expect(find(hooks.render(), "h2").props.children).toBe("Web 服务"); hooks.commit();
    history.back();
    expect(find(hooks.render(), "h2").props.children).toBe("设置分类"); hooks.commit();
    index++; host.dispatchEvent(new Event("popstate"));
    expect(find(hooks.render(), "h2").props.children).toBe("Web 服务"); hooks.commit();
    index++; host.dispatchEvent(new Event("popstate"));
    expect(find(hooks.render(), "h2").props.children).toBe("模型与任务分配");
    expect(context.previousPageId).toBe("web");
    hooks.dispose(); expect(remove).toHaveBeenCalledWith("popstate", expect.any(Function));
  });
  it("uses a native legacy root link under a base path", () => {
    const hooks = hookSession(() => SettingsShell({ pages: [] }));
    const link = find(hooks.render(), "a", props => props.href === "/");
    expect(link.props.target).toBe("_top");
    expect(link.props.onClick).toBeUndefined();
    hooks.dispose();
  });

  it("returns from task bindings to Web and Settings before closing, resets when reopened", () => {
    vi.stubGlobal("requestAnimationFrame", (callback: () => void) => { callback(); return 1; });
    const close = vi.fn();
    let context!: import("./SettingsShell").SettingsPageContext;
    const pages: SettingsPage[] = [
      { id: "web", title: "Web 服务", description: "", icon: () => null, group: "服务集成", render: value => { if (value.active) context = value; return null; } },
      { id: "features", title: "模型与任务分配", description: "", icon: () => null, render: () => null },
    ];
    const hooks = hookSession(() => SettingsShell({ pages, onClose: close }));
    find(hooks.render(), "button", props => props.children !== undefined && props["aria-current"] === undefined).props.onClick!({} as never);
    hooks.render(); context.navigate("features");
    find(hooks.render(), "button", props => props["aria-label"] === "返回上级设置").props.onClick!({} as never);
    expect(find(hooks.render(), "h2").props.children).toBe("Web 服务");
    find(hooks.render(), "button", props => props["aria-label"] === "返回设置分类").props.onClick!({} as never);
    expect(close).not.toHaveBeenCalled();
    const tree = hooks.render();
    expect(find(tree, "h2").props.children).toBe("设置分类");
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
