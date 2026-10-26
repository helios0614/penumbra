import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatRequestParametersMenu } from "./ChatRequestParametersMenu";
import { createChatRequestParametersOwner } from "@/components/chat-workspace/chat-request-parameters";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { elements, find, hookSession } from "./test-utils/hook-session";

vi.mock("react", async original => {
  const actual = await original<typeof React>();
  return { ...actual, ...Object.fromEntries(["useState", "useRef", "useCallback", "useId", "useEffect", "useLayoutEffect", "useSyncExternalStore"].map(key => [key, vi.fn(actual[key as keyof typeof actual] as never)])) };
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function session() {
  vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
  const owner = createChatRequestParametersOwner();
  let identity = { conversationId: "a", connectionId: "connection-a", profileId: null, protocol: "openai_chat_completions", model: "literal-a" }, disabled = false;
  let parameters = owner.sync(identity);
  const apply = vi.fn((scope, draft) => { const result = owner.apply(scope, draft); parameters = owner.sync(identity); return result; });
  const hooks = hookSession(() => ChatRequestParametersMenu({ parameters, disabled, onApply: apply }));
  const input = (name: "context" | "temperature") => find(hooks.render(), Input, p => p.id?.endsWith(name) ?? false).props;
  const button = (name: string) => find(hooks.render(), Button, p => p.children === name).props;
  const click = (name: string) => button(name).onClick?.({} as never);
  const submit = () => (elements(hooks.render()).find(n => n.type === "form")!.props.onSubmit as (event: unknown) => void)({ preventDefault() {} });
  return { ...hooks, apply, input, button, click, submit, parameters: () => parameters,
    open: () => find(hooks.render(), Dialog).props.onOpenChange?.(true, {} as never),
    edit: (name: "context" | "temperature", value: string) => input(name).onChange?.({ target: { value } } as never),
    switch: () => { identity = { ...identity, conversationId: "b" }; parameters = owner.sync(identity); },
    lock: () => { disabled = true; } };
}
describe("shared quick parameters form", () => {
  it("does nothing when unchanged, rejects invalid edits and cancels without losing the applied values", () => {
    const s = session(); s.open(); expect(s.button("应用到后续请求").disabled).toBe(true);
    s.edit("context", "0"); s.submit(); expect(s.apply).not.toHaveBeenCalled();
    s.edit("context", "100"); s.edit("temperature", "0"); s.submit();
    expect(s.parameters().overrides).toEqual({ contextLimit: 100, temperature: 0 });
    s.open(); s.edit("context", "10"); s.click("取消"); s.open();
    expect(s.input("context").value).toBe("100"); expect(s.apply).toHaveBeenCalledOnce();
    s.click("恢复后端默认"); expect(s.parameters().overrides).toEqual({});
  });
  it("invalidates open drafts on identity changes and rejects a retained old submit callback", () => {
    const s = session(); s.open(); s.edit("context", "10");
    const old = elements(s.render()).find(n => n.type === "form")!.props.onSubmit as (event: unknown) => void;
    s.switch(); expect(find(s.render(), Dialog).props.open).toBe(false);
    old({ preventDefault() {} }); expect(s.apply).toHaveLastReturnedWith("stale"); expect(s.parameters().overrides).toEqual({});
  });
  it("disables inputs/apply/reset after execution acquires the lock", () => {
    const s = session(); s.open(); s.edit("context", "10"); s.lock();
    s.submit(); expect(s.apply).not.toHaveBeenCalled(); expect(s.button("应用到后续请求").disabled).toBe(true);
    expect(elements(s.render()).find(n => n.type === "fieldset")!.props.disabled).toBe(true);
  });
});
