import { Brain, Pencil, RefreshCw, Trash2, type LucideIcon } from "lucide-react";
import { QuickNoteAnnotatedProse } from "./QuickNoteProse";

export { QuickNoteSummary } from "./QuickNoteSummary";

export type NoteAction = "step1" | "step2" | "edit" | "delete";
export const NOTE_ACTIONS: readonly { readonly action: NoteAction; readonly label: string; readonly icon: LucideIcon }[] = [
  { action: "step1", label: "Step 1 重跑辅助模型（清空正文）", icon: RefreshCw },
  { action: "step2", label: "Step 2 重跑主模型（重新生成正文）", icon: Brain },
  { action: "edit", label: "编辑正文", icon: Pencil },
  { action: "delete", label: "删除速记", icon: Trash2 },
];

export function QuickNoteOutput({ output }: { readonly output: string }) {
  return <div className="whitespace-pre-wrap break-words text-[15px] leading-7 text-foreground" data-quick-note-output="true">
    {output.trim() ? <QuickNoteAnnotatedProse output={output} /> : <p className="text-sm text-muted-foreground">尚无已保存正文</p>}
  </div>;
}
