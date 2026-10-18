import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createToastScope, createToastStore, type ToastStore } from "./toast-store";
import { ToastMessage } from "./toast";
import { toastGeometry } from "./toast-viewport";

let store: ToastStore;
beforeEach(() => { vi.useFakeTimers(); store = createToastStore(); });
afterEach(() => { store.dispose(); vi.useRealTimers(); });
describe("Toast lifecycle", () => {
  it("expires success/info/error at their distinct defaults and supports an explicit duration", () => {
    store.show({ type: "success", text: "已保存" });
    vi.advanceTimersByTime(2999); expect(store.getSnapshot().items).toHaveLength(1);
    vi.advanceTimersByTime(1); expect(store.getSnapshot().items).toHaveLength(0);
    store.show({ type: "info", text: "已提交" });
    vi.advanceTimersByTime(3999); expect(store.getSnapshot().items).toHaveLength(1);
    vi.advanceTimersByTime(1); expect(store.getSnapshot().items).toHaveLength(0);
    store.show({ type: "error", text: "复制失败" });
    vi.advanceTimersByTime(4999); expect(store.getSnapshot().items).toHaveLength(1);
    vi.advanceTimersByTime(1); expect(store.getSnapshot().items).toHaveLength(0);
    store.show({ type: "success", text: "保存成功", duration: 6000 });
    vi.advanceTimersByTime(6000); expect(store.getSnapshot().items).toHaveLength(0);
  });
  it("updates a dedupe key and resets its timer without duplicating identical live-region text", () => {
    const id = store.show({ type: "success", text: "已保存", dedupeKey: "save" });
    vi.advanceTimersByTime(2000);
    expect(store.show({ type: "success", text: "已保存", dedupeKey: "save" })).toBe(id);
    expect(store.getSnapshot().announcement).toBe("已保存");
    expect(store.getSnapshot().items).toHaveLength(1);
    vi.advanceTimersByTime(2000); expect(store.getSnapshot().items).toHaveLength(1);
    store.show({ type: "error", text: "复制失败", dedupeKey: "save" });
    expect(store.getSnapshot().items[0]).toMatchObject({ id, type: "error", text: "复制失败" });
    expect(store.getSnapshot().announcement).toBe("复制失败");
    vi.advanceTimersByTime(5000); expect(store.getSnapshot().items).toHaveLength(0);
    expect(store.getSnapshot().announcement).toBe("");
  });
  it("limits capacity, releases evicted timers and isolates operation/page scopes", () => {
    const a = createToastScope(store, "date-a"), b = createToastScope(store, "date-b");
    a.show({ type: "info", text: "相同结果" }); b.show({ type: "info", text: "相同结果" });
    expect(store.getSnapshot().items).toHaveLength(2);
    a.show({ type: "success", text: "新结果" });
    expect(store.getSnapshot().items.map((item) => item.text)).toEqual(["相同结果", "新结果"]);
    expect(vi.getTimerCount()).toBe(2);
    a.dispose(); expect(store.getSnapshot().items).toHaveLength(1);
    expect(a.show({ type: "success", text: "卸载后的晚到结果" })).toBeNull();
    expect(store.getSnapshot().items[0].scope).toBe("date-b");
    b.dispose(); expect(vi.getTimerCount()).toBe(0);
  });
  it("allows manual dismissal and pauses the remaining lifetime for modal/focus/hidden state", () => {
    const id = store.show({ type: "success", text: "已保存" })!;
    vi.advanceTimersByTime(1000); store.pause(true);
    vi.advanceTimersByTime(10_000); expect(store.getSnapshot().items).toHaveLength(1);
    store.pause(false); vi.advanceTimersByTime(1999); expect(store.getSnapshot().items).toHaveLength(1);
    store.dismiss(id); expect(store.getSnapshot().items).toHaveLength(0); expect(vi.getTimerCount()).toBe(0);
    store.pause(true); store.show({ type: "info", text: "Dialog 完成" });
    expect(store.getSnapshot().announcement).toBe("");
    store.pause(false); expect(store.getSnapshot().announcement).toBe("Dialog 完成");
    vi.advanceTimersByTime(4000); expect(store.getSnapshot().items).toHaveLength(0);
  });
  it("cleans subscriptions/timers on disposal and permits StrictMode effect setup again", () => {
    const listener = vi.fn(), unsubscribe = store.subscribe(listener);
    store.show({ type: "success", text: "已保存" }); expect(listener).toHaveBeenCalledOnce();
    unsubscribe(); store.dispose(); expect(vi.getTimerCount()).toBe(0);
    expect(store.show({ type: "success", text: "late" })).toBeNull();
    store.activate(); store.show({ type: "info", text: "新挂载" }); expect(store.getSnapshot().items).toHaveLength(1);
    expect(listener).toHaveBeenCalledOnce();
  });
});
describe("Toast rendering and viewport", () => {
  it("renders a compact single message by default, an explicit explanation only when supplied, and a named close button", () => {
    const item = { id: 1, scope: "page", type: "success" as const, text: "已保存" };
    const onDismiss = vi.fn(), html = renderToStaticMarkup(<ToastMessage item={item} onDismiss={onDismiss} />);
    expect(html.match(/<p>/g)).toHaveLength(1); expect(html).not.toContain("penumbra-toast-description");
    expect(html).toContain('aria-label="关闭提示：已保存"'); expect(html).not.toContain("autofocus");
    expect(renderToStaticMarkup(<ToastMessage item={{ ...item, description: "原正文已清空" }} onDismiss={onDismiss} />)).toContain("原正文已清空");
    const tree = ToastMessage({ item, onDismiss });
    const button = tree.props.children[2]; button.props.onClick(); expect(onDismiss).toHaveBeenCalledOnce();
  });
  it("intersects the real app viewport with a panned keyboard viewport and clears a fixed action area", () => {
    expect(toastGeometry({ left: 0, top: 0, width: 1440, height: 900 }, { left: 208, right: 1232, top: 90, bottom: 850 }, 16)).toMatchObject({ left: 208, top: 90, width: 1024, height: 760 });
    expect(toastGeometry({ left: 0, top: 110, width: 390, height: 420 }, { left: 0, right: 390, top: 80, bottom: 850 }, 16, 460)).toEqual({ left: 0, top: 110, width: 390, height: 420, "--toast-clearance": "82px" });
  });
  it("keeps theme tokens, reduced motion, mobile safe areas and desktop placement outside scroll nodes", () => {
    const css = readFileSync(new URL("toast.css", import.meta.url), "utf8");
    for (const token of ["safe-area-inset-bottom", "safe-area-inset-left", "safe-area-inset-right", "safe-area-inset-top", "--toast-clearance", "prefers-reduced-motion", "var(--color-foreground)", "align-items: flex-end", "width: fit-content", "min-height: 44px"]) expect(css).toContain(token);
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|text-overflow:\s*ellipsis|white-space:\s*nowrap/i);
    const source = readFileSync(new URL("toast.tsx", import.meta.url), "utf8");
    expect(source).toContain('role="status" aria-live="polite" aria-atomic="true"'); expect(source).toContain("document.body");
    const app = readFileSync(new URL("../apps/DesktopAppView.tsx", import.meta.url), "utf8");
    expect(app).toContain("<ToastProvider key={appId} viewportRef={viewportRef}");
    for (const path of ["../../widgets/Desktop.tsx", "../desktop-v2/EditorialDesktop.tsx"]) expect(readFileSync(new URL(path, import.meta.url), "utf8")).toContain("<DesktopAppView");
  });
});
