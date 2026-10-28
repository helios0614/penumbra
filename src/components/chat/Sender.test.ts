import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearAcceptedSenderDraft,
  shouldSubmitSenderKey,
  isMobileSenderKeyboard,
} from "@/components/chat/Sender";

afterEach(() => vi.unstubAllGlobals());

describe("Sender keyboard submission", () => {
  it.each([
    ["none", false, false], ["none", true, false],
    ["enter", false, true], ["enter", true, false],
    ["shift-enter", false, false], ["shift-enter", true, true],
  ] as const)("%s + shift=%s submits=%s", (shortcut, shiftKey, expected) => {
    expect(shouldSubmitSenderKey({ key: "Enter", shiftKey, isComposing: false, shortcut })).toBe(expected);
  });

  it("defaults to no shortcut", () => {
    expect(shouldSubmitSenderKey({ key: "Enter", shiftKey: false, isComposing: false })).toBe(false);
  });

  it.each([
    ["Mozilla Android", "Linux", 1, false, true],
    ["Mozilla iPhone", "iPhone", 1, false, true],
    ["Mozilla Macintosh", "MacIntel", 5, false, true],
    ["desktop", "Linux", 1, true, true],
    ["desktop", "Linux", 1, false, false],
    ["desktop", "MacIntel", 0, false, false],
  ])("keeps mobile Enter native (%s / %s / touch=%s / coarse=%s)", (userAgent, platform, maxTouchPoints, coarse, expected) => {
    vi.stubGlobal("navigator", { userAgent, platform, maxTouchPoints });
    vi.stubGlobal("window", { matchMedia: () => ({ matches: coarse }) });
    expect(isMobileSenderKeyboard()).toBe(expected);
  });

  it.each(["ctrlKey", "metaKey", "altKey", "repeat", "mobile", "isComposing"] as const)("blocks %s in both send modes", flag => {
    for (const shortcut of ["enter", "shift-enter"] as const) {
      expect(shouldSubmitSenderKey({ key: "Enter", shiftKey: shortcut === "shift-enter", isComposing: false, shortcut, [flag]: true })).toBe(false);
    }
  });

  it("does not submit Enter during IME composition", () => {
    expect(shouldSubmitSenderKey({
      key: "Enter",
      shiftKey: false,
      isComposing: true,
      shortcut: "enter",
    })).toBe(false);
  });

  it("blocks Safari IME confirmation after compositionend", () => {
    expect(shouldSubmitSenderKey({ key: "Enter", shiftKey: false, isComposing: false, keyCode: 229, shortcut: "enter" })).toBe(false);
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
