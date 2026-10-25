import { useRef, useState, type ReactNode } from "react";
import { ChevronRight, Paperclip, RotateCcw, X, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UPLOAD_MIME_TYPES } from "@/domain/media/media-types";
import type { AttachmentDraftStore, DraftAttachment } from "@/application/chat-media/attachment-drafts";
import { MediaImage } from "@/components/media/MediaImage";
import "@/components/media/media.css";

export function AttachmentPicker({ disabled, onFiles }: { disabled: boolean; onFiles: (files: readonly File[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return <>
    <div className="border-b border-border/50 p-1.5">
      <Button type="button" variant="ghost" className="h-auto min-h-14 w-full justify-start gap-3 rounded-xl px-3 py-2 text-left text-foreground hover:bg-ai/5 focus-visible:bg-ai/5 active:bg-ai/10" disabled={disabled}
        onClick={() => input.current?.click()} aria-label="添加图片或视频" title="添加图片或视频">
        <Paperclip className="size-4 shrink-0 text-muted-strong" aria-hidden="true" />
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="text-sm font-medium">添加图片或视频</span>
          <span className="text-[11px] font-normal text-muted-foreground">单个文件最大 20 MiB</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Button>
    </div>
    <input ref={input} type="file" multiple accept={UPLOAD_MIME_TYPES.join(",")} className="hidden" aria-label="选择图片或视频" disabled={disabled}
      onChange={event => { onFiles(Array.from(event.currentTarget.files ?? [])); event.currentTarget.value = ""; }} />
  </>;
}

export function AttachmentDrafts({ owner, items, store, disabled }: { owner: string; items: readonly DraftAttachment[]; store: AttachmentDraftStore; disabled: boolean }) {
  if (!items.length) return null;
  const images = items.filter(item => item.kind === "image" && item.previewUrl).map(item => ({ url: item.previewUrl!, label: item.file.name }));
  let imageIndex = 0;
  return <div className="attachment-drafts scrollbar-none" aria-label="附件草稿">
    {items.map(item => <div className="attachment-draft" key={item.id} data-upload-status={item.status}>
      <div className="attachment-draft-preview">
        {item.previewUrl ? item.kind === "image" ? <MediaImage compact image={{ url: item.previewUrl, label: item.file.name }} images={images} index={imageIndex++}
          lease={() => store.retain(items.map(a => a.id))} /> : <video src={item.previewUrl} controls playsInline preload="metadata" aria-label={`视频草稿：${item.file.name}`} />
          : <Paperclip className="m-auto size-6 text-muted-foreground" />}
        <Button type="button" variant="secondary" size="icon-lg" className="attachment-remove" disabled={disabled} aria-label={`移除 ${item.file.name}`} title="移除附件" onClick={() => store.remove(owner, item.id)}><X className="size-3.5" /></Button>
      </div>
      <p className="truncate text-[11px] text-muted-strong" title={item.file.name}>{item.file.name}</p>
      <p className="flex items-center gap-1 text-[10px] text-muted-foreground">{size(item.file.size)} · {item.status === "uploading" ? <><LoaderCircle className="size-3 animate-spin motion-reduce:animate-none" />上传中</> : item.status === "uploaded" ? "已上传" : "上传未完成"}</p>
      {item.error && <p role="alert" className="mt-1 text-[11px] text-destructive-foreground">{item.error}</p>}
      {item.status === "failed" && item.retryable && <Button variant="ghost" size="compact" disabled={disabled} onClick={() => store.retry(owner, item.id)}><RotateCcw className="size-3" />重试上传</Button>}
    </div>)}
  </div>;
}

/** Drop is scoped to the composer. Never intercept the whole document. */
export function AttachmentDrop({ disabled, onFiles, children }: { disabled: boolean; onFiles: (files: readonly File[]) => void; children: ReactNode }) {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  return <div className="relative min-w-0" data-attachment-drop={dragging}
    onDragEnter={event => { if (Array.from(event.dataTransfer.types).includes("Files")) { event.preventDefault(); depth.current++; if (!disabled) setDragging(true); } }}
    onDragOver={event => { if (Array.from(event.dataTransfer.types).includes("Files")) { event.preventDefault(); event.dataTransfer.dropEffect = disabled ? "none" : "copy"; } }}
    onDragLeave={() => { if (--depth.current <= 0) { depth.current = 0; setDragging(false); } }}
    onDrop={event => { if (Array.from(event.dataTransfer.types).includes("Files")) { event.preventDefault(); depth.current = 0; setDragging(false); if (!disabled) onFiles(Array.from(event.dataTransfer.files)); } }}>
    {children}{dragging && <div className="attachment-drop-hint pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-3xl border border-dashed border-ai bg-popover/95 text-sm text-ai">放入图片或视频</div>}
  </div>;
}
function size(bytes: number) { return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KiB` : `${(bytes / 1024 / 1024).toFixed(1)} MiB`; }
