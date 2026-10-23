import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DiaryFeedback({ loading, error, retained, target, onRetry }: {
  readonly loading: boolean;
  readonly error: string | null;
  readonly retained: boolean;
  readonly target: "日历" | "正文";
  readonly onRetry: () => void;
}) {
  return <>
    {loading && <p role="status" className="flex items-center gap-2 py-3 text-[13px] text-muted-strong">
      <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />{retained ? `正在刷新${target}…` : `正在读取${target}…`}
    </p>}
    {error && <div role="alert" className="py-3 text-[13px] leading-6">
      <p className="text-destructive-foreground">{retained ? `刷新未成功，以下保留上次读取的${target === "日历" ? "索引" : "正文"}。` : ""}{error}</p>
      <Button variant="soft-primary" size="compact" className="mt-2" onClick={onRetry}>重新读取{target}</Button>
    </div>}
  </>;
}
