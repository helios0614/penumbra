import { useRef, useState } from "react";
import { CircleAlert, ChevronUp, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

/** Presentation only. Refresh remain owned by the Main adapter. */
export function ChatExecutionFeedback({ summary, detail, uncertain, onRefresh }: {
  readonly summary: string;
  readonly detail: string;
  readonly uncertain: boolean;
  readonly onRefresh?: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refreshError, setRefreshError] = useState(false);
  const refreshing = useRef(false);
  return <div className="mx-auto mb-2 max-w-[720px] text-xs text-muted-strong" data-chat-execution-feedback>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button type="button" variant="ghost" size="compact" className="max-w-full gap-2"
        aria-label={`${summary}，查看详情`} />}>
        <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="min-w-0 truncate" role={uncertain ? "status" : "alert"}>{summary}</span>
        <ChevronUp className="size-3.5 shrink-0" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent side="top" align="start" sideOffset={12} className="chat-composer-menu"
        collisionAvoidance={{ side: "none", align: "shift", fallbackAxisSide: "none" }}>
        <ScrollArea className="chat-model-scroll"><div className="space-y-3 p-3 text-xs leading-relaxed">
          <PopoverTitle>回复状态</PopoverTitle>
          <p>{detail}</p>
          {uncertain && <p>结果尚未确认，可重新核对。核对只读取状态，不会再次发送或重新生成；草稿和附件可以继续编辑。</p>}
          {onRefresh && <Button type="button" variant="outline" size="compact" loading={busy} disabled={busy} onClick={async () => {
            if (refreshing.current) return;
            refreshing.current = true; setBusy(true); setRefreshError(false);
            try { await onRefresh(); } catch { setRefreshError(true); }
            finally { refreshing.current = false; setBusy(false); }
          }}><RefreshCw className="size-3.5" aria-hidden="true" />刷新状态</Button>}
          {refreshError && <p role="alert">暂时无法刷新，请稍后重试。</p>}

        </div></ScrollArea>
      </PopoverContent>
    </Popover>
  </div>;
}
