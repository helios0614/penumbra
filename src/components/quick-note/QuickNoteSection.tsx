import { Brain, Pencil, RefreshCw, Trash2, type LucideIcon } from "lucide-react";
import { formatPeriod } from "@/application/quick-note/quick-note-date";
import { normalizeOutput, normalizeSummary, type QuickNote } from "@/domain/quick-note";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export type NoteAction = "step1" | "step2" | "edit" | "delete";
export const NOTE_ACTIONS: readonly { readonly action: NoteAction; readonly label: string; readonly icon: LucideIcon }[] = [
  { action: "step1", label: "Step 1 重跑辅助模型（清空正文）", icon: RefreshCw },
  { action: "step2", label: "Step 2 重跑主模型（重新生成正文）", icon: Brain },
  { action: "edit", label: "编辑正文", icon: Pencil },
  { action: "delete", label: "删除速记", icon: Trash2 },
];

export function QuickNoteSection({ note, timeZone, disabled, pending, onAction }: {
  readonly note: QuickNote; readonly timeZone: string; readonly disabled: boolean; readonly pending?: string; readonly onAction: (action: NoteAction, note: QuickNote) => void;
}) {
  return (
    <article className="py-6 sm:py-8" aria-label={`${note.periodLabel}速记`} aria-busy={Boolean(pending)}>
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <h3 className="rounded-xl bg-primary/10 px-3 py-2 text-sm font-medium text-primary-ink">{note.periodLabel}</h3>
          <p className="text-xs leading-5 text-muted-foreground">{formatPeriod(note.periodStart, note.periodEnd, timeZone)}</p>
        </div>
        <div className="-mr-2 flex flex-wrap" role="group" aria-label={`${note.periodLabel}操作`}>
          {NOTE_ACTIONS.map(({ action, label, icon: Icon }) => (
            <Tooltip key={action}>
              <TooltipTrigger render={<Button variant="ghost" className="size-11 text-muted-strong" disabled={disabled} aria-label={`${note.periodLabel}：${label}`} title={label} onClick={() => onAction(action, note)} />}>
                <Icon aria-hidden="true" />
              </TooltipTrigger>
              <TooltipContent>{label}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      </header>
      {pending && <p className="mt-2 text-sm text-muted-strong" role="status">{pending === "delete" ? "正在删除…" : pending === "step1" ? "正在请求 Step 1…" : pending === "step2" ? "正在请求 Step 2…" : "正在保存…"}</p>}
      <QuickNoteSummary summary={note.summary} />
      <div className="mt-5 whitespace-pre-wrap break-words text-[15px] leading-8 text-foreground" data-quick-note-output="true">
        {note.output.trim() ? normalizeOutput(note.output) : <p className="text-sm text-muted-foreground">尚无已保存正文</p>}
      </div>
    </article>
  );
}

export function QuickNoteSummary({ summary }: { readonly summary: string }) {
  const sections = normalizeSummary(summary);
  return (
    <details className="mt-4 border-y border-border/70 py-1">
      <summary className="min-h-11 cursor-pointer py-3 text-sm text-muted-strong">对话摘要（辅助整理 · Step 1）</summary>
      <div className="space-y-4 pb-4 pt-2 text-sm leading-7 text-muted-strong">
        {sections.length ? sections.map((section, index) => (
          <section key={index}>
            <h4 className="mb-1 font-medium text-foreground">{section.title}</h4>
            <p className="whitespace-pre-wrap break-words">{section.text}</p>
          </section>
        )) : <p>尚无已保存辅助摘要</p>}
      </div>
    </details>
  );
}
