import { createContext, useContext, useEffect, useLayoutEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { createAudioController, type AudioController } from "@/application/chat-media/audio-controller";

const AudioContext = createContext<AudioController | null>(null);
export function ChatAudio({ scope, identities, children, createController = createAudioController }: { scope: string; identities: readonly string[]; children: ReactNode; createController?: () => AudioController }) {
  const [controller] = useState(createController);
  useEffect(() => { controller.activate(); return () => controller.dispose(); }, [controller]);
  useLayoutEffect(() => { controller.stop(); }, [controller, scope]);
  useEffect(() => {
    const active = controller.getState().identity;
    if (active && !identities.includes(active)) controller.stop();
  }, [controller, identities]);
  return <AudioContext.Provider value={controller}>{children}</AudioContext.Provider>;
}
export function useChatAudio() {
  const controller = useContext(AudioContext);
  const state = useSyncExternalStore(controller?.subscribe ?? noopSubscribe, controller?.getState ?? idleState, controller?.getState ?? idleState);
  return { controller, state };
}
const emptyController = createAudioController();
const idleState = emptyController.getState;
const noopSubscribe = () => () => {};
