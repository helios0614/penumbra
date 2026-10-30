import { useLayoutEffect, useRef, useState } from "react";
import { Play, MessagesSquare } from "lucide-react";
import type { DiaryFeedController, DiaryFeedState } from "@/application/diary-chat/diary-feed-controller";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { diaryDialogViewportRef } from "./DiaryReaderDetails";

export function DiaryFeedAction({ date, indexedEntryId, state, controller, onOpen }: {
  readonly date: string; readonly indexedEntryId?: string;
  readonly state: DiaryFeedState; readonly controller: DiaryFeedController | null;
  readonly onOpen: (entryId: string) => void;
}) {
  const [replacement, setReplacement] = useState<{ date: string; id: string } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const restore = useRef<{ date: string; target: HTMLButtonElement } | null>(null);
  const notice = state.notices[date], busy = state.busyDate !== null;
  useLayoutEffect(() => {
    if (busy || !restore.current) return;
    const saved = restore.current; restore.current = null;
    if (saved.date === date && saved.target.isConnected && !saved.target.disabled &&
      (document.activeElement === document.body || document.activeElement === saved.target)) {
      saved.target.focus({ preventScroll: true });
    }
  }, [busy, date]);
  return <div className="mt-2 px-1" aria-label="手动启动日记投喂">
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <Button ref={trigger} type="button" variant="link" size="compact" className="min-h-11 gap-1.5 px-0 text-xs font-normal text-muted-strong"
        disabled={!controller || busy} onClick={() => {
          const target = trigger.current;
          if (target && target === document.activeElement) restore.current = { date, target };
          void controller?.start(date);
        }}>
        <Play className="size-3.5" aria-hidden="true" />{state.busyDate === date ? "正在启动…" : "开始投喂"}
      </Button>
      {notice?.kind === "draft" && <>
        <Button type="button" variant="link" size="compact" className="min-h-11 px-0 text-xs" onClick={() => notice.entryId && onOpen(notice.entryId)}>继续原日记</Button>
        <Button type="button" variant="link" size="compact" className="min-h-11 px-0 text-xs text-muted-strong" disabled={busy}
          onClick={() => notice.entryId && setReplacement({ date, id: notice.entryId })}>替换并重新投喂</Button>
      </>}
      {notice?.kind === "started" && notice.entryId && notice.entryId !== indexedEntryId && <Button type="button" variant="link" size="compact" className="min-h-11 gap-1.5 px-0 text-xs" onClick={() => onOpen(notice.entryId!)}>
        <MessagesSquare className="size-3.5" aria-hidden="true" />进入本次日记对话
      </Button>}
    </div>
    {notice && <p role={notice.kind === "uncertain" || notice.kind === "refused" ? "alert" : "status"} className="text-xs leading-5 text-muted-strong">{notice.text}</p>}
    <AlertDialog open={Boolean(replacement)} onOpenChange={open => { if (!open) setReplacement(null); }}>
      <AlertDialogContent ref={diaryDialogViewportRef}>
        <AlertDialogHeader><AlertDialogTitle>替换草稿并重新投喂？</AlertDialogTitle><AlertDialogDescription>
          {replacement?.date} 的旧草稿和对话将被替换，并重新投喂。此操作无法撤回。
        </AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>保留旧草稿</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={busy} onClick={() => {
          if (replacement) void controller?.replaceConfirmed(replacement.date, replacement.id);
          setReplacement(null);
        }}>确认替换并投喂</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
