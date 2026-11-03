import type { DiaryExtractionController, DiaryExtractionState } from "@/application/diary-chat/diary-extraction-controller";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { diaryDialogViewportRef, diaryTagLabels } from "./DiaryReaderDetails";
import { DiaryEditList } from "./DiaryEditor";
import { DiaryKeywordEditor } from "./DiaryKeywordEditor";

export function DiaryExtractionPreview({ state, controller }: { readonly state: DiaryExtractionState; readonly controller: DiaryExtractionController | null }) {
  const preview = state.preview;
  if (!preview) return null;
  const { draft } = preview;
  const disabled = state.busy || preview.invalid || state.uncertain;
  const change = controller?.change;
  return <Dialog open onOpenChange={(open, details) => { if (!open) { if (state.busy) details.cancel(); else controller?.cancel(); } }}>
    <DialogContent ref={diaryDialogViewportRef} className="max-w-3xl" closeButtonProps={{ disabled: state.busy }}>
      <DialogHeader>
        <DialogTitle>日记草稿预览</DialogTitle>
        <DialogDescription>{preview.date} · 确认保存后归档；取消将丢弃本次草稿。</DialogDescription>
      </DialogHeader>
      <DialogBody>
        <form id="diary-extraction-form" className="min-w-0 space-y-4" onSubmit={event => { event.preventDefault(); if (!disabled) void controller?.save(); }}>
          <div><label htmlFor="diary-extract-title" className="mb-2 block text-sm font-medium">标题</label>
            <Textarea id="diary-extract-title" surface="translucent" rows={1} value={draft.title} disabled={disabled} onChange={event => change?.({ title: event.target.value })} />
          </div>
          <div><label htmlFor="diary-extract-content" className="mb-2 block text-sm font-medium">正文</label>
            <Textarea id="diary-extract-content" surface="translucent" rows={12} className="text-[15px] leading-8" value={draft.content} disabled={disabled} onChange={event => change?.({ content: event.target.value })} />
          </div>
          <fieldset disabled={disabled} className="min-w-0"><legend className="mb-2 text-sm font-medium">关键词</legend>
            <DiaryKeywordEditor values={draft.keywords} disabled={disabled} onChange={keywords => change?.({ keywords })} />
          </fieldset>
          <div><label htmlFor="diary-extract-importance" className="mb-2 block text-sm font-medium">重要度（0–1）</label>
            <Input id="diary-extract-importance" surface="translucent" type="number" min={0} max={1} step="any" value={draft.importance ?? ""} disabled={disabled} onChange={event => change?.({ importance: event.target.value === "" ? null : Number(event.target.value) })} />
            <p className="mt-1 text-xs leading-5 text-muted-foreground">留空将保留日记已有的重要度。</p>
          </div>
          <fieldset disabled={disabled} className="min-w-0 space-y-2"><legend className="mb-2 text-sm font-medium">分类标签</legend>
            <div className="flex flex-wrap gap-1">{[...diaryTagLabels].map(([tag, label]) => <Button key={tag} type="button" variant={draft.tags.includes(tag) ? "soft-primary" : "ghost"} size="compact" className="min-h-11 text-xs" aria-pressed={draft.tags.includes(tag)}
              onClick={() => change?.({ tags: draft.tags.includes(tag) ? draft.tags.filter(value => value !== tag) : [...draft.tags, tag] })}>{label}</Button>)}</div>
            <DiaryEditList label="自定义分类" values={draft.tags.filter(tag => !diaryTagLabels.has(tag))} disabled={disabled} onChange={values => change?.({ tags: [...draft.tags.filter(tag => diaryTagLabels.has(tag)), ...values] })} />
          </fieldset>
        </form>
      </DialogBody>
      {state.error && <p role="alert" className="shrink-0 px-5 pb-3 text-xs leading-5 text-destructive-foreground sm:px-6">{state.error}</p>}
      <DialogFooter>
        <Button type="button" variant="ghost" disabled={state.busy} onClick={() => controller?.cancel()}>取消</Button>
        {state.uncertain && <Button type="button" variant="outline" disabled={state.busy} onClick={() => void controller?.verify()}>核对结果</Button>}
        <Button type="submit" form="diary-extraction-form" variant="soft-primary" disabled={disabled || !controller} aria-busy={state.busy}>{state.busy ? "正在核对…" : "确认保存并归档"}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
