import * as React from "react";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { find, elements, hookSession } from "@/components/chat/test-utils/hook-session";
import { AppSelect } from "@/components/ui/app-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { discoverModels, testConnection } from "@/domain/registry/registry-client";
import type { Connection, DiscoveredModels } from "@/domain/registry/registry-types";
import { ConnectionProbe } from "./ConnectionProbe";
import { ModelDiscovery } from "./ModelDiscovery";

vi.mock("react", async original => {
  const actual = await original<typeof React>();
  return { ...actual, ...Object.fromEntries(["useState", "useRef", "useCallback", "useId", "useEffect", "useLayoutEffect", "useSyncExternalStore"].map(key => [key, vi.fn(actual[key as keyof typeof actual] as never)])) };
});
vi.mock("@/domain/registry/registry-client", () => ({ discoverModels: vi.fn(), testConnection: vi.fn() }));
afterEach(() => { vi.restoreAllMocks(); vi.mocked(discoverModels).mockReset(); vi.mocked(testConnection).mockReset(); });
const connection: Connection = { id: "synthetic", name: "Synthetic", base_url: "https://synthetic.invalid", enabled: true, transport: "direct", gateway_id: null,
  default_model: "literal-default", credential: { configured: true, masked: "••••1234", secret_ref: "ref" } };
const result = (protocol: "openai_chat_completions" | "anthropic_messages", models: string[]): DiscoveredModels => ({ connection_id: connection.id, protocol, operation: "model_list", models, truncated: false, next_page: null });

describe("Connection system controls and separated operations", () => {
  it("uses system form controls throughout the editor, discovery and test", () => {
    for (const file of ["ConnectionDetail.tsx", "ModelDiscovery.tsx", "ConnectionProbe.tsx", "ConnectionDeleteDialog.tsx"]) {
      const source = readFileSync(new URL(file, import.meta.url), "utf8");
      expect(source).not.toMatch(/<(?:input|select|option)\b/);
    }
    const editor = readFileSync(new URL("ConnectionDetail.tsx", import.meta.url), "utf8");
    expect(editor).toContain("<AppSelect"); expect(editor).toContain("<Switch"); expect(editor).toContain("<DialogBody"); expect(editor).toContain("<DialogFooter");
  });
  it("keeps a hand-entered test literal when protocol changes and never starts discovery", async () => {
    const hooks = hookSession(() => ConnectionProbe({ connection }));
    let tree = hooks.render(); hooks.commit();
    expect(testConnection).not.toHaveBeenCalled(); expect(discoverModels).not.toHaveBeenCalled();
    find(tree, Input).props.onChange!({ target: { value: "manual/keep" } } as React.ChangeEvent<HTMLInputElement>);
    tree = hooks.render(); find(tree, AppSelect).props.onValueChange("anthropic_messages");
    tree = hooks.render(); expect(find(tree, Input).props.value).toBe("manual/keep");
    vi.mocked(testConnection).mockResolvedValue({ ok: true, connection_id: connection.id, protocol: "anthropic_messages", model: "manual/keep", test_type: "basic_nonstream", validates_full_chat: false });
    find(tree, Button, props => props.children === "基础非流式测试").props.onClick!({} as never);
    await vi.waitFor(() => expect(testConnection).toHaveBeenCalledWith(connection.id, "anthropic_messages", "manual/keep", { signal: expect.any(AbortSignal) }));
    expect(discoverModels).not.toHaveBeenCalled(); hooks.dispose();
  });
  it("discovery only supplies suggestions; filling a hint is always an explicit action", async () => {
    const useModel = vi.fn(); vi.mocked(discoverModels).mockResolvedValue(result("openai_chat_completions", ["remote/model"]));
    const hooks = hookSession(() => ModelDiscovery({ connection, disabled: false, unsaved: false, onUseModel: useModel }));
    const tree = hooks.render(); hooks.commit();
    expect(discoverModels).not.toHaveBeenCalled();
    find(tree, Button, props => props.children === "获取远端模型").props.onClick!({} as never);
    await vi.waitFor(() => expect(elements(hooks.render()).some(node => node.props.children === "remote/model")).toBe(true));
    expect(useModel).not.toHaveBeenCalled();
    find(hooks.render(), Button, props => props.children === "填入预填草稿").props.onClick!({} as never);
    expect(useModel).toHaveBeenCalledWith("remote/model"); expect(testConnection).not.toHaveBeenCalled(); hooks.dispose();
  });
  it("discards an older discovery after protocol changes even when the API ignores abort", async () => {
    let resolve!: (value: DiscoveredModels) => void;
    vi.mocked(discoverModels).mockImplementationOnce(() => new Promise(done => { resolve = done; })).mockResolvedValue(result("anthropic_messages", ["current/model"]));
    const hooks = hookSession(() => ModelDiscovery({ connection, disabled: false, unsaved: false, onUseModel: vi.fn() }));
    let tree = hooks.render(); hooks.commit();
    find(tree, Button, props => props.children === "获取远端模型").props.onClick!({} as never);
    tree = hooks.render(); find(tree, AppSelect).props.onValueChange("anthropic_messages");
    tree = hooks.render(); find(tree, Button, props => props.children === "获取远端模型").props.onClick!({} as never);
    await vi.waitFor(() => expect(elements(hooks.render()).some(node => node.props.children === "current/model")).toBe(true));
    resolve(result("openai_chat_completions", ["late/model"])); await Promise.resolve(); await Promise.resolve();
    expect(elements(hooks.render()).some(node => node.props.children === "late/model")).toBe(false); hooks.dispose();
  });
});
