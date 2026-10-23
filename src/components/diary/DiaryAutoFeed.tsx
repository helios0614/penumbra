import { CircleHelp, Sparkles } from "lucide-react";
import type { DiaryState } from "@/application/diary-reader/diary-reader-state";
import type { DiaryReaderController } from "@/application/diary-reader/diary-reader-controller";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";

export function DiaryAutoFeed({ state, controller }: { readonly state: DiaryState["autoFeed"]; readonly controller: DiaryReaderController | null }) {
  return <div className="mt-1" aria-label="自动投喂记忆设置">
    <div className="flex min-h-11 items-center gap-2 px-1 text-xs text-muted-strong">
      <Sparkles className="size-3.5 shrink-0 text-primary-ink" aria-hidden="true" /><span id="diary-auto-feed-label">自动投喂记忆</span>
      <Popover><PopoverTrigger aria-label="了解自动投喂记忆" render={<Button variant="ghost" className="size-11 px-0 text-muted-foreground" />}><CircleHelp className="size-3.5" aria-hidden="true" /></PopoverTrigger>
        <PopoverContent><PopoverTitle>自动投喂记忆</PopoverTitle><PopoverDescription className="text-xs leading-6">这是全局设置，与所选月份和日期无关。开启既有记忆投喂，不代表日记正文已完成或归档。旧执行链路仍有替换未完成记录的风险，重要草稿请先备份。</PopoverDescription></PopoverContent>
      </Popover>
      <div className="ml-auto shrink-0">
        {state.enabled === null ? <span className="text-xs text-muted-foreground" role="status">{state.loading ? "读取中…" : "状态未知"}</span>
          : <Switch aria-labelledby="diary-auto-feed-label" checked={state.enabled} busy={state.saving} disabled={!controller || state.loading || state.uncertain} onCheckedChange={(enabled) => void controller?.toggleAutoFeed(enabled)} />}
      </div>
    </div>
    {state.error && <div className="flex flex-wrap items-center gap-x-2 px-1 text-xs leading-5 text-muted-strong" role="status">
      <span>{state.error}</span><Button variant="ghost" size="compact" disabled={!controller || state.loading || state.saving} onClick={() => void controller?.loadAutoFeed()}>{state.uncertain ? "核对状态" : "重新读取设置"}</Button>
    </div>}
  </div>;
}
