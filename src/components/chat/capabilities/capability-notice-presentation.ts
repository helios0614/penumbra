import type { AiDelivery, CapabilityRecord } from "@/domain/message/capability-types";

const deliveryWarnings: Record<AiDelivery, string | null> = {
  response_received: null,
  prepared: "结果已准备，是否送达模型尚无法确认。",
  not_included: "结果未注入 AI（上下文预算上限），已停止续写。",
  not_requested: "本次未发起 AI 续写。",
  unknown: "历史记录未确认结果是否送达 AI。",
};

/** Only adapter-tagged routine notices are omitted. Never inspect business prose. */
export function capabilityNotices(record: Pick<CapabilityRecord, "notices" | "noticeFacts">) {
  return record.notices.flatMap((notice, index) => {
    const fact = record.noticeFacts?.find(fact => fact.index === index);
    if (fact?.kind === "execution-scope") return [];
    if (fact?.kind === "ai-delivery") {
      const warning = deliveryWarnings[fact.status];
      return warning ? [warning] : [];
    }
    return [notice];
  });
}
