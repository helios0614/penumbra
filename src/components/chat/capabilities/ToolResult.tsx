import type { CapabilityRecord, CapabilityStatus } from "@/domain/message/capability-types";
import { CapabilityDisclosure } from "./CapabilityDisclosure";
import { CapabilityDetails } from "./CapabilityDetails";

export function toolBatchStatus(statuses: readonly CapabilityStatus[]): CapabilityStatus {
  if (statuses.length === 0 || statuses.some(s => s === "unknown")) return "unknown";
  if (statuses.every(s => s === "success")) return "success";
  if (statuses.every(s => s === "skipped")) return "skipped";
  if (statuses.every(s => s === "cancelled")) return "cancelled";
  if (statuses.some(s => s === "success" || s === "partial")) return "partial";
  return "failed";
}
export function ToolResult({ record, identity }: { record: CapabilityRecord; identity: string }) {
  const status = record.calls.length ? toolBatchStatus(record.calls.map(call => call.status)) : record.status;
  return <CapabilityDisclosure identity={identity} title={record.title} summary={record.summary} previewLines={record.previewLines} status={status} result
    hasDetails={record.calls.length > 0 || record.fields.length > 0 || record.notices.length > 0}
    preview={record.calls.length ? `${record.calls.length} 项调用` : record.preview ?? record.fields[0]?.text}>
    {record.calls.length > 0 ? <div className="space-y-1">
      {record.calls.map((call, index) => <CapabilityDisclosure key={index} identity={`${identity}:call:${index}`}
        title={call.capability === "MCP" ? "远程调用" : call.capability === "POI_SEARCH" ? "查找地点" : "查询路线"}
        preview={call.identifier} status={call.status}>
        <p className="break-all py-1 font-mono text-[11px] text-muted-foreground">{call.identifier}</p>
        <CapabilityDetails fields={call.fields} notices={call.notices} />
      </CapabilityDisclosure>)}
    </div> : <CapabilityDetails fields={record.fields} notices={record.notices} />}
  </CapabilityDisclosure>;
}
