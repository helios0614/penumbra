export const FEATURE_GROUPS = [
  { name: "主对话", usages: ["main_chat"] },
  { name: "记忆与联网", usages: ["memory_sentinel", "memory_digest", "web_compression"] },
  { name: "速记与感知", usages: ["quick_note_compression", "camera_sentinel", "location_sentinel"] },
  { name: "独立任务", usages: ["book_annotation", "game_decision"] },
] as const;
export type FeatureUsage = typeof FEATURE_GROUPS[number]["usages"][number];
export const FEATURE_NAMES: Record<FeatureUsage, string> = {
  main_chat: "新对话默认模型", memory_sentinel: "记忆哨兵", memory_digest: "日记总结（Memory Digest）",
  web_compression: "网页内容压缩", quick_note_compression: "速记压缩", camera_sentinel: "摄像头哨兵",
  location_sentinel: "位置哨兵", book_annotation: "书籍批注", game_decision: "游戏决策",
};
export interface FeatureSelection { readonly connection_id: string; readonly protocol: string; readonly model: string }
export interface FeatureBinding {
  readonly usage: FeatureUsage;
  readonly selection: FeatureSelection | null;
  readonly diagnostic: string | null;
  readonly allowed_protocols: readonly string[];
  readonly lifecycle: string;
}
const protocolNames: Readonly<Record<string, string>> = {
  openai_chat_completions: "OpenAI 对话补全", anthropic_messages: "Anthropic 消息接口",
  minimax_chatcompletion_v2: "MiniMax 对话接口 v2",
};
const statusNames: Readonly<Record<string, string>> = {
  feature_binding_required: "未配置", main_default_not_selected: "未配置", main_selection_required: "未配置",
  disabled_profile: "Connection 已停用", missing_credential: "缺少凭据", missing_profile: "Connection 不存在",
  unknown_profile: "Connection 不存在", incompatible_protocol: "协议不兼容", unsupported_protocol: "协议不受支持",
  invalid_feature_binding: "绑定无法解析",
};
export const protocolName = (protocol: string): string => Object.prototype.hasOwnProperty.call(protocolNames, protocol) ? protocolNames[protocol] : protocol;
export function featureStatus(feature: FeatureBinding): string {
  if (feature.diagnostic) return Object.prototype.hasOwnProperty.call(statusNames, feature.diagnostic) ? statusNames[feature.diagnostic] : "Registry 诊断异常";
  return feature.selection ? "已配置 · 当前可用" : "未返回选择 · 请核对";
}
export function featureScope(feature: FeatureBinding): string {
  if (feature.lifecycle === "new_session_default") {
    if (feature.usage === "main_chat") return "影响之后创建的 Main Conversation，不修改已有会话。";
    if (feature.usage === "game_decision") return "影响之后创建的 Game Session，不修改已有 Session。";
  }
  if (feature.lifecycle === "request_default" && feature.usage === "book_annotation") return "影响后续使用默认绑定的单次或批量批注任务；任务可显式覆盖。";
  if (feature.lifecycle === "feature") return feature.usage === "quick_note_compression"
    ? "影响之后解析此绑定的 Quick Note Step1 请求。" : "影响之后解析此 Feature Binding 的请求或任务。";
  return `后端生命周期：${feature.lifecycle}；生效范围需核对。`;
}
export const sameSelection = (a: FeatureSelection | null, b: FeatureSelection | null) => a === b || !!a && !!b &&
  a.connection_id === b.connection_id && a.protocol === b.protocol && a.model === b.model;
