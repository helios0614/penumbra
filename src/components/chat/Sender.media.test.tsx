import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Sender } from "./Sender";
import { Button } from "@/components/ui/button";
import { find, hookSession } from "./test-utils/hook-session";
vi.mock("react", async original => {
  const actual = await original<typeof React>();
  return { ...actual, ...Object.fromEntries(["useState", "useRef", "useCallback", "useId", "useEffect", "useLayoutEffect", "useSyncExternalStore"].map(key => [key, vi.fn(actual[key as keyof typeof actual] as never)])) };
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe("Sender media slot preserves text/IME behavior", () => {
  it("allows an empty text snapshot only with completed media", async () => {
    const send = vi.fn(async () => true); let ready = false;
    const s = hookSession(() => Sender({ onSend: send, hasAttachments: true, attachmentsReady: ready, attachments: <div>draft</div> }));
    const submit = () => find(s.render(), Button, p => p["aria-label"] === "发送消息").props;
    expect(submit().disabled).toBe(true); ready = true; expect(submit().disabled).toBe(false);
    submit().onClick?.({} as never); await Promise.resolve(); expect(send).toHaveBeenCalledWith(""); s.dispose();
  });
  it("pastes only image files into the attachment callback and keeps ordinary text paste native", () => {
    const files = vi.fn(); const s = hookSession(() => Sender({ onFiles: files }));
    const paste = find(s.render(), "textarea").props.onPaste!;
    const preventDefault = vi.fn(); paste({ clipboardData: { items: [{ kind: "string", type: "text/plain" }] }, preventDefault } as never);
    expect(files).not.toHaveBeenCalled(); expect(preventDefault).not.toHaveBeenCalled();
    const image = new File(["x"], "a.png", { type: "image/png" });
    paste({ clipboardData: { items: [{ kind: "file", type: "image/png", getAsFile: () => image }] }, preventDefault } as never);
    expect(files).toHaveBeenCalledWith([image]); expect(preventDefault).toHaveBeenCalledOnce(); s.dispose();
  });
});
