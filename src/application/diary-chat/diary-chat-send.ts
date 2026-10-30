import { sendDiaryMessage, regenerateDiaryMessage, type DiarySendEvent, type DiaryRegenerateEvent } from "@/domain/diary/diary-chat-send-client";
import type { DiaryMessage } from "@/domain/diary/diary-chat-types";
import { ApiError } from "@/lib/api";
import { diaryStreamText } from "./diary-chat-stream-text";

export interface DiaryChatOverlay {
  readonly message: DiaryMessage;
  readonly status: "optimistic" | "streaming" | "unconfirmed" | undefined;
  readonly revision: number;
  readonly receipt?: true;
}
export interface DiarySendState {
  readonly overlays: readonly DiaryChatOverlay[];
  readonly sending: boolean;
  readonly sendError: string | null;
  readonly submissionKey: string | null;
}
export const initialDiarySendState: DiarySendState = { overlays: [], sending: false, sendError: null, submissionKey: null };
const uncertain = "本次回复结果待核对，请刷新历史。不要直接重发，以免重复保存用户消息。";

/** Only this mounted Entry's local request, not the backend auto-feed lifecycle. */
export function createDiaryChatSend(ports: {
  getState: () => DiarySendState & { entryId: string | null; messages: readonly DiaryMessage[] | null };
  publish: (patch: Partial<DiarySendState> & { messages?: readonly DiaryMessage[] }) => void;
  beforeSend: () => void;
  refresh: () => Promise<unknown>;
}, stream: typeof sendDiaryMessage = sendDiaryMessage, regenerateStream: typeof regenerateDiaryMessage = regenerateDiaryMessage) {
  let epoch = 0, revision = 0;
  let abort: AbortController | null = null;
  let active: { user: string; assistant: string; assistantSaved: boolean } | null = null;
  const rows = () => ports.getState().overlays;
  const set = (overlays: readonly DiaryChatOverlay[]) => ports.publish({ overlays });
  const remove = (id: string) => set(rows().filter(row => row.message.id !== id));
  const saved = (id: string) => ports.getState().messages?.some(row => row.id === id);
  return {
    revision: () => revision,
    reconcile(messages: readonly DiaryMessage[], readRevision: number) {
      const ids = new Set(messages.map(row => row.id));
      if (active && ids.has(active.assistant)) active.assistantSaved = true;
      // A snapshot started before a receipt must not overwrite that newer receipt.
      return rows().filter(row => !ids.has(row.message.id) || row.receipt && row.revision > readRevision);
    },
    cancel() { ++epoch; abort?.abort(); abort = null; active = null; },
    send(content: string) { return run(content, null); },
    regenerate(messageId: string) { return run("", messageId); },
  };
  async function run(content: string, targetId: string | null): Promise<boolean> {
    const { entryId, sending } = ports.getState();
    if (!entryId || sending || !targetId && !content.trim()) return false;
    ports.beforeSend();
    const owner = ++epoch, request = new AbortController(); abort = request;
    const now = Date.now() / 1000, prefix = `diary-local:${owner}:${Date.now()}`;
    const session = { user: `${prefix}:user`, assistant: `${prefix}:assistant`, assistantSaved: false };
    active = session;
    const message = (id: string, role: string, text: string): DiaryMessage => ({ id, entryId, role, content: text, createdAt: now, updatedAt: null, thinking: null, drift: null });
    ports.publish({ sending: true, sendError: null, submissionKey: prefix, overlays: [...rows(),
      ...(!targetId ? [{ message: message(session.user, "user", content), status: "optimistic" as const, revision: ++revision }] : []),
      { message: message(session.assistant, "assistant", ""), status: "streaming", revision: ++revision }] });
    const owns = () => epoch === owner && !request.signal.aborted && ports.getState().entryId === entryId;
    let started = false, done = false, failed = false, raw = "";
    let replacedIds: readonly string[] = [];
    const update = (id: string, patch: Partial<DiaryMessage>, status: DiaryChatOverlay["status"]) => set(rows().map(row => row.message.id === id ? { message: { ...row.message, ...patch }, status, revision: ++revision } : row));
    const event = (value: DiarySendEvent | DiaryRegenerateEvent) => {
      if (done) return;
      if (value.type === "start") {
        if (started || value.entryId !== entryId || (targetId ? !("replacedIds" in value) || !value.replacedIds.includes(targetId) : !("userId" in value) || value.userId === value.assistantId)) throw new Error("Diary stream identity mismatch");
        started = true;
        if ("replacedIds" in value) replacedIds = value.replacedIds;
        if ("userId" in value) {
          update(session.user, { id: value.userId }, undefined);
          session.user = value.userId;
        }
        update(session.assistant, { id: value.assistantId }, "streaming");
        session.assistant = value.assistantId;
        if (saved(session.user)) remove(session.user);
        if (saved(session.assistant)) { session.assistantSaved = true; remove(session.assistant); }
      } else if (value.type === "chunk") {
        raw += value.content;
        if (!session.assistantSaved) update(session.assistant, diaryStreamText(raw), "streaming");
      } else if (value.type === "error") {
        failed = true; ports.publish({ sendError: targetId ? "重新生成遇到错误，正在读取历史核对。请勿直接重复提交；已执行的命令不会回滚。" : `回复生成遇到错误，已保存的消息会保留。${uncertain}` });
      } else {
        if (targetId && (!started || !value.message) || value.message && (value.message.entryId !== entryId || started && value.message.id !== session.assistant)) throw new Error("Diary receipt identity mismatch");
        done = true;
        if (value.message) {
          const remaining = rows().filter(row => row.message.id !== session.assistant && row.message.id !== value.message!.id && (!targetId || !replacedIds.includes(row.message.id)));
          session.assistant = value.message.id; session.assistantSaved = true;
          // Only an explicit save receipt can remove the exact backend snapshot suffix.
          if (targetId) ports.beforeSend();
          ports.publish({ ...(targetId ? { messages: (ports.getState().messages ?? []).filter(row => !replacedIds.includes(row.id)) } : {}),
            overlays: [...remaining, { message: value.message, status: undefined, revision: ++revision, receipt: true }] });
        } else if (!session.assistantSaved) remove(session.assistant);
      }
    };
    try {
      const events = targetId ? regenerateStream(entryId, targetId, request.signal) : stream(entryId, content, request.signal);
      for await (const value of events) {
        if (!owns()) return false;
        event(value);
      }
      if ((!done || !started) && owns()) { failed = true; ports.publish({ sendError: targetId ? "连接结束但未收到完整身份及保存回执，正在读取历史核对。请勿直接重复提交；已执行的命令不会回滚。" : `连接结束但未收到完整身份及保存回执。${uncertain}` }); }
    } catch (error) {
      if (!owns()) return false;
      const detail = error instanceof ApiError && error.status === 422 && error.code === "HTTP_ERROR" && error.data && typeof error.data === "object" && "detail" in error.data ? error.data.detail : null;
      const missingBaseUrl = detail && typeof detail === "object" && "code" in detail && detail.code === "missing_base_url";
      // This configuration preflight precedes Diary's message writes and generation.
      if (missingBaseUrl && !started) { remove(session.user); remove(session.assistant); }
      failed = true; ports.publish({ sendError: missingBaseUrl ? "当前模型配置缺少 API 地址，请检查模型设置。" : targetId ? "重新生成结果待核对，正在读取历史。请勿直接重复提交；已保存的替换和已执行的命令不会回滚。" : `发送未能确认。${uncertain}` });
    } finally {
      if (owns()) {
        abort = null; active = null;
        if (targetId && !session.assistantSaved) remove(session.assistant);
        set(rows().map(row => row.message.id === session.assistant && !session.assistantSaved || row.message.id === session.user && !started
          ? { ...row, status: "unconfirmed" } : row));
        if (targetId) {
          // Read once before permitting another local operation after an unknown outcome.
          await ports.refresh();
          if (owns()) ports.publish({ sending: false });
        } else {
          ports.publish({ sending: false });
          void ports.refresh();
        }
      }
    }
    return !failed;
  }
}
