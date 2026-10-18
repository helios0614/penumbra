import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MapPin } from "lucide-react";
import { createLocationController } from "@/application/location/location-controller";
import { draftFromConfig } from "@/application/location/location-draft";
import { INITIAL_LOCATION_STATE } from "@/application/location/location-state";
import { locationConfig, locationStatus } from "@/domain/location/location-fixtures";
import { createLocationNavigation } from "./location-navigation";
import { LocationAdvanced } from "./LocationAdvanced";
import { LocationCredentials } from "./LocationCredentials";
import { LocationQuietHours } from "./LocationQuietHours";
import { LocationPois } from "./LocationPois";
import { Button } from "@/components/ui/button";

// Inspect the real feature callbacks without mounting a browser or emulating Base UI.
function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  return Children.toArray(node).flatMap((child) => isValidElement<Record<string, unknown>>(child)
    ? [child, ...elements(child.props.children as ReactNode)] : []);
}
function capture(render: () => ReactNode) {
  let tree: ReactNode;
  function Capture() { tree = render(); return null; }
  renderToStaticMarkup(<Capture />); return tree;
}
function button(node: ReactNode, label: string) {
  const item = elements(node).find((element) => element.type === Button &&
    (element.props["aria-label"] === label || Children.toArray(element.props.children as ReactNode).includes(label)));
  if (!item) throw new Error(`Missing button: ${label}`);
  return item;
}
const state = () => { const config = locationConfig(); return { ...INITIAL_LOCATION_STATE, config, status: locationStatus(), baseline: draftFromConfig(config), draft: draftFromConfig(config) }; };
function fakeApi(config = locationConfig()) {
  const unexpected = async () => { throw new Error("Unexpected operation"); };
  return { getLocationConfig: async () => config, getLocationStatus: async () => locationStatus(), saveLocationConfig: vi.fn(async () => {}),
    setLocationHome: unexpected, searchLocationPois: unexpected, revealLocationKey: unexpected, clearLocationKey: unexpected };
}

describe("Location scoped interactions", () => {
  it("binds each group clear to its own pair without an immediate request", async () => {
    const initial = state();
    initial.config.values.quiet_hours_weekday_start = "23:00"; initial.config.values.quiet_hours_weekday_end = "09:00";
    initial.config.values.quiet_hours_weekend_end = "10:00";
    const api = fakeApi(initial.config), controller = createLocationController(api);
    try {
      await controller.refresh();
      for (const kind of ["weekday", "weekend"]) {
        const tree = LocationQuietHours({ state: controller.getState(), controller });
        const group = elements(tree).find((element) => element.props.kind === kind)!;
        const render = group.type as (props: Record<string, unknown>) => ReactNode;
        const clear = button(render(group.props), kind === "weekday" ? "清空工作日专用时段" : "清空休息日专用时段");
        expect(clear.props.disabled).toBe(false); (clear.props.onClick as () => void)();
      }
      expect(api.saveLocationConfig).not.toHaveBeenCalled();
      expect(controller.getState().draft).toMatchObject({ quiet_hours_start: "00:00", quiet_hours_end: "08:00",
        quiet_hours_weekday_start: "", quiet_hours_weekday_end: "", quiet_hours_weekend_start: "", quiet_hours_weekend_end: "" });
    } finally { controller.dispose(); }
  });
  it("routes Key and position form submissions independently and disables saves for unchanged inputs", () => {
    const controller = createLocationController(fakeApi()), saveKey = vi.spyOn(controller, "saveKey").mockResolvedValue(), savePosition = vi.spyOn(controller, "savePosition").mockResolvedValue();
    const commonSave = vi.spyOn(controller, "save").mockResolvedValue(), current = state();
    try {
      let key = LocationCredentials({ state: current, controller, onClear: vi.fn() });
      expect(button(key, "保存 Key").props.disabled).toBe(true);
      current.replacementKey = " "; expect(button(LocationCredentials({ state: current, controller, onClear: vi.fn() }), "保存 Key").props.disabled).toBe(true);
      current.replacementKey = "new-key";
      key = LocationCredentials({ state: current, controller, onClear: vi.fn() });
      expect(button(key, "保存 Key").props.disabled).toBe(false);
      const preventDefault = vi.fn(); key.props.onSubmit({ preventDefault });
      expect(saveKey).toHaveBeenCalledOnce(); expect(preventDefault).toHaveBeenCalledOnce();
      let advanced = capture(() => LocationAdvanced({ state: current, controller, onHome: vi.fn(), onClear: vi.fn() }));
      expect(button(advanced, "保存位置参数").props.disabled).toBe(true);
      current.draft.poi_radius = "4000";
      advanced = capture(() => LocationAdvanced({ state: current, controller, onHome: vi.fn(), onClear: vi.fn() }));
      expect(button(advanced, "保存位置参数").props.disabled).toBe(false);
      const form = elements(advanced).find((element) => element.type === "form" && element.props["aria-label"] === "位置参数")!;
      (form.props.onSubmit as (event: { preventDefault: () => void }) => void)({ preventDefault });
      expect(savePosition).toHaveBeenCalledOnce(); expect(commonSave).not.toHaveBeenCalled();
      const quiet = LocationQuietHours({ state: current, controller });
      expect(button(quiet, "保存配置").props.disabled).toBe(true);
    } finally { controller.dispose(); }
  });
  it("retains reload and exit protection while any other region still has a draft", async () => {
    const controller = createLocationController(fakeApi());
    const host = Object.assign(new EventTarget(), { history: { state: null, pushState: vi.fn(), back: vi.fn() }, location: { href: "https://test.invalid/app/location" } });
    const confirm = vi.fn(), discard = vi.fn(() => controller.discard()), exit = vi.fn();
    const navigation = createLocationNavigation(host, { dirty: () => controller.getState().dirty, busy: () => Boolean(controller.getState().pending), confirm, discard });
    try {
      await controller.refresh(); controller.edit("quiet_hours_end", "09:30"); controller.edit("home_threshold", "750"); controller.replaceKey("new-key");
      for (const save of [controller.saveKey, controller.savePosition]) {
        await save(); navigation.exit(exit);
        const unload = new Event("beforeunload", { cancelable: true }); host.dispatchEvent(unload);
        expect(unload.defaultPrevented).toBe(true); expect(exit).not.toHaveBeenCalled(); expect(discard).not.toHaveBeenCalled();
      }
      expect(confirm).toHaveBeenCalledTimes(2);
      await controller.save(); navigation.exit(exit);
      expect(controller.getState().dirty).toBe(false); expect(exit).toHaveBeenCalledOnce();
      const cleanUnload = new Event("beforeunload", { cancelable: true }); host.dispatchEvent(cleanUnload); expect(cleanUnload.defaultPrevented).toBe(false);
    } finally { navigation.dispose(); controller.dispose(); }
  });
  it("keeps the home action lightweight and its confirmation callback separate from saving", () => {
    const onHome = vi.fn();
    const tree = capture(() => LocationAdvanced({ state: state(), controller: null, onHome, onClear: vi.fn() }));
    const home = button(tree, "使用最近上报位置设为家");
    expect(home.props.type).toBe("button"); expect(home.props.variant).toBe("ghost");
    expect(home.props.className).not.toContain("bg-primary"); expect(home.props.className).toContain("text-xs");
    (home.props.onClick as () => void)(); expect(onHome).toHaveBeenCalledOnce();
  });
  it("retains the thumbnail slot and pin after image failure and passes the original POI to details", () => {
    const current = state(), onDetail = vi.fn();
    const poi = Object.freeze({ name: "测试地点", category: "餐饮服务;中餐厅", address: "测试地址", distance: 280, rating: "4.5", photo: "https://images.invalid/poi.jpg", phone: null, cost: null });
    current.status = { ...current.status, pois: { "餐饮美食": [poi] } };
    const tree = capture(() => LocationPois({ state: current, controller: null, onDetail }));
    const row = button(tree, "查看测试地点详情");
    const slot = elements(row).find((element) => element.type === "span" && String(element.props.className).includes("bg-primary/10"))!;
    const image = elements(slot).find((element) => element.type === "img")!;
    const target = { hidden: false };
    (image.props.onError as (event: { currentTarget: typeof target }) => void)({ currentTarget: target });
    expect(target.hidden).toBe(true);
    expect(slot.props.className).toContain("size-12"); expect(slot.props.className).toContain("sm:size-14");
    expect(elements(slot).some((element) => element.type === MapPin)).toBe(true);
    (row.props.onClick as () => void)(); expect(onDetail.mock.calls[0][0]).toBe(poi); expect(poi.photo).toBe("https://images.invalid/poi.jpg");
  });
});
