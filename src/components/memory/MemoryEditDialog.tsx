import { useRef, useState, type RefObject } from "react";
import type { Memory, MemoryEditInput } from "@/domain/memory";
import type { MemoryManagementError } from "@/application/memory-management";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { normalizeMemoryKeywordText } from "./MemoryCreateDialog";

export function memoryKeywordDraft(memory: Memory): string {
  if (memory.keywordsForEdit !== undefined) {
    try { const parsed: unknown = JSON.parse(memory.keywordsForEdit); if (Array.isArray(parsed) && parsed.every(v => typeof v === "string")) return parsed.join(", "); } catch { /* Legacy plain text is editable without changing it on unrelated saves. */ }
    return memory.keywordsForEdit;
  }
  return memory.tags.join(", ");
}
export function MemoryEditDialog({ memory, pending, error, onSubmit, onClose, finalFocus }: {
  readonly memory: Memory; readonly pending: boolean; readonly error: MemoryManagementError | null;
  readonly onSubmit: (input: MemoryEditInput) => Promise<boolean>; readonly onClose: () => void;
  readonly finalFocus: RefObject<HTMLElement | null>;
}) {
  // An opening snapshot: background GETs must not replace an unsaved draft.
  const [content, setContent] = useState(memory.content);
  const [keywords, setKeywords] = useState(() => memoryKeywordDraft(memory));
  const [importance, setImportance] = useState(memory.importance?.toString() ?? "");
  const [keywordsChanged, setKeywordsChanged] = useState(false);
  const [importanceChanged, setImportanceChanged] = useState(false);
  const [validation, setValidation] = useState<string | null>(null);
  const submitRef = useRef(false);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const submit = async () => {
    if (pending || submitRef.current) return;
    if (!content.trim()) { setValidation("请填写记忆正文。"); return; }
    const score = Number(importance);
    if (importanceChanged && (!importance.trim() || !Number.isFinite(score) || score < 0 || score > 1)) { setValidation("重要度应为 0 到 1 之间的数字。"); return; }
    setValidation(null); submitRef.current = true;
    try { await onSubmit({ content, ...(keywordsChanged ? { keywords: JSON.stringify(normalizeMemoryKeywordText(keywords)) } : {}), ...(importanceChanged ? { importance: score } : {}) }); }
    finally { submitRef.current = false; }
  };
  return <Dialog open disablePointerDismissal={pending} onOpenChange={(open, details) => { if (!open) { if (pending || submitRef.current) details.cancel(); else onClose(); } }}>
    <DialogContent initialFocus={contentRef} finalFocus={finalFocus} closeButtonProps={{ disabled: pending, "aria-label": "关闭编辑记忆" }}>
      <DialogHeader><DialogTitle>编辑记忆</DialogTitle><DialogDescription>修改内容；未改动的关键词和重要度会保留原值。</DialogDescription></DialogHeader>
      <DialogBody render={<form id="memory-edit-form" onSubmit={event => { event.preventDefault(); void submit(); }} />}>
        <label className="flex flex-col gap-2 text-sm font-medium">正文
          <Textarea ref={contentRef} autoFocus rows={6} surface="translucent" className="scrollbar-none min-h-28 max-h-52 resize-none overflow-y-auto" value={content} disabled={pending} onChange={event => setContent(event.target.value)} />
        </label>
        <label className="mt-4 flex flex-col gap-2 text-sm">关键词
          <Input surface="translucent" controlSize="comfortable" value={keywords} disabled={pending} placeholder="用逗号分隔" onChange={event => { setKeywords(event.target.value); setKeywordsChanged(true); }} />
        </label>
        <label className="mt-4 flex flex-col gap-2 text-sm">重要度
          <Input surface="translucent" controlSize="comfortable" type="number" min={0} max={1} step="any" value={importance} disabled={pending} placeholder="保留原值" onChange={event => { setImportance(event.target.value); setImportanceChanged(true); }} />
        </label>
        {(validation || error) && <p role="alert" className="mt-3 text-xs leading-5 text-destructive-foreground">{validation ?? error?.message}</p>}
      </DialogBody>
      <DialogFooter><Button variant="ghost" size="comfortable" disabled={pending} onClick={onClose}>取消</Button><Button type="submit" form="memory-edit-form" size="comfortable" loading={pending} disabled={!content.trim()}>保存修改</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
