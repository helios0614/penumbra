import { openApiStream } from "@/lib/api";
import { parseSseJsonData, parseSseStream } from "@/lib/sse";
import { DiaryContractError } from "./diary-types";
import { parseDiaryMessages } from "./diary-chat-mappers";
import type { DiaryMessage } from "./diary-chat-types";

export type DiarySendEvent =
  | { readonly type: "start"; readonly entryId: string; readonly assistantId: string; readonly userId: string }
  | { readonly type: "chunk"; readonly content: string }
  | { readonly type: "error" }
  | { readonly type: "done"; readonly drift: string | null; readonly thinking: string | null; readonly message: DiaryMessage | null };

export type DiaryRegenerateEvent = Exclude<DiarySendEvent, { type: "start" }> |
  { readonly type: "start"; readonly entryId: string; readonly assistantId: string; readonly replacedIds: readonly string[] };

export function parseDiaryRegenerateEvent(input: unknown, entryId: string): DiaryRegenerateEvent | null {
  if (input && typeof input === "object" && "type" in input && input.type === "start") {
    const row = input as Record<string, unknown>;
    if (row.entry_id !== entryId || typeof row.id !== "string" || !row.id.trim() || !Array.isArray(row.replaced_message_ids) ||
      !row.replaced_message_ids.length || row.replaced_message_ids.some(id => typeof id !== "string" || !id.trim()) || row.replaced_message_ids.includes(row.id)) throw new DiaryContractError();
    return { type: "start", entryId, assistantId: row.id, replacedIds: row.replaced_message_ids };
  }
  const event = parseDiarySendEvent(input, entryId);
  return event?.type === "start" ? null : event;
}

export function parseDiarySendEvent(input: unknown, entryId: string): DiarySendEvent | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new DiaryContractError();
  const row = input as Record<string, unknown>;
  const text = (value: unknown): string => {
    if (typeof value !== "string") throw new DiaryContractError();
    return value;
  };
  const id = (value: unknown) => { const result = text(value); if (!result.trim()) throw new DiaryContractError(); return result; };
  switch (row.type) {
    case "start":
      if (row.entry_id !== entryId) throw new DiaryContractError();
      return { type: "start", entryId, assistantId: id(row.id), userId: id(row.user_message_id) };
    case "chunk": return { type: "chunk", content: text(row.content) };
    // Provider exceptions can contain private configuration. Keep a safe UI summary.
    case "error": return { type: "error" };
    case "done": {
      if (!("message" in row)) throw new DiaryContractError();
      const message = row.message === null ? null : parseDiaryMessages([row.message], entryId)[0];
      if (message && message.role !== "assistant") throw new DiaryContractError();
      return { type: "done", message, drift: row.drift == null ? null : text(row.drift), thinking: row.thinking == null ? null : text(row.thinking) };
    }
    default: return null;
  }
}

/** MsgCreate: omit optional generation overrides so Diary's existing selection/context applies. */
export async function* sendDiaryMessage(entryId: string, content: string, signal: AbortSignal): AsyncGenerator<DiarySendEvent> {
  if (!entryId.trim() || !content.trim()) throw new DiaryContractError();
  yield* readDiaryStream(`/api/diary/entries/${encodeURIComponent(entryId)}/messages`, { content, role: "user" }, entryId, signal, parseDiarySendEvent);
}

export async function* regenerateDiaryMessage(entryId: string, messageId: string, signal: AbortSignal): AsyncGenerator<DiaryRegenerateEvent> {
  if (!entryId.trim() || !messageId.trim()) throw new DiaryContractError();
  yield* readDiaryStream(`/api/diary/entries/${encodeURIComponent(entryId)}/messages/${encodeURIComponent(messageId)}/regenerate`, undefined, entryId, signal, parseDiaryRegenerateEvent);
}

async function* readDiaryStream<T>(path: string, body: { content: string; role: string } | undefined, entryId: string, signal: AbortSignal, parse: (input: unknown, entryId: string) => T | null) {
  const stream = await openApiStream(path, {
    method: "POST", body, signal,
    timeoutMs: 30_000, streamIdleTimeoutMs: 120_000,
  });
  if (!stream.contentType.includes("text/event-stream")) {
    await stream.body.cancel();
    throw new DiaryContractError();
  }
  for await (const frame of parseSseStream(stream.body, { signal })) {
    const event = parse(parseSseJsonData(frame), entryId);
    if (event) yield event;
  }
}
