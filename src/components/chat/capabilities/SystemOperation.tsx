import type { CapabilityRecord } from "@/domain/message/capability-types";
import { CapabilityDisclosure } from "./CapabilityDisclosure";
import { CapabilityDetails } from "./CapabilityDetails";

export function SystemOperation({ record, identity }: { record: CapabilityRecord; identity: string }) {
  const hasDetails = record.fields.length > 0;
  return <>
    <CapabilityDisclosure identity={identity} title={record.title} summary={record.summary} previewLines={record.previewLines}
      preview={record.preview ?? record.fields[0]?.text.replace(/\s+/g, " ")}
      status={record.status} capability={record.capability} hasDetails={hasDetails}>
      <CapabilityDetails fields={record.fields} notices={record.notices} />
    </CapabilityDisclosure>
    {!hasDetails && record.notices.length > 0 && <p className="px-2 text-[11px] leading-5 text-muted-foreground">{record.notices.join(" · ")}</p>}
  </>;
}
