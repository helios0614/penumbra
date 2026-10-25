import type { CapabilityRecord } from "@/domain/message/capability-types";
import { CapabilityDisclosure } from "./CapabilityDisclosure";
import { SystemOperationDetails } from "./SystemOperationDetails";
import { systemOperationPresentation } from "./system-operation-presentation";

export function SystemOperation({ record, identity }: { record: CapabilityRecord; identity: string }) {
  const hasDetails = record.fields.length > 0;
  const view = systemOperationPresentation(record);
  return <>
    <CapabilityDisclosure identity={identity} title={record.title} summary={view.summary} previewLines={view.previewLines}
      preview={view.preview} hideSummaryWhenOpen={view.hideSummaryWhenOpen}
      status={record.status} capability={record.capability} hasDetails={hasDetails}>
      <SystemOperationDetails record={record} identity={identity} />
    </CapabilityDisclosure>
    {!hasDetails && record.notices.length > 0 && <p className="px-2 text-[11px] leading-5 text-muted-foreground">{record.notices.join(" · ")}</p>}
  </>;
}
