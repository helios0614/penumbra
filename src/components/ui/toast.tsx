import { createContext, useContext, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Check, CircleAlert, Info, X } from "lucide-react";
import { createToastScope, createToastStore, type ToastInput, type ToastItem, type ToastStore } from "./toast-store";
import { useToastViewport } from "./toast-viewport";
import "./toast.css";
export type { ToastInput, ToastType } from "./toast-store";

const ToastContext = createContext<ToastStore | null>(null);
export function ToastProvider({ children, viewportRef, mobileClearance = 112 }: {
  readonly children: ReactNode; readonly viewportRef?: RefObject<HTMLElement | null>; readonly mobileClearance?: number;
}) {
  const [store] = useState(createToastStore);
  useEffect(() => { store.activate(); return () => store.dispose(); }, [store]);
  return <ToastContext.Provider value={store}>{children}<ToastHost store={store} viewportRef={viewportRef} mobileClearance={mobileClearance} /></ToastContext.Provider>;
}

/** A mounted page or operation owns its notifications; late async results become no-ops. */
export function useToast(scopeKey = "page") {
  const store = useContext(ToastContext), id = useId();
  const scope = `${id}:${scopeKey}`;
  const lifetime = useMemo(() => createToastScope(store, scope), [store, scope]);
  useEffect(() => { lifetime.activate(); return () => lifetime.dispose(); }, [lifetime]);
  return lifetime;
}

/** Bridge one explicit business result; persistent errors never enter this hook. */
export function useFeedbackToast(result: object | null, input: ToastInput | null, scopeKey = "page") {
  const toast = useToast(scopeKey), previous = useRef<object | null>(null);
  useEffect(() => {
    if (result && result !== previous.current && input) toast.show(input);
    previous.current = result;
  }, [result, input, toast]);
}

export function ToastMessage({ item, onDismiss }: { readonly item: ToastItem; readonly onDismiss: () => void }) {
  const Icon = item.type === "success" ? Check : item.type === "error" ? CircleAlert : Info;
  return <div className="penumbra-toast mist-glass-strong" data-type={item.type}>
    <Icon className="penumbra-toast-icon" aria-hidden="true" />
    <div className="penumbra-toast-copy"><p>{item.text}</p>{item.description && <p className="penumbra-toast-description">{item.description}</p>}</div>
    <button type="button" className="penumbra-toast-close" aria-label={`关闭提示：${item.text}`} title="关闭提示" onClick={onDismiss}><X aria-hidden="true" className="size-3.5" /></button>
  </div>;
}

function ToastHost({ store, viewportRef, mobileClearance }: {
  readonly store: ToastStore; readonly viewportRef?: RefObject<HTMLElement | null>; readonly mobileClearance: number;
}) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const { geometry, modal } = useToastViewport(viewportRef, mobileClearance);
  const [hovered, setHovered] = useState(false), [focused, setFocused] = useState(false), [hidden, setHidden] = useState(false);
  const listRef = useRef<HTMLDivElement>(null), previousFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const update = () => setHidden(document.hidden);
    update(); document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  useEffect(() => {
    const remember = (event: FocusEvent) => { if (event.target instanceof HTMLElement && event.target !== document.body && !listRef.current?.contains(event.target)) previousFocus.current = event.target; };
    if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) previousFocus.current = document.activeElement;
    document.addEventListener("focusin", remember);
    return () => document.removeEventListener("focusin", remember);
  }, []);
  useEffect(() => store.pause(modal || hovered || focused || hidden), [store, modal, hovered, focused, hidden]);
  const dismiss = (id: number) => {
    const hadFocus = listRef.current?.contains(document.activeElement);
    store.dismiss(id);
    if (hadFocus) { setFocused(false); if (previousFocus.current?.isConnected) previousFocus.current.focus({ preventScroll: true }); }
  };
  if (typeof document === "undefined") return null;
  return createPortal(<div className="penumbra-toast-viewport" style={geometry as CSSProperties} data-modal={modal || undefined}>
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">{modal || hidden ? "" : snapshot.announcement}</div>
    <div ref={listRef} className="penumbra-toast-list" role="region" aria-label="操作提示" hidden={modal} onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
      {snapshot.items.map((item) => <ToastMessage key={item.id} item={item} onDismiss={() => dismiss(item.id)} />)}
    </div>
  </div>, document.body);
}
