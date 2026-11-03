import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DialogBody, DialogFooter } from "@/components/ui/dialog";
import { AppSelect } from "@/components/ui/app-select";
import { testConnection } from "@/domain/registry/registry-client";
import { PROBE_PROTOCOLS, validLiteral, type Connection, type ProbeProtocol, type ProbeResult } from "@/domain/registry/registry-types";
import { ConnectionError } from "./ConnectionShared";
import { useRegistryTask } from "./useRegistryTask";

export function ConnectionProbe({ connection, onClose }: { connection: Connection; onClose?: () => void }) {
  const [protocol, setProtocol] = useState<ProbeProtocol>("openai_chat_completions");
  const [model, setModel] = useState(connection.default_model ?? "");
  const test = useRegistryTask<ProbeResult>();
  const unsupported = connection.transport !== "direct" && protocol !== "anthropic_messages";
  const unavailable = !connection.enabled || !connection.credential.configured;
  return <><DialogBody className="space-y-4">
    <div className="space-y-1"><p className="text-xs">本次协议</p>
      <AppSelect surface="translucent" controlSize="comfortable" ariaLabel="本次协议" value={protocol} options={PROBE_PROTOCOLS.map(value => ({ value, label: value }))}
        onValueChange={value => { test.reset(); setProtocol(value); }} />
    </div>
    <label className="grid gap-1 text-xs"><span>测试模型（可手填）</span>
      <Input surface="translucent" controlSize="comfortable" aria-label="测试模型" value={model} onChange={event => { setModel(event.target.value); test.reset(); }} />
    </label>
    <p className="text-xs leading-relaxed text-muted-foreground">仅验证一次基础非流式请求，不代表完整 Chat、Streaming、Thinking、Cache、图片或长上下文可用。不修改连接、绑定或会话。</p>
    {unsupported && <p className="text-xs text-muted-strong">此 Transport 的测试仅支持 Anthropic 协议。</p>}
    {unavailable && <p className="text-xs text-muted-strong">请先启用连接并配置 Key。</p>}
    <ConnectionError error={test.state.error} />
    {test.state.data && <p role="status" className="text-xs">基础非流式测试成功 · {test.state.data.model}</p>}
  </DialogBody><DialogFooter><Button variant="outline" onClick={onClose}>关闭</Button>
    <Button loading={test.state.status === "loading"} disabled={unavailable || unsupported || !validLiteral(model)}
      onClick={() => { void test.run(signal => testConnection(connection.id, protocol, model, { signal })); }}>测试</Button>
  </DialogFooter></>;
}
