import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "@/components/ui/button";
import { ScheduleCameraInfo, ScheduleCameraStatus } from "./ScheduleCameraStatus";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof React>();
  return { ...actual, useState: vi.fn(actual.useState), useEffect: vi.fn(actual.useEffect) };
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("scheduled-check camera availability", () => {
  it.each([[true, "摄像头当前正在运行"], [false, "摄像头当前未运行"], [null, "摄像头状态暂时未知"]] as const)("shows the %s state without offering to open a device", (running, label) => {
    const tree = ScheduleCameraInfo({ state: { running, loading: false, error: null }, refresh: vi.fn() });
    const html = renderToStaticMarkup(tree);
    expect(html).toContain(label); expect(html).toContain("创建不会开启摄像头；执行时仍需摄像头正在运行");
    expect(html).toContain('href="/camera"'); expect(html).toContain('target="_blank"'); expect(html).toContain('rel="noopener noreferrer"');
    expect(html).not.toMatch(/截图成功|保证可用|自动监控已开启|开启摄像头<\/button>/);
  });
  it("keeps read failure inline and offers a read-only refresh", () => {
    const refresh = vi.fn(), tree = ScheduleCameraInfo({ state: { running: null, loading: false, error: "无法连接服务" }, refresh });
    expect(renderToStaticMarkup(tree)).toContain('role="alert"');
    const row = React.Children.toArray(tree.props.children)[0] as React.ReactElement<{ children: React.ReactNode }>;
    const control = React.Children.toArray(row.props.children).find((child) => React.isValidElement(child) && child.type === Button) as React.ReactElement<React.ComponentProps<typeof Button>>;
    control.props.onClick?.({} as never); expect(refresh).toHaveBeenCalledOnce();
    expect(renderToStaticMarkup(<ScheduleCameraInfo state={{ running: null, loading: true, error: null }} refresh={refresh} />)).toContain("正在读取摄像头状态");
  });
  it("reads only while the create dialog is open and cleans up visibility listeners and late requests", async () => {
    const effects: React.EffectCallback[] = [];
    vi.spyOn(React, "useState").mockImplementation(((initial: unknown) => [initial, vi.fn()]) as unknown as typeof React.useState);
    vi.spyOn(React, "useEffect").mockImplementation((fn) => { effects.push(fn); });
    const document = new EventTarget(); Object.defineProperty(document, "hidden", { value: false }); vi.stubGlobal("document", document);
    const fetch = vi.fn((_url, options) => new Promise<Response>((_resolve, reject) => options.signal.addEventListener("abort", () => reject(new Error("aborted"))))); vi.stubGlobal("fetch", fetch);
    ScheduleCameraStatus({ open: false }); effects.pop()?.(); expect(fetch).not.toHaveBeenCalled();
    ScheduleCameraStatus({ open: true }); const cleanup = effects.pop()?.(); expect(fetch).toHaveBeenCalledOnce();
    document.dispatchEvent(new Event("visibilitychange")); expect(fetch).toHaveBeenCalledTimes(2);
    if (typeof cleanup === "function") cleanup();
    expect(fetch.mock.calls[1][1].signal.aborted).toBe(true);
    document.dispatchEvent(new Event("visibilitychange")); expect(fetch).toHaveBeenCalledTimes(2);
    await Promise.resolve();
  });
});
