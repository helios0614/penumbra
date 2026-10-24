import type { CapabilityField } from "@/domain/message/capability-types";
import { Button } from "@/components/ui/button";
import { useCopyFeedback } from "../copy-feedback";

export function DetailField({ field, sameAsSaved = false }: { field: CapabilityField; sameAsSaved?: boolean }) {
  const copy = useCopyFeedback(field.text);
  return <div className="capability-field min-w-0">
    <div className="flex min-w-0 items-center justify-between gap-2">
      <span className="text-[11px] text-muted-foreground">{field.label}</span>
      {field.text && <Button variant="ghost" size="sm" className="capability-copy text-[11px] text-muted-foreground" onClick={copy} aria-label={`复制${field.label}`}>复制</Button>}
    </div>
    {sameAsSaved ? <p className="text-xs leading-6 text-muted-foreground">内容与已保存结果一致</p> : <pre aria-label={field.label} className="capability-field-text whitespace-pre-wrap break-words font-sans text-xs leading-6 text-muted-strong [overflow-wrap:anywhere]">
      {field.text || "（无内容）"}
    </pre>}
  </div>;
}
export function CapabilityDetails({ fields, notices = [] }: { fields: readonly CapabilityField[]; notices?: readonly string[] }) {
  return <div className="capability-fields min-w-0">
    {fields.map((field, index) => <DetailField key={`${field.label}:${index}`} field={field} />)}
    {notices.length > 0 && <div className="capability-notices space-y-1 text-[11px] leading-5 text-muted-foreground">
      {notices.map((notice, index) => <p key={index}>{notice}</p>)}
    </div>}
  </div>;
}
