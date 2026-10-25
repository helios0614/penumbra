import type { CapabilityRecord } from "@/domain/message/capability-types";
import { CapabilityDetails } from "./CapabilityDetails";
import { CapabilityTechnicalDetails } from "./CapabilityTechnicalDetails";
import { systemOperationPresentation } from "./system-operation-presentation";

export function SystemOperationDetails({ record, identity }: { record: CapabilityRecord; identity: string }) {
  const { primary, technical, notices } = systemOperationPresentation(record);
  return <>
    <CapabilityDetails fields={primary} notices={notices} />
    {technical.length > 0 && <CapabilityTechnicalDetails identity={identity} title="原始记录 / 技术详情">
      <CapabilityDetails fields={technical} />
    </CapabilityTechnicalDetails>}
  </>;
}
