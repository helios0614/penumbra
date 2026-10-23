import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MainModelSelection } from "./MainModelSelection";
import { createChatSetupViewModel } from "@/application/chat-setup";
import { mapChatReadiness, mapMainConfiguration } from "@/domain/runtime";
import { mainConfigurationWire, readinessWire } from "@/test-fixtures/main-chat-wire";

describe("minimal Main model editor", () => {
  it("labels current identity and explains Runtime/background scope without exposing endpoint or credential fields", () => {
    const html = renderToStaticMarkup(<MainModelSelection setup={setup()} disabled={false} onSave={vi.fn()} />);
    expect(html).toContain("会话模型");
    expect(html).toContain("literal-not-in-catalog");
    expect(html).toContain("Connection 默认模型仅用于预填");
    expect(html).toContain("不会热切换已启动的 Runtime");
    for (const text of ["Camera", "Location", "闹钟", "查岗", "Activity greeting", "速记 Step2"]) expect(html).toContain(text);
    expect(html).not.toMatch(/synthetic.invalid|credential_ref|base_url/);
  });

  it("keeps missing saved connection/protocol visible and requires correction rather than choosing a replacement", () => {
    const base = setup();
    const value = { ...base, configuration: { ...base.configuration!, connections: [], diagnostic: "missing_profile" } };
    const html = renderToStaticMarkup(<MainModelSelection setup={value} disabled={false} onSave={vi.fn()} />);
    expect(html).toContain("connection-a（已保存，当前不可用）");
    expect(html).toContain("openai_chat_completions（已保存，当前不可用）");
    expect(html).toContain("missing_profile");
    expect(html).toMatch(/type="submit"[^>]*disabled/);
  });

  it("renders the global new-conversation default as a separate read-only scope", () => {
    const html = renderToStaticMarkup(<MainModelSelection setup={setup(false)} disabled={false} onSave={vi.fn()} />);
    expect(html).toContain("新会话默认（只读）");
    expect(html).not.toContain("保存当前会话");
    expect(html).not.toContain("<form");
  });
});

function setup(selected = true) {
  return createChatSetupViewModel({
    conversation: selected ? { id: "conv_a", title: "Synthetic", modelKey: "old", createdAt: 1, updatedAt: 2 } : null,
    availableModels: [], configuration: mapMainConfiguration(mainConfigurationWire()), readiness: mapChatReadiness(readinessWire()),
  });
}
