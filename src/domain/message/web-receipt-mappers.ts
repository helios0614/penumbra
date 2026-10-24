import type { CapabilityRecord, CapabilityStatus } from "./capability-types";

const record = (v: unknown): Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : {};
const str = (v: unknown) => typeof v === "string" ? v : "";
const reasons: Record<string, string> = {
  generation_failed: "模型续写失败，搜索执行结果仍保留", evidence_delivery_failed: "证据未能交付模型",
  web_access_disabled: "联网未开启", new_web_access_forbidden: "本轮不允许新的联网访问", search_limit_reached: "已达本轮搜索上限",
  empty_query: "查询为空", query_too_long: "查询过长", provider_unconfigured: "搜索服务未配置", provider_timeout: "搜索超时",
  provider_http_error: "搜索服务返回错误", provider_error: "搜索服务调用失败", provider_invalid_response: "搜索服务返回格式错误",
  zero_results: "没有搜索结果", all_candidates_rejected: "候选来源未通过读取条件", all_fetches_failed: "来源读取均失败",
  timeout: "读取超时", blocked_host: "该域名不允许读取", blocked_address: "该地址不允许读取", http_error: "页面返回错误",
  login_required: "页面需要登录", empty_content: "页面没有可读取正文", fetch_error: "读取失败",
};
export const webReason = (v: unknown) => reasons[str(v)] || (v ? "未取得可用结果" : "");

export function mapWebReceipts(dto: Record<string, unknown>): (CapabilityRecord & { id: string })[] {
  const receipts: (CapabilityRecord & { id: string })[] = [], seen = new Set<string>();
  const source = dto.role === "assistant" ? dto.web_search_results : dto.role === "user" ? dto.url_read_results : null;
  if (!Array.isArray(source)) return receipts;
  for (const value of source) {
    const item = record(value), id = str(item.id);
    if (!id || seen.has(id)) continue;
    const search = dto.role === "assistant";
    if (search && (item.source_message_id !== dto.id || item.conv_id !== dto.conv_id)) continue;
    seen.add(id);
    const status: CapabilityStatus = item.status === "success" || item.status === "failed" || item.status === "partial" ? item.status : "unknown";
    const fields = [{ label: search ? "查询" : "域名", text: str(search ? item.query : item.domain) }];
    if (search) {
      for (const [key, label] of [["candidate_count", "候选数"], ["fetched_count", "已读取数"], ["source_count", "可用来源数"]]) {
        if (typeof item[key] === "number" && Number.isFinite(item[key])) fields.push({ label, text: String(item[key]) });
      }
      if (Array.isArray(item.sources)) for (const raw of item.sources) {
        const s = record(raw);
        fields.push({ label: "来源", text: [str(s.title), str(s.domain)].filter(Boolean).join(" · ") });
      }
    }
    if (item.reason) fields.push({ label: "原因", text: webReason(item.reason) });
    receipts.push({ id, kind: "result", capability: search ? "WEBSEARCH" : "URL_READ", title: search ? "网页搜索" : "链接读取", status, fields, calls: [],
      notices: item.follow_up_status ? [webReason(item.follow_up_status)] : [] });
  }
  return receipts;
}
