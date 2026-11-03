import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { discoverModels, testConnection } from "@/domain/registry/registry-client";
import { PROBE_PROTOCOLS, validLiteral, type Connection, type DiscoveredModels, type ProbeProtocol, type ProbeResult } from "@/domain/registry/registry-types";
import { ConnectionCard, ConnectionError } from "./ConnectionShared";
import { useRegistryTask } from "./useRegistryTask";

export function ConnectionProbe({ connection, disabled, unsaved, onUseModel }: {
  connection: Connection; disabled: boolean; unsaved: boolean; onUseModel: (model: string) => void;
}) {
  const [protocol, setProtocol] = useState<ProbeProtocol>("openai_chat_completions");
  const [model, setModel] = useState(connection.default_model ?? "");
  const [models, setModels] = useState<readonly string[]>([]);
  const [pageInfo, setPageInfo] = useState<DiscoveredModels | null>(null);
  const test = useRegistryTask<ProbeResult>(), discover = useRegistryTask<DiscoveredModels>();
  const selectProtocol = (next: ProbeProtocol) => {
    test.reset(); discover.reset(); setProtocol(next); setModels([]); setPageInfo(null);
    // The literal belongs to the draft, never to a protocol dropdown or catalog refresh.
  };
  const fetchModels = async (cursor?: string) => {
    const result = await discover.run(signal => discoverModels(connection.id, protocol, cursor, { signal }));
    if (result) { setModels(previous => cursor ? [...new Set([...previous, ...result.models])] : result.models); setPageInfo(result); }
  };
  const noDiscovery = connection.transport !== "direct" || protocol === "minimax_chatcompletion_v2";
  const unsupportedTest = connection.transport !== "direct" && protocol !== "anthropic_messages";
  const unavailable = disabled || unsaved || !connection.enabled || !connection.credential.configured;
  return <ConnectionCard title="连接测试与远端模型">
    <p className="text-xs text-muted-foreground">使用已保存连接。协议仅用于本次操作，不保存到 Connection。</p>
    <label className="block space-y-1 text-xs">本次协议
      <select aria-label="本次协议" value={protocol} onChange={event => selectProtocol(event.target.value as ProbeProtocol)}
        className="mist-solid min-h-9 w-full rounded-xl px-2 text-sm">
        {PROBE_PROTOCOLS.map(value => <option key={value} value={value}>{value}</option>)}
      </select>
    </label>
    <label className="block space-y-1 text-xs">测试模型（可手填）
      <Input aria-label="测试模型" value={model} onChange={event => { setModel(event.target.value); test.reset(); }} />
    </label>
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" loading={test.state.status === "loading"} disabled={unavailable || unsupportedTest || !validLiteral(model)}
        onClick={() => { void test.run(signal => testConnection(connection.id, protocol, model, { signal })); }}>基础非流式测试</Button>
      <Button variant="outline" loading={discover.state.status === "loading"} disabled={unavailable || noDiscovery} onClick={() => { void fetchModels(); }}>获取远端模型</Button>
    </div>
    <p className="text-xs leading-relaxed text-muted-foreground">仅验证一次基础非流式请求，不代表完整 Chat、Streaming、Thinking、Cache、图片或长上下文可用。不修改连接、绑定或会话。</p>
    {unsupportedTest && <p className="text-xs text-muted-strong">此 Transport 的测试仅支持 Anthropic 协议。</p>}
    {noDiscovery && <p className="text-xs text-muted-strong">此 Transport / 协议不支持模型发现，仍可手动输入模型。</p>}
    {unavailable && <p className="text-xs text-muted-strong">请先确认已保存、启用且已配置 Key 的连接。</p>}
    <ConnectionError error={test.state.error} />
    {test.state.data && <p role="status" className="text-xs">基础非流式测试成功 · {test.state.data.model}</p>}
    <ConnectionError error={discover.state.error} />
    {discover.state.data && models.length === 0 && <p role="status" className="text-xs">远端返回空模型列表；保留手动输入。</p>}
    {models.length > 0 && <ul className="max-h-64 space-y-2 overflow-y-auto rounded-xl border border-border p-2">
      {models.map(item => <li key={item} className="flex flex-wrap items-center gap-2 rounded-lg bg-background/25 p-2">
        <span className="min-w-0 flex-1 break-all font-mono text-xs">{item}</span>
        <Button size="sm" variant="outline" disabled={!validLiteral(item) || disabled} onClick={() => { onUseModel(item); }}>填入预填草稿</Button>
        <Button size="sm" variant="ghost" disabled={!validLiteral(item)} onClick={() => { setModel(item); test.reset(); }}>用于测试</Button>
      </li>)}
    </ul>}
    {pageInfo?.truncated && <div className="space-y-2 text-xs text-muted-foreground">
      <p>列表尚未完整返回。{protocol === "openai_chat_completions" ? "OpenAI 当前不支持分页，请手动输入。" : !pageInfo.next_page ? "未提供下一页游标，请手动输入。" : "可继续读取下一页。"}</p>
      {protocol === "anthropic_messages" && pageInfo.next_page && <Button variant="outline" disabled={unavailable || discover.state.status === "loading"}
        onClick={() => { void fetchModels(pageInfo.next_page!); }}>读取下一页</Button>}
    </div>}
  </ConnectionCard>;
}
