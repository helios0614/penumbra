import type { JsonValue } from "@/domain/message";
import { JsonViewer } from "@/components/ui/json-viewer";
import { LogDisclosure } from "./LogDisclosure";
import { objectValue } from "./system-log-presentation";
const leaf = (value: JsonValue) => value === null ? "null" : typeof value !== "object" ? String(value) : undefined;
function Scalar({ name, value }: { name: string; value: JsonValue }) {
  return <div className="min-w-0" data-wire-field={name}>
    <div className="mb-0.5 break-all text-[11px] text-muted-foreground">{name}</div>
    <div className="system-log-text text-xs" data-log-reading-anchor>{leaf(value)}</div>
  </div>;
}
function JsonField({ name, value }: { name: string; value: JsonValue }) {
  return <div data-wire-field={name}><LogDisclosure title={name}><JsonViewer data={value} label={name} showCopy={false} defaultMode="raw" /></LogDisclosure></div>;
}
/** Focused wire presentation; unknown structures remain available through the shared JSON reader. */
export function WireField({ name, value }: { name: string; value: JsonValue }) {
  if (leaf(value) !== undefined) return <Scalar name={name} value={value} />;
  const object = objectValue(value);
  if (object && Object.values(object).every(item => leaf(item) !== undefined)) return <div className="min-w-0" data-wire-field={name}>
    <div className="mb-1 break-all text-[11px] text-muted-foreground">{name}</div>
    <div className="system-log-fields">{Object.entries(object).map(([key, item]) => <Scalar key={key} name={key} value={item} />)}</div>
  </div>;
  return <JsonField name={name} value={value} />;
}
function Content({ name, value }: { name: string; value: JsonValue }) {
  if (typeof value === "string") return <div data-wire-field={name}><div className="mb-1 text-[11px] text-muted-foreground">{name}</div><pre className="system-log-text font-sans text-xs leading-relaxed" data-log-reading-anchor>{value}</pre></div>;
  if (!Array.isArray(value) || value.length > 100) return <WireField name={name} value={value} />;
  return <div data-wire-field={name} className="space-y-2">{value.map((block, index) => {
    const row = objectValue(block);
    if (!row) return <WireField key={index} name={`${name}[${index}]`} value={block} />;
    return <div key={index} className="space-y-2 border-l border-border pl-2" data-wire-block={index}>
      <span className="text-[11px] text-muted-foreground">{name}[{index}]</span>
      {Object.entries(row).map(([key, item]) => <WireField key={key} name={key} value={item} />)}
    </div>;
  })}</div>;
}
export function WireSystem({ name, value }: { name: string; value: JsonValue }) {
  const row = objectValue(value);
  return row && Array.isArray(row.parts) ? <div className="space-y-2">{Object.entries(row).map(([key, item]) => key === "parts" ? <Content key={key} name={key} value={item} /> : <WireField key={key} name={key} value={item} />)}</div>
    : <Content name={name} value={value} />;
}
export function WireMessages({ name, value }: { name: string; value: JsonValue }) {
  if (!Array.isArray(value) || value.length > 200) return <JsonField name={name} value={value} />;
  return <div className="space-y-1" data-wire-messages>{value.map((message, index) => {
    const row = objectValue(message);
    if (!row) return <WireField key={index} name={`${name}[${index}]`} value={message} />;
    const role = typeof row.role === "string" ? row.role : "role 未提供";
    return <div key={index} data-wire-message={index}><LogDisclosure title={`${String(index + 1).padStart(2, "0")} · ${role}`}>
      <div className="space-y-2">{Object.entries(row).map(([key, item]) => key === "content" || key === "parts" ? <Content key={key} name={key} value={item} />
        : key === "tool_calls" ? <WireTools key={key} name={key} value={item} /> : <WireField key={key} name={key} value={item} />)}</div>
    </LogDisclosure></div>;
  })}</div>;
}
function ToolFields({ value }: { value: { readonly [key: string]: JsonValue } }) {
  return <div className="space-y-2">{Object.entries(value).map(([key, item]) => key === "function" && objectValue(item)
    ? <div key={key} data-wire-field={key} className="border-l border-border pl-2"><div className="mb-2 text-[11px] text-muted-foreground">function</div><ToolFields value={objectValue(item)!} /></div>
    : key === "functionDeclarations" && Array.isArray(item) ? <WireTools key={key} name={key} value={item} /> : <WireField key={key} name={key} value={item} />)}</div>;
}
export function WireTools({ name, value }: { name: string; value: JsonValue }) {
  if (!Array.isArray(value) || value.length > 100) return <JsonField name={name} value={value} />;
  return <div>{value.map((tool, index) => {
    const row = objectValue(tool); if (!row) return <WireField key={index} name={`${name}[${index}]`} value={tool} />;
    const fn = objectValue(row.function); const label = row.name ?? fn?.name ?? row.type;
    return <LogDisclosure key={index} title={`${String(index + 1).padStart(2, "0")}${typeof label === "string" ? ` · ${label}` : ""}`}><ToolFields value={row} /></LogDisclosure>;
  })}</div>;
}
