import type { ComponentProps, Ref } from "react";
import { Plus, Save, X } from "lucide-react";
import type { DiaryEditor as EditorState, DiaryDraft } from "@/application/diary-reader/diary-actions-state";
import type { DiaryReaderController } from "@/application/diary-reader/diary-reader-controller";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageScrollArea } from "@/components/ui/page-scroll-area";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { diaryDialogViewportRef, DiaryReaderPaper, diaryTagLabels } from "./DiaryReaderDetails";
import { DiaryKeywordEditor } from "./DiaryKeywordEditor";
import "./diary-editor.css";

export function DiaryEditor({ editor, controller, editorRef, onCancel }: {
  readonly editor: EditorState; readonly controller: DiaryReaderController | null;
  readonly editorRef?: Ref<HTMLElement>; readonly onCancel: () => void;
}) {
  const busy = Boolean(editor.busy);
  const change = (patch: Partial<DiaryDraft>) => controller?.changeDraft(patch);
  return <DiaryReaderPaper readerRef={editorRef} label="日记编辑工作区">
    <header className="diary-editor-header shrink-0 border-b border-primary/10 px-4 py-2 sm:px-7">
      <div className="mx-auto flex w-full max-w-[42rem] flex-wrap items-center gap-2">
        <Button variant="ghost" size="comfortable" className="mr-auto px-2 text-muted-strong" disabled={busy} onClick={onCancel} aria-label="取消编辑并返回阅读">取消</Button>
        {editor.uncertain && <Button variant="outline" size="comfortable" className="px-2 text-xs" disabled={busy || !controller} onClick={() => void controller?.verifyEdit()}>核对结果</Button>}
        <Button variant="soft-primary" size="comfortable" className="gap-1.5 px-3" disabled={busy || !controller || editor.uncertain || editor.conflict} onClick={() => void controller?.saveEdit()} aria-busy={busy}>
          <Save className="size-3.5" aria-hidden="true" />{editor.busy === "save" ? "正在保存…" : editor.busy === "verify" ? "正在核对…" : "保存"}
        </Button>
      </div>
      {editor.error && <p className="mx-auto mt-1 max-w-[42rem] text-xs leading-5 text-destructive-foreground" role="alert">{editor.error}</p>}
    </header>
    <PageScrollArea label="日记编辑字段" topLabel="回到编辑顶部" contentClassName="diary-editor-fields px-4 py-4 sm:px-7">
      <form className="mx-auto w-full max-w-[42rem] space-y-4" onSubmit={(event) => { event.preventDefault(); void controller?.saveEdit(); }}>
        <p className="text-xs leading-5 text-muted-foreground">编辑日记 · <time dateTime={editor.baseline.date}>{editor.baseline.date}</time></p>
        <div><label htmlFor="diary-edit-title" className="mb-2 block text-sm font-medium">标题</label>
          <DiaryEditorTitle value={editor.draft.title} disabled={busy} onChange={(title) => change({ title })} />
        </div>
        <div><label htmlFor="diary-edit-content" className="mb-2 block text-sm font-medium">正文</label>
          <Textarea id="diary-edit-content" surface="translucent" value={editor.draft.content} rows={18} className="diary-editor-prose text-[15px] leading-8" disabled={busy} onChange={(event) => change({ content: event.target.value })} />
        </div>
        <fieldset disabled={busy} className="space-y-2"><legend className="mb-2 text-sm font-medium">分类标签</legend>
          <div className="flex flex-wrap gap-1">
            {[...new Set([...diaryTagLabels.keys(), ...editor.draft.tags.filter((tag) => tag.trim())])].map((tag) => <Button key={tag} variant={editor.draft.tags.includes(tag) ? "soft-primary" : "ghost"} size="compact" className="min-h-11 text-xs" aria-pressed={editor.draft.tags.includes(tag)}
              onClick={() => change({ tags: editor.draft.tags.includes(tag) ? editor.draft.tags.filter((value) => value !== tag) : [...editor.draft.tags, tag] })}>{diaryTagLabels.get(tag) ?? tag}</Button>)}
          </div>
          <DiaryEditList label="自定义分类" values={editor.draft.tags.filter((tag) => !diaryTagLabels.has(tag))} disabled={busy} onChange={(values) => change({ tags: [...editor.draft.tags.filter((tag) => diaryTagLabels.has(tag)), ...values] })} />
        </fieldset>
        <fieldset disabled={busy} className="min-w-0"><legend className="mb-2 text-sm font-medium">关键词</legend>
          <DiaryKeywordEditor values={editor.draft.keywords} disabled={busy} onChange={(keywords) => change({ keywords })} />
        </fieldset>
        <div><label htmlFor="diary-edit-importance" className="mb-2 block text-sm font-medium">重要度（0–1）</label>
          <Input id="diary-edit-importance" surface="translucent" type="number" min={0} max={1} step="any" value={editor.draft.importance ?? ""} disabled={busy} onChange={(event) => change({ importance: event.target.value === "" ? null : Number(event.target.value) })} />
          {editor.baseline.importance === null && <p className="mt-1 text-xs leading-5 text-muted-foreground">原重要度不可用，留空将保留服务端原值。</p>}
        </div>
      </form>
    </PageScrollArea>
  </DiaryReaderPaper>;
}

function DiaryEditorTitle({ value, disabled, onChange }: { readonly value: string; readonly disabled: boolean; readonly onChange: (value: string) => void }) {
  return <div className="diary-editor-title-wrap text-base leading-6 md:text-sm">
    {/* The inert mirror also grows with wrapping and text zoom without field-sizing support. */}
    <span className="diary-editor-title-measure" aria-hidden="true">{`${value} `}</span>
    <Textarea id="diary-edit-title" surface="translucent" className="diary-editor-title" value={value} rows={1} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
  </div>;
}

export function DiaryEditList({ label, values, disabled, onChange }: { readonly label: string; readonly values: readonly string[]; readonly disabled: boolean; readonly onChange: (values: readonly string[]) => void }) {
  return <div className="space-y-2">
    {values.map((value, index) => <div key={index} className="flex items-start gap-1">
      <Textarea aria-label={`${label} ${index + 1}`} rows={1} surface="translucent" value={value} disabled={disabled} className="min-h-11" onChange={(event) => onChange(values.map((item, offset) => offset === index ? event.target.value : item))} />
      <Button variant="ghost" className="size-11 shrink-0 px-0 text-muted-strong" aria-label={`移除${label} ${index + 1}`} disabled={disabled} onClick={() => onChange(values.filter((_, offset) => offset !== index))}><X className="size-3.5" aria-hidden="true" /></Button>
    </div>)}
    <Button variant="ghost" size="compact" className="min-h-11 gap-1 text-xs text-muted-strong" disabled={disabled} onClick={() => onChange([...values, ""])}><Plus className="size-3.5" aria-hidden="true" />添加{label}</Button>
  </div>;
}

export function DiaryDiscardDialog({ open, busy, onKeep, onDiscard, finalFocus }: { readonly open: boolean; readonly busy: boolean; readonly onKeep: () => void; readonly onDiscard: () => void; readonly finalFocus?: ComponentProps<typeof AlertDialogContent>["finalFocus"] }) {
  return <AlertDialog open={open} onOpenChange={(next) => { if (!next) onKeep(); }}>
    <AlertDialogContent ref={diaryDialogViewportRef} finalFocus={finalFocus}>
      <AlertDialogHeader><AlertDialogTitle>放弃未保存的修改？</AlertDialogTitle><AlertDialogDescription>未保存的修改将丢失。若保存结果未知，请先核对或备份；离开不会撤销保存请求。</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter><AlertDialogCancel disabled={busy} onClick={onKeep}>继续编辑</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={busy} onClick={onDiscard}>放弃修改</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
