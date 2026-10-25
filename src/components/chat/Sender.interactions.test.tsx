import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Sender } from "./Sender";
import { Button } from "@/components/ui/button";
import { ComposerToolsMenu } from "./ComposerToolsMenu";
import { elements, find, hookSession } from "./test-utils/hook-session";
import { createChatSendController } from "@/application/chat-send";
import { readFileSync } from "node:fs";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof React>();
  return { ...actual, ...Object.fromEntries(["useState", "useRef", "useCallback", "useId", "useEffect", "useLayoutEffect"].map((key) => [key, vi.fn(actual[key as keyof typeof actual] as never)])) };
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function session(onSend: React.ComponentProps<typeof Sender>["onSend"] = vi.fn(() => true)) {
  let disabled = false, submitDisabled = false;
  const hooks = hookSession(() => Sender({ onSend, disabled, submitDisabled, tools: <div>真实模型编辑器</div> }));
  const textarea = () => find(hooks.render(), "textarea").props;
  const frame = () => find(hooks.render(), "div", (p) => p.className === "chat-composer mist-solid").props;
  const expanded = () => elements(hooks.render()).find((el) => el.props["data-expanded"] !== undefined)?.props["data-expanded"];
  const change = (value: string) => textarea().onChange?.({ target: { value } } as never);
  const blur = (inside = false) => frame().onBlurCapture?.({ currentTarget: { contains: () => inside }, relatedTarget: {} } as never);
  const focus = () => textarea().onFocus?.({} as never);
  const menu = (open: boolean) => find(hooks.render(), ComposerToolsMenu).props.onOpenChange(open);
  const submit = () => find(hooks.render(), Button, (p) => p["aria-label"] === "发送消息").props.onClick?.({} as never);
  return { ...hooks, textarea, frame, expanded, change, blur, focus, menu, submit, setDisabled: (value: boolean) => { disabled = value; }, setSubmitDisabled: (value: boolean) => { submitDisabled = value; } };
}

function mountMeasurements(s: ReturnType<typeof session>, compactHeight = 24, contentHeight = compactHeight) {
  const compact = { scrollHeight: compactHeight, clientWidth: 200 };
  const content = { scrollHeight: contentHeight, clientWidth: 200 };
  const mount = (name: string, element: unknown) => {
    const node = elements(s.render()).find((item) => item.props["data-measure"] === name)!;
    (node.props.ref as React.RefObject<unknown>).current = element;
  };
  mount("compact", compact); mount("content", content); s.commit();
  return { compact, content };
}

describe("floating Sender interactions", () => {
  it("edits the next draft throughout header wait and generation, but Enter and clicks cannot submit until unlocked", async () => {
    let accept!: (accepted: boolean) => void;
    const onSend = vi.fn(() => new Promise<boolean>(resolve => { accept = resolve; }));
    const s = session(onSend); s.change("第一条"); s.submit();
    expect(s.textarea().disabled).not.toBe(true); expect(s.textarea().placeholder).toBe("输入消息…");
    s.change("下一条"); s.submit(); expect(onSend).toHaveBeenCalledOnce();
    s.setSubmitDisabled(true); accept(true); await Promise.resolve();
    const blockedEnter = vi.fn(); s.textarea().onKeyDown?.({ key: "Enter", nativeEvent: {}, preventDefault: blockedEnter } as never);
    expect(blockedEnter).toHaveBeenCalledOnce(); expect(onSend).toHaveBeenCalledOnce(); expect(s.textarea().value).toBe("下一条");
    s.textarea().onCompositionStart?.({} as never); s.change("下一条中文"); s.setSubmitDisabled(false);
    const compositionEnter = vi.fn(); s.textarea().onKeyDown?.({ key: "Enter", nativeEvent: {}, preventDefault: compositionEnter } as never);
    expect(compositionEnter).not.toHaveBeenCalled(); expect(onSend).toHaveBeenCalledOnce();
    s.textarea().onCompositionEnd?.({} as never); expect(s.textarea().value).toBe("下一条中文");
    expect(find(s.render(), Button, p => p["aria-label"] === "发送消息").props.disabled).toBe(false);
    expect(onSend).toHaveBeenCalledOnce(); s.submit(); expect(onSend).toHaveBeenLastCalledWith("下一条中文");
    accept(true); await Promise.resolve(); s.dispose();
  });
  it("leaves parent-retained unknown submissions outside the next editable text draft", async () => {
    let finish!: (value: "retained") => void;
    const s = session(() => new Promise<"retained">(resolve => { finish = resolve; }));
    s.change("不可重复的原提交"); s.submit(); s.change("下一轮草稿"); finish("retained"); await Promise.resolve();
    expect(s.textarea().value).toBe("下一轮草稿"); expect(elements(s.render()).some(item => item.type === "summary")).toBe(false); s.dispose();
  });
  it("expands on empty focus, stays expanded through menu blur, and collapses outside without losing text", () => {
    const s = session();
    expect(s.expanded()).toBe(false); s.focus(); expect(s.expanded()).toBe(true);
    s.change("保留草稿"); s.menu(true); s.blur(); expect(s.expanded()).toBe(true);
    s.menu(false); expect(s.expanded()).toBe(false); expect(s.textarea().value).toBe("保留草稿");
    s.focus(); s.blur(true); expect(s.expanded()).toBe(true);
    s.blur(); expect(s.expanded()).toBe(false); expect(s.textarea().value).toBe("保留草稿");
  });
  it("keeps an unfocused single row compact through trigger and portalled menu focus", () => {
    const s = session(); s.change("短草稿");
    s.frame().onFocusCapture?.({ target: {} } as never); // Trigger/Portal focus is not textarea focus.
    s.menu(true); s.blur(); expect(s.expanded()).toBe(false);
    s.menu(false); expect(s.expanded()).toBe(false); expect(s.textarea().value).toBe("短草稿");
    s.focus(); s.menu(true); s.blur(); expect(s.expanded()).toBe(true);
  });
  it("blocks duplicate submission before rerender and only clears the accepted draft snapshot", async () => {
    let accept!: (accepted: boolean) => void;
    const onSend = vi.fn(() => new Promise<boolean>((resolve) => { accept = resolve; }));
    const s = session(onSend); s.change("  第一份草稿  "); s.submit(); s.submit();
    expect(onSend).toHaveBeenCalledOnce(); expect(onSend).toHaveBeenCalledWith("第一份草稿");
    expect(s.textarea().value).toBe(""); expect(s.textarea().placeholder).toBe("输入消息…");
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
  it("keeps soft-wrapped drafts expanded after blur, remeasures on rotation and cleans up", () => {
    const s = session(); let resize = () => {};
    const disconnect = vi.fn();
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: () => void) { resize = callback; }
      observe = vi.fn(); disconnect = disconnect;
    });
    const { compact, content } = mountMeasurements(s, 500, 500);
    expect(s.frame().style).toEqual({ "--chat-text-height": "144px" });
    s.blur(); expect(s.expanded()).toBe(true);
    compact.scrollHeight = 48; content.scrollHeight = 24; compact.clientWidth = 300; resize();
    expect(s.expanded()).toBe(true); // One line when expanded, two when compact: no oscillation.
    compact.scrollHeight = 24; compact.clientWidth = 600; resize();
    expect(s.expanded()).toBe(false); expect(s.frame().style).toEqual({ "--chat-text-height": "24px" });
    s.dispose(); expect(disconnect).toHaveBeenCalledOnce();
  });

  it("retains the same textarea/ref and IME state through expansion, multiline blur and menu focus", () => {
    const send = vi.fn(() => true), s = session(send), ref = s.textarea().ref;
    const measured = mountMeasurements(s);
    s.change("a\nb"); measured.compact.scrollHeight = 48; measured.content.scrollHeight = 48;
    s.render(); s.commit(); s.blur(); expect(s.expanded()).toBe(true);
    s.textarea().onCompositionStart?.({} as never); s.focus(); s.menu(true); s.blur();
    expect(s.textarea().ref).toBe(ref); expect(s.textarea().value).toBe("a\nb");
    s.textarea().onKeyDown?.({ key: "Enter", shiftKey: false, nativeEvent: {}, preventDefault: vi.fn() } as never);
    expect(send).not.toHaveBeenCalled();
    s.menu(false); expect(s.expanded()).toBe(true);
    measured.compact.scrollHeight = 24; measured.content.scrollHeight = 24; s.change(""); s.render(); s.commit();
    expect(s.expanded()).toBe(false); s.focus(); expect(s.expanded()).toBe(true);
  });

  it("restores unaccepted text without overwriting concurrent edits, even if the edit matches the submitted text", async () => {
    let finish!: (value: boolean) => void;
    const s = session(() => new Promise<boolean>((resolve) => { finish = resolve; }));
    s.change("原文"); s.submit(); s.change("新草稿"); finish(false); await Promise.resolve();
    expect(s.textarea().value).toBe("新草稿");
    expect(find(s.render(), "summary").props.children).toContain("未确认的提交原文已保留（");
    find(s.render(), Button, (p) => p.children === "恢复到草稿").props.onClick?.({} as never);
    expect(s.textarea().value).toBe("新草稿\n\n原文");
    s.submit(); s.change("新草稿\n\n原文"); finish(true); await Promise.resolve();
    expect(s.textarea().value).toBe("新草稿\n\n原文"); // A new edit/revision must survive acceptance of the old snapshot.
  });

  it("clears on real transport acceptance before the first chunk and does not resurrect it on later uncertainty", async () => {
    let accept!: (response: Response) => void;
    let body!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({ start(writer) { body = writer; } });
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(() => new Promise((resolve) => { accept = resolve; }));
    vi.stubGlobal("fetch", fetch);
    const controller = createChatSendController({ createUuid: () => "draft-acceptance", reconcileHistory: async () => {
      throw new Error("synthetic history unavailable");
    } });
    const s = session((content) => controller.send({ conversationId: "synthetic", content }));
    s.change("待提交原文"); s.submit();
    expect(controller.getState().kind).toBe("sending-user"); expect(s.textarea().value).toBe("");
    expect(s.textarea().placeholder).toBe("输入消息…");
    accept(new Response(stream, { headers: { "content-type": "text/event-stream" } }));
    await vi.waitFor(() => expect(controller.getState().kind).toBe("streaming"));
    await vi.waitFor(() => expect(s.textarea().placeholder).toBe("输入消息…"));
    expect(s.textarea().value).toBe("");
    body.close(); await vi.waitFor(() => expect(controller.getState().kind).toBe("finalization-uncertain"));
    expect(s.textarea().value).toBe(""); expect(fetch).toHaveBeenCalledOnce(); controller.dispose();
  });

  it("returns the pending original when opening fails and the real controller enters unknown recovery", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new TypeError("synthetic offline"));
    vi.stubGlobal("fetch", fetch);
    const controller = createChatSendController({ createUuid: () => "draft-unknown", reconcileHistory: async () => {
      throw new Error("synthetic history unavailable");
    } });
    const s = session((content) => controller.send({ conversationId: "synthetic", content }));
    s.change("不可丢失的原文"); s.submit(); expect(s.textarea().value).toBe("");
    await vi.waitFor(() => expect(controller.getState().kind).toBe("finalization-uncertain"));
    await vi.waitFor(() => expect(s.textarea().value).toBe("不可丢失的原文"));
    expect(fetch).toHaveBeenCalledOnce(); controller.dispose();
  });

  it("uses a 200ms geometry transition, reduced motion override, hidden scrollbars and a whole-Composer tools anchor", () => {
    const css = readFileSync(new URL("./chat.css", import.meta.url), "utf8"), s = session();
    expect(css).toContain("height 200ms ease, padding 200ms ease");
    expect(css).toMatch(/prefers-reduced-motion: reduce[\s\S]*\.chat-composer-input[\s\S]*transition: none/);
    expect(s.textarea().className).toContain("scrollbar-none");
    expect(find(s.render(), ComposerToolsMenu).props.anchor).toBe(s.frame().ref);
  });
  it("centers the 24px text line and button hit boxes on one axis without a translate offset", () => {
    const css = readFileSync(new URL("./chat.css", import.meta.url), "utf8");
    expect(css).toContain("padding: 13px 52px"); expect(css).toContain("padding: 17px 60px");
    expect(css).toContain("bottom: 7px"); expect(css).not.toContain("translateY");
    expect(1 + 13 + 24 / 2).toBe(52 / 2);
    expect(52 - 1 - 7 - 36 / 2).toBe(52 / 2);
    expect(1 + 17 + 24 / 2).toBe(60 / 2);
    expect(60 - 1 - 7 - 44 / 2).toBe(60 / 2);
    expect(css).toContain("padding: 12px 16px 60px"); expect(css).toContain("height 200ms ease");
  });
});

describe("PR3 Composer insertion and draft snapshots", () => {
  it("appends after existing text, focuses without scrolling ancestors, and moves the cursor to the end", () => {
    const apiRef: React.RefObject<import("./composer-draft").SenderHandle | null> = { current: null };
    const snapshot = vi.fn(), focus = vi.fn(), selection = vi.fn(), onSend = vi.fn();
    const hooks = hookSession(() => Sender({ apiRef, onDraftChange: snapshot, onSend, initialDraft: { value: "我还想问一个问题：", recoveryDrafts: [] } }));
    const textarea = () => find(hooks.render(), "textarea").props;
    (textarea().ref as React.RefObject<unknown>).current = { focus, setSelectionRange: selection, scrollHeight: 200, scrollTop: 0 };
    hooks.commit(); expect(apiRef.current?.append("好，我信你一次。\n下一行")).toBe(true);
    hooks.render(); hooks.commit();
    expect(textarea().value).toBe("我还想问一个问题：\n\n好，我信你一次。\n下一行");
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    const length = String(textarea().value).length; expect(selection).toHaveBeenLastCalledWith(length, length);
    expect(snapshot).toHaveBeenLastCalledWith({ value: textarea().value, recoveryDrafts: [] }); expect(onSend).not.toHaveBeenCalled();
    hooks.dispose(); expect(apiRef.current).toBeNull();
  });
  it("queues insertion until composition finishes and keeps the final IME text", () => {
    const apiRef: React.RefObject<import("./composer-draft").SenderHandle | null> = { current: null };
    const hooks = hookSession(() => Sender({ apiRef }));
    const textarea = () => find(hooks.render(), "textarea").props;
    hooks.render(); hooks.commit();
    textarea().onCompositionStart?.({} as never);
    expect(apiRef.current?.append("追加正文")).toBe(true); expect(textarea().value).toBe("");
    textarea().onChange?.({ target: { value: "输入法完成" } } as never);
    textarea().onCompositionEnd?.({} as never);
    expect(textarea().value).toBe("输入法完成\n\n追加正文");
    hooks.dispose();
  });
  it("restores a conversation's draft and recovery text when the keyed Sender returns", () => {
    let draft = { value: "A 草稿", recoveryDrafts: ["A 未确认原文"] as readonly string[] };
    const hooks = hookSession(() => Sender({ initialDraft: draft, onDraftChange: (next) => { draft = next; } }));
    const textarea = find(hooks.render(), "textarea").props;
    textarea.onChange?.({ target: { value: "A 修改后" } } as never); hooks.render(); hooks.commit(); hooks.dispose();
    const other = hookSession(() => Sender({ initialDraft: undefined }));
    expect(find(other.render(), "textarea").props.value).toBe(""); other.dispose();
    const returned = hookSession(() => Sender({ initialDraft: draft }));
    expect(find(returned.render(), "textarea").props.value).toBe("A 修改后");
    expect(find(returned.render(), "summary").props.children).toContain("未确认的提交原文已保留（"); returned.dispose();
  });
});
