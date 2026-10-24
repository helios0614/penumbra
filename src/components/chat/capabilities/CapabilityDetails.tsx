import type { CapabilityField } from "@/domain/message/capability-types";
import { Button } from "@/components/ui/button";
import { useCopyFeedback } from "../copy-feedback";

function DetailField({ field }: { field: CapabilityField }) {
  const copy = useCopyFeedback(field.text);
  return <div className="min-w-0 py-1">
    <div className="flex min-w-0 items-center justify-between gap-2">
      <span className="text-[11px] text-muted-foreground">{field.label}</span>
      {field.text && <Button variant="ghost" size="sm" className="text-[11px] text-muted-foreground" onClick={copy} aria-label={`复制${field.label}`}>复制</Button>}
    </div>
    <pre tabIndex={0} aria-label={field.label} className="scrollbar-none max-h-72 max-w-full overflow-auto overscroll-contain whitespace-pre-wrap break-words font-sans text-xs leading-6 text-muted-strong [overflow-wrap:anywhere]">
      {field.text || "（无内容）"}
    </pre>
  </div>;
}
export function CapabilityDetails({ fields, notices = [] }: { fields: readonly CapabilityField[]; notices?: readonly string[] }) {
  return <div className="min-w-0 divide-y divide-border/30">
    {fields.map((field, index) => <DetailField key={`${field.label}:${index}`} field={field} />)}
    {notices.length > 0 && <div className="space-y-1 py-2 text-[11px] leading-5 text-muted-foreground">
      {notices.map((notice, index) => <p key={index}>{notice}</p>)}
    </div>}
  </div>;
}
