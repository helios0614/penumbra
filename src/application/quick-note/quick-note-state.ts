import { ApiError } from "@/lib/api";
import { QuickNoteContractError, type QuickNote, type TriggerConfig, type IncompletePeriod } from "@/domain/quick-note";

export interface QuickNoteEditor {
  readonly baseline: QuickNote;
  readonly draft: string;
  readonly error: string | null;
  readonly conflict: QuickNote | null;
  readonly uncertain: boolean;
}

export interface QuickNoteState {
  readonly config: TriggerConfig | null;
  readonly configLoading: boolean;
  readonly configError: string | null;
  readonly date: string;
  readonly page: number;
  readonly status: "idle" | "loading" | "success" | "error";
  // Application-level date collection; backend page metadata stays in the client.
  readonly data: { readonly items: readonly QuickNote[] } | null;
  readonly error: string | null;
  readonly notice: { readonly tone: "info" | "error"; readonly text: string } | null;
  readonly pending: { readonly kind: string; readonly target: string } | null;
  readonly candidates: readonly IncompletePeriod[] | null;
  readonly candidatesLoading: boolean;
  readonly candidatesError: string | null;
  readonly editor: QuickNoteEditor | null;
}

export const INITIAL_QUICK_NOTE_STATE: QuickNoteState = {
  config: null, configLoading: true, configError: null, date: "", page: 1,
  status: "idle", data: null, error: null, notice: null, pending: null,
  candidates: null, candidatesLoading: false, candidatesError: null, editor: null,
};

export function sameSavedNote(a: QuickNote, b: QuickNote): boolean {
  return a.output === b.output && a.summary === b.summary && a.periodStart === b.periodStart && a.periodEnd === b.periodEnd && a.periodLabel === b.periodLabel;
}

export function uncertainFailure(error: unknown): boolean {
  return error instanceof QuickNoteContractError || error instanceof ApiError && ["NETWORK_ERROR", "TIMEOUT", "INVALID_RESPONSE"].includes(error.code);
}

export function failureText(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) return "当前会话无权访问，请检查登录状态后重试。";
    if (error.status === 409) return "服务端拒绝本次操作：可能已有任务、完整正文或时段冲突，请重新读取记录和日志。";
    if (error.status === 404) return "记录已不存在，请刷新列表。";
    if (error.status === 502) return "主模型生成未完成（502），请查看日志并重新读取已保存正文。";
    if (error.status === 400 || error.status === 422) return "请求未通过后端校验，请核对日期、时段和辅助摘要。";
  }
  if (error instanceof QuickNoteContractError) return error.message;
  return "请求失败，请检查连接后重试读取。";
}
