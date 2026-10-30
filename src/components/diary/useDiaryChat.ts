import { useEffect, useState } from "react";
import { createDiaryChatController, initialDiaryChatState, type DiaryChatController } from "@/application/diary-chat/diary-chat-controller";
import { createDiaryChatRealtime, type DiaryChatConnectionState } from "@/application/diary-chat/diary-chat-realtime";

export function useDiaryChat(entryId: string) {
  const [state, setState] = useState(initialDiaryChatState);
  const [controller, setController] = useState<DiaryChatController | null>(null);
  const [connection, setConnection] = useState<DiaryChatConnectionState>("connecting");
  useEffect(() => {
    const active = createDiaryChatController();
    setController(active); setConnection("connecting");
    const unsubscribe = active.subscribe(setState);
    void active.open(entryId);
    const realtime = createDiaryChatRealtime(active, setConnection);
    return () => { realtime.dispose(); unsubscribe(); active.dispose(); };
  }, [entryId]);
  return { state: state.entryId === entryId ? state : { ...initialDiaryChatState, entryId, status: "loading" as const }, controller, connection };
}
