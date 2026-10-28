import { useSyncExternalStore } from "react";

export type SendShortcut = "none" | "enter" | "shift-enter";
export const SEND_SHORTCUT_KEY = "penumbra-chat-send-shortcut";
const CHANGE_EVENT = "penumbra-chat-send-shortcut-change";
// Keep the preference effective for this page even when storage is unavailable.
let unsavedPreference: SendShortcut | undefined;

export function normalizeSendShortcut(value: unknown): SendShortcut {
  return value === "enter" || value === "shift-enter" ? value : "none";
}

export function getSendShortcut(): SendShortcut {
  if (unsavedPreference !== undefined) return unsavedPreference;
  if (typeof window === "undefined") return "none";
  try { return normalizeSendShortcut(window.localStorage.getItem(SEND_SHORTCUT_KEY)); }
  catch { return "none"; }
}

export function setSendShortcut(value: SendShortcut): void {
  unsavedPreference = normalizeSendShortcut(value);
  try {
    window.localStorage.setItem(SEND_SHORTCUT_KEY, unsavedPreference);
    unsavedPreference = undefined;
  } catch { /* The in-memory preference remains usable. */ }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === SEND_SHORTCUT_KEY || event.key === null) listener();
  };
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useSendShortcut(): SendShortcut {
  return useSyncExternalStore(subscribe, getSendShortcut, () => "none");
}
