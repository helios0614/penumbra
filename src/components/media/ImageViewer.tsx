import { useEffect, useRef, useState, type ComponentProps, type CSSProperties, type RefObject } from "react";
import { ChevronLeft, ChevronRight, Minimize, Minus, Plus, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ViewerStage, type ViewerImage } from "./ViewerStage";
import { clampZoom } from "./viewer-geometry";
import "./media.css";

export function ImageViewer({ images, initialIndex, onClose, finalFocus }: {
  images: readonly ViewerImage[]; initialIndex: number; onClose: () => void; finalFocus: RefObject<HTMLElement | null>;
}) {
  const [index, setIndex] = useState(Math.min(initialIndex, images.length - 1));
  const [scale, setScale] = useState(1);
  const [viewport, setViewport] = useState<CSSProperties>({});
  const content = useRef<HTMLDivElement>(null);
  const navigate = (delta: number) => { setIndex(current => Math.max(0, Math.min(images.length - 1, current + delta))); setScale(1); };
  useEffect(() => {
    const view = window.visualViewport;
    const resize = () => setViewport({ "--dialog-viewport-height": `${view?.height ?? window.innerHeight}px`, "--dialog-viewport-top": `${view?.offsetTop ?? 0}px` } as CSSProperties);
    resize(); view?.addEventListener("resize", resize); view?.addEventListener("scroll", resize); window.addEventListener("resize", resize);
    return () => { view?.removeEventListener("resize", resize); view?.removeEventListener("scroll", resize); window.removeEventListener("resize", resize); };
  }, []);
  if (!images[index]) return null;
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent ref={content} finalFocus={finalFocus} showCloseButton={false} className="media-viewer" overlayClassName="media-viewer-overlay" style={viewport}
      onKeyDown={event => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); navigate(event.key === "ArrowLeft" ? -1 : 1); }
      }}>
      <div className="media-viewer-toolbar">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <DialogTitle className="sr-only sm:not-sr-only sm:m-0 sm:shrink-0 sm:text-xs sm:font-normal sm:leading-5 sm:text-muted-foreground">图片预览</DialogTitle>
          <DialogDescription className="m-0 truncate whitespace-nowrap text-[11px] tabular-nums sm:text-xs">{index + 1} / {images.length} · {Math.round(scale * 100)}%</DialogDescription>
        </div>
        <div className="media-viewer-actions">
          <ViewerButton label="缩小" disabled={scale <= 1} onClick={() => setScale(value => clampZoom(value - .5))}><Minus className="size-4" /></ViewerButton>
          <ViewerButton label="放大" disabled={scale >= 8} onClick={() => setScale(value => clampZoom(value + .5))}><Plus className="size-4" /></ViewerButton>
          <ViewerButton label="适应窗口" onClick={() => setScale(1)}><Minimize className="size-4" /></ViewerButton>
          <ViewerButton label="关闭图片预览" onClick={onClose}><X className="size-4" /></ViewerButton>
        </div>
      </div>
      <ViewerStage key={images[index].url} image={images[index]} scale={scale} onScale={setScale} onNavigate={navigate} />
      <div className="media-viewer-footer">
        <ViewerButton label="上一张图片" disabled={index === 0} onClick={() => navigate(-1)}><ChevronLeft className="size-4" /></ViewerButton>
        <span className="text-xs text-muted-strong">{scale > 1 ? "拖动查看细节 · 双击适屏" : "双击放大 · 左右滑动切换"}</span>
        <ViewerButton label="下一张图片" disabled={index === images.length - 1} onClick={() => navigate(1)}><ChevronRight className="size-4" /></ViewerButton>
      </div>
    </DialogContent>
  </Dialog>;
}
function ViewerButton({ label, children, ...props }: ComponentProps<typeof Button> & { label: string }) {
  return <Button type="button" variant="ghost" size="icon-lg" className="size-11 shrink-0 rounded-full" aria-label={label} title={label} {...props}>{children}</Button>;
}
