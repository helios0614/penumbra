import { useState } from "react";
import { normalizeOutput } from "@/domain/quick-note";
import type { QuickNoteController } from "@/application/quick-note/quick-note-controller";
import type { QuickNoteEditor as EditorState } from "@/application/quick-note/quick-note-state";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle } from "@/components/ui/alert-dialog";

export function QuickNoteEditor({ editor, busy, controller }: {
  readonly editor: EditorState | null; readonly busy: boolean; readonly controller: QuickNoteController | null;
}) {
  const [confirm, setConfirm] = useState<"discard" | "overwrite" | null>(null);
  const close = () => {
    if (!editor || busy) return;
    if (editor.draft !== normalizeOutput(editor.baseline.output)) setConfirm("discard");
    else controller?.cancelEdit();
  };
  return (
    <>
      <Dialog open={Boolean(editor)} onOpenChange={(next) => { if (!next) close(); }} disablePointerDismissal={busy}>
        <DialogContent showCloseButton={false} className="max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-[24px] p-5 sm:max-w-2xl">
          <DialogTitle>编辑正文 · {editor?.baseline.periodLabel}</DialogTitle>
          <DialogDescription>保存前会重新核对服务端内容。刷新日志和记录不会替换当前草稿。</DialogDescription>
          {editor && <QuickNoteEditorFields editor={editor} busy={busy} onChange={(value) => controller?.changeDraft(value)} />}
          {editor?.conflict && (
            <div className="space-y-2 border-t border-border pt-4">
              <h3 className="text-sm font-medium">服务端最新正文</h3>
              <p className="whitespace-pre-wrap break-words text-sm leading-7">{normalizeOutput(editor.conflict.output) || "尚无已保存正文"}</p>
              <Button variant="destructive" className="h-11" disabled={busy} onClick={() => setConfirm("overwrite")}>用草稿覆盖最新正文…</Button>
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" className="h-11" disabled={busy} onClick={close}>取消编辑</Button>
            {editor?.uncertain && <Button variant="outline" className="h-11" disabled={busy} onClick={() => void controller?.verifyEditor()}>核对保存结果</Button>}
            <Button className="h-11" disabled={busy || !editor || editor.uncertain || Boolean(editor.conflict)} onClick={() => void controller?.saveEditor()}>{busy ? "正在处理…" : "保存正文"}</Button>
          </div>
        </DialogContent>
      </Dialog>
      <AlertDialog open={Boolean(confirm)} onOpenChange={(next) => { if (!next) setConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogTitle>{confirm === "discard" ? "放弃当前草稿？" : "确认覆盖最新正文？"}</AlertDialogTitle>
          <AlertDialogDescription>{confirm === "discard" ? "尚未保存的正文修改会被放弃。" : "会再次核对服务端，并用当前草稿替换刚才展示的最新正文。"}</AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">返回编辑</AlertDialogCancel>
            <AlertDialogAction className="h-11" variant="destructive" onClick={() => {
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
    <label htmlFor="quick-note-editor" className="text-sm font-medium">正文</label>
    <Textarea id="quick-note-editor" value={editor.draft} onChange={(event) => onChange(event.target.value)} disabled={busy} rows={12} className="min-h-60 resize-y leading-7" aria-describedby={editor.error ? "quick-note-edit-error" : undefined} />
    {editor.error && <p id="quick-note-edit-error" role="alert" className="text-sm leading-6 text-destructive">{editor.error}</p>}
  </>;
}
