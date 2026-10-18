import { Children, isValidElement, type ComponentProps, type ElementType, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { LocationConfirm, LocationPoiDialog } from "./LocationDialogs";

function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  return Children.toArray(node).flatMap((child) => isValidElement<Record<string, unknown>>(child) ? [child, ...elements(child.props.children as ReactNode)] : []);
}
function find<T extends ElementType>(node: ReactNode, type: T) {
  const element = elements(node).find((child) => child.type === type);
  if (!element) throw new Error(`Missing element: ${String(type)}`);
  return element as ReactElement<ComponentProps<T>>;
}
const poi = { name: "地点名称", category: "餐饮服务;中餐厅", address: "长地址".repeat(50), distance: 0, phone: null, rating: "4.5", cost: null, photo: null };

describe("Location dialog composition", () => {
  it("uses a compact reading body with a top close and omits missing fields, subtitle and footer", () => {
    const tree = LocationPoiDialog({ poi, onClose: vi.fn() }), popup = find(tree, DialogContent);
    expect(Children.toArray(popup.props.children).map((child) => (child as ReactElement).type)).toEqual([DialogHeader, DialogBody]);
    expect(popup.props).toMatchObject({ closeButtonProps: { "aria-label": "关闭地点详情" }, "aria-describedby": undefined });
    expect(find(tree, DialogTitle).props.children).toBe(poi.name);
    expect(elements(tree).some((child) => child.type === DialogDescription || child.type === DialogFooter)).toBe(false);
    const body = find(tree, DialogBody);
    expect(body.props.render?.type).toBe("dl");
    const rows = Children.toArray(body.props.children) as ReactElement[];
    expect(rows).toHaveLength(4);
    const values = elements(rows).filter((child) => child.type === "dd").map((child) => child.props.children);
    expect(values).toEqual([poi.category, poi.address, "0 m", poi.rating]);
    expect(elements(rows).filter((child) => child.type === "dd").every((child) => String(child.props.className).includes("break-words"))).toBe(true);
    expect(popup.props.showCloseButton).toBeUndefined();
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
    const cancel = vi.fn();
    find(busy, AlertDialog).props.onOpenChange?.(false, { cancel } as never); expect(onCancel).toHaveBeenCalledOnce(); expect(cancel).toHaveBeenCalledOnce();
    expect(find(busy, AlertDialogCancel).props.disabled).toBe(true); expect(find(busy, AlertDialogAction).props.disabled).toBe(true);
    expect(find(tree, AlertDialogContent).props.className).toBeUndefined();
  });
  it("inherits shared geometry and keeps only the compact POI field spacing local", () => {
    const tree = LocationPoiDialog({ poi, onClose: vi.fn() });
    expect(find(tree, DialogContent).props.className).toBeUndefined();
    expect(find(tree, DialogHeader).props.className).toBeUndefined();
    expect(find(tree, DialogBody).props.className).toContain("py-3");
  });
});
