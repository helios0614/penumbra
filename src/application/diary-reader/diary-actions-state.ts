import { ApiError } from "@/lib/api";
import type { ArchivedDiary } from "@/domain/diary";
import { DiaryWriteRejectedError, type DiaryUpdate } from "@/domain/diary/diary-write-client";
import { hasDiaryText } from "@/domain/diary/diary-mappers";

export interface DiaryDraft {
  readonly title: string;
  readonly content: string;
  readonly tags: readonly string[];
  readonly keywords: readonly string[];
  readonly importance: number | null;
}
export interface DiaryEditor {
  readonly baseline: ArchivedDiary;
  readonly draft: DiaryDraft;
  readonly submitted: DiaryDraft | null;
  readonly busy: "save" | "verify" | null;
  readonly error: string | null;
  readonly uncertain: boolean;
  readonly conflict: boolean;
}
export interface DiaryAutoFeed {
  readonly enabled: boolean | null;
  readonly loading: boolean;
  readonly saving: boolean;
  readonly uncertain: boolean;
  readonly error: string | null;
}
export const initialDiaryAutoFeed: DiaryAutoFeed = { enabled: null, loading: false, saving: false, uncertain: false, error: null };
export const diaryDraft = (entry: ArchivedDiary): DiaryDraft => ({ title: entry.title ?? "", content: entry.content, tags: [...entry.tags], keywords: [...entry.keywords], importance: entry.importance });
export const sameDiaryDraft = (a: DiaryDraft, b: DiaryDraft) => a.title === b.title && a.content === b.content && a.importance === b.importance && JSON.stringify(a.tags) === JSON.stringify(b.tags) && JSON.stringify(a.keywords) === JSON.stringify(b.keywords);
export const hasDiaryEdits = (editor: DiaryEditor | null) => Boolean(editor && (editor.uncertain || !sameDiaryDraft(editor.draft, diaryDraft(editor.baseline))));
export function diaryUpdate(editor: DiaryEditor): DiaryUpdate {
  const { draft, baseline } = editor;
  if (!hasDiaryText(draft.content)) throw new Error("已归档日记需要保留有效正文。");
  if (draft.importance !== null && (!Number.isFinite(draft.importance) || draft.importance < 0 || draft.importance > 1)) throw new Error("重要度需要在 0 到 1 之间。");
  if (draft.importance === null && baseline.importance !== null) throw new Error("重要度不能留空，请输入 0 到 1 之间的数值。");
  for (const values of [draft.tags, draft.keywords]) if (values.some((value) => !value.trim()) || new Set(values).size !== values.length) throw new Error("分类和关键词不能有空项或重复项。");
  const proseChanged = draft.title !== (baseline.title ?? "") || draft.content !== baseline.content;
  return {
    status: "done", ...(proseChanged ? { title: draft.title, content: draft.content } : {}),
    ...(JSON.stringify(draft.tags) !== JSON.stringify(baseline.tags) ? { tags: draft.tags } : {}),
    ...(JSON.stringify(draft.keywords) !== JSON.stringify(baseline.keywords) ? { keywords: draft.keywords } : {}),
    ...(draft.importance !== null && draft.importance !== baseline.importance ? { importance: draft.importance } : {}),
  };
}
export function diaryWriteUncertain(error: unknown) {
  return !(error instanceof DiaryWriteRejectedError || error instanceof ApiError && error.status >= 400 && error.status < 500 && error.code === "HTTP_ERROR" && error.status !== 408);
}
