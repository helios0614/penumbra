import { ChevronDown } from "lucide-react";
import type { CapabilityField, PublicToolCall } from "@/domain/message/capability-types";
import { CapabilityDetails, DetailField } from "./CapabilityDetails";
import { notifyCapabilityToggle, useCapabilityExpansion } from "./CapabilityDisclosure";

const technicalLabels = new Set(["调用参数", "实际执行参数", "结果长度（截断前）", "本次 AI 有界结果"]);

/** Reorder only the existing safe fields; retain every value and copy payload. */
export function toolDetailFields(fields: readonly CapabilityField[]) {
  const hasResultBody = fields.some(field => field.label === "结果正文" && field.text.trim());
  const primary: CapabilityField[] = [], technical: CapabilityField[] = [];
  for (const field of fields) {
    (technicalLabels.has(field.label) || (field.label === "已保存结果" && hasResultBody) ? technical : primary).push(field);
  }
  const saved = fields.find(field => field.label === "已保存结果");
  return { primary, technical, saved };
}

export function ToolCallDetails({ call, identity }: { call: PublicToolCall; identity: string }) {
  const { primary, technical, saved } = toolDetailFields(call.fields);
  const [technicalOpen, setTechnicalOpen] = useCapabilityExpansion(`${identity}:technical`);
  return <>
    <p className="capability-tool-identifier font-mono text-[11px] text-muted-foreground">{call.identifier}</p>
    <CapabilityDetails fields={primary} notices={call.notices} />
    {technical.length > 0 && <details className="capability-technical" open={technicalOpen} onToggle={event => {
      setTechnicalOpen(event.currentTarget.open);
    }}>
      <summary className="text-[11px] text-muted-foreground" onClick={event => notifyCapabilityToggle(event.currentTarget)}>
        <ChevronDown aria-hidden="true" className="size-3.5" />技术详情 · 参数、完整结果与 AI 上下文
      </summary>
      {technicalOpen && <div className="capability-technical-fields">
        {technical.map((field, index) => <DetailField key={`${field.label}:${index}`} field={field}
          sameAsSaved={field.label === "本次 AI 有界结果" && !!saved?.text && field.text === saved.text} />)}
      </div>}
    </details>}
  </>;
}
