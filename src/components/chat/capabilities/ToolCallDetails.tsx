import type { CapabilityField, PublicToolCall } from "@/domain/message/capability-types";
import { CapabilityDetails, DetailField } from "./CapabilityDetails";
import { CapabilityTechnicalDetails } from "./CapabilityTechnicalDetails";
import { toolResultBody } from "@/domain/message/capability-mappers";
import { JSON_MAX_TREE_CHARS } from "@/components/ui/json-viewer-model";
import { capabilityNotices } from "./capability-notice-presentation";

const technicalLabels = new Set(["调用参数", "实际执行参数", "结果长度（截断前）", "本次 AI 有界结果"]);
const jsonLabels = new Set(["调用参数", "实际执行参数", "已保存结果", "本次 AI 有界结果", "结果正文"]);
type ToolLayout = { primary: CapabilityField[]; technical: CapabilityField[] };
const layouts = new WeakMap<PublicToolCall, ToolLayout>();

/** Omit proven duplicates/statistics from the view; retain the source and copy payloads. */
export function toolDetailFields(call: PublicToolCall) {
  const cached = layouts.get(call);
  if (cached) return cached;
  let fields = call.fields;
  const saved = fields.find(field => field.label === "已保存结果");
  // Legacy/public string envelopes retain their exact safe source. Extract only
  // the explicit content[] text blocks, lazily inside an open call's detail.
  if (!fields.some(field => field.label === "结果正文") && saved && saved.text.length <= JSON_MAX_TREE_CHARS && /^\s*\{/.test(saved.text) && /"content"\s*:/.test(saved.text)) {
    try {
      const body = toolResultBody(JSON.parse(saved.text));
      if (body) fields = [...fields.slice(0, fields.indexOf(saved)), body, ...fields.slice(fields.indexOf(saved))];
    } catch { /* Invalid JSON remains complete safe text. */ }
  }
  const hasResultBody = fields.some(field => field.label === "结果正文" && field.text.trim());
  const primary: CapabilityField[] = [], technical: CapabilityField[] = [];
  for (const field of fields) {
    if (field.label === "本次 AI 有界结果" && saved?.text.trim() && field.text === saved.text) continue;
    if (field.label === "结果长度（截断前）" && call.resultTruncated !== true) continue;
    (technicalLabels.has(field.label) || (field.label === "已保存结果" && hasResultBody) ? technical : primary).push(field);
  }
  const layout = { primary, technical };
  layouts.set(call, layout);
  return layout;
}

export function ToolCallDetails({ call, identity }: { call: PublicToolCall; identity: string }) {
  const { primary, technical } = toolDetailFields(call);
  return <>
    <p className="capability-tool-identifier font-mono text-[11px] text-muted-foreground">{call.identifier}</p>
    <CapabilityDetails fields={primary} notices={capabilityNotices(call)} jsonLabels={jsonLabels} />
    {technical.length > 0 && <CapabilityTechnicalDetails identity={identity} title="技术详情 · 参数、完整结果与 AI 上下文">
      {technical.map((field, index) => <DetailField key={`${field.label}:${index}`} field={field}
        json={jsonLabels.has(field.label)} />)}
    </CapabilityTechnicalDetails>}
  </>;
}
