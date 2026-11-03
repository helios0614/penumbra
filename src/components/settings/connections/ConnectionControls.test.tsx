import * as React from "react";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { find, elements, hookSession } from "@/components/chat/test-utils/hook-session";
import { AppSelect } from "@/components/ui/app-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { discoverModels, testConnection } from "@/domain/registry/registry-client";
import type { Connection, DiscoveredModels } from "@/domain/registry/registry-types";
import { ConnectionProbe } from "./ConnectionProbe";
import { PopoverTrigger } from "@/components/ui/popover";
import { ModelDiscovery, fetchDiscovery } from "./ModelDiscovery";

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
    tree = hooks.render(); find(tree, AppSelect).props.onValueChange("openai_chat_completions");
    tree = hooks.render(); expect(find(tree, Input).props.value).toBe("manual/keep");
    vi.mocked(testConnection).mockResolvedValue({ ok: true, connection_id: connection.id, protocol: "openai_chat_completions", model: "manual/keep", test_type: "basic_nonstream", validates_full_chat: false });
    find(tree, Button, props => props.children === "发送").props.onClick!({} as never);
    await vi.waitFor(() => expect(testConnection).toHaveBeenCalledWith(connection.id, "openai_chat_completions", "manual/keep", { signal: expect.any(AbortSignal) }, "你好"));
    expect(discoverModels).not.toHaveBeenCalled(); hooks.dispose();
  });

  const start = (tree: React.ReactNode) => (find(tree, PopoverTrigger).props.render as React.ReactElement<{ onClick: () => void }>).props.onClick();
  it("aborts and isolates late results on clear and unmount, and starts empty on reopen", async () => {
    const pending: ((value: never) => void)[] = [];
    vi.mocked(testConnection).mockImplementation(() => new Promise(done => pending.push(done)));
    const hooks = hookSession(() => ConnectionProbe({ connection }));
    let tree = hooks.render(); hooks.commit();
    find(tree, Textarea).props.onChange!({ target: { value: "custom" } } as React.ChangeEvent<HTMLTextAreaElement>);
    tree = hooks.render(); const send = find(tree, Button, p => p.children === "发送");
    send.props.onClick!({} as never); send.props.onClick!({} as never);
    expect(testConnection).toHaveBeenCalledTimes(1);
    const signal = vi.mocked(testConnection).mock.calls[0][3]!.signal!;
    find(hooks.render(), Button, p => p.children === "清空").props.onClick!({} as never);
    expect(signal.aborted).toBe(true); pending[0]({ content: "late" } as never);
    await Promise.resolve(); tree = hooks.render();
    expect(find(tree, Textarea).props.value).toBe("");
    expect(elements(tree).filter(n => n.type === "section")).toHaveLength(0);
    find(tree, Button, p => p.children === "发送").props.onClick!({} as never);
    const closedSignal = vi.mocked(testConnection).mock.calls[1][3]!.signal!;
    hooks.dispose(); expect(closedSignal.aborted).toBe(true); pending[1]({ content: "closed" } as never);
    await Promise.resolve();
    const reopened = hookSession(() => ConnectionProbe({ connection }));
    expect(find(reopened.render(), Textarea).props.value).toBe("你好");
    expect(elements(reopened.render()).filter(n => n.type === "section")).toHaveLength(0); reopened.dispose();
  });
  it("merges two successful sources, deduplicates and only uses an explicit candidate", async () => {
    const useModel = vi.fn();
    vi.mocked(discoverModels).mockImplementation(async (_, protocol) => result(protocol as "anthropic_messages", ["remote/model"]));
    const hooks = hookSession(() => ModelDiscovery({ connection, disabled: false, unsaved: false, value: "manual/literal", onUseModel: useModel }));
    const tree = hooks.render(); hooks.commit(); expect(discoverModels).not.toHaveBeenCalled(); start(tree);
    await vi.waitFor(() => expect(elements(hooks.render()).filter(n => n.type === Button && n.props.children === "remote/model")).toHaveLength(1));
    expect(discoverModels).toHaveBeenCalledTimes(2); expect(useModel).not.toHaveBeenCalled();
    expect(find(hooks.render(), Input, p => p["aria-label"] === "模型预填建议").props.value).toBe("manual/literal");
    find(hooks.render(), Button, p => p.children === "remote/model").props.onClick!({} as never);
    expect(useModel).toHaveBeenCalledWith("remote/model"); hooks.dispose();
  });
  it("shows a successful source while the other fails and preserves Anthropic pagination", async () => {
    vi.mocked(discoverModels).mockImplementation(async (_, protocol, cursor) => {
      if(protocol === "openai_chat_completions") throw new Error("synthetic");
      return {...result("anthropic_messages", cursor ? ["second", "first"] : ["first"]), truncated: !cursor, next_page: cursor ? null : "cursor"};
    });
    const hooks = hookSession(() => ModelDiscovery({ connection, disabled: false, unsaved: false, onUseModel: vi.fn() }));
    const tree=hooks.render();hooks.commit();start(tree);
    await vi.waitFor(() => expect(elements(hooks.render()).some(n=>n.props.children === "first")).toBe(true));
    find(hooks.render(), Button, p=>p.children === "读取下一页").props.onClick!({} as never);
    await vi.waitFor(() => expect(elements(hooks.render()).some(n=>n.props.children === "second")).toBe(true));
    expect(discoverModels).toHaveBeenLastCalledWith(connection.id,"anthropic_messages","cursor",{signal:expect.any(AbortSignal)});hooks.dispose();
  });
  it("discards stale refreshes and unmounted responses even when abort is ignored", async () => {
    const pending: ((value: DiscoveredModels)=>void)[]=[];
    vi.mocked(discoverModels).mockImplementation(()=>new Promise(done=>pending.push(done)));
    const useModel=vi.fn();const hooks=hookSession(()=>ModelDiscovery({connection,disabled:false,unsaved:false,onUseModel:useModel}));
    let tree=hooks.render();hooks.commit();start(tree);tree=hooks.render();start(tree);
    pending[2](result("openai_chat_completions",["current"]));pending[3](result("anthropic_messages",[]));
    await vi.waitFor(()=>expect(elements(hooks.render()).some(n=>n.props.children === "current")).toBe(true));
    pending[0](result("openai_chat_completions",["late"]));pending[1](result("anthropic_messages",["late"]));
    await Promise.resolve();await Promise.resolve();expect(elements(hooks.render()).some(n=>n.props.children === "late")).toBe(false);
    start(hooks.render());hooks.dispose();pending[4](result("openai_chat_completions",["closed"]));pending[5](result("anthropic_messages",["closed"]));expect(useModel).not.toHaveBeenCalled();
  });
  it("bounds an unresponsive source independently", async () => {
    vi.useFakeTimers();vi.mocked(discoverModels).mockImplementation(()=>new Promise(()=>{}));
    const request=fetchDiscovery(connection,"openai_chat_completions",undefined,new AbortController().signal);
    const assertion=expect(request).rejects.toMatchObject({code:"unknown"});await vi.advanceTimersByTimeAsync(15000);await assertion;vi.useRealTimers();
  });
});
