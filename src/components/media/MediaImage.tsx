import { useEffect, useRef, useState } from "react";
import { ImageOff, LoaderCircle } from "lucide-react";
import { ImageViewer } from "./ImageViewer";
import type { ViewerImage } from "./ViewerStage";

/** span output is valid inside Markdown paragraphs; viewer portals outside it. */
export function MediaImage({ image, images = [image], index = 0, lease, compact = false }: {
  image: ViewerImage; images?: readonly ViewerImage[]; index?: number; lease?: () => () => void; compact?: boolean;
}) {
  const [load, setLoad] = useState<{ url: string; status: "loading" | "ready" | "failed" }>({ url: image.url, status: "loading" });
  const status = load.url === image.url ? load.status : "loading";
  const [shape, setShape] = useState("landscape");
  const [open, setOpen] = useState(false), [retry, setRetry] = useState(0);
  const trigger = useRef<HTMLButtonElement>(null), release = useRef<(() => void) | null>(null);
  const previousUrl = useRef(image.url);
  useEffect(() => {
    if (previousUrl.current === image.url) return;
    previousUrl.current = image.url; setOpen(false); release.current?.(); release.current = null;
  }, [image.url]);
  useEffect(() => () => { release.current?.(); release.current = null; }, []);
  const close = () => { setOpen(false); release.current?.(); release.current = null; };
  return <span className="media-image" data-shape={shape} data-compact={compact} data-status={status}>
    <button ref={trigger} type="button" aria-label={status === "failed" ? `重试显示 ${image.label}` : `查看 ${image.label}`} title={status === "failed" ? "重新读取图片" : "查看原图"}
      onClick={() => {
        if (status === "failed") { setLoad({ url: image.url, status: "loading" }); setRetry(value => value + 1); return; }
        trigger.current?.dispatchEvent(new Event("chat-media-preview", { bubbles: true }));
        release.current = lease?.() ?? null; setOpen(true);
      }} className="media-image-trigger">
      {status === "loading" && <span className="media-image-placeholder" role="status"><LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" /><span className="sr-only">正在加载图片</span></span>}
      {status === "failed" ? <span className="media-image-placeholder flex-col gap-1"><ImageOff className="size-5" /><span className="text-xs">图片未能显示 · 重试</span></span>
        : <img key={`${image.url}:${retry}`} src={image.url} alt={image.label} loading="lazy" decoding="async" onLoad={event => {
          const ratio = event.currentTarget.naturalHeight / event.currentTarget.naturalWidth;
          setShape(ratio > 2.5 ? "long" : ratio > 1.2 ? "portrait" : "landscape"); setLoad({ url: image.url, status: "ready" });
        }} onError={() => setLoad({ url: image.url, status: "failed" })} />}
    </button>
    {open && <ImageViewer images={images} initialIndex={index} onClose={close} finalFocus={trigger} />}
  </span>;
}
