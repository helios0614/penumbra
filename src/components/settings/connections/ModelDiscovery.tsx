import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { discoverModels } from "@/domain/registry/registry-client";
import { RegistryError, validLiteral, type Connection, type DiscoveredModels, type ProbeProtocol } from "@/domain/registry/registry-types";
import { useRegistryTask } from "./useRegistryTask";

// Discovery has its own deadline per source; one stalled endpoint cannot hide the other.
export async function fetchDiscovery(connection: Connection, protocol: ProbeProtocol, cursor: string | undefined, signal: AbortSignal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) controller.abort();
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      discoverModels(connection.id, protocol, cursor, { signal: controller.signal }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new RegistryError("unknown")); }, 15000); }),
    ]);
  } finally { clearTimeout(timer!); signal.removeEventListener("abort", abort); }
}

export function ModelDiscovery({ connection, disabled, unsaved, value = "", autoFetch = false, onAutoFetch, onUseModel }: {
  connection: Connection; disabled: boolean; unsaved: boolean; value?: string; autoFetch?: boolean; onAutoFetch?: () => void; onUseModel: (model: string) => void;
}) {
  const [open, setOpen] = useState(false), [search, setSearch] = useState("");
  const [anthropicModels, setAnthropicModels] = useState<readonly string[]>([]);
  const openai = useRegistryTask<DiscoveredModels>(), anthropic = useRegistryTask<DiscoveredModels>();
  const noDiscovery = connection.transport !== "direct";
  const unavailable = disabled || unsaved || !connection.enabled || !connection.credential.configured || noDiscovery;
  const fetchAnthropic = async (cursor?: string) => {
    const result = await anthropic.run(signal => fetchDiscovery(connection, "anthropic_messages", cursor, signal));
    if (result) setAnthropicModels(previous => cursor ? [...new Set([...previous, ...result.models])] : result.models);
  };
  const fetchModels = () => {
    setSearch(""); setAnthropicModels([]);
    void openai.run(signal => fetchDiscovery(connection, "openai_chat_completions", undefined, signal));
    void fetchAnthropic();
  };
  useEffect(() => { if (autoFetch && !unavailable) { setOpen(true); fetchModels(); onAutoFetch?.(); } }, [autoFetch, unavailable]);
  const models = [...new Set([...(openai.state.data?.models ?? []), ...anthropicModels])];
  const filtered = models.filter(model => model.toLowerCase().includes(search.toLowerCase()));
  const loading = openai.state.status === "loading" || anthropic.state.status === "loading";
  const failed = [openai.state.status === "error" ? "OpenAI" : "", anthropic.state.status === "error" ? "Anthropic" : ""].filter(Boolean);
  const succeeded = openai.state.status === "success" || anthropic.state.status === "success" || anthropicModels.length > 0;
  const page = anthropic.state.data;
  return <section aria-label="模型发现" className="space-y-2">
    <div className="grid gap-1"><p className="text-xs">模型预填建议（可选）</p>
    <div className="flex min-w-0 items-stretch gap-2">
      <Input surface="translucent" controlSize="comfortable" aria-label="模型预填建议" className="min-w-0 flex-1" value={value} disabled={disabled} onChange={event => onUseModel(event.target.value)} />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger render={<Button size="comfortable" className="self-stretch px-3" variant="outline" disabled={unavailable} onClick={fetchModels} />}>获取模型</PopoverTrigger>
        <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] max-h-[min(26rem,var(--available-height))] gap-2 overflow-hidden rounded-xl p-1">
          <Input surface="translucent" aria-label="筛选已获取的模型" placeholder="搜索模型" value={search} onChange={event => setSearch(event.target.value)} />
          <div aria-live="polite" className="space-y-1 px-2 text-xs text-muted-strong">
            {loading && <p>正在获取模型…</p>}
            {failed.length > 0 && <p>{failed.join("、")} 来源未成功（请求失败或超时）。{succeeded ? "可选择已获取的候选。" : "仍可手动输入。"}</p>}
            {!loading && succeeded && models.length === 0 && <p>远端返回空模型列表；保留手动输入。</p>}
            {models.length > 0 && filtered.length === 0 && <p>没有匹配的模型。</p>}
          </div>
          <ul aria-label="模型候选" className="min-h-0 overflow-y-auto overscroll-contain" onKeyDown={event => {
            if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
            const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
            const current = items.indexOf(document.activeElement as HTMLButtonElement);
            const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
            event.preventDefault(); items[next]?.focus();
          }}>
            {filtered.map(model => <li key={model}><Button variant="ghost" disabled={disabled || !validLiteral(model)} aria-pressed={value === model}
              className="min-h-11 h-auto w-full justify-start whitespace-normal break-all rounded-lg px-2.5 py-2 text-left text-xs hover:bg-primary/8 hover:text-primary-ink focus-visible:bg-primary/8 aria-pressed:bg-primary/12 aria-pressed:text-primary-ink"
              onClick={() => { onUseModel(model); setOpen(false); }}>{model}</Button></li>)}
          </ul>
          {openai.state.data?.truncated && <p className="px-2 text-xs text-muted-foreground">OpenAI 当前不支持分页，请手动输入。</p>}
          {page?.truncated && (page.next_page ? <Button size="compact" variant="ghost" disabled={unavailable || loading} onClick={() => { void fetchAnthropic(page.next_page!); }}>读取下一页</Button> : <p className="px-2 text-xs">Anthropic 未提供下一页游标，请手动输入。</p>)}
        </PopoverContent>
      </Popover>
    </div>
    </div>
    {noDiscovery && <p className="text-xs text-muted-strong">此接入方式暂不支持模型发现，仍可手动输入。</p>}
    {unsaved && <p className="text-xs text-muted-foreground">接入配置有未保存改动，请先保存并读回。</p>}
    {!connection.credential.configured && <p className="text-xs text-muted-foreground">配置 Key 后可获取建议；始终允许手动输入。</p>}
  </section>;
}
