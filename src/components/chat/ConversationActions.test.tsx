import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConversationDialog, type ConversationAction } from "./ConversationActions";
import { DialogBody } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { elements, find, hookSession } from "./test-utils/hook-session";
vi.mock("react", async (original) => {
  const actual = await original<typeof React>();
  return { ...actual, ...Object.fromEntries(["useState", "useRef", "useCallback", "useId", "useEffect", "useLayoutEffect"].map(key => [key, vi.fn(actual[key as keyof typeof actual] as never)])) };
});
afterEach(() => vi.restoreAllMocks());
function session(kind: "rename" | "delete" = "rename") {
  const rename = vi.fn(async () => {}), remove = vi.fn(async () => {}), close = vi.fn();
  let action: ConversationAction = { kind, id: "a", title: "真实标题" }, locked = false;
  const hooks = hookSession(() => ConversationDialog({ action, locked, onRename: rename, onDelete: remove, onClose: close }));
  const input = () => find(hooks.render(), Input).props;
  const submit = () => {
    const form = find(hooks.render(), DialogBody).props.render as React.ReactElement<React.ComponentProps<"form">>;
    form.props.onSubmit?.({ preventDefault: vi.fn() } as never);
  };
  return { ...hooks, rename, remove, close, input, submit, lock: () => { locked = true; }, refreshTitle: () => { action = { ...action, title: "WS 新标题" }; } };
}
describe("PR3 conversation dialogs", () => {
  it("starts with the real title, cancels without a write and keeps edits through list refresh", () => {
    const s = session(); expect(s.input().value).toBe("真实标题");
    s.input().onChange?.({ target: { value: "未保存编辑" } } as never); s.refreshTitle(); expect(s.input().value).toBe("未保存编辑");
    find(s.render(), Button, props => props.children === "取消").props.onClick?.({} as never);
    expect(s.close).toHaveBeenCalledOnce(); expect(s.rename).not.toHaveBeenCalled();
  });
  it("rejects blank names and retains failed edits", async () => {
    const s = session(); s.input().onChange?.({ target: { value: "  " } } as never); s.submit(); expect(s.rename).not.toHaveBeenCalled();
    s.input().onChange?.({ target: { value: "  编辑内容  " } } as never); s.rename.mockRejectedValueOnce(new Error("private"));
    s.submit(); await Promise.resolve(); await Promise.resolve();
    expect(s.rename).toHaveBeenCalledWith("a", "编辑内容"); expect(s.input().value).toBe("  编辑内容  ");
    expect(elements(s.render()).some(item => item.props.role === "alert")).toBe(true); expect(s.close).not.toHaveBeenCalled();
    s.submit(); await Promise.resolve(); await Promise.resolve(); expect(s.close).toHaveBeenCalledOnce();
  });
  it("requires delete confirmation and locks duplicate submits while the request is in flight", async () => {
    const s = session("delete"); expect(s.remove).not.toHaveBeenCalled();
    expect(JSON.stringify(s.render())).toContain("此操作无法撤销");
    let finish!: () => void; s.remove.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    s.submit(); s.submit(); expect(s.remove).toHaveBeenCalledOnce(); expect(s.close).not.toHaveBeenCalled();
    finish(); await Promise.resolve(); await Promise.resolve(); expect(s.close).toHaveBeenCalledOnce();
  });
  it("cannot confirm a dialog after execution has acquired Chat", () => {
    const s = session("delete"); s.lock(); s.submit(); expect(s.remove).not.toHaveBeenCalled();
  });
});
