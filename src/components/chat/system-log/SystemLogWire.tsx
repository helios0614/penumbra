import type { JsonValue } from "@/domain/message";
import { JsonViewer } from "@/components/ui/json-viewer";
import { LogDisclosure } from "./LogDisclosure";
import { LogTextPreview } from "./LogTextPreview";
import { objectValue, wireStructure } from "./system-log-presentation";
const leaf = (value: JsonValue) => value === null ? "null" : typeof value !== "object" ? String(value) : undefined;
function Scalar({ name, value }: { name: string; value: JsonValue }) {
  return <div className="min-w-0" data-wire-field={name}>
    <div className="system-log-hint">{name}</div>
    <div className="system-log-text text-xs" data-log-reading-anchor>{leaf(value)}</div>
  </div>;
}
function JsonField({ name, value }: { name: string; value: JsonValue }) {
  return <div data-wire-field={name}><LogDisclosure title={name} keepMounted><JsonViewer data={value} label={name} showCopy={false} defaultMode="raw" /></LogDisclosure></div>;
}
export function WireField({ name, value }: { name: string; value: JsonValue }) {
  if (leaf(value) !== undefined) return <Scalar name={name} value={value} />;
  const object = objectValue(value);
  if (object && Object.values(object).every(item => leaf(item) !== undefined)) return <div className="min-w-0" data-wire-field={name}>
    <div className="system-log-hint">{name}</div>
    <div className="system-log-inline-fields">{Object.entries(object).map(([key, item]) => <Scalar key={key} name={key} value={item} />)}</div>
  </div>;
  return <JsonField name={name} value={value} />;
}
function Block({ name, value, collapse }: { name: string; value: JsonValue; collapse: boolean }) {
  const row = objectValue(value);
  if (!row) return <Content name={name} value={value} collapse={collapse} />;
  if (typeof row.text === "string" && (row.type === undefined || row.type === "text")) return <div data-wire-block={name}>
    <LogTextPreview text={row.text} label={name} copyable collapse={collapse} />
    {Object.entries(row).filter(([key]) => key !== "text").map(([key, item]) => <WireField key={key} name={key} value={item} />)}
  </div>;
  const source = objectValue(row.source) ?? objectValue(row.inlineData) ?? objectValue(row.inline_data) ?? objectValue(objectValue(row.image_url)?.url);
  const metadata = source && Object.entries(source).filter(([key, value]) => ["media_type", "mime_type", "mimeType", "estimated_bytes", "_capture"].includes(key) && leaf(value) !== undefined);
  return <div className="system-log-content-block" data-wire-block={name}>
    <div className="system-log-hint system-log-text">{wireStructure(value)}{metadata?.map(([key, value]) => ` · ${key}: ${leaf(value)}`).join("")}</div>
    {row.type === "tool_result" && typeof row.content === "string" && <LogTextPreview text={row.content} label={name} copyable collapse={collapse} />}
    <LogDisclosure title={`原始内容块 · ${name}`} keepMounted><JsonViewer data={value} label={name} showCopy={false} defaultMode="raw" /></LogDisclosure>
  </div>;
}
function Content({ name, value, collapse = true }: { name: string; value: JsonValue; collapse?: boolean }) {
  if (typeof value === "string") return <div data-wire-field={name}><LogTextPreview text={value} label={name} copyable collapse={collapse} /></div>;
  if (!Array.isArray(value) || value.length > 100) return <WireField name={name} value={value} />;
  return <div data-wire-field={name} className="system-log-content-blocks">{value.map((block, index) => <Block key={index} name={`${name}[${index}]`} value={block} collapse={collapse} />)}</div>;
}
export function WireSystem({ name, value }: { name: string; value: JsonValue }) {
  const row = objectValue(value);
  return row && Array.isArray(row.parts) ? <div>{Object.entries(row).map(([key, item]) => key === "parts" ? <Content key={key} name={key} value={item} collapse={false} /> : <WireField key={key} name={key} value={item} />)}</div>
    : <Content name={name} value={value} collapse={false} />;
}
export function WireMessage({ name, value, index }: { name: string; value: JsonValue; index: number }) {
  const row = objectValue(value);
  if (!row) return <div data-wire-message={index}><Content name={`${name}[${index}]`} value={value} /></div>;
  return <article className="system-log-message" data-wire-message={index}>
    <h5 className="system-log-message-heading">{String(index + 1).padStart(2, "0")} · {typeof row.role === "string" ? row.role : "role 未提供"}</h5>
    {Object.entries(row).filter(([key]) => key !== "role").map(([key, item]) => key === "content" || key === "parts" ? <Content key={key} name={key} value={item} />
      : key === "tool_calls" ? <WireTools key={key} name={key} value={item} /> : <WireField key={key} name={key} value={item} />)}
  </article>;
}
export function WireMessages({ name, value }: { name: string; value: JsonValue }) {
  if (!Array.isArray(value) || value.length > 200) return <JsonField name={name} value={value} />;
  const earlier = Math.max(0, value.length - 5);
  const systems = value.slice(0, earlier).filter(item => ["system", "developer"].includes(String(objectValue(item)?.role))).length;
  return <div data-wire-messages>
    <p className="system-log-hint">{value.length} 条 · 按原始发送顺序{earlier ? " · 最近 5 条默认展示" : ""}</p>
    {earlier > 0 && <LogDisclosure title={`展开较早的 ${earlier} 条消息${systems ? `（含 ${systems} 条 system / developer）` : ""}`} keepMounted>
      {value.slice(0, earlier).map((message, index) => <WireMessage key={index} name={name} value={message} index={index} />)}
    </LogDisclosure>}
    {value.slice(earlier).map((message, index) => <WireMessage key={index + earlier} name={name} value={message} index={index + earlier} />)}
  </div>;
}
function ToolFields({ value }: { value: { readonly [key: string]: JsonValue } }) {
  return <div className="space-y-1">{Object.entries(value).map(([key, item]) => key === "function" && objectValue(item)
    ? <div key={key} data-wire-field={key}><div className="system-log-hint">function</div><ToolFields value={objectValue(item)!} /></div>
    : key === "functionDeclarations" && Array.isArray(item) ? <WireTools key={key} name={key} value={item} /> : <WireField key={key} name={key} value={item} />)}</div>;
}
export function WireTools({ name, value }: { name: string; value: JsonValue }) {
  if (!Array.isArray(value) || value.length > 100) return <JsonField name={name} value={value} />;
  return <div>{value.map((tool, index) => {
    const row = objectValue(tool); if (!row) return <WireField key={index} name={`${name}[${index}]`} value={tool} />;
    const fn = objectValue(row.function); const label = row.name ?? fn?.name ?? row.type ?? (Array.isArray(row.functionDeclarations) ? `${row.functionDeclarations.length} functionDeclarations` : undefined);
    return <LogDisclosure key={index} title={`${String(index + 1).padStart(2, "0")}${typeof label === "string" ? ` · ${label}` : ""}`} keepMounted><ToolFields value={row} /></LogDisclosure>;
  })}</div>;
}
