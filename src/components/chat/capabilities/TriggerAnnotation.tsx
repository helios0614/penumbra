import type { CapabilityRecord } from "@/domain/message/capability-types";
import { CapabilityIcon } from "./CapabilityIcon";

export function TriggerAnnotation({ record }: { record: CapabilityRecord }) {
  return <div role="note" className="flex min-w-0 items-start gap-2 px-2 py-1 text-[11px] leading-6 text-muted-foreground">
    <CapabilityIcon capability={record.capability} className="mt-1.5 size-3 shrink-0 text-ai/80" />
    <p className="min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]">
      <span className="text-muted-strong">{record.title}</span>
      {record.fields.map((field, index) => <span key={index}> · {field.label} {field.text}</span>)}
      {record.notices.map((notice, index) => <span key={`notice:${index}`}> · {notice}</span>)}
    </p>
  </div>;
}
