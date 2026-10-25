import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { ImageOff, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clampPan, clampZoom, swipeDirection, type Point } from "./viewer-geometry";

export type ViewerImage = { readonly url: string; readonly label: string };
export function ViewerStage({ image, scale, onScale, onNavigate }: { image: ViewerImage; scale: number; onScale: (value: number) => void; onNavigate: (delta: number) => void }) {
  const stageRef = useRef<HTMLDivElement>(null), imageRef = useRef<HTMLImageElement>(null);
  const pointers = useRef(new Map<number, Point>()), previousGap = useRef(0), swipeStart = useRef<Point | null>(null);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [retry, setRetry] = useState(0);
  useEffect(() => { if (scale === 1) setPan({ x: 0, y: 0 }); }, [scale]);
  useEffect(() => {
    const node = stageRef.current;
    if (!node) return;
    const wheel = (event: WheelEvent) => { if (event.ctrlKey || scale > 1) { event.preventDefault(); onScale(clampZoom(scale - event.deltaY * .005)); } };
    node.addEventListener("wheel", wheel, { passive: false });
    return () => node.removeEventListener("wheel", wheel);
  }, [scale, onScale]);
  const constrain = (next: Point) => clampPan(next, scale,
    { width: stageRef.current?.clientWidth ?? 0, height: stageRef.current?.clientHeight ?? 0 },
    { width: imageRef.current?.naturalWidth ?? 0, height: imageRef.current?.naturalHeight ?? 0 });
  const pointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || status !== "ready") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, point);
    if (pointers.current.size === 1) swipeStart.current = point;
    if (pointers.current.size === 2) { previousGap.current = gap([...pointers.current.values()]); swipeStart.current = null; }
  };
  const pointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const before = pointers.current.get(event.pointerId); if (!before) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      const next = gap([...pointers.current.values()]);
      if (previousGap.current > 0) onScale(clampZoom(scale * next / previousGap.current));
      previousGap.current = next;
    } else if (scale > 1) setPan(current => constrain({ x: current.x + event.clientX - before.x, y: current.y + event.clientY - before.y }));
  };
  const pointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const start = swipeStart.current;
    pointers.current.delete(event.pointerId); previousGap.current = 0; swipeStart.current = null;
    if (event.type !== "pointercancel" && scale === 1 && start) {
      const direction = swipeDirection(event.clientX - start.x, event.clientY - start.y);
      if (direction) onNavigate(direction);
    }
  };
  const shownPan = constrain(pan);
  return <div ref={stageRef} className="media-viewer-stage" data-zoomed={scale > 1} onPointerDown={pointerDown} onPointerMove={pointerMove}
    onPointerUp={pointerUp} onPointerCancel={pointerUp} onLostPointerCapture={() => { pointers.current.clear(); previousGap.current = 0; swipeStart.current = null; }} onDoubleClick={() => onScale(scale > 1 ? 1 : 3)}>
    {status === "loading" && <span role="status" className="media-viewer-status"><LoaderCircle className="size-5 animate-spin motion-reduce:animate-none" />正在读取图片</span>}
    {status === "failed" && <div role="alert" className="media-viewer-status flex-col"><ImageOff className="size-7" /><p>图片暂时无法显示</p><Button variant="outline" onClick={() => { setStatus("loading"); setRetry(value => value + 1); }}>重新读取</Button></div>}
    <img key={retry} ref={imageRef} src={image.url} alt={image.label} draggable={false} hidden={status === "failed"}
      onLoad={() => setStatus("ready")} onError={() => setStatus("failed")}
      className="media-viewer-original" style={{ "--image-scale": scale, "--image-x": `${shownPan.x}px`, "--image-y": `${shownPan.y}px` } as CSSProperties} />
  </div>;
}
function gap(points: Point[]) { return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y); }
