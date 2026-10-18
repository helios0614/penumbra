import { describe, expect, it, vi } from "vitest";
import { copyWithFeedback } from "./copy-feedback";

describe("Chat clipboard acknowledgement", () => {
  it("waits for clipboard resolution before producing the single success outlet", async () => {
    let resolve!: () => void;
    const write = vi.fn(() => new Promise<void>((done) => { resolve = done; })), notify = vi.fn();
    const pending = copyWithFeedback("正文", write, notify);
    expect(write).toHaveBeenCalledWith("正文"); expect(notify).not.toHaveBeenCalled();
    resolve(); expect(await pending).toBe(true);
    expect(notify).toHaveBeenCalledExactlyOnceWith({ type: "success", text: "已复制", dedupeKey: "copy" });
  });
  it.each(["rejection", "missing-api"])("reports %s without claiming success or throwing an unhandled rejection", async (kind) => {
    const write = kind === "rejection" ? vi.fn(async () => { throw new Error("denied"); }) : vi.fn((): Promise<void> => { throw new Error("unavailable"); });
    const notify = vi.fn();
    expect(await copyWithFeedback("正文", write, notify)).toBe(false);
    expect(notify).toHaveBeenCalledExactlyOnceWith({ type: "error", text: "复制失败，请重试", dedupeKey: "copy" });
  });
});
