import { readFileSync } from "node:fs";
import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./button";
import { Dialog, DialogBody, DialogCloseButton, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./dialog";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "./alert-dialog";

const css = readFileSync(new URL("./dialog-layout.css", import.meta.url), "utf8");
function popup(content: React.ReactElement<{ children?: React.ReactNode }>) {
  return React.Children.toArray(content.props.children).find((child) => React.isValidElement(child) && child.type === DialogPrimitive.Popup) as React.ReactElement<DialogPrimitive.Popup.Props>;
}

describe("Shared dialog title typography", () => {
  it.each([DialogTitle, AlertDialogTitle])("uses the functional sans family, 18px/28px and semibold by default", (Title) => {
    const title = Title({ children: "中文标题" });
    expect(title.props.className).toContain("font-sans text-lg font-semibold leading-7");
    expect(title.props.className).not.toMatch(/font-heading|font-decorative/);
    expect(title.props.children).toBe("中文标题");
  });
  it("continues to allow deliberate local typography overrides", () => {
    const title = DialogTitle({ children: "Title", className: "text-sm font-normal" });
    expect(title.props.className).toContain("text-sm"); expect(title.props.className).toContain("font-normal");
    expect(title.props.className).not.toContain("font-semibold");
  });
});

describe("Shared dialog layout and native interaction contracts", () => {
  it("bounds both Mist shells without introducing a fixed height or an outer scroller", () => {
    for (const content of [DialogContent({}), AlertDialogContent({})]) {
      const shell = popup(content);
      expect(shell.props.className).toContain("mist-glass-strong");
      expect(shell.props.className).toContain("flex-col");
      expect(shell.props.className).toContain("overflow-hidden");
      expect(shell.props.className).toContain("rounded-[28px]");
      expect(shell.props.className).not.toMatch(/(?:^| )h-|overflow-y-auto/);
    }
    for (const rule of ["100dvh", "safe-area-inset-top", "safe-area-inset-bottom", "safe-area-inset-left", "safe-area-inset-right", "max-height: max(0px, var(--dialog-available-height))"]) expect(css).toContain(rule);
    expect(popup(AlertDialogContent({ size: "sm" })).props.className).toContain("max-w-xs");
    expect(popup(DialogContent({ className: "max-w-xl" })).props.className).not.toContain("max-w-lg");
  });

  it("keeps short bodies natural and form/dl semantics and refs intact", () => {
    const onSubmit = vi.fn(), ref = React.createRef<HTMLDivElement>();
    const body = DialogBody({ render: <form id="test-form" onSubmit={onSubmit} />, ref, children: "fields" });
    expect(body.type).toBe("form");
    expect(body.props).toMatchObject({ id: "test-form", ref, onSubmit, children: "fields", "data-slot": "dialog-body" });
    expect(body.props.className).toContain("min-h-0 flex-auto overflow-y-auto");
    expect(body.props.className).not.toMatch(/(?:^| )h-|min-h-\[/);
    expect(DialogBody({ render: <dl /> }).type).toBe("dl");
    expect(DialogHeader({}).props.className).toContain("shrink-0");
    expect(AlertDialogHeader({}).props.className).toContain("min-h-0 shrink overflow-y-auto");
    expect(AlertDialogHeader({}).props.className).not.toContain("shrink-0");
  });

  it.each([DialogFooter, AlertDialogFooter])("keeps footer actions in document order, wraps and leaves density to Button", (Footer) => {
    const footer = Footer({ children: <Button>确认</Button> });
    for (const rule of ["shrink-0", "flex-row", "flex-wrap", "justify-end", "gap-2"]) expect(footer.props.className).toContain(rule);
    expect(footer.props.className).not.toMatch(/col-reverse|bg-muted|(?:^| )-m|h-11|(?:^| )w-full(?: |$)/);
    expect(AlertDialogCancel({}).props.render.props.variant).toBe("ghost");
  });

  it("renders a single named X by default and supports business-disabled or custom close controls", () => {
    const automatic = popup(DialogContent({ closeButtonProps: { "aria-label": "关闭表单", disabled: true } }));
    const close = React.Children.toArray(automatic.props.children).find((child) => React.isValidElement(child) && child.type === DialogCloseButton) as React.ReactElement<React.ComponentProps<typeof DialogCloseButton>>;
    expect(close.props).toMatchObject({ "aria-label": "关闭表单", disabled: true });
    const rendered = DialogCloseButton(close.props);
    expect(rendered.props).toMatchObject({ "aria-label": "关闭表单", title: "关闭表单", disabled: true });
    expect(rendered.props.render.props.className).toContain("size-11");
    expect(rendered.props.children.props.className).toBe("size-4");
    const custom = popup(DialogContent({ showCloseButton: false, children: <DialogHeader><DialogCloseButton /></DialogHeader> }));
    expect(React.Children.toArray(custom.props.children)).toHaveLength(1);
    expect(React.Children.toArray(popup(AlertDialogContent({ children: "说明" })).props.children)).toEqual(["说明"]);
  });

  it("forwards Base UI focus, dismissal and cancellation APIs without adding a keyboard handler", () => {
    const initialFocus = React.createRef<HTMLElement>(), finalFocus = React.createRef<HTMLElement>();
    const onOpenChange = vi.fn();
    const dialog = Dialog({ open: true, onOpenChange, disablePointerDismissal: true });
    const alert = AlertDialog({ open: true, onOpenChange });
    expect(dialog.type).toBe(DialogPrimitive.Root);
    expect(alert.type).toBe(AlertDialogPrimitive.Root);
    for (const root of [dialog, alert]) expect(root.props.onOpenChange).toBe(onOpenChange);
    for (const content of [DialogContent({ initialFocus, finalFocus }), AlertDialogContent({ initialFocus, finalFocus })]) {
      expect(popup(content).props).toMatchObject({ initialFocus, finalFocus });
      expect(popup(content).props.onKeyDown).toBeUndefined();
    }
    expect(css).toMatch(/prefers-reduced-motion: reduce/);
    expect(css).toContain('animation: none;');
    expect(css).toContain('transition: none;');
  });
});
