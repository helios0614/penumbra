import * as React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { ModelSelectionPanel, type ModelSelectionEditor } from "./ModelSelectionPanel";
import { find, hookSession } from "./test-utils/hook-session";
import { AppSelect } from "@/components/ui/app-select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
vi.mock("react", async original => { const actual = await original<typeof React>(); return { ...actual, ...Object.fromEntries(["useState", "useRef", "useCallback", "useId", "useEffect", "useLayoutEffect"].map(k => [k, vi.fn(actual[k as keyof typeof actual] as never)])) }; });
afterEach(() => vi.restoreAllMocks());
it("shares Main's picker but stages quick/advanced Diary edits until explicit save", () => {
  const commit = vi.fn(), change = vi.fn(patch => ({ connectionId: "a", protocol: "anthropic_messages", model: "typed", ...patch }));
  const editor: ModelSelectionEditor = { draft: { connectionId: "a", protocol: "anthropic_messages", model: "typed" }, dirty: true, complete: true, pending: false, locked: false, notice: null, change, commit, refresh: vi.fn(async () => {}) };
  const s = hookSession(() => ModelSelectionPanel({ ownerId: "entry", editor, explicitSave: true, canSave: true, canRefresh: true, needsRecovery: false, recoveryMessage: "", description: "仅影响当前日记的回复与重新生成。", configuration: { selection: { connectionId: "a", protocol: "anthropic_messages", model: "saved" }, diagnostic: null, allowedProtocols: ["anthropic_messages", "openai_chat_completions"], connections: [{ id: "a", name: "A", enabled: true, credentialConfigured: true, protocols: [], defaultModel: "preset" }] } }));
  find(s.render(), AppSelect).props.onValueChange(JSON.stringify(["a", "preset"])); expect(commit).not.toHaveBeenCalled();
  find(s.render(), "details").props.onToggle?.({ currentTarget: { open: true } } as never);
  find(s.render(), Input).props.onChange?.({ target: { value: "new" } } as never); find(s.render(), Input).props.onBlur?.({} as never);
  find(s.render(), AppSelect, p => p.ariaLabel === "接口格式").props.onValueChange("openai_chat_completions"); expect(commit).not.toHaveBeenCalled();
  find(s.render(), Button, p => p.children === "保存模型").props.onClick?.({} as never); expect(commit).toHaveBeenCalledOnce();
});
