import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { WifiConfig } from "@/domain/device-context";
import { INITIAL_ACTIVITY_STATE } from "@/application/activity/activity-state";
import { WifiNetworkDialog, WifiNetworkFields, networkAdditionError } from "./WifiNetworkDialog";

const config: WifiConfig = { revision: 3, mappings: [{ ssid: "Family", scene: "home" }], cacheMaxAgeSeconds: 86400 };
describe("Audited manual network addition", () => {
  it("uses a low-frequency dialog trigger without an always-visible form", () => {
    const state = { ...INITIAL_ACTIVITY_STATE, wifi: { data: config, loading: false, error: null } };
    const html = renderToStaticMarkup(<WifiNetworkDialog state={state} controller={null} />);
    expect(html).toContain("添加网络标记"); expect(html).not.toContain("<form"); expect(html).not.toContain("<input");
  });
  it("shows real config input and a failure without discarding the user's draft", () => {
    const html = renderToStaticMarkup(<WifiNetworkFields ssid=" My Home " scene="home" disabled={false} error="保存失败，请核对后重试。" onSubmit={vi.fn()} onSsidChange={vi.fn()} onSceneChange={vi.fn()} />);
    expect(html).toContain('value=" My Home "'); expect(html).toContain('autoCapitalize="none"'); expect(html).toContain('role="alert"'); expect(html).toContain("保存失败");
    expect(html).not.toContain("浏览器当前网络");
  });
  it("reuses server mapping rules and does not silently edit an existing mapping through Add", () => {
    expect(networkAdditionError(config, "Family", "work")).toContain("已有标记");
    expect(networkAdditionError(config, "family", "work")).toBeNull();
    expect(networkAdditionError(config, " Family ", "work")).toBeNull();
    for (const ssid of ["", "中".repeat(11), "a\n", "a".repeat(33)]) expect(networkAdditionError(config, ssid, "home")).not.toBeNull();
    expect(networkAdditionError(config, "a".repeat(32), "work")).toBeNull();
  });
  it("retains the backend maximum of 128 entries", () => {
    const full = { ...config, mappings: Array.from({ length: 128 }, (_, n) => ({ ssid: String(n), scene: "home" as const })) };
    expect(networkAdditionError(full, "another", "work")).not.toBeNull();
  });
});
