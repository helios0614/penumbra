import { Button } from "@/components/ui/button";

export function SettingsReadbackStatus({ pending, error, onRefresh }: {
  pending: "read" | "save" | null;
  error: string;
  onRefresh: () => void;
}) {
  return <>
    {pending && <p role="status" className="text-xs text-muted-foreground">{pending === "read" ? "正在读取配置…" : "正在保存并读取配置…"}</p>}
    {error && <div className="space-y-1">
      <p role="alert" className="break-words text-xs text-destructive">{error}</p>
      <Button type="button" variant="outline" size="compact" onClick={onRefresh}>重新读取</Button>
    </div>}
  </>;
}
