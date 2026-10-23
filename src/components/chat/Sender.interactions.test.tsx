import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Sender } from "./Sender";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent } from "@/components/ui/popover";
import { elements, find, hookSession } from "./test-utils/hook-session";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof React>();
  return { ...actual, ...Object.fromEntries(["useState", "useRef", "useCallback", "useId", "useEffect", "useLayoutEffect"].map((key) => [key, vi.fn(actual[key as keyof typeof actual] as never)])) };
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function session(onSend: React.ComponentProps<typeof Sender>["onSend"] = vi.fn(() => true)) {
  let disabled = false;
  const hooks = hookSession(() => Sender({ onSend, disabled, tools: <div>真实模型编辑器</div> }));
  const textarea = () => find(hooks.render(), "textarea").props;
  const frame = () => find(hooks.render(), "div", (p) => p.className === "chat-composer mist-solid").props;
  const expanded = () => elements(hooks.render()).find((el) => el.props["data-expanded"] !== undefined)?.props["data-expanded"];
  const change = (value: string) => textarea().onChange?.({ target: { value } } as never);
  const blur = (inside = false) => frame().onBlurCapture?.({ currentTarget: { contains: () => inside }, relatedTarget: {} } as never);
  const focus = () => frame().onFocusCapture?.({} as never);
  const menu = (open: boolean) => find(hooks.render(), Popover).props.onOpenChange?.(open, {} as never);
  const submit = () => find(hooks.render(), Button, (p) => p["aria-label"] === "发送消息").props.onClick?.({} as never);
  return { ...hooks, textarea, frame, expanded, change, blur, focus, menu, submit, setDisabled: (value: boolean) => { disabled = value; } };
}

describe("floating Sender interactions", () => {
  it("expands on empty focus, stays expanded through menu blur, and collapses outside without losing text", () => {
    const s = session();
    expect(s.expanded()).toBe(false); s.focus(); expect(s.expanded()).toBe(true);
    s.change("保留草稿"); s.menu(true); s.blur(); expect(s.expanded()).toBe(true);
    expect(find(s.render(), PopoverContent).props.side).toBe("top");
    s.menu(false); expect(s.expanded()).toBe(false); expect(s.textarea().value).toBe("保留草稿");
    s.focus(); s.blur(true); expect(s.expanded()).toBe(true);
    s.blur(); expect(s.expanded()).toBe(false); expect(s.textarea().value).toBe("保留草稿");
  });
  it("blocks duplicate submission before rerender and only clears the accepted draft snapshot", async () => {
    let accept!: (accepted: boolean) => void;
    const onSend = vi.fn(() => new Promise<boolean>((resolve) => { accept = resolve; }));
    const s = session(onSend); s.change("  第一份草稿  "); s.submit(); s.submit();
    expect(onSend).toHaveBeenCalledOnce(); expect(onSend).toHaveBeenCalledWith("第一份草稿");
    s.change("后来编辑的草稿"); accept(true); await Promise.resolve();
    expect(s.textarea().value).toBe("后来编辑的草稿");
    s.submit(); accept(true); await Promise.resolve(); expect(s.textarea().value).toBe("");
  });
  it.each([false, "throw"])("retains drafts on rejection (%s), focus changes and send lock", async (outcome) => {
    const onSend = vi.fn(async () => { if (outcome === "throw") throw new Error("synthetic"); return false; });
    const s = session(onSend); s.change("草稿"); s.submit(); await Promise.resolve();
    expect(s.textarea().value).toBe("草稿"); s.focus(); s.blur(); expect(s.textarea().value).toBe("草稿");
    s.setDisabled(true); s.submit(); expect(onSend).toHaveBeenCalledOnce(); expect(s.textarea().disabled).toBe(true);
  });
  it("preserves Chinese IME, Safari keyCode 229, Shift+Enter and normal Enter behavior", async () => {
    const onSend = vi.fn(() => true), s = session(onSend); s.change("中文");
    const key = (nativeEvent: object, shiftKey = false) => {
      const preventDefault = vi.fn();
      s.textarea().onKeyDown?.({ key: "Enter", shiftKey, nativeEvent, preventDefault } as never);
      return preventDefault;
    };
    s.textarea().onCompositionStart?.({} as never); expect(key({}).mock.calls).toHaveLength(0);
    s.textarea().onCompositionEnd?.({} as never);
    key({ isComposing: true }); key({ keyCode: 229 }); key({}, true);
    expect(onSend).not.toHaveBeenCalled();
    expect(key({})).toHaveBeenCalledOnce(); expect(onSend).toHaveBeenCalledOnce();
    await Promise.resolve(); expect(s.textarea().value).toBe("");
  });
  it("caps auto height, remeasures wrapping on width changes, and disconnects its observer", () => {
    const s = session(); let resize = () => {};
    const disconnect = vi.fn();
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: () => void) { resize = callback; }
      observe = vi.fn(); disconnect = disconnect;
    });
    const input = { style: { height: "" }, scrollHeight: 500, clientWidth: 300 };
    (s.textarea().ref as React.RefObject<unknown>).current = input; s.commit();
    expect(input.style.height).toBe("144px");
    input.scrollHeight = 72; input.clientWidth = 600; resize(); expect(input.style.height).toBe("72px");
    s.change(""); input.scrollHeight = 24; s.commit();
    s.dispose(); expect(disconnect).toHaveBeenCalledOnce();
  });
});
