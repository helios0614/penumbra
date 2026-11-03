import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AppSelect } from "@/components/ui/app-select";
import { discoverModels } from "@/domain/registry/registry-client";
import { PROBE_PROTOCOLS, validLiteral, type Connection, type DiscoveredModels, type ProbeProtocol } from "@/domain/registry/registry-types";
import { ConnectionError } from "./ConnectionShared";
import { useRegistryTask } from "./useRegistryTask";

export function ModelDiscovery({ connection, disabled, unsaved, onUseModel }: {
  connection: Connection; disabled: boolean; unsaved: boolean; onUseModel: (model: string) => void;
}) {
  const [protocol, setProtocol] = useState<ProbeProtocol>("openai_chat_completions");
  const [models, setModels] = useState<readonly string[]>([]);
  const [pageInfo, setPageInfo] = useState<DiscoveredModels | null>(null);
  const discover = useRegistryTask<DiscoveredModels>();
  const fetchModels = async (cursor?: string) => {
    const result = await discover.run(signal => discoverModels(connection.id, protocol, cursor, { signal }));
    if (result) { setModels(previous => cursor ? [...new Set([...previous, ...result.models])] : result.models); setPageInfo(result); }
  };
  const noDiscovery = connection.transport !== "direct" || protocol === "minimax_chatcompletion_v2";
  const unavailable = disabled || unsaved || !connection.enabled || !connection.credential.configured;
  return <section aria-label="模型发现" className="space-y-2">
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-0 flex-1 space-y-1"><p className="text-xs text-muted-foreground">发现协议 · 仅用于本次操作</p>
        <AppSelect ariaLabel="发现协议" value={protocol} options={PROBE_PROTOCOLS.map(value => ({ value, label: value }))}
          onValueChange={value => { discover.reset(); setProtocol(value); setModels([]); setPageInfo(null); }} disabled={disabled} />
      </div>
      <Button variant="outline" loading={discover.state.status === "loading"} disabled={unavailable || noDiscovery} onClick={() => { void fetchModels(); }}>获取远端模型</Button>
    </div>
    {noDiscovery && <p className="text-xs text-muted-strong">此 Transport / 协议不支持模型发现，仍可手动输入模型。</p>}
    {unsaved && <p className="text-xs text-muted-foreground">接入配置有未保存改动，请先保存并读回。</p>}
    {!connection.credential.configured && <p className="text-xs text-muted-foreground">配置 Key 后可获取建议；始终允许手动输入。</p>}
    <ConnectionError error={discover.state.error} />
    {discover.state.data && models.length === 0 && <p role="status" className="text-xs">远端返回空模型列表；保留手动输入。</p>}
    {models.length > 0 && <ul className="divide-y divide-border/50 rounded-xl border border-border/60 px-2">
      {models.map(item => <li key={item} className="flex flex-wrap items-center gap-2 py-2">
        <span className="min-w-0 flex-1 break-all font-mono text-xs">{item}</span>
        <Button size="sm" variant="outline" disabled={!validLiteral(item) || disabled} onClick={() => onUseModel(item)}>填入预填草稿</Button>
      </li>)}
    </ul>}
    {pageInfo?.truncated && <div className="space-y-2 text-xs text-muted-foreground">
      <p>列表尚未完整返回。{protocol === "openai_chat_completions" ? "OpenAI 当前不支持分页，请手动输入。" : !pageInfo.next_page ? "未提供下一页游标，请手动输入。" : "可继续读取下一页。"}</p>
      {protocol === "anthropic_messages" && pageInfo.next_page && <Button variant="outline" disabled={unavailable || discover.state.status === "loading"}
        onClick={() => { void fetchModels(pageInfo.next_page!); }}>读取下一页</Button>}
    </div>}
  </section>;
}
