import { useEffect, useState, type RefObject } from "react";

export function toastGeometry(viewport: { left: number; top: number; width: number; height: number }, anchor: { left: number; top: number; right: number; bottom: number } | undefined, clearance: number, obstacleTop?: number) {
  const left = Math.max(viewport.left, anchor?.left ?? viewport.left), top = Math.max(viewport.top, anchor?.top ?? viewport.top);
  const right = Math.min(viewport.left + viewport.width, anchor?.right ?? Infinity);
  const bottom = Math.min(viewport.top + viewport.height, anchor?.bottom ?? Infinity);
  return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top), "--toast-clearance": `${Math.max(clearance, obstacleTop === undefined ? 0 : bottom - obstacleTop + 12)}px` };
}
export function useToastViewport(anchor: RefObject<HTMLElement | null> | undefined, clearance: number) {
  const [state, setState] = useState({ geometry: {}, modal: false });
  useEffect(() => {
    let frame = 0;
    const observed = new Set<Element>();
    const update = () => {
      frame = 0;
      const visual = window.visualViewport;
      const viewport = { left: visual?.offsetLeft ?? 0, top: visual?.offsetTop ?? 0, width: visual?.width ?? window.innerWidth, height: visual?.height ?? window.innerHeight };
      const elements = [...(anchor?.current?.querySelectorAll<HTMLElement>("[data-toast-obstacle]") ?? [])];
      for (const element of observed) if (!elements.includes(element as HTMLElement)) { observer.unobserve(element); observed.delete(element); }
      for (const element of elements) if (!observed.has(element)) { observer.observe(element); observed.add(element); }
      const obstacles = elements.map((element) => element.getBoundingClientRect()).filter((rect) => rect.height > 0);
      const obstacleTop = obstacles.length ? Math.min(...obstacles.map((rect) => rect.top)) : undefined;
      setState({ geometry: toastGeometry(viewport, anchor?.current?.getBoundingClientRect(), clearance, obstacleTop),
        modal: Boolean(document.querySelector('[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]')) });
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const observer = new ResizeObserver(schedule), mutation = new MutationObserver(schedule);
    update();
    if (anchor?.current) observer.observe(anchor.current);
    // Only modal/obstacle lifecycle and modal attributes; no polling or layout writes to observed nodes.
    mutation.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-modal"] });
    window.addEventListener("resize", schedule); window.addEventListener("scroll", schedule, true);
    window.visualViewport?.addEventListener("resize", schedule); window.visualViewport?.addEventListener("scroll", schedule);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); mutation.disconnect(); window.removeEventListener("resize", schedule); window.removeEventListener("scroll", schedule, true); window.visualViewport?.removeEventListener("resize", schedule); window.visualViewport?.removeEventListener("scroll", schedule); };
  }, [anchor, clearance]);
  return state;
}
