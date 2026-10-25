import type { CapabilityField } from "@/domain/message/capability-types";
import { Button } from "@/components/ui/button";
import { useCopyFeedback } from "../copy-feedback";
import { JsonViewer } from "@/components/ui/json-viewer";
import { notifyCapabilityToggle } from "./CapabilityDisclosure";
import { useContext } from "react";
import { SearchHighlightContext, SearchText } from "../search-highlight";

export function DetailField({ field, json = false }: { field: CapabilityField; json?: boolean }) {
  const copy = useCopyFeedback(field.text);
  return <div className="capability-field min-w-0">
    <div className="flex min-w-0 items-center justify-between gap-2">
      <span className="text-[11px] text-muted-foreground"><SearchText text={field.label}/></span>
      {field.text && <Button variant="ghost" size="sm" className="capability-copy text-[11px] text-muted-foreground" onClick={copy} aria-label={`复制${field.label}`}>复制</Button>}
    </div>
    {json ? <div className="capability-json">
      {(field.textBlocks ?? [field.text]).map((text, index) => <JsonViewer key={index} rawText={text}
        label={field.textBlocks && field.textBlocks.length > 1 ? `${field.label} ${index + 1}` : field.label} showCopy={false}
        onBeforeLayoutChange={notifyCapabilityToggle} />)}
    </div> : <pre aria-label={field.label} className="capability-field-text whitespace-pre-wrap break-words font-sans text-xs leading-6 text-muted-strong [overflow-wrap:anywhere]">
      <SearchText text={field.text || "（无内容）"}/>
    </pre>}
  </div>;
}
function SearchFieldGate({field,json}:{field:CapabilityField;json?:boolean}) {
  const search=useContext(SearchHighlightContext);
  return search.active&&/调用(?:参数|标题|正文)|实际执行参数|本次.?AI|raw_command|executed_args|evidence|模型上下文/i.test(field.label)?null:<DetailField field={field} json={json}/>;
}
export function CapabilityDetails({ fields, notices = [], jsonLabels }: { fields: readonly CapabilityField[]; notices?: readonly string[]; jsonLabels?: ReadonlySet<string> }) {
  return <div className="capability-fields min-w-0">
    {fields.map((field, index) => <SearchFieldGate key={`${field.label}:${index}`} field={field} json={jsonLabels?.has(field.label)} />)}
    {notices.length > 0 && <div className="capability-notices space-y-1 text-[11px] leading-5 text-muted-foreground">
      {notices.map((notice, index) => <p key={index}><SearchText text={notice}/></p>)}
    </div>}
  </div>;
}
