import type { QuickNoteController } from "@/application/quick-note/quick-note-controller";
import type { QuickNoteState } from "@/application/quick-note/quick-note-state";
import { Button } from "@/components/ui/button";

export function QuickNoteFeedback({ state, controller }: { readonly state: QuickNoteState; readonly controller: QuickNoteController | null }) {
  return <>
    {state.notice && !state.notice.toast && <p role={state.notice.tone === "error" ? "alert" : "status"} className={`my-3 text-sm leading-6 ${state.notice.tone === "error" ? "text-destructive" : "text-muted-strong"}`}>{state.notice.text}</p>}
    {state.pending && <p role="status" className="my-3 text-sm text-muted-foreground">{state.pending.kind === "step1" ? "正在请求 Step 1…" : state.pending.kind === "step2" ? "正在请求 Step 2…" : state.pending.kind === "delete" ? "正在删除…" : state.pending.kind === "backfill" ? "正在提交补写请求…" : "正在处理…"}</p>}
    {state.status === "loading" && <p role="status" className="py-5 text-sm text-muted-foreground">正在读取速记…</p>}
    {state.error && <div role="alert" className="py-4 text-sm"><p className="text-destructive">{state.error}</p><Button variant="outline" className="mt-3 h-11" onClick={() => void controller?.load()}>重新读取记录</Button></div>}
  </>;
}
