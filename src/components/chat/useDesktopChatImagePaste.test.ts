import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDesktopChatImagePaste } from "./useDesktopChatImagePaste";
import { receiveClipboardImages } from "./image-paste";
import { hookSession } from "./test-utils/hook-session";

vi.mock("react", async original => {
  const actual = await original<typeof React>();
  return { ...actual, useEffect: vi.fn(actual.useEffect) };
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function clipboard(items: readonly { kind: string; type: string; getAsFile?: () => File | null }[]) {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", { value: { items } });
  return event as ClipboardEvent;
}
const image = () => new File(["synthetic"], "paste.png", { type: "image/png" });
const imageItem = (file: File) => ({ kind: "file", type: file.type, getAsFile: () => file });

describe("shared image clipboard reception", () => {
  it("consumes mixed image/text once and leaves non-images, missing data and unreadable files native", () => {
    const files = vi.fn(), file = image();
    const event = clipboard([{ kind: "string", type: "text/plain" }, imageItem(file), imageItem(new File(["x"], "clip.mp4", { type: "video/mp4" }))]);
    expect(receiveClipboardImages(event, files)).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(files).toHaveBeenCalledExactlyOnceWith([file]);
    expect(receiveClipboardImages(event, files)).toBe(false);
    expect(files).toHaveBeenCalledOnce();
    for (const event of [new Event("paste") as ClipboardEvent, clipboard([{ kind: "string", type: "text/plain" }]), clipboard([{ kind: "file", type: "image/png", getAsFile: () => null }])]) {
      expect(receiveClipboardImages(event, files)).toBe(false);
      expect(event.defaultPrevented).toBe(false);
    }
    expect(files).toHaveBeenCalledOnce();
  });
});

describe("desktop page paste listener lifecycle", () => {
  function setup() {
    const doc = Object.assign(new EventTarget(), { body: {}, documentElement: {}, activeElement: null as unknown, querySelectorAll: () => [] });
    doc.activeElement = doc.body;
    vi.stubGlobal("document", doc);
    vi.stubGlobal("navigator", { userAgent: "Desktop", platform: "MacIntel", maxTouchPoints: 0 });
    const scope = { ownerDocument: doc } as unknown as HTMLDivElement;
    const ref = { current: scope as HTMLDivElement | null };
    const add = vi.spyOn(doc, "addEventListener"), remove = vi.spyOn(doc, "removeEventListener");
    let onFiles: ((files: readonly File[]) => void) | undefined = vi.fn();
    const s = hookSession(() => useDesktopChatImagePaste(ref, onFiles));
    const render = () => { s.render(); s.commit(); };
    const paste = () => { const event = clipboard([imageItem(image())]); doc.dispatchEvent(event); return event; };
    return { ...s, render, paste, ref, add, remove, initial: onFiles, setReceiver: (next: typeof onFiles) => { onFiles = next; render(); } };
  }

  it("owns one listener across rerenders, replaces the conversation callback and removes it on disable/unmount", () => {
    const s = setup(); s.render(); s.render(); s.render();
    expect(s.add).toHaveBeenCalledOnce();
    expect(s.paste().defaultPrevented).toBe(true); expect(s.initial).toHaveBeenCalledOnce();
    const next = vi.fn(); s.setReceiver(next);
    expect(s.remove).toHaveBeenCalledOnce(); s.paste();
    expect(next).toHaveBeenCalledOnce(); expect(s.initial).toHaveBeenCalledOnce();
    s.setReceiver(undefined); expect(s.paste().defaultPrevented).toBe(false);
    expect(next).toHaveBeenCalledOnce();
    s.setReceiver(next); s.paste(); expect(next).toHaveBeenCalledTimes(2);
    s.ref.current = null; expect(s.paste().defaultPrevented).toBe(false);
    s.dispose(); expect(s.paste().defaultPrevented).toBe(false);
    expect(s.remove).toHaveBeenCalledTimes(3); expect(next).toHaveBeenCalledTimes(2);
  });

  it.each([
    { userAgent: "iPhone", platform: "iPhone", maxTouchPoints: 5 },
    { userAgent: "Desktop Safari", platform: "MacIntel", maxTouchPoints: 5 },
    { userAgent: "Android", platform: "Linux", maxTouchPoints: 1 },
  ])("leaves mobile paste unchanged (%j)", navigator => {
    const s = setup(); vi.stubGlobal("navigator", navigator); s.render();
    expect(s.add).not.toHaveBeenCalled(); expect(s.paste().defaultPrevented).toBe(false);
    expect(s.initial).not.toHaveBeenCalled(); s.dispose();
  });
});
