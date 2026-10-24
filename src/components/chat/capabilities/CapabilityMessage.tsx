import type { CapabilityRecord } from "@/domain/message/capability-types";
import { SystemOperation } from "./SystemOperation";
import { TriggerAnnotation } from "./TriggerAnnotation";
import { ToolResult } from "./ToolResult";
import { LegacySystemContent } from "./LegacySystemContent";

const legacy: CapabilityRecord = { kind: "operation", capability: "legacy", title: "历史系统记录", status: "unknown", fields: [], calls: [], notices: ["这条旧记录没有可用的系统文本或执行结果"] };
export function CapabilityMessage({ record, identity }: { record?: CapabilityRecord | null; identity: string }) {
  const display = record ?? legacy;
  if (display.capability === "legacy-text") return <LegacySystemContent record={display} identity={identity} />;
  if (display.kind === "trigger") return <TriggerAnnotation record={display} />;
  if (display.kind === "result") return <ToolResult record={display} identity={identity} />;
  return <SystemOperation record={display} identity={identity} />;
}
