import * as React from "react";
import { vi } from "vitest";

/** Real component callbacks with synthetic UI/geometry; no browser or network. */
export function hookSession<T>(component: () => T) {
  const states: unknown[] = [], refs: { current: unknown }[] = [];
  const deps: (readonly unknown[] | undefined)[] = [], cleanups: (() => void)[] = [];
  const pending: (() => void)[] = [];
  const callbacks: { value: unknown; deps: readonly unknown[] }[] = [];
  let stateIndex = 0, refIndex = 0, effectIndex = 0, callbackIndex = 0;
  vi.spyOn(React, "useState").mockImplementation(((initial: unknown) => {
    const i = stateIndex++;
    if (!(i in states)) states[i] = typeof initial === "function" ? initial() : initial;
    return [states[i], (next: unknown) => { states[i] = typeof next === "function" ? next(states[i]) : next; }];
  }) as typeof React.useState);
  vi.spyOn(React, "useRef").mockImplementation(((initial: unknown) => refs[refIndex++] ??= { current: initial }) as typeof React.useRef);
  vi.spyOn(React, "useCallback").mockImplementation(((callback: unknown, next: readonly unknown[]) => {
    const i = callbackIndex++;
    if (!callbacks[i] || next.some((value, n) => value !== callbacks[i].deps[n])) callbacks[i] = { value: callback, deps: next };
    return callbacks[i].value;
  }) as typeof React.useCallback);
  vi.spyOn(React, "useId").mockReturnValue("synthetic-id");
  vi.spyOn(React, "useSyncExternalStore").mockImplementation(((_subscribe: unknown, snapshot: () => unknown) => snapshot()) as typeof React.useSyncExternalStore);
  const effect = ((callback: () => void | (() => void), next?: readonly unknown[]) => {
    const i = effectIndex++;
    if (!(i in deps) || !next || next.some((value, n) => value !== deps[i]?.[n])) {
      deps[i] = next;
      pending.push(() => { cleanups[i]?.(); cleanups[i] = callback() || (() => {}); });
    }
  }) as typeof React.useEffect;
  vi.spyOn(React, "useEffect").mockImplementation(effect);
  vi.spyOn(React, "useLayoutEffect").mockImplementation(effect);
  return {
    render: () => { stateIndex = 0; refIndex = 0; effectIndex = 0; callbackIndex = 0; return component(); },
    commit: () => pending.splice(0).forEach((run) => run()),
    dispose: () => cleanups.forEach((cleanup) => cleanup()),
  };
}
export function elements(node: React.ReactNode): React.ReactElement<Record<string, unknown>>[] {
  return React.Children.toArray(node).flatMap((child) => React.isValidElement<Record<string, unknown>>(child)
    ? [child, ...elements(child.props.children as React.ReactNode)] : []);
}
export function find<T extends React.ElementType>(node: React.ReactNode, type: T, predicate?: (props: React.ComponentProps<T>) => boolean) {
  const result = elements(node).find((child) => child.type === type && (!predicate || predicate(child.props as React.ComponentProps<T>)));
  if (!result) throw new Error(`Missing element: ${String(type)}`);
  return result as React.ReactElement<React.ComponentProps<T>>;
}
