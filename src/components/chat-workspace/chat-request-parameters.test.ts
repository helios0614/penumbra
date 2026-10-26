import { describe, expect, it } from "vitest";
import { mapChatSendExecutionInput, mapChatRegenerateExecutionInput } from "@/application/chat-send/chat-send-request";
import { mapSendMessageRequest, mapRegenerateQuery } from "@/application/chat-execution/chat-execution-request";
import {
  createChatRequestParametersOwner, requestParameterDraft, temperatureMaximum, validateRequestParameters,
  type ChatRequestParameterScope,
} from "./chat-request-parameters";

const OPENAI = "openai_chat_completions", ANTHROPIC = "anthropic_messages";
const identity = (patch: Partial<ChatRequestParameterScope> = {}): ChatRequestParameterScope => ({
  conversationId: "a", connectionId: "connection-a", profileId: null, protocol: OPENAI, model: "literal-a", ...patch,
});

describe("temporary request parameters contract", () => {
  it.each(["1", "100"])("accepts context boundary %s", value => {
    expect(validateRequestParameters({ contextLimit: value, temperature: "" }, OPENAI)).toMatchObject({ valid: true, overrides: { contextLimit: Number(value) } });
  });
  it.each(["0", "-1", "1.5", "1.0", "101", "NaN", "Infinity", "1e2", "0x10", "abc"])("rejects non-contract context %s", value => {
    expect(validateRequestParameters({ contextLimit: value, temperature: "" }, OPENAI).errors.contextLimit).toBeTruthy();
  });
  it.each([OPENAI, ANTHROPIC, "gemini_stream_generate_content"])("preserves temperature zero on %s", protocol => {
    expect(validateRequestParameters({ contextLimit: "", temperature: "0" }, protocol)).toMatchObject({ valid: true, overrides: { temperature: 0 } });
  });
  it("uses explicit protocol ranges and rejects unknown protocols without guessing from model names", () => {
    expect(temperatureMaximum(ANTHROPIC)).toBe(1); expect(temperatureMaximum(OPENAI)).toBe(2);
    expect(temperatureMaximum(null)).toBeNull(); expect(temperatureMaximum("claude-model")).toBeNull();
    expect(validateRequestParameters({ contextLimit: "", temperature: "1" }, ANTHROPIC).valid).toBe(true);
    expect(validateRequestParameters({ contextLimit: "", temperature: "2" }, OPENAI).valid).toBe(true);
    expect(validateRequestParameters({ contextLimit: "", temperature: "1.1" }, ANTHROPIC).valid).toBe(false);
    expect(validateRequestParameters({ contextLimit: "", temperature: "2.1" }, OPENAI).valid).toBe(false);
    expect(validateRequestParameters({ contextLimit: "10", temperature: "" }, null).valid).toBe(true);
    expect(validateRequestParameters({ contextLimit: "10", temperature: "0" }, null).valid).toBe(false);
  });
  it.each(["NaN", "Infinity", "-Infinity", "-0.1", "2.01", "0x1", "oops"])("rejects invalid temperature %s", temperature => {
    expect(validateRequestParameters({ contextLimit: "", temperature }, OPENAI).valid).toBe(false);
  });
  it("starts empty, keeps the applied snapshot on rejection and resets by deleting keys", () => {
    const owner = createChatRequestParametersOwner(), first = owner.sync(identity());
    expect(first.overrides).toEqual({});
    expect(owner.apply(first.scope!, { contextLimit: "1", temperature: "0" })).toBe("applied");
    const applied = owner.sync(identity());
    expect(owner.apply(applied.scope!, { contextLimit: "0", temperature: "0" })).toBe("invalid");
    expect(owner.sync(identity())).toBe(applied);
    expect(owner.apply(applied.scope!, { contextLimit: "1", temperature: "0.0" })).toBe("unchanged");
    expect(owner.apply(applied.scope!, { contextLimit: "", temperature: "" })).toBe("applied");
    expect(owner.sync(identity()).overrides).toEqual({}); expect(applied.overrides).toEqual({ contextLimit: 1, temperature: 0 });
  });
  it.each(["conversationId", "connectionId", "protocol", "model"] as const)("invalidates %s changes including A → B → A leases", field => {
    const owner = createChatRequestParametersOwner(), first = owner.sync(identity());
    owner.apply(first.scope!, { contextLimit: "100", temperature: "0" });
    const second = owner.sync(identity({ [field]: field === "protocol" ? ANTHROPIC : "other" }));
    expect(second.overrides).toEqual({}); expect(second.notice).toContain("恢复后端默认");
    expect(owner.apply(first.scope!, { contextLimit: "2", temperature: "0" })).toBe("stale");
    const third = owner.sync(identity()); expect(third.scope).not.toBe(first.scope);
    expect(owner.apply(first.scope!, { contextLimit: "3", temperature: "0" })).toBe("stale");
  });
  it("retains scope on same-identity refreshes and rejects a disposed controller's old lease in a new owner", () => {
    const owner = createChatRequestParametersOwner(), first = owner.sync(identity());
    expect(owner.sync(identity()).scope).toBe(first.scope);
    const fresh = createChatRequestParametersOwner(); fresh.sync(identity());
    expect(fresh.apply(first.scope!, { contextLimit: "1", temperature: "0" })).toBe("stale");
    expect(requestParameterDraft({ temperature: 0 })).toEqual({ contextLimit: "", temperature: "0" });
  });
  it("feeds identical snapshots into send and canonical query without injecting defaults or losing attachments/IDs", () => {
    const owner = createChatRequestParametersOwner(), initial = owner.sync(identity());
    const sendWire = () => mapSendMessageRequest(mapChatSendExecutionInput("原始正文", "stable-id", { ...owner.sync(identity()).overrides, attachments: ["/uploads/synthetic.png"] }));
    const regenWire = () => mapRegenerateQuery(mapChatRegenerateExecutionInput(owner.sync(identity()).overrides));
    expect(sendWire()).toEqual({ content: "原始正文", client_msg_id: "stable-id", attachments: ["/uploads/synthetic.png"] });
    expect([...regenWire()]).toEqual([]);
    owner.apply(initial.scope!, { contextLimit: "100", temperature: "0" });
    const captured = owner.sync(identity()).overrides;
    expect(sendWire()).toMatchObject({ context_limit: 100, temperature: 0, client_msg_id: "stable-id" });
    expect([...regenWire()]).toEqual([["context_limit", "100"], ["temperature", "0"]]);
    owner.apply(initial.scope!, { contextLimit: "", temperature: "" });
    expect([...regenWire()]).toEqual([]); expect(sendWire()).not.toHaveProperty("temperature");
    expect(captured).toEqual({ contextLimit: 100, temperature: 0 });
  });
});
