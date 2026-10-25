import type { CapabilityRecord } from "@/domain/message/capability-types";
import { CapabilityDisclosure } from "./CapabilityDisclosure";
import { CapabilityDetails } from "./CapabilityDetails";
import { capabilityNotices } from "./capability-notice-presentation";

/** Already sanitized in the adapter; React text nodes also escape HTML/Markdown. */
export function LegacySystemContent({ record, identity }: { record: CapabilityRecord; identity: string }) {
  return <CapabilityDisclosure identity={identity} title={record.title} capability={record.capability} previewLines={2}
    preview={record.preview ?? record.fields[0]?.text} hasDetails={record.fields.length > 0}>
    <CapabilityDetails fields={record.fields} notices={capabilityNotices(record)} />
  </CapabilityDisclosure>;
}
