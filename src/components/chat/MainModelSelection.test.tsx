import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MainModelSelection } from "./MainModelSelection";
import { createChatSetupViewModel } from "@/application/chat-setup";
import { mapChatReadiness, mapMainConfiguration } from "@/domain/runtime";
import { mainConfigurationWire, readinessWire } from "@/test-fixtures/main-chat-wire";
import { find, hookSession } from "./test-utils/hook-session";
import { Button } from "@/components/ui/button";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof React>();
  return { ...actual, ...Object.fromEntries(["useState", "useRef", "useCallback", "useId", "useEffect", "useLayoutEffect"].map((key) => [key, vi.fn(actual[key as keyof typeof actual] as never)])) };
});
afterEach(() => vi.restoreAllMocks());

describe("minimal Main model editor", () => {
  it("labels current identity and explains Runtime/background scope without exposing endpoint or credential fields", () => {
    const html = renderToStaticMarkup(<MainModelSelection setup={setup()} disabled={false} onSave={vi.fn()} />);
    expect(html).toContain("会话模型");
    expect(html).toContain("literal-not-in-catalog");
    expect(html).toContain("Connection 默认模型仅用于预填");
    expect(html).toContain("不会热切换已启动的 Runtime");
    for (const text of ["Camera", "Location", "闹钟", "查岗", "Activity greeting", "速记 Step2"]) expect(html).toContain(text);
    expect(html).not.toMatch(/synthetic.invalid|credential_ref|base_url/);
  });

  it("keeps missing saved connection/protocol visible and requires correction rather than choosing a replacement", () => {
    const base = setup();
    const value = { ...base, configuration: { ...base.configuration!, connections: [], diagnostic: "missing_profile" } };
    const html = renderToStaticMarkup(<MainModelSelection setup={value} disabled={false} onSave={vi.fn()} />);
    expect(html).toContain("connection-a（已保存，当前不可用）");
    expect(html).toContain("openai_chat_completions（已保存，当前不可用）");
    expect(html).toContain("missing_profile");
    expect(html).toMatch(/type="submit"[^>]*disabled/);
  });

  it("renders the global new-conversation default as a separate read-only scope", () => {
    const html = renderToStaticMarkup(<MainModelSelection setup={setup(false)} disabled={false} onSave={vi.fn()} />);
    expect(html).toContain("新会话默认（只读）");
    expect(html).not.toContain("保存当前会话");
    expect(html).not.toContain("<form");
  });

  it("keeps friendly identity separate from full Connection details and displays real readiness", () => {
    const html = renderToStaticMarkup(<MainModelSelection setup={setup()} disabled={false} />);
    expect(html).toContain("Synthetic connection"); expect(html).toContain("完整选择身份");
    expect(html).toContain("connection-a"); expect(html).toContain("Readiness：本地配置已就绪");
  });

  it("keeps the save lock until readback resolves and passes canonical identity once", async () => {
    let resolve!: () => void;
    const save = vi.fn(() => new Promise<void>((done) => { resolve = done; }));
    const s = hookSession(() => MainModelSelection({ setup: setup(), disabled: false, onSave: save }));
    const submit = () => find(s.render(), "form").props.onSubmit?.({ preventDefault: vi.fn() } as never);
    const first = submit(); submit();
    expect(save).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith("conv_a", { connectionId: "connection-a", protocol: "openai_chat_completions", model: "literal-not-in-catalog" });
    expect(find(s.render(), Button, (p) => p.type === "submit").props.disabled).toBe(true);
    resolve(); await first;
    expect(find(s.render(), Button, (p) => p.type === "submit").props.disabled).toBe(false);
    expect(renderToStaticMarkup(s.render())).toContain("选择已保存，并已重新读取生效状态");
  });

  it("does not save when execution/configuration is locked and preserves literal after a failed confirmation", async () => {
    let disabled = true;
    const save = vi.fn(async () => { throw new Error("synthetic readback failure"); });
    const s = hookSession(() => MainModelSelection({ setup: setup(), disabled, onSave: save }));
    const submit = () => find(s.render(), "form").props.onSubmit?.({ preventDefault: vi.fn() } as never);
    await submit(); expect(save).not.toHaveBeenCalled(); disabled = false;
    find(s.render(), "input").props.onChange?.({ target: { value: "my-literal" } } as never);
    await submit(); expect(save).toHaveBeenCalledOnce(); expect(find(s.render(), "input").props.value).toBe("my-literal");
    expect(renderToStaticMarkup(s.render())).toContain("未能确认保存结果");
  });

  it("uses connection defaults only as a draft and requires explicit Protocol selection", () => {
    const save = vi.fn();
    const s = hookSession(() => MainModelSelection({ setup: setup(), disabled: false, onSave: save }));
    find(s.render(), "select", (p) => p.value === "connection-a").props.onChange?.({ target: { value: "connection-a" } } as never);
    expect(find(s.render(), "input").props.value).toBe("prefill-only");
    expect(find(s.render(), Button, (p) => p.type === "submit").props.disabled).toBe(true);
    expect(save).not.toHaveBeenCalled();
  });
});

function setup(selected = true) {
  return createChatSetupViewModel({
    conversation: selected ? { id: "conv_a", title: "Synthetic", modelKey: "old", createdAt: 1, updatedAt: 2 } : null,
    availableModels: [], configuration: mapMainConfiguration(mainConfigurationWire()), readiness: mapChatReadiness(readinessWire()),
  });
}
