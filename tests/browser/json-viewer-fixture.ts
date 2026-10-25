// Synthetic safe data only. No backend calls, model requests or real forum writes.
export const ordinarySource = ' \n{\n  "名称": "Penumbra · 中文",\n  "计数": 0,\n  "启用": false,\n  "空值": null,\n  "多行": "第一行\\n第二行",\n  "超长字段名_abcdefghijklmnopqrstuvwxyz_abcdefghijklmnopqrstuvwxyz_abcdefghijklmnopqrstuvwxyz": "长字符串与中文自然换行。长字符串与中文自然换行。长字符串与中文自然换行。",\n  "资料": { "城市": "合成城市", "标签": ["阅读", "写作"] },\n  "列表": [1, 2, { "末项": "完整叶子" }],\n  "HTML": "<script>window.__jsonExecuted = true</script><img src=javascript:alert(1)>"\n}\n ';
export const deep = Array.from({ length: 16 }).reduce<unknown>(value => ({ 深层对象_very_long_key: value }), { 叶子: "深层中文最终叶子" });
export const largeSource = JSON.stringify(Array.from({ length: 600 }, (_, id) => ({ id, title: `大型结果 ${id}`, body: "长正文测试。".repeat(100) })));
export const writeBody = "论坛写入的唯一实际正文起始\n" + "这是只读合成验收正文，没有执行论坛请求。\n".repeat(120);

const base = { conv_id: "json-review", created_at: 1792886400, drift: null, thinking: null, is_carryover: 0, attachments: [], mcp_tool_calls: [], cache_region: null };
const call = (patch = {}) => ({ server: "community", tool: "profile", status: "success", args: { user: "synthetic-reader" },
  result: { content: [{ type: "text", text: '{"profile":{"name":"合成读者","bio":"多行中文\\n第二行","posts":0},"active":false}' }] }, ai_delivery: "prepared", ...patch });
const result = (id: string, calls: unknown[]) => ({ ...base, id, role: "assistant", content: "", public_tool_result: { version: 1, kind: "result", capability: "tools", title: "工具执行", calls } });
export const chatFixture = [
  ...Array.from({ length: 18 }, (_, index) => ({ ...base, id: `history-${index}`, role: index % 2 ? "assistant" : "user", content: `历史合成消息 ${index} · 检查展开详情时的阅读锚点。` })),
  result("forum-write", [call({ tool: "forum_write", args: { title: "合成论坛写入", content: writeBody, thread_id: 3502 },
    executed_args: { title: "合成论坛写入", content: writeBody, thread_id: 3503 },
    result: ' { "success": true, "message_id": "synthetic-45304" }\n', ai_result: '{"success":true}', ai_truncated: true })]),
  result("forum-profile", [call()]),
  result("plain-result", [call({ tool: "plain", result: "普通自然语言结果，包含 {\"示例\":1}，保留原文。", ai_delivery: "unknown" })]),
  result("mixed-result", [call({ tool: "mixed", result: { content: [{ type: "text", text: "第一段普通文本" }, { type: "text", text: '[{"name":"结构化数组"},false,null]' }, { type: "image", data: "safe-placeholder" }] } })]),
  result("large-result", [call({ tool: "large", result: largeSource })]),
  result("batch-result", [call(), call({ tool: "failed", status: "failed", error: "实际失败回执", result: "{invalid}", storage_truncated: true, ai_delivery: "not_included" }), call({ tool: "unknown", status: "unknown", result: "交付未知", ai_delivery: "unknown" })]),
  { ...base, id: "legacy-result", role: "assistant", content: "", mcp_tool_calls: [{ server: "legacy", tool: "profile", success: true, args: { token: "PRIVATE_FIXTURE_CREDENTIAL" },
    result: '{"api_key":"PRIVATE_FIXTURE_CREDENTIAL","content":[{"type":"text","text":"{\\"name\\":\\"旧 MCP 公开资料\\"}"}]}', result_version: 1 }] },
  ...Array.from({ length: 12 }, (_, index) => ({ ...base, id: `tail-${index}`, role: "assistant", content: `验收尾部消息 ${index} · 向上阅读时展开、切换原文与结构化，不应自动跳到底部。` })),
];
