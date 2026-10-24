import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MessageActions } from "./MessageActions";
import { TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { find, hookSession } from "./test-utils/hook-session";
vi.mock("./copy-feedback", () => ({ useCopyFeedback: () => vi.fn() }));
vi.mock("react", async (original) => {
  const actual = await original<typeof React>();
  return { ...actual, ...Object.fromEntries(["useState", "useRef", "useCallback", "useId", "useEffect", "useLayoutEffect"].map(key => [key, vi.fn(actual[key as keyof typeof actual] as never)])) };
});
afterEach(() => vi.restoreAllMocks());
function session() {
  const insert = vi.fn(); let selected: string | null = "选中文字", capturedAllowed = true;
  const Component = (MessageActions as unknown as { type: (props: React.ComponentProps<typeof MessageActions>) => React.ReactElement }).type;
  const hooks = hookSession(() => Component({ role: "assistant", content: "**完整正文**", insertContent: "完整正文", onInsert: insert,
    getSelectedText: () => selected, canUseCapturedSelection: () => capturedAllowed }));
  const button = () => (find(hooks.render(), TooltipTrigger, props => (props.render as React.ReactElement<React.ComponentProps<typeof Button>>)?.props["aria-label"] === "放入输入框").props.render as React.ReactElement<React.ComponentProps<typeof Button>>).props;
  const pointer = (type = "mouse") => { const preventDefault = vi.fn(); button().onPointerDown?.({ pointerType: type, button: 0, preventDefault } as never); return preventDefault; };
  const click = (detail = 1) => button().onClick?.({ detail } as never);
  return { ...hooks, button, pointer, click, insert, selection: (value: string | null) => { selected = value; }, invalidate: () => { capturedAllowed = false; } };
}
describe("PR3 insertion selection gesture", () => {
  it("uses the current range, then the full body when there is no selection", () => {
    const s = session(); s.click(); expect(s.insert).toHaveBeenLastCalledWith("选中文字");
    s.selection(null); s.click(); expect(s.insert).toHaveBeenLastCalledWith("完整正文");
  });
  it("captures before mouse focus clears Selection and consumes it only once", () => {
    const s = session(); expect(s.pointer()).toHaveBeenCalledOnce(); s.selection(null); s.click(); expect(s.insert).toHaveBeenLastCalledWith("选中文字");
    s.click(); expect(s.insert).toHaveBeenLastCalledWith("完整正文");
  });
  it("does not prevent touch selection and still survives tap-focus collapse", () => {
    const s = session(); expect(s.pointer("touch")).not.toHaveBeenCalled(); s.selection(null); s.click(); expect(s.insert).toHaveBeenLastCalledWith("选中文字");
  });
  it("rejects canceled, keyboard and invalidated gestures instead of reusing stale selections", () => {
    const s = session(); s.pointer(); s.button().onPointerCancel?.({} as never); s.selection(null); s.click(); expect(s.insert).toHaveBeenLastCalledWith("完整正文");
    s.selection("过去的选择"); s.pointer(); s.selection(null); s.click(0); expect(s.insert).toHaveBeenLastCalledWith("完整正文");
    s.selection("过去的选择"); s.pointer(); s.selection(null); s.invalidate(); s.click(); expect(s.insert).toHaveBeenLastCalledWith("完整正文");
  });
});
