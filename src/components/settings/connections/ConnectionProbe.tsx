import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppSelect } from "@/components/ui/app-select";
import { testConnection } from "@/domain/registry/registry-client";
import { PROBE_PROTOCOLS, validLiteral, type Connection, type ProbeProtocol, type ProbeResult } from "@/domain/registry/registry-types";
import { ConnectionError } from "./ConnectionShared";
import { useRegistryTask } from "./useRegistryTask";

export function ConnectionProbe({ connection }: { connection: Connection }) {
  const [protocol, setProtocol] = useState<ProbeProtocol>("openai_chat_completions");
  const [model, setModel] = useState(connection.default_model ?? "");
  const test = useRegistryTask<ProbeResult>();
  const unsupported = connection.transport !== "direct" && protocol !== "anthropic_messages";
  const unavailable = !connection.enabled || !connection.credential.configured;
  return <div className="space-y-4">
    <div className="space-y-1"><p className="text-xs">本次协议</p>
      <AppSelect ariaLabel="本次协议" value={protocol} options={PROBE_PROTOCOLS.map(value => ({ value, label: value }))}
        onValueChange={value => { test.reset(); setProtocol(value); }} />
    </div>
    <label className="block space-y-1 text-xs">测试模型（可手填）
      <Input aria-label="测试模型" value={model} onChange={event => { setModel(event.target.value); test.reset(); }} />
    </label>
    <Button loading={test.state.status === "loading"} disabled={unavailable || unsupported || !validLiteral(model)}
      onClick={() => { void test.run(signal => testConnection(connection.id, protocol, model, { signal })); }}>基础非流式测试</Button>
    <p className="text-xs leading-relaxed text-muted-foreground">仅验证一次基础非流式请求，不代表完整 Chat、Streaming、Thinking、Cache、图片或长上下文可用。不修改连接、绑定或会话。</p>
    {unsupported && <p className="text-xs text-muted-strong">此 Transport 的测试仅支持 Anthropic 协议。</p>}
    {unavailable && <p className="text-xs text-muted-strong">请先启用连接并配置 Key。</p>}
    <ConnectionError error={test.state.error} />
    {test.state.data && <p role="status" className="text-xs">基础非流式测试成功 · {test.state.data.model}</p>}
  </div>;
}
