import { useState } from "react";
import { normalizeOutput } from "@/domain/quick-note";
import type { QuickNoteController } from "@/application/quick-note/quick-note-controller";
import type { QuickNoteEditor as EditorState } from "@/application/quick-note/quick-note-state";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { QuickNoteDialogHeader } from "./QuickNoteDialogHeader";
import { useQuickNoteDialogViewport } from "./quick-note-dialog-viewport";

export function QuickNoteEditor({ editor, busy, controller }: {
  readonly editor: EditorState | null; readonly busy: boolean; readonly controller: QuickNoteController | null;
}) {
  const [confirm, setConfirm] = useState<"discard" | "overwrite" | null>(null);
  const viewportRef = useQuickNoteDialogViewport();
  const confirmViewportRef = useQuickNoteDialogViewport();
  const close = () => {
    if (!editor || busy) return;
    if (editor.draft !== normalizeOutput(editor.baseline.output)) setConfirm("discard");
    else controller?.cancelEdit();
  };
  return (
    <>
      <Dialog open={Boolean(editor)} onOpenChange={(next) => { if (!next) close(); }} disablePointerDismissal={busy}>
        <DialogContent ref={viewportRef} initialFocus={() => document.getElementById("quick-note-editor")} showCloseButton={false} className="quick-note-dialog" data-quick-note-dialog="editor" aria-busy={busy}>
          <QuickNoteDialogHeader title={`编辑正文 · ${editor?.baseline.periodLabel ?? ""}`} description="保存前会重新核对服务端内容。刷新日志和记录不会替换当前草稿。" busy={busy} />
          <div className="quick-note-editor-body">
            {editor && <QuickNoteEditorFields editor={editor} busy={busy} onChange={(value) => controller?.changeDraft(value)} />}
            {editor?.conflict && (
              <section className="quick-note-editor-conflict">
                <h3 id="quick-note-conflict-title" className="shrink-0 text-sm font-medium">服务端最新正文</h3>
                <div role="region" aria-labelledby="quick-note-conflict-title" tabIndex={0} className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-lg whitespace-pre-wrap break-words text-sm leading-7 focus-visible:outline-2 focus-visible:outline-ring">{normalizeOutput(editor.conflict.output) || "尚无已保存正文"}</div>
              </section>
            )}
          </div>
          <DialogFooter>
            {editor?.conflict && <Button variant="destructive" disabled={busy} onClick={() => setConfirm("overwrite")}>用草稿覆盖最新正文…</Button>}
            <Button variant="ghost" className="text-muted-strong" disabled={busy} onClick={close}>取消编辑</Button>
            {editor?.uncertain && <Button variant="outline" disabled={busy} onClick={() => void controller?.verifyEditor()}>核对保存结果</Button>}
            <Button aria-busy={busy} disabled={busy || !editor || editor.uncertain || Boolean(editor.conflict)} onClick={() => void controller?.saveEditor()}>{busy ? "正在处理…" : "保存正文"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={Boolean(confirm)} onOpenChange={(next) => { if (!next) setConfirm(null); }}>
        <AlertDialogContent ref={confirmViewportRef} className="quick-note-dialog" data-quick-note-dialog="editor-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm === "discard" ? "放弃当前草稿？" : "确认覆盖最新正文？"}</AlertDialogTitle>
            <AlertDialogDescription>{confirm === "discard" ? "尚未保存的正文修改会被放弃。" : "会再次核对服务端，并用当前草稿替换刚才展示的最新正文。"}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="ghost" className="text-muted-strong">返回编辑</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => {
              if (confirm === "discard") controller?.cancelEdit();
              else { controller?.acceptConflict(); void controller?.saveEditor(); }
              setConfirm(null);
            }}>{confirm === "discard" ? "放弃草稿" : "确认覆盖并保存"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function QuickNoteEditorFields({ editor, busy, onChange }: {
  readonly editor: EditorState; readonly busy: boolean; readonly onChange: (value: string) => void;
}) {
  return <>
    <label htmlFor="quick-note-editor" className="shrink-0 text-sm font-medium">正文</label>
    <Textarea id="quick-note-editor" value={editor.draft} onChange={(event) => onChange(event.target.value)} disabled={busy} surface="translucent" rows={12} className="min-h-0 flex-1 field-sizing-fixed resize-none overflow-y-auto overscroll-contain rounded-xl px-3 py-2.5 text-base leading-7 shadow-none md:text-sm" aria-describedby={editor.error ? "quick-note-edit-error" : undefined} />
    {editor.error && <p id="quick-note-edit-error" role="alert" className="shrink-0 text-xs leading-5 text-destructive-foreground">{editor.error}</p>}
  </>;
}
