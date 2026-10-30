import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { find, hookSession } from "@/components/chat/test-utils/hook-session";
import { Button } from "@/components/ui/button";
import { AlertDialogAction, AlertDialogDescription } from "@/components/ui/alert-dialog";
import { DiaryFeedAction } from "./DiaryFeedAction";
import { createDiaryFeedController, type DiaryFeedState } from "@/application/diary-chat/diary-feed-controller";

vi.mock("react", async original => ({ ...await original<typeof import("react")>() }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe("manual calendar feed UI", () => {
  it("opens the exact receipt ID even if the index is empty, without auto-navigation or a second launch", () => {
    const open = vi.fn(), c = createDiaryFeedController(async () => true);
    const state: DiaryFeedState = { busyDate: null, notices: { "2020-01-02": { kind: "started", entryId: "real", text: "已开始投喂" } } };
    const session = hookSession(() => DiaryFeedAction({ date: "2020-01-02", state, controller: c, onOpen: open }));
    const tree = session.render(); session.commit(); expect(open).not.toHaveBeenCalled();
    (find(tree, Button, p => String(p.children).includes("进入本次")).props.onClick as () => void)();
    expect(open).toHaveBeenCalledWith("real"); session.dispose(); c.dispose();
  });
  it("draft continue only navigates; replace makes no POST until the separate warning is confirmed", async () => {
    const start = vi.fn(async () => ({ kind: "draft" as const, entryId: "old" }));
    const c = createDiaryFeedController(async () => true, start); await c.start("2020-01-02");
    const open = vi.fn(), replace = vi.spyOn(c, "replaceConfirmed");
    const session = hookSession(() => DiaryFeedAction({ date: "2020-01-02", state: c.getState(), controller: c, onOpen: open }));
    let tree = session.render(); session.commit();
    (find(tree, Button, p => p.children === "继续原日记").props.onClick as () => void)(); expect(open).toHaveBeenCalledWith("old"); expect(start).toHaveBeenCalledOnce();
    (find(tree, Button, p => p.children === "替换并重新投喂").props.onClick as () => void)(); tree = session.render(); session.commit();
    expect(replace).not.toHaveBeenCalled();
    expect(String(find(tree, AlertDialogDescription).props.children)).toContain("旧草稿和对话将被替换");
    (find(tree, AlertDialogAction).props.onClick as () => void)(); expect(replace).toHaveBeenCalledWith("2020-01-02", "old");
    session.dispose(); c.dispose();
  });
  it("keeps start a small date-local action and prevents duplicate receipt links once indexed", () => {
    const html = renderToStaticMarkup(<DiaryFeedAction date="2020-01-02" indexedEntryId="real" state={{ busyDate: null, notices: { "2020-01-02": { kind: "started", entryId: "real", text: "已开始投喂" } } }} controller={null} onOpen={vi.fn()} />);
    expect(html).toContain("开始投喂"); expect(html).not.toContain("进入本次日记对话");
  });
  it.each([false, true])("restores the disabled trigger's lost focus only if the user did not move focus: %s", moved => {
    const body = {}, elsewhere = {}, documentStub = { activeElement: body as unknown, body };
    vi.stubGlobal("document", documentStub);
    const target = { isConnected: true, disabled: false, focus: vi.fn() };
    let state: DiaryFeedState = { busyDate: null, notices: {} };
    const c = createDiaryFeedController(async () => true);
    vi.spyOn(c, "start").mockResolvedValue();
    const session = hookSession(() => DiaryFeedAction({ date: "2020-01-02", state, controller: c, onOpen: vi.fn() }));
    const tree = session.render(); session.commit();
    const button = find(tree, Button, p => String(p.children).includes("开始投喂"));
    (button.props.ref as { current: unknown }).current = target;
    documentStub.activeElement = target;
    (button.props.onClick as () => void)();
    state = { ...state, busyDate: "2020-01-02" }; session.render(); session.commit();
    documentStub.activeElement = moved ? elsewhere : body;
    state = { ...state, busyDate: null }; session.render(); session.commit();
    expect(target.focus).toHaveBeenCalledTimes(moved ? 0 : 1); session.dispose(); c.dispose();
  });
});
