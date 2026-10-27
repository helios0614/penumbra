import { useEffect, useState, useSyncExternalStore } from "react";
import { createAttachmentDraftStore, type AttachmentDraftStore } from "@/application/chat-media/attachment-drafts";

export function useAttachmentDrafts(owner: string | null, retainedStore?: AttachmentDraftStore) {
  const [store] = useState(() => retainedStore ?? createAttachmentDraftStore());
  useEffect(() => { store.activate(); return () => { if (!retainedStore) store.dispose(); }; }, [store, retainedStore]);
  const items = useSyncExternalStore(store.subscribe, () => store.get(owner ?? ""), () => store.get(owner ?? ""));
  const recoveries = useSyncExternalStore(store.subscribe, () => store.getRecoveries(owner ?? ""), () => store.getRecoveries(owner ?? ""));
  return { store, items, recoveries, ready: items.every(item => item.status === "uploaded") };
}
