import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { find, hookSession } from "@/components/chat/test-utils/hook-session";
import { AppSelect } from "@/components/ui/app-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { clearFeatureBinding, updateFeatureBinding } from "@/domain/registry/registry-client";
import { FEATURE_GROUPS, type FeatureSelection, type FeatureUsage } from "@/domain/registry/feature-bindings";
import { RegistryError } from "@/domain/registry/registry-types";
import { FeatureBindingDialog } from "./FeatureBindingDialog";
import { readFeatureSnapshot, type FeatureSnapshot } from "./feature-snapshot";

vi.mock("react", async original => {
  const actual = await original<typeof React>();
  return { ...actual, ...Object.fromEntries(["useState", "useRef", "useCallback", "useId", "useEffect", "useLayoutEffect", "useSyncExternalStore"].map(key => [key, vi.fn(actual[key as keyof typeof actual] as never)])) };
});
vi.mock("@/domain/registry/registry-client", () => ({ clearFeatureBinding: vi.fn(), updateFeatureBinding: vi.fn() }));
vi.mock("./feature-snapshot", () => ({ readFeatureSnapshot: vi.fn() }));
afterEach(() => { vi.restoreAllMocks(); vi.mocked(updateFeatureBinding).mockReset(); vi.mocked(clearFeatureBinding).mockReset(); vi.mocked(readFeatureSnapshot).mockReset(); });
const triple = { connection_id: "a", protocol: "anthropic_messages", model: "manual/outside-catalog" };
function snapshot(selection: FeatureSelection | null = triple): FeatureSnapshot {
  return { registry: { schema_version: 2, authority_state: "persisted_v2", migration_required: false, diagnosticCount: 0, deferredCount: 0,
    connections: ["a", "b"].map(id => ({ id, name: id, base_url: "https://synthetic.invalid", enabled: true, transport: "direct", gateway_id: null,
      default_model: `suggestion/${id}`, credential: { configured: true, masked: "••••1234", secret_ref: `ref-${id}` } })) },
  features: FEATURE_GROUPS.flatMap(group => [...group.usages]).map(usage => ({ usage, selection, diagnostic: selection ? null : "feature_binding_required",
    allowed_protocols: usage === "memory_sentinel" ? ["openai_chat_completions"] : ["openai_chat_completions", "anthropic_messages"], lifecycle: "feature" })) };
}
function setup(initial = snapshot(), usage: FeatureUsage = "memory_digest") {
  const props = { initial, usage, onObserved: vi.fn(), onSaved: vi.fn(), onClose: vi.fn(), onManageConnections: vi.fn(), finalFocus: () => null };
  const hooks = hookSession(() => FeatureBindingDialog(props)); hooks.render(); hooks.commit();
  return { hooks, props };
}
const click = (tree: React.ReactNode, label: string) => find(tree, Button, p => p.children === label).props.onClick!({} as never);
const change = (tree: React.ReactNode, label: string, value: string) => find(tree, AppSelect, p => p.ariaLabel === label).props.onValueChange(value);

describe("Feature editor behavior with fake Registry", () => {
  it("keeps literal and protocol when switching Connection; suggestion requires explicit use", () => {
    const { hooks } = setup();
    change(hooks.render(), "Connection", "b");
    expect(find(hooks.render(), Input).props.value).toBe(triple.model);
    expect(find(hooks.render(), AppSelect, p => p.ariaLabel === "Protocol").props.value).toBe(triple.protocol);
    click(hooks.render(), "采用建议模型"); expect(find(hooks.render(), Input).props.value).toBe("suggestion/b");
    expect(updateFeatureBinding).not.toHaveBeenCalled(); hooks.dispose();
  });
  it("prefills an empty literal only on deliberate Connection change, without choosing a protocol", () => {
    const { hooks } = setup(snapshot(null));
    expect(find(hooks.render(), Input).props.value).toBe("");
    change(hooks.render(), "Connection", "b");
    expect(find(hooks.render(), Input).props.value).toBe("suggestion/b");
    expect(find(hooks.render(), AppSelect, p => p.ariaLabel === "Protocol").props.value).toBe(""); hooks.dispose();
  });
  it("uses backend allowed protocols and retains disallowed historical values for repair", () => {
    const { hooks } = setup(snapshot({ ...triple, protocol: "historical" }), "memory_sentinel");
    const select = find(hooks.render(), AppSelect, p => p.ariaLabel === "Protocol");
    expect(select.props.value).toBe("historical");
    expect(select.props.options).toEqual([{ value: "historical", label: "historical（历史值，当前不允许）", disabled: true }, { value: "openai_chat_completions", label: "OpenAI Chat Completions", disabled: false }]);
    expect(find(hooks.render(), Button, p => p.children === "保存分配").props.disabled).toBe(true); hooks.dispose();
  });
  it("prevents duplicate PUT and reports success only after authoritative readback", async () => {
    let finish!: (value: FeatureSelection) => void;
    vi.mocked(updateFeatureBinding).mockImplementation(() => new Promise(done => { finish = done; }));
    vi.mocked(readFeatureSnapshot).mockResolvedValue(snapshot());
    const { hooks, props } = setup();
    const save = find(hooks.render(), Button, p => p.children === "保存分配");
    save.props.onClick!({} as never); save.props.onClick!({} as never);
    expect(updateFeatureBinding).toHaveBeenCalledTimes(1); expect(props.onSaved).not.toHaveBeenCalled();
    finish(triple); await vi.waitFor(() => expect(props.onSaved).toHaveBeenCalledWith(false));
    expect(readFeatureSnapshot).toHaveBeenCalledOnce(); expect(props.onObserved).toHaveBeenCalled(); hooks.dispose();
  });
  it("DELETE requires confirmation, reads back missing diagnostics, and never writes an empty triple", async () => {
    vi.mocked(clearFeatureBinding).mockResolvedValue(true); vi.mocked(readFeatureSnapshot).mockResolvedValue(snapshot(null));
    const { hooks, props } = setup(); click(hooks.render(), "清除当前分配");
    expect(clearFeatureBinding).not.toHaveBeenCalled(); click(hooks.render(), "取消清除");
    click(hooks.render(), "清除当前分配"); click(hooks.render(), "确认清除");
    await vi.waitFor(() => expect(props.onSaved).toHaveBeenCalledWith(true));
    expect(updateFeatureBinding).not.toHaveBeenCalled(); expect(props.onObserved.mock.calls[0][0].features[0].diagnostic).toBe("feature_binding_required"); hooks.dispose();
  });
  it.each(["network", "persistence_failed"])("blocks replay after %s and requires successful read and acknowledgement", async code => {
    vi.mocked(updateFeatureBinding).mockRejectedValue(new RegistryError(code)); vi.mocked(readFeatureSnapshot).mockRejectedValueOnce(new RegistryError("network")).mockResolvedValue(snapshot());
    const { hooks, props } = setup(); click(hooks.render(), "保存分配");
    await vi.waitFor(() => expect(readFeatureSnapshot).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(find(hooks.render(), Button, p => p.children === "重新读取当前状态")).toBeDefined());
    expect(find(hooks.render(), Button, p => p.children === "保存分配").props.disabled).toBe(true);
    expect(find(hooks.render(), Button, p => p.children === "已核对，继续编辑").props.disabled).toBe(true);
    click(hooks.render(), "重新读取当前状态");
    await vi.waitFor(() => expect(props.onObserved).toHaveBeenCalledOnce());
    expect(updateFeatureBinding).toHaveBeenCalledTimes(1); expect(props.onSaved).not.toHaveBeenCalled();
    click(hooks.render(), "已核对，继续编辑"); expect(find(hooks.render(), Button, p => p.children === "保存分配").props.disabled).toBe(false); hooks.dispose();
  });
  it("an unknown write result with matching readback still requires explicit review; concurrent changes are preserved", async () => {
    vi.mocked(updateFeatureBinding).mockRejectedValue(new RegistryError("network")); vi.mocked(readFeatureSnapshot).mockResolvedValue(snapshot());
    const { hooks, props } = setup(); click(hooks.render(), "保存分配");
    await vi.waitFor(() => expect(props.onObserved).toHaveBeenCalled()); expect(props.onSaved).not.toHaveBeenCalled();
    expect(find(hooks.render(), Input).props.value).toBe(triple.model); hooks.dispose();
    vi.mocked(updateFeatureBinding).mockResolvedValue(triple); vi.mocked(readFeatureSnapshot).mockResolvedValue(snapshot({ ...triple, model: "other-writer" }));
    const next = setup(); click(next.hooks.render(), "保存分配");
    await vi.waitFor(() => expect(next.props.onObserved).toHaveBeenCalled()); expect(next.props.onSaved).not.toHaveBeenCalled();
    expect(find(next.hooks.render(), Input).props.value).toBe(triple.model); next.hooks.dispose();
  });
  it("closing invalidates a late write/read response before another feature opens", async () => {
    let finish!: (value: FeatureSnapshot) => void;
    vi.mocked(updateFeatureBinding).mockResolvedValue(triple); vi.mocked(readFeatureSnapshot).mockImplementation(() => new Promise(done => { finish = done; }));
    const { hooks, props } = setup(); click(hooks.render(), "保存分配");
    await vi.waitFor(() => expect(readFeatureSnapshot).toHaveBeenCalled());
    const signal = vi.mocked(readFeatureSnapshot).mock.calls[0][0]; hooks.dispose(); expect(signal.aborted).toBe(true);
    finish(snapshot()); await Promise.resolve(); await Promise.resolve(); expect(props.onObserved).not.toHaveBeenCalled(); expect(props.onSaved).not.toHaveBeenCalled();
    const next = setup(snapshot({ ...triple, model: "game-only" }), "game_decision");
    expect(find(next.hooks.render(), Input).props.value).toBe("game-only"); next.hooks.dispose();
  });
});
