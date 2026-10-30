import { messageWindowWire } from "@/test-fixtures/message-window-wire";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ModelSelectionPanel } from "./ModelSelectionPanel";
import { MainModelSelection } from "./MainModelSelection";
import { createChatSetupViewModel } from "@/application/chat-setup";
import { mapChatReadiness, mapMainConfiguration } from "@/domain/runtime";
import { mainConfigurationWire, readinessWire, OPENAI } from "@/test-fixtures/main-chat-wire";
import { find, hookSession, elements } from "./test-utils/hook-session";
import { Button } from "@/components/ui/button";
import { AppSelect } from "@/components/ui/app-select";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api";
import { createChatWorkspaceController } from "@/components/chat-workspace/chat-workspace-controller";
import { getChatSenderAvailability } from "@/components/chat-workspace/chat-sender-policy";
import { messageWire } from "@/test-fixtures/main-chat-wire";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof React>();
  return { ...actual, ...Object.fromEntries(["useState", "useRef", "useCallback", "useId", "useEffect", "useLayoutEffect"].map((key) => [key, vi.fn(actual[key as keyof typeof actual] as never)])) };
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function setup(selected = true) {
  const wire = mainConfigurationWire();
  wire.connections.push({ ...wire.connections[0], id: "connection-b", name: "备用连接", default_model: "preset-b", transport: "unknown" });
  wire.connections.push({ ...wire.connections[0], id: "connection-c", name: "第三个连接", default_model: "preset-c" });
  wire.connections.push({ ...wire.connections[0], id: "no-default", name: "手动填写", default_model: "" });
  return createChatSetupViewModel({ conversation: selected ? { id: "conv_a", title: "Synthetic", modelKey: "old", createdAt: 1, updatedAt: 2 } : null,
    availableModels: [], configuration: mapMainConfiguration(wire), readiness: mapChatReadiness(readinessWire()) });
}
function session(onSave: React.ComponentProps<typeof MainModelSelection>["onSave"] = vi.fn(async () => {}), advanced = true) {
  let props: React.ComponentProps<typeof MainModelSelection> = { setup: setup(), disabled: false, onSave, onRefresh: vi.fn(async () => {}) };
  const s = hookSession(() => { const panel = MainModelSelection(props); return ModelSelectionPanel(panel.props); });
  s.render(); s.commit();
  find(s.render(), "details").props.onToggle?.({ currentTarget: { open: advanced } } as never);
  return { ...s,
    update: (patch: Partial<typeof props>) => { props = { ...props, ...patch }; s.render(); s.commit(); },
    select: (value: string, label = "连接") => find(s.render(), AppSelect, (p) => p.ariaLabel === label).props.onValueChange(value),
    input: () => find(s.render(), Input).props,
    advanced: () => find(s.render(), "details").props.onToggle?.({ currentTarget: { open: true } } as never),
    change: (value: string) => find(s.render(), Input).props.onChange?.({ target: { value } } as never),
    finish: () => find(s.render(), Input).props.onBlur?.({} as never),
    current: () => {
      find(s.render(), "details").props.onToggle?.({ currentTarget: { open: false } } as never);
      const picker = find(s.render(), AppSelect, (p) => p.ariaLabel === "切换模型").props;
      const confirmed = elements(s.render()).find((node) => node.props["data-confirmed-model"] !== undefined);
      const html = renderToStaticMarkup(confirmed ?? <>{picker.options.find(({ value }) => value === picker.value)?.label}</>);
      find(s.render(), "details").props.onToggle?.({ currentTarget: { open: true } } as never);
      return html;
    },
  };
}
function deferred() { let resolve!: () => void; const promise = new Promise<void>((done) => { resolve = done; }); return { promise, resolve }; }
const flush = () => Promise.resolve();

describe("daily Main model selection", () => {
  it("switches complete presets directly, and can queue a return to the confirmed custom model", async () => {
    const first = deferred(), save = vi.fn().mockImplementationOnce(() => first.promise).mockResolvedValue(undefined);
    const s = session(save, false);
    const picker = () => find(s.render(), AppSelect, (p) => p.ariaLabel === "切换模型").props;
    expect(elements(s.render()).some((node) => node.type === Input)).toBe(false);
    picker().onValueChange(JSON.stringify(["connection-b", "preset-b"]));
    expect(picker().value).toBe(JSON.stringify(["connection-b", "preset-b"])); // Selecting the old value can emit a new intent.
    expect(s.current()).toContain("literal-not-in-catalog");
    find(s.render(), "details").props.onToggle?.({ currentTarget: { open: false } } as never);
    picker().onValueChange(JSON.stringify(["connection-a", "literal-not-in-catalog"]));
    first.resolve(); await flush();
    expect(save.mock.calls.map(([, selection]) => selection)).toEqual([
      { connectionId: "connection-b", protocol: OPENAI, model: "preset-b" },
      { connectionId: "connection-a", protocol: OPENAI, model: "literal-not-in-catalog" },
    ]);
  });
  it("opens manual adjustment for a preset without a model or an interface format, without submitting", () => {
    const save = vi.fn(), s = session(save, false);
    find(s.render(), AppSelect, (p) => p.ariaLabel === "切换模型").props.onValueChange(JSON.stringify(["no-default", ""]));
    expect(s.input().value).toBe(""); expect(save).not.toHaveBeenCalled();
    expect(find(s.render(), AppSelect, (p) => p.ariaLabel === "接口格式").props.value).toBe(OPENAI);
    const html = renderToStaticMarkup(s.render()); expect(html).toContain("此连接没有默认模型");
    find(s.render(), AppSelect, (p) => p.ariaLabel === "接口格式").props.onValueChange("");
    s.select("connection-b"); expect(s.input().value).toBe("preset-b"); expect(save).not.toHaveBeenCalled();
  });
  it("keeps long literals editable in the shared control size and never commits an IME Enter", () => {
    const save = vi.fn(), s = session(save), literal = "very-long-literal/".repeat(20);
    s.change(literal); s.input().onCompositionStart?.({} as never);
    s.input().onKeyDown?.({ key: "Enter", nativeEvent: { isComposing: true }, preventDefault: vi.fn() } as never); s.finish();
    expect(save).not.toHaveBeenCalled(); expect(s.input().value).toBe(literal);
    expect(s.input().controlSize).toBe("comfortable"); expect(s.input().className).toBe("text-sm");
    s.input().onCompositionEnd?.({} as never); s.finish(); expect(save).toHaveBeenCalledOnce();
  });
  it("shows Chinese daily controls, friendly effective identity, hidden advanced details and shared scroll surface", () => {
    const html = renderToStaticMarkup(<MainModelSelection setup={setup()} disabled={false} />);
    for (const text of ["当前模型", "Synthetic connection", "literal-not-in-catalog", "切换模型", "手动调整", "主动消息与提醒", "scrollbar-none"]) expect(html).toContain(text);
    for (const text of ["Literal model", "Readiness", "Connection", "Protocol", "Runtime", "Camera", "保存当前会话", "synthetic.invalid"]) expect(html).not.toContain(text);
    expect(html.replace(/<[^>]*>/g, "")).not.toContain("connection-a");
    for (const text of ["模型状态", "刷新状态", "接口标识", "当前生效模型", "border-t"]) expect(html).not.toContain(text);
    const s = session(); s.advanced(); expect(find(s.render(), AppSelect, (p) => p.ariaLabel === "接口格式").props.value).toBe(OPENAI);
  });
  it("prefills default_model and preserves Protocol even when the connection has no inferred protocol support", async () => {
    const done = deferred(), save = vi.fn(() => done.promise), s = session(save);
    s.select("connection-b"); expect(s.input().value).toBe("preset-b");
    expect(save).toHaveBeenCalledWith("conv_a", { connectionId: "connection-b", protocol: OPENAI, model: "preset-b" });
    expect(s.current()).toContain("literal-not-in-catalog"); expect(s.current()).not.toContain("preset-b");
    expect(find(s.render(), AppSelect, (p) => p.ariaLabel === "连接").props.disabled).toBe(false);
    done.resolve(); await flush(); s.update({ setup: { ...setup(), configuration: { ...setup().configuration!, selection: { connectionId: "connection-b", protocol: OPENAI, model: "preset-b" } } } });
    expect(s.current()).toContain("preset-b");
  });
  it("does not submit missing defaults and commits a manually edited literal only on completion", async () => {
    const save = vi.fn(async () => {}), s = session(save);
    s.select("no-default"); expect(s.input().value).toBe(""); expect(save).not.toHaveBeenCalled();
    s.change("t"); s.change("typed-model"); expect(save).not.toHaveBeenCalled();
    s.finish(); expect(save).toHaveBeenCalledWith("conv_a", { connectionId: "no-default", protocol: OPENAI, model: "typed-model" });
    await flush();
  });
  it("serializes fast changes, coalesces waiting selections, and does not let old readback replace the latest draft", async () => {
    const first = deferred(), second = deferred();
    const save = vi.fn().mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);
    const s = session(save); s.select("connection-b"); s.select("connection-a"); s.select("connection-c");
    expect(save).toHaveBeenCalledOnce();
    s.update({ configurationPending: true }); expect(s.input().disabled).toBe(false);
    s.update({ setup: { ...setup(), configuration: { ...setup().configuration!, selection: { connectionId: "connection-b", protocol: OPENAI, model: "preset-b" } } }, configurationPending: false });
    expect(s.input().value).toBe("preset-c"); first.resolve(); await flush();
    expect(save).toHaveBeenCalledTimes(2); expect(save.mock.calls[1][1]).toEqual({ connectionId: "connection-c", protocol: OPENAI, model: "preset-c" });
    second.resolve(); await flush(); expect(s.input().value).toBe("preset-c");
  });
  it("deduplicates Enter followed by blur and preserves the interface format while typing", async () => {
    const first = deferred(), save = vi.fn(() => first.promise), s = session(save); s.change("typed");
    s.input().onKeyDown?.({ key: "Enter", nativeEvent: { isComposing: false }, preventDefault: vi.fn() } as never); s.finish();
    first.resolve(); await flush(); await flush(); expect(save).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith("conv_a", { connectionId: "connection-a", protocol: OPENAI, model: "typed" });
  });
  it("stops after rejection, retains the latest editing intent and exposes real safe rejection feedback without fallback", async () => {
    let reject!: (reason: unknown) => void;
    const save = vi.fn(() => new Promise<void>((_, fail) => { reject = fail; })), s = session(save);
    s.select("connection-b"); s.select("connection-c");
    reject(new ApiError("private endpoint", 400, { detail: "incompatible_protocol" })); await flush();
    expect(save).toHaveBeenCalledOnce(); expect(s.input().value).toBe("preset-c");
    const text = JSON.stringify(elements(s.render()).map((node) => node.props.children).filter((v) => typeof v === "string"));
    expect(text).toContain("编辑内容已保留"); expect(text).not.toContain("private endpoint");
    expect(find(s.render(), Button, (p) => p.children === "重试切换").props.disabled).toBe(false);
  });
  it("does not save while execution/another configuration owner is locked, and removes queued saves on unmount", async () => {
    const first = deferred(), save = vi.fn(() => first.promise), s = session(save);
    s.update({ disabled: true }); s.select("connection-b"); expect(save).not.toHaveBeenCalled();
    s.update({ disabled: false, configurationPending: true }); s.select("connection-b"); expect(save).not.toHaveBeenCalled();
    s.update({ configurationPending: false }); s.select("connection-b"); s.select("connection-c"); s.dispose();
    first.resolve(); await flush(); expect(save).toHaveBeenCalledOnce();
  });
  it("keeps missing identities visible and lets the backend decide unsupported interface combinations", () => {
    const s = session(); s.update({ setup: { ...setup(), configuration: { ...setup().configuration!, connections: [], diagnostic: "missing_profile" } } });
    expect(find(s.render(), AppSelect, (p) => p.ariaLabel === "连接").props.options[0].label).toContain("当前不可用");
    expect(s.input().value).toBe("literal-not-in-catalog");
  });
  it("renders global defaults as read-only without starting mutations", () => {
    const html = renderToStaticMarkup(<MainModelSelection setup={setup(false)} disabled={false} onSave={vi.fn()} />);
    expect(html).toContain("新会话默认（只读）"); expect(html).not.toContain('aria-label="连接"');
  });
  it("refreshes readback without another PUT and preserves the unsaved latest draft", async () => {
    const save = vi.fn(async () => { throw new ApiError("private", 503); });
    const refresh = vi.fn(async () => {}), s = session(save); s.update({ onRefresh: refresh });
    s.select("connection-b"); await flush();
    await find(s.render(), Button, (p) => p.children === "刷新状态").props.onClick?.({} as never);
    expect(refresh).toHaveBeenCalledOnce(); expect(save).toHaveBeenCalledOnce();
    s.update({ setup: { ...setup(), configuration: { ...setup().configuration!, selection: { connectionId: "connection-a", protocol: OPENAI, model: "HTTP-readback" } } } });
    expect(s.input().value).toBe("preset-b");
    expect(s.current()).toContain("HTTP-readback");
  });
  it("keeps the real PR1 PUT/readback owner sequence for queued daily switches", async () => {
    let saved = { connection_id: "connection-a", protocol: OPENAI, model: "literal-not-in-catalog" };
    const puts: typeof saved[] = [];
    let finishFirst!: (response: Response) => void;
    const first = new Promise<Response>((resolve) => { finishFirst = resolve; });
    const json = (data: unknown) => new Response(JSON.stringify(Array.isArray(data) && data[0]?.conv_id ? messageWindowWire(data, data[0].conv_id) : data), { headers: { "content-type": "application/json" } });
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async (input, init) => {
      const path = String(input);
      if (init?.method === "PUT") {
        const body = JSON.parse(String(init.body));
        expect(Object.keys(body)).toEqual(["main_selection"]);
        saved = body.main_selection; puts.push(saved);
        return puts.length === 1 ? first : json({ ok: true });
      }
      if (path === "/api/conversations") return json([{ id: "conv_a", title: "Synthetic", model: "legacy", main_selection: saved,
        main_selection_diagnostic: null, created_at: 1, updated_at: 2, message_count: 1 }]);
      if (path.startsWith("/api/main/configuration?")) {
        const wire = mainConfigurationWire();
        return json({ ...wire, connection_selection: saved, connections: [wire.connections[0],
          { ...wire.connections[0], id: "connection-b", name: "B", default_model: "preset-b", transport: "unknown" },
          { ...wire.connections[0], id: "connection-c", name: "C", default_model: "preset-c" }] });
      }
      if (path.startsWith("/api/chat/readiness?")) return json(readinessWire(saved.model));
      if (path.startsWith("/api/conversations/conv_a/messages/window?")) return json([messageWire()]);
      throw new Error(`Unexpected synthetic request ${path}`);
    }));
    const controller = createChatWorkspaceController(); await controller.load();
    const s = session((id, selection) => controller.saveMainSelection(id, selection));
    const sync = () => {
      const state = controller.getState();
      if (state.status === "ready") s.update({ setup: state.workspace.setup, configurationPending: !!state.configurationPending });
    };
    sync(); const unsubscribe = controller.subscribe(sync);
    s.select("connection-b"); s.select("connection-c");
    expect(getChatSenderAvailability(controller.getState(), { kind: "idle" }).enabled).toBe(false);
    expect(puts).toHaveLength(1); finishFirst(json({ ok: true }));
    await vi.waitFor(() => expect(puts).toHaveLength(2));
    await vi.waitFor(() => expect(controller.getState()).toMatchObject({ workspace: { setup: {
      configuration: { selection: { connectionId: "connection-c", protocol: OPENAI, model: "preset-c" } },
      readiness: { kind: "available", value: { modelKey: "preset-c", ready: true } },
    } } }));
    expect(puts.map(({ connection_id }) => connection_id)).toEqual(["connection-b", "connection-c"]);
    expect(puts.every(({ protocol }) => protocol === OPENAI)).toBe(true);
    expect(s.input().value).toBe("preset-c"); expect(getChatSenderAvailability(controller.getState(), { kind: "idle" }).enabled).toBe(true);
    unsubscribe(); s.dispose(); controller.dispose();
  });
});
