import { useEffect, useState } from "react";
import { getUserDisplayName } from "@/domain/worldbook/worldbook-client";

export function useChatUserName(enabled: boolean): string {
  const [userName, setUserName] = useState("你");

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void getUserDisplayName(controller.signal).then(name => {
      if (!controller.signal.aborted) setUserName(name);
    }).catch(() => {
      // A missing name must not prevent reading or sending messages.
    });
    return () => controller.abort();
  }, [enabled]);

  return userName;
}
