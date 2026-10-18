import { readFileSync } from "node:fs";
import { Children, isValidElement, type ComponentProps, type ElementType, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { LocationConfirm, LocationDialogClose, LocationPoiDialog } from "./LocationDialogs";

const css = readFileSync(new URL("./location.css", import.meta.url), "utf8");
function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  return Children.toArray(node).flatMap((child) => isValidElement<Record<string, unknown>>(child) ? [child, ...elements(child.props.children as ReactNode)] : []);
}
function find<T extends ElementType>(node: ReactNode, type: T) {
  const element = elements(node).find((child) => child.type === type);
  if (!element) throw new Error(`Missing element: ${String(type)}`);
  return element as ReactElement<ComponentProps<T>>;
}
function block(selector: string) {
  const start = css.indexOf(`${selector} {`); expect(start).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf("}", start));
}
const poi = { name: "地点名称", category: "餐饮服务;中餐厅", address: "长地址".repeat(50), distance: 0, phone: null, rating: "4.5", cost: null, photo: null };

describe("Location dialog composition", () => {
  it("uses a compact reading body with a top close and omits missing fields, subtitle and footer", () => {
    const tree = LocationPoiDialog({ poi, onClose: vi.fn() }), popup = find(tree, DialogContent);
    expect(Children.toArray(popup.props.children).map((child) => (child as ReactElement).type)).toEqual([DialogHeader, "dl"]);
    expect(popup.props).toMatchObject({ showCloseButton: false, "aria-describedby": undefined });
    expect(find(tree, DialogTitle).props.children).toBe(poi.name);
    expect(elements(tree).some((child) => child.type === DialogDescription || child.type === DialogFooter)).toBe(false);
    const rows = Children.toArray(find(tree, "dl").props.children) as ReactElement[];
    expect(rows).toHaveLength(4);
    const values = elements(rows).filter((child) => child.type === "dd").map((child) => child.props.children);
    expect(values).toEqual([poi.category, poi.address, "0 m", poi.rating]);
    expect(elements(rows).filter((child) => child.type === "dd").every((child) => String(child.props.className).includes("break-words"))).toBe(true);
    const close = LocationDialogClose(find(tree, LocationDialogClose).props);
    expect(find(close, DialogClose).props["aria-label"]).toBe("关闭地点详情");
    const closeButton = find(close, DialogClose).props.render as ReactElement;
    expect(closeButton.props).toMatchObject({ type: "button", size: "icon-lg", className: expect.stringContaining("size-11") });
    expect(block(".location-dialog .location-dialog-close")).toContain("padding: 0");
  });
  it("preserves the existing close callback and delegates escape, focus and dismissal to Dialog", () => {
    const onClose = vi.fn(), tree = LocationPoiDialog({ poi, onClose });
    find(tree, Dialog).props.onOpenChange?.(true, {} as never); expect(onClose).not.toHaveBeenCalled();
    find(tree, Dialog).props.onOpenChange?.(false, {} as never); expect(onClose).toHaveBeenCalledOnce();
    expect(find(tree, DialogContent).props.onKeyDown).toBeUndefined();
  });
  it("keeps cancel and destructive confirmation in a right-aligned row without changing exit callbacks", () => {
    const onCancel = vi.fn(), onConfirm = vi.fn();
    const props = { open: true, title: "放弃未保存的配置？", description: "尚未保存的配置将被放弃。", action: "放弃并离开", destructive: true, onCancel, onConfirm };
    const tree = LocationConfirm(props);
    expect(find(tree, AlertDialogTitle).props.children).toBe(props.title); expect(find(tree, AlertDialogDescription).props.children).toBe(props.description);
    expect(Children.toArray(find(tree, AlertDialogFooter).props.children).map((child) => (child as ReactElement).type)).toEqual([AlertDialogCancel, AlertDialogAction]);
    expect(find(tree, AlertDialogCancel).props).toMatchObject({ variant: "ghost", disabled: false });
    expect(find(tree, AlertDialogAction).props).toMatchObject({ variant: "destructive", children: "放弃并离开" });
    find(tree, AlertDialog).props.onOpenChange?.(false, {} as never); expect(onCancel).toHaveBeenCalledOnce(); expect(onConfirm).not.toHaveBeenCalled();
    find(tree, AlertDialogAction).props.onClick?.({} as never); expect(onConfirm).toHaveBeenCalledOnce();
    const busy = LocationConfirm({ ...props, busy: true });
    find(busy, AlertDialog).props.onOpenChange?.(false, {} as never); expect(onCancel).toHaveBeenCalledOnce();
    expect(find(busy, AlertDialogCancel).props.disabled).toBe(true); expect(find(busy, AlertDialogAction).props.disabled).toBe(true);
    const footer = block('.location-dialog > [data-slot="alert-dialog-footer"]');
    expect(footer).toContain('justify-content: flex-end'); expect(footer).toContain('flex-flow: row wrap');
    expect(find(tree, AlertDialogContent).props.className).toBe("location-dialog");
  });
  it("bounds the dialog on narrow and short screens while only the content scrolls", () => {
    const shell = block(".location-dialog[data-slot]");
    expect(shell).toContain("width: calc(100% - 2rem)"); expect(shell).toContain("max-height:"); expect(shell).toContain("100dvh"); expect(shell).toContain("overflow: hidden");
    const body = block(".location-dialog-body"); expect(body).toContain("min-height: 0"); expect(body).toContain("overflow-y: auto");
    expect(block('.location-dialog > [data-slot="dialog-header"]')).toContain("padding-right: 4rem");
  });
});
