import type { CapabilityRecord, CapabilityStatus } from "@/domain/message/capability-types";
import { CapabilityDisclosure } from "./CapabilityDisclosure";
import { CapabilityDetails } from "./CapabilityDetails";
import { ToolCallDetails } from "./ToolCallDetails";

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
  const single = record.calls.length === 1 ? record.calls[0] : null;
  return <CapabilityDisclosure identity={identity} title={record.title}
    summary={record.summary ?? (record.calls.length ? `${record.calls.length} 项调用` : undefined)} previewLines={record.previewLines}
    status={status} capability={single?.capability ?? record.capability}
    hasDetails={record.calls.length > 0 || record.fields.length > 0 || record.notices.length > 0}
    preview={single?.identifier || record.preview || (!record.calls.length ? record.fields[0]?.text : undefined)}>
    {single ? <ToolCallDetails call={single} identity={`${identity}:call:0`} /> : record.calls.length > 1 ? <div className="capability-call-list">
      {record.calls.map((call, index) => <CapabilityDisclosure key={index} identity={`${identity}:call:${index}`}
        title={call.capability === "POI_SEARCH" ? "查找地点" : call.capability === "ROUTE_PLAN" ? "查询路线" : "远程调用"}
        preview={call.identifier} status={call.status} capability={call.capability} contained>
        <ToolCallDetails call={call} identity={`${identity}:call:${index}`} />
      </CapabilityDisclosure>)}
    </div> : null}
    <CapabilityDetails fields={record.fields} notices={record.notices} />
  </CapabilityDisclosure>;
}
