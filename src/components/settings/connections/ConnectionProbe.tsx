import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DialogBody, DialogFooter } from "@/components/ui/dialog";
import { AppSelect } from "@/components/ui/app-select";
import { testConnection } from "@/domain/registry/registry-client";
import { PROBE_PROTOCOLS, RegistryError, validLiteral, type Connection, type ProbeProtocol, type ProbeResult } from "@/domain/registry/registry-types";

type Entry = { input: string; protocol: ProbeProtocol; model: string; result?: ProbeResult; error?: RegistryError };
export function ConnectionProbe({ connection, onClose }: { connection: Connection; onClose?: () => void }) {
  const [protocol, setProtocol] = useState<ProbeProtocol>("openai_chat_completions");
  const [model, setModel] = useState(connection.default_model ?? "");
  const [prompt, setPrompt] = useState("你好");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => { active.current?.abort(); active.current = null; }, []);
  const clear = () => { active.current?.abort(); active.current = null; setLoading(false); setPrompt(""); setEntries([]); };
  const send = async () => {
    if (active.current) return;
    const controller = new AbortController(); active.current = controller; setLoading(true);
    const entry: Entry = { input: prompt, protocol, model: model.trim() };
    try { entry.result = await testConnection(connection.id, protocol, model, { signal: controller.signal }, prompt); }
    catch (error) { entry.error = error instanceof RegistryError ? error : new RegistryError("unknown"); }
    if (active.current !== controller || controller.signal.aborted) return;
    active.current = null; setEntries(previous => [...previous, entry]); setLoading(false);
  };
  const unsupported = connection.transport !== "direct" && protocol !== "anthropic_messages";
  const unavailable = !connection.enabled || !connection.credential.configured;
  return <><DialogBody className="space-y-4">
    <div className="space-y-1"><p className="text-xs">本次协议</p>
      <AppSelect surface="translucent" controlSize="comfortable" ariaLabel="本次协议" value={protocol} options={PROBE_PROTOCOLS.map(value => ({ value, label: value }))}
        onValueChange={setProtocol} />
    </div>
    <label className="grid gap-1 text-xs"><span>测试模型（可手填）</span>
      <Input surface="translucent" controlSize="comfortable" aria-label="测试模型" value={model} onChange={event => setModel(event.target.value)} />
    </label>
    <p className="text-xs leading-relaxed text-muted-foreground">每次为独立的普通非流式文本请求，不验证完整 Chat 能力。记录仅保留到关闭弹窗。取消请求不代表上游停止执行或计费。</p>
    {unsupported && <p className="text-xs text-muted-strong">此 Transport 的测试仅支持 Anthropic 协议。</p>}
    {unavailable && <p className="text-xs text-muted-strong">请先启用连接并配置 Key。</p>}
    <label className="grid gap-1 text-xs"><span>测试内容</span>
      <Textarea aria-label="测试内容" surface="translucent" controlSize="comfortable" className="max-h-48 min-h-24 resize-y overflow-y-auto" value={prompt} onChange={event => setPrompt(event.target.value)} />
    </label>
    {[...prompt].length > 10000 && <p role="alert" className="text-xs text-destructive">测试内容不能超过 10000 个字符。</p>}
    <div aria-label="临时测试记录" className="space-y-3">
      {entries.map((entry, index) => <section key={index} aria-label={`测试记录 ${index + 1}`} className="min-w-0 space-y-3 rounded-xl border border-border-strong/40 bg-background/20 p-3 text-sm [overflow-wrap:anywhere]">
        <p className="text-xs text-muted-foreground">{entry.protocol} · {entry.model}</p>
        <div><p className="mb-1 text-xs text-muted-foreground">输入内容</p><p className="whitespace-pre-wrap">{entry.input}</p></div>
        {entry.error ? <p role="alert" className="whitespace-pre-wrap text-xs text-destructive">{entry.error.status > 0 ? `HTTP ${entry.error.status} · ` : ""}{entry.error.code}：{entry.error.message}{entry.error.safeMessage ? `\n${entry.error.safeMessage}` : ""}</p> : <>
          <div><p className="mb-1 text-xs text-muted-foreground">输出内容</p><p className="whitespace-pre-wrap">{entry.result?.content || "（空响应）"}</p></div>
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-primary"><span>Input Tokens：{entry.result?.input_tokens ?? "未返回"}</span><span>Output Tokens：{entry.result?.output_tokens ?? "未返回"}</span></p>
        </>}
      </section>)}
    </div>
  </DialogBody><DialogFooter><Button variant="outline" onClick={() => { clear(); onClose?.(); }}>关闭</Button>
    <Button variant="outline" onClick={clear}>清空</Button>
    <Button loading={loading} disabled={loading || unavailable || unsupported || !validLiteral(model) || !prompt.trim() || [...prompt].length > 10000}
      onClick={() => { void send(); }}>发送</Button>
  </DialogFooter></>;
}
