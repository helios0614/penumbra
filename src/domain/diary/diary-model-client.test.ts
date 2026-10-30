import { afterEach, describe, expect, it, vi } from "vitest";
import { getDiaryModelConfiguration, parseDiaryModelConfiguration, saveDiaryModelConfiguration } from "./diary-model-client";

export const selection = { connection_id: "a", protocol: "anthropic_messages", model: "literal/diary" };
export const modelWire = (entryId = "entry/a", independent = false) => ({ scope: "diary", id: entryId, editable: true,
  source: independent ? "explicit" : "legacy_unselected", selection: independent ? selection : null, stored_model: independent ? JSON.stringify(selection) : null,
  diagnostic: independent ? null : "independent_selection_required", effective_selection: selection, effective_diagnostic: null,
  allowed_protocols: ["openai_chat_completions", "anthropic_messages"],
  connections: [{ id: "a", name: "A", enabled: true, transport: "direct", default_model: "preset-a", credential_configured: true }] });
afterEach(() => vi.unstubAllGlobals());
describe("Diary model configuration contract", () => {
  it("distinguishes compatibility from saved identity and projects only safe picker facts", () => {
    const row = { ...modelWire(), key: "private", secret_ref: "private", connections: [{ ...modelWire().connections[0], key: "private", base_url: "private" }] };
    const value = parseDiaryModelConfiguration(row, "entry/a"); expect(value.independent).toBe(false); expect(value.saved).toBeNull();
    expect(value.display.selection).toEqual({ connectionId: "a", protocol: "anthropic_messages", model: "literal/diary" }); expect(JSON.stringify(value)).not.toContain("private");
    expect(parseDiaryModelConfiguration(modelWire("entry/a", true), "entry/a").saved?.model).toBe("literal/diary");
  });
  it("preserves invalid explicit identities for correction instead of inventing a fallback", () => {
    const wire = { ...modelWire("entry/a", true), connections: [], effective_selection: null, effective_diagnostic: "missing_profile" };
    expect(parseDiaryModelConfiguration(wire, "entry/a").display).toMatchObject({ selection: { connectionId: "a", model: "literal/diary" }, diagnostic: "missing_profile" });
  });
  it("requires the current scope, owner and effective-contract fields", () => {
    for (const value of [{ ...modelWire(), id: "other" }, { ...modelWire(), scope: "main" }, { ...modelWire(), editable: false }, { scope: "diary", id: "entry/a" }]) expect(() => parseDiaryModelConfiguration(value, "entry/a")).toThrow();
  });
  it("uses only scoped GET/PUT and verifies the server readback identity", async () => {
    const fetcher = vi.fn(async (_input: unknown, init?: RequestInit) => Response.json(modelWire("entry/a", init?.method === "PUT")));
    vi.stubGlobal("fetch", fetcher);
    await getDiaryModelConfiguration("entry/a");
    await saveDiaryModelConfiguration("entry/a", { connectionId: "a", protocol: "anthropic_messages", model: "literal/diary" });
    expect(fetcher.mock.calls.map(call => call[0])).toEqual(["/api/registry/selections/diary/entry%2Fa", "/api/registry/selections/diary/entry%2Fa"]);
    expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toEqual(selection);
    fetcher.mockResolvedValueOnce(Response.json(modelWire("entry/a", false)));
    await expect(saveDiaryModelConfiguration("entry/a", { connectionId: "a", protocol: "anthropic_messages", model: "literal/diary" })).rejects.toThrow();
  });
});
