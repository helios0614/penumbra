import { describe, expect, it } from "vitest";
import { mapMainConfiguration, mapMainSelection, mapChatReadiness } from "@/domain/runtime";
import { mapConversationList } from "@/domain/conversation/conversation-mappers";
import { mainConfigurationWire, OPENAI, ANTHROPIC, readinessWire } from "@/test-fixtures/main-chat-wire";

describe("Registry v2 Main boundary", () => {
  it("projects only safe connection facts and intersects Main protocols with transport", () => {
    const wire = mainConfigurationWire();
    const input = { ...wire, connections: [
      { ...wire.connections[0], key: "fake-secret", credential_ref: { private: true } },
      { ...wire.connections[0], id: "gateway", transport: "cloudflare_rest" },
    ] };
    const result = mapMainConfiguration(input);
    expect(result.connections[0]?.protocols).toEqual([OPENAI, ANTHROPIC]);
    expect(result.connections[1]?.protocols).toEqual([ANTHROPIC]);
    expect(result.selection).toEqual({ connectionId: "connection-a", protocol: OPENAI, model: "literal-not-in-catalog" });
    expect(JSON.stringify(result)).not.toMatch(/fake-secret|credential_ref|base_url|synthetic.invalid/);
  });
  it("preserves unavailable saved identity and future safe diagnostic codes without fallback", () => {
    const wire = mainConfigurationWire("saved-literal", "missing-connection");
    const result = mapMainConfiguration({ ...wire, connections: [], diagnostic: "new_valid_diagnostic" });
    expect(result.selection).toMatchObject({ connectionId: "missing-connection", model: "saved-literal" });
    expect(result.diagnostic).toBe("new_valid_diagnostic");
  });
  it("supports legacy profile reads but canonical null suppresses the legacy selection view", () => {
    expect(mapMainSelection({ profile_id: "legacy:gemini", model: "legacy-model" })).toEqual({ profileId: "legacy:gemini", model: "legacy-model" });
    expect(mapMainConfiguration({ ...mainConfigurationWire(), connection_selection: null,
      selection: { profile_id: "legacy:other", model: "must-not-fallback" } }).selection).toBeNull();
  });
  it.each(["missing_credential", "disabled_profile", "invalid_main_selection", "future_valid_code", "constructor"])("keeps readiness %s as a safe blocking state", (code) => {
    expect(mapChatReadiness({ ...readinessWire("literal", code), ready: true })).toMatchObject({ ready: false, reason: code });
  });
  it("parses conversation canonical identity and diagnostic even when legacy model remains unchanged", () => {
    const result = mapConversationList([{ id: "a", title: "Synthetic", model: "old-catalog-key", created_at: 1,
      updated_at: 2, message_count: 0, main_selection: { connection_id: "new", protocol: OPENAI, model: "new-literal" },
      main_selection_diagnostic: "future_valid_code" }]);
    expect(result[0]).toMatchObject({ modelKey: "old-catalog-key", mainSelection: { connectionId: "new", model: "new-literal" }, mainSelectionDiagnostic: "future_valid_code" });
  });
});
