import { describe, expect, it } from "vitest";

import {
  clearAcceptedSenderDraft,
  shouldSubmitSenderKey,
} from "@/components/chat/Sender";

describe("Sender keyboard submission", () => {
  it("uses Enter to send and Shift+Enter for a newline", () => {
    expect(shouldSubmitSenderKey({
      key: "Enter",
      shiftKey: false,
      isComposing: false,
    })).toBe(true);
    expect(shouldSubmitSenderKey({
      key: "Enter",
      shiftKey: true,
      isComposing: false,
    })).toBe(false);
  });

  it("does not submit Enter during IME composition", () => {
    expect(shouldSubmitSenderKey({
      key: "Enter",
      shiftKey: false,
      isComposing: true,
    })).toBe(false);
  });

  it("does not submit unrelated keys", () => {
    expect(shouldSubmitSenderKey({
      key: "Space",
      shiftKey: false,
      isComposing: false,
    })).toBe(false);
  });

  it("clears only the exact accepted draft snapshot", () => {
    expect(clearAcceptedSenderDraft("hello", "hello")).toBe("");
    expect(clearAcceptedSenderDraft("hello\n", "hello")).toBe("hello\n");
    expect(clearAcceptedSenderDraft("hello again", "hello")).toBe(
      "hello again",
    );
  });
});
