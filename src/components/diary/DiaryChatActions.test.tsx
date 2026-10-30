import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DiaryChatView } from "./DiaryChatView";
import { TooltipProvider } from "@/components/ui/tooltip";
import { initialDiaryChatState, type DiaryChatState } from "@/application/diary-chat/diary-chat-controller";
import type { DiaryMessage } from "@/domain/diary/diary-chat-types";

let state: DiaryChatState;
vi.mock("./useDiaryChat", () => ({ useDiaryChat: () => ({ state, controller: null, connection: "open" }) }));
afterEach(() => vi.restoreAllMocks());
const row = (id: string, role: string): DiaryMessage => ({ id, role, entryId: "a", content: "正文", createdAt: 1, updatedAt: null, thinking: null, drift: null });
const render = () => renderToStaticMarkup(<TooltipProvider><DiaryChatView entryId="a" onBack={vi.fn()} /></TooltipProvider>);
function setup() { state = { ...initialDiaryChatState, entryId: "a", status: "ready", entry: { id: "a", date: "2026-10-01", title: null, status: "writing" }, messages: [row("user", "user"), row("assistant", "assistant"), row("old-assistant", "assistant"), row("unknown", "system")] }; }
describe("Diary shared message action assembly", () => {
  it("offers edit only on user, regenerate on every saved assistant and delete on both ordinary roles", () => {
    setup(); const html = render();
    expect(html.match(/aria-label="编辑消息"/g)).toHaveLength(1); expect(html.match(/aria-label="重新生成回复"/g)).toHaveLength(2);
    expect(html.match(/aria-label="删除消息"/g)).toHaveLength(3); expect(html).not.toContain('aria-label="放入输入框"');
  });
  it.each(["optimistic", "streaming", "unconfirmed", undefined] as const)("never offers persisted actions on %s overlays, including receipts awaiting HTTP", status => {
    setup(); state = { ...state, messages: [], overlays: [{ message: row("overlay", "assistant"), status, revision: 1 }] };
    const html = render(); for (const label of ["编辑消息", "删除消息", "重新生成回复"]) expect(html).not.toContain(`aria-label="${label}"`);
  });
  it.each(["send", "mutation"])("gates the mounted Entry's actions during %s without changing its bubbles", kind => {
    setup(); state = { ...state, sending: kind === "send", mutation: kind === "mutation" ? { kind: "edit", messageId: "user" } : null };
    const html = render(); expect(html).toContain('data-message-id="user"'); for (const label of ["编辑消息", "删除消息", "重新生成回复"]) expect(html).not.toContain(`aria-label="${label}"`);
  });
});
