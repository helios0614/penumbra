import type { CapabilityRecord } from "@/domain/message/capability-types";
import { CapabilityDisclosure } from "./CapabilityDisclosure";
import { CapabilityDetails } from "./CapabilityDetails";

/** Already sanitized in the adapter; React text nodes also escape HTML/Markdown. */
export function LegacySystemContent({ record, identity }: { record: CapabilityRecord; identity: string }) {
  return <CapabilityDisclosure identity={identity} title="旧版系统内容" previewLines={2}
    preview={record.preview ?? record.fields[0]?.text} hasDetails={record.fields.length > 0}>
    <CapabilityDetails fields={record.fields} notices={record.notices} />
  </CapabilityDisclosure>;
}
