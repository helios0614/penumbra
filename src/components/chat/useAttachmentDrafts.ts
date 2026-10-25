import { useEffect, useState, useSyncExternalStore } from "react";
import { createAttachmentDraftStore } from "@/application/chat-media/attachment-drafts";

export function useAttachmentDrafts(owner: string | null) {
  const [store] = useState(createAttachmentDraftStore);
  useEffect(() => { store.activate(); return () => store.dispose(); }, [store]);
  const items = useSyncExternalStore(store.subscribe, () => store.get(owner ?? ""), () => store.get(owner ?? ""));
  return { store, items, ready: items.every(item => item.status === "uploaded") };
}
