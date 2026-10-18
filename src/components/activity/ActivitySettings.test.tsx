import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as activity from "@/domain/activity";
import * as device from "@/domain/device-context";
import { ApiError } from "@/lib/api";
import { createActivityController, type ActivityController } from "@/application/activity/activity-controller";
import { INITIAL_ACTIVITY_STATE, type ActivityState } from "@/application/activity/activity-state";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { AppSelect } from "@/components/ui/app-select";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ActivityDialogHeader } from "./ActivityDialogHeader";
import { ActivityReadIssue } from "./ActivityFeedback";
import { PhoneStatusPanel } from "./PhoneStatusPanel";
import { WifiSceneSettings } from "./WifiSceneSettings";
import { WifiNetworkDialog, WifiNetworkFields } from "./WifiNetworkDialog";

// Inspect composition and real callbacks in memory; no DOM or browser automation.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof React>();
  return { ...actual, useState: vi.fn(actual.useState), useRef: vi.fn(actual.useRef), useEffect: vi.fn(actual.useEffect) };
});
afterEach(() => vi.restoreAllMocks());
const config: device.WifiConfig = { revision: 3, mappings: [{ ssid: "家庭网络", scene: "home" }, { ssid: "公司网络", scene: "work" }], cacheMaxAgeSeconds: 86400 };
const loaded: ActivityState = { ...INITIAL_ACTIVITY_STATE, wifi: { data: config, loading: false, error: null }, visibility: { data: true, loading: false, error: null } };
function elements(node: React.ReactNode): React.ReactElement<Record<string, unknown>>[] {
  return React.Children.toArray(node).flatMap((child) => React.isValidElement<Record<string, unknown>>(child)
    ? [child, ...elements(child.type === ActivityReadIssue ? ActivityReadIssue(child.props as React.ComponentProps<typeof ActivityReadIssue>) : child.props.children as React.ReactNode)] : []);
}
function find<T extends React.ElementType>(node: React.ReactNode, type: T) {
  const element = elements(node).find((child) => child.type === type);
  if (!element) throw new Error(`Missing element: ${String(type)}`);
  return element as React.ReactElement<React.ComponentProps<T>>;
}
function switchButton(state: ActivityState, controller: ActivityController | null) {
  const tree = PhoneStatusPanel({ state, controller });
  const toggle = find(tree, Switch);
  return Switch(toggle.props);
}
function networkSession(controller: ActivityController, initial = loaded) {
  let state = initial, cursor = 0;
  const values: unknown[] = [], cleanups: (() => void)[] = [];
  const useState = ((initialValue: unknown) => {
    const index = cursor++;
    if (!(index in values)) values[index] = typeof initialValue === "function" ? initialValue() : initialValue;
    return [values[index], (next: unknown) => { values[index] = typeof next === "function" ? next(values[index]) : next; }];
  }) as typeof React.useState;
  const useRef = ((value: unknown) => {
    const index = cursor++;
    if (!(index in values)) values[index] = { current: value };
    return values[index];
  }) as typeof React.useRef;
  const useEffect = ((effect: React.EffectCallback) => {
    const index = cursor++;
    if (!(index in values)) { values[index] = true; const cleanup = effect(); if (cleanup) cleanups.push(cleanup); }
  }) as typeof React.useEffect;
  const render = () => {
    cursor = 0;
    const spies = [vi.spyOn(React, "useState").mockImplementation(useState), vi.spyOn(React, "useRef").mockImplementation(useRef), vi.spyOn(React, "useEffect").mockImplementation(useEffect)];
    try { return WifiNetworkDialog({ state, controller }); } finally { spies.forEach((spy) => spy.mockRestore()); }
  };
  return { render, update: (patch: Partial<ActivityState>) => { state = { ...state, ...patch }; }, dispose: () => cleanups.forEach((cleanup) => cleanup()) };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("Activity phone permission setting", () => {
  it.each([true, false])("uses a controlled, keyboard-native button switch for %s", (visible) => {
    const setVisibility = vi.fn(), controller = { setVisibility } as unknown as ActivityController;
    const toggle = switchButton({ ...loaded, visibility: { data: visible, loading: false, error: null } }, controller);
    expect(toggle.props).toMatchObject({ type: "button", role: "switch", "aria-labelledby": "activity-visibility-label", "aria-checked": visible, disabled: false });
    expect(toggle.props.className).toContain("h-11 w-11");
    toggle.props.onClick?.({} as never); expect(setVisibility).toHaveBeenCalledWith(!visible);
    const html = renderToStaticMarkup(toggle);
    expect(html).toContain('role="switch"'); expect(html).not.toContain('type="checkbox"');
  });
  it("disables pending/unknown/failed settings and keeps the read recovery action", () => {
    const setVisibility = vi.fn(), loadVisibility = vi.fn();
    const controller = { setVisibility, loadVisibility } as unknown as ActivityController;
    for (const state of [
      { ...loaded, pending: "visibility" as const }, { ...loaded, pending: "wifi" as const },
      { ...loaded, visibility: { data: null, loading: false, error: null } },
      { ...loaded, visibility: { data: true, loading: true, error: null } },
      { ...loaded, visibility: { data: true, loading: false, error: "离线" } },
    ]) {
      const toggle = switchButton(state, controller); expect(toggle.props.disabled).toBe(true);
      toggle.props.onClick?.({} as never); expect(setVisibility).not.toHaveBeenCalled();
    }
    const pending = PhoneStatusPanel({ state: { ...loaded, pending: "visibility" }, controller });
    expect(elements(pending).some((element) => element.props.role === "status" && element.props.children === "保存中…")).toBe(true);
    const failed = PhoneStatusPanel({ state: { ...loaded, visibility: { data: null, loading: false, error: "离线" } }, controller });
    const retry = elements(failed).find((element) => element.type === Button && element.props.children === "重新读取权限")!;
    (retry.props.onClick as () => void)(); expect(loadVisibility).toHaveBeenCalledOnce();
  });
  it.each([0, 409])("reconciles a failed permission write (%s) with server state without a second mutation", async (status) => {
    const deps = { ...activity, ...device, getDeviceAiVisible: vi.fn(async () => true), setDeviceAiVisible: vi.fn(async () => { throw new ApiError("failed", status); }) };
    const controller = createActivityController(deps);
    try {
      await controller.loadVisibility();
      let completion: Promise<boolean> | undefined;
      const wrapped = { ...controller, setVisibility: (value: boolean) => completion = controller.setVisibility(value) };
      switchButton(controller.getState(), wrapped).props.onClick?.({} as never);
      expect(controller.getState().pending).toBe("visibility"); expect(switchButton(controller.getState(), controller).props.disabled).toBe(true);
      await completion;
      expect(deps.setDeviceAiVisible).toHaveBeenCalledTimes(1); expect(deps.getDeviceAiVisible).toHaveBeenCalledTimes(2);
      expect(controller.getState().notice).toMatchObject({ error: true });
      expect(switchButton(controller.getState(), controller).props).toMatchObject({ "aria-checked": true, disabled: false });
    } finally { controller.dispose(); }
  });
  it("waits for saved permission to be reread and allows recovery when that read fails", async () => {
    const deps = { ...activity, ...device, getDeviceAiVisible: vi.fn().mockResolvedValueOnce(false).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(true), setDeviceAiVisible: vi.fn(async () => {}) };
    const controller = createActivityController(deps);
    try {
      await controller.loadVisibility();
      let completion: Promise<unknown> | undefined;
      const wrapped = { ...controller, setVisibility: (value: boolean) => { const saved = controller.setVisibility(value); completion = saved; return saved; }, loadVisibility: () => { const read = controller.loadVisibility(); completion = read; return read; } };
      switchButton(controller.getState(), wrapped).props.onClick?.({} as never);
      expect(switchButton(controller.getState(), wrapped).props).toMatchObject({ "aria-checked": false, "aria-busy": true, disabled: true });
      await completion;
      expect(switchButton(controller.getState(), wrapped).props.disabled).toBe(true);
      const tree = PhoneStatusPanel({ state: controller.getState(), controller: wrapped });
      const retry = elements(tree).find((element) => element.type === Button && element.props.children === "重新读取权限")!;
      (retry.props.onClick as () => void)(); await completion;
      expect(switchButton(controller.getState(), wrapped).props).toMatchObject({ "aria-checked": true, disabled: false });
      expect(deps.setDeviceAiVisible).toHaveBeenCalledTimes(1);
    } finally { controller.dispose(); }
  });
});

describe("Activity network dialog and scene settings", () => {
  it("composes the form between a mature header and a sibling footer with linked submit", () => {
    const s = networkSession({} as ActivityController);
    const popup = find(s.render(), DialogContent);
    expect(popup.props.showCloseButton).toBe(false);
    expect(popup.props.className).toBeUndefined();
    expect(React.Children.toArray(popup.props.children).map((child) => (child as React.ReactElement).type)).toEqual([ActivityDialogHeader, WifiNetworkFields, DialogFooter]);
    const buttons = elements(find(popup, DialogFooter)).filter((element) => element.type === Button);
    expect(buttons.map((element) => element.props.children)).toEqual(["取消", "保存标记"]);
    expect(buttons[1].props).toMatchObject({ type: "submit", form: "activity-network-form" });
    const fields = WifiNetworkFields(find(s.render(), WifiNetworkFields).props);
    const html = renderToStaticMarkup(fields);
    expect(html).toContain("当前页面无法读取绑定手机"); expect(html).toContain("大小写和空格需一致");
    expect(find(fields, Input).props.surface).toBe("translucent"); expect(find(fields, AppSelect).props.surface).toBe("translucent");
    s.dispose();
  });
  it("keeps failed/conflicted input intact, blocks dismissal while saving, and closes only on success", async () => {
    const first = deferred<boolean>(), saveMapping = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValueOnce(true);
    const controller = { saveMapping, getState: () => ({ notice: { text: "配置已被其他页面修改，请核对后重试。" } }) } as unknown as ActivityController;
    const s = networkSession(controller);
    find(s.render(), Dialog).props.onOpenChange?.(true, {} as never);
    find(s.render(), WifiNetworkFields).props.onSsidChange(" My Wi-Fi "); find(s.render(), WifiNetworkFields).props.onSceneChange("work");
    find(s.render(), WifiNetworkFields).props.onSubmit();
    expect(saveMapping).toHaveBeenCalledWith(" My Wi-Fi ", "work", "wifi-dialog");
    s.update({ pending: "wifi" });
    const busy = s.render(); expect(find(busy, Dialog).props.disablePointerDismissal).toBe(true);
    expect(find(busy, ActivityDialogHeader).props.busy).toBe(true);
    const cancel = vi.fn();
    find(busy, Dialog).props.onOpenChange?.(false, { cancel } as never); expect(find(s.render(), Dialog).props.open).toBe(true); expect(cancel).toHaveBeenCalledOnce();
    find(s.render(), WifiNetworkFields).props.onSubmit(); expect(saveMapping).toHaveBeenCalledTimes(1);
    first.resolve(false); await first.promise; await Promise.resolve(); s.update({ pending: null });
    expect(find(s.render(), WifiNetworkFields).props).toMatchObject({ ssid: " My Wi-Fi ", scene: "work", error: expect.stringContaining("其他页面修改") });
    find(s.render(), WifiNetworkFields).props.onSubmit(); await Promise.resolve(); await Promise.resolve();
    expect(saveMapping).toHaveBeenCalledTimes(2); expect(find(s.render(), Dialog).props.open).toBe(false);
    s.dispose();
  });
  it("retains mapping validation before submission and links validation errors to the input", () => {
    const saveMapping = vi.fn(), s = networkSession({ saveMapping } as unknown as ActivityController);
    find(s.render(), WifiNetworkFields).props.onSsidChange("家庭网络"); find(s.render(), WifiNetworkFields).props.onSubmit();
    const fields = find(s.render(), WifiNetworkFields); expect(fields.props.error).toContain("已有标记"); expect(saveMapping).not.toHaveBeenCalled();
    expect(find(WifiNetworkFields(fields.props), Input).props).toMatchObject({ "aria-describedby": "activity-network-help activity-network-error" });
    s.dispose();
  });
  it("can recover a failed configuration read inside the dialog without losing input or repeating the write", () => {
    const saveMapping = vi.fn(), loadWifi = vi.fn();
    const s = networkSession({ saveMapping, loadWifi } as unknown as ActivityController);
    find(s.render(), WifiNetworkFields).props.onSsidChange("保留的网络");
    s.update({ wifi: { ...loaded.wifi, error: "读取失败" } });
    const fields = find(s.render(), WifiNetworkFields).props;
    expect(fields).toMatchObject({ ssid: "保留的网络", disabled: true, readFailed: true });
    const recovery = elements(WifiNetworkFields(fields)).find((element) => element.type === Button && element.props.children === "重新读取标记")!;
    (recovery.props.onClick as () => void)();
    expect(loadWifi).toHaveBeenCalledExactlyOnceWith(true); expect(saveMapping).not.toHaveBeenCalled();
    s.update({ wifi: loaded.wifi }); expect(find(s.render(), WifiNetworkFields).props).toMatchObject({ ssid: "保留的网络", disabled: false, readFailed: false });
    s.dispose();
  });
  it("keeps scene groups symmetric, protects long names and passes exact names to existing actions", () => {
    const saveMapping = vi.fn(), loadWifi = vi.fn(), controller = { saveMapping, loadWifi } as unknown as ActivityController;
    const state = { ...loaded, wifi: { ...loaded.wifi, data: { ...config, mappings: [{ ssid: " Long Network ".repeat(4), scene: "home" as const }, config.mappings[1]] } } };
    const tree = WifiSceneSettings({ state, controller });
    const html = renderToStaticMarkup(tree);
    expect(html).toContain("家庭网络"); expect(html).toContain("公司网络"); expect(html).not.toContain("当前页面无法读取");
    expect(elements(tree).filter((element) => element.type === "section")).toHaveLength(2);
    expect(html.match(/grid-cols-\[minmax\(0,1fr\)_auto\]/g)).toHaveLength(2);
    const actions = elements(tree).filter((element) => element.type === Button);
    for (const action of actions) (action.props.onClick as () => void)();
    expect(saveMapping.mock.calls).toEqual([[state.wifi.data.mappings[0].ssid, "work"], [state.wifi.data.mappings[0].ssid, null], ["公司网络", "home"], ["公司网络", null]]);
    const empty = renderToStaticMarkup(<WifiSceneSettings state={{ ...loaded, wifi: { ...loaded.wifi, data: { ...config, mappings: [] } } }} controller={null} />);
    expect(empty.match(/暂无标记/g)).toHaveLength(2);
  });
});
