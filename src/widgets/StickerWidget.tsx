import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Flower2, ImagePlus } from 'lucide-react';
import { getStickerImage, saveStickerImage } from './sticker-storage';

export function StickerWidget() {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const objectUrlRef = useRef<string | null>(null);

  const showImage = (image: Blob) => {
    const nextUrl = URL.createObjectURL(image);
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = nextUrl;
    setImageUrl(nextUrl);
  };

  useEffect(() => {
    let isMounted = true;

    void getStickerImage()
      .then((image) => {
        if (image && isMounted) showImage(image);
      })
      .catch(() => {
        // 无法读取本地图片时使用默认贴纸。
      });

    return () => {
      isMounted = false;
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  const handleImageChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;

    showImage(file);
    setIsSaving(true);
    try {
      await saveStickerImage(file);
    } catch {
      // 存储受限时仍保留本次页面内的预览。
    } finally {
      setIsSaving(false);
      input.value = '';
    }
  };

  return (
    <div className="grid h-full w-full place-items-center">
      <label
        className="group relative block aspect-square h-full max-w-full cursor-pointer overflow-hidden rounded-[22px] border border-border-strong bg-primary-subtle text-primary-ink shadow-md transition-transform duration-200 hover:-translate-y-0.5 active:scale-[0.98]"
        title="更换贴纸图片"
      >
        <input
          type="file"
          accept="image/*"
          onChange={handleImageChange}
          className="sr-only"
          aria-label="更换贴纸图片"
        />

        {imageUrl ? (
          <img src={imageUrl} alt="自定义贴纸" className="size-full object-cover" />
        ) : (
          <span className="relative flex size-full flex-col items-center justify-center overflow-hidden">
            <span className="absolute -right-5 -top-6 size-16 rounded-full bg-primary/16" aria-hidden="true" />
            <span className="absolute -bottom-8 -left-7 size-20 rounded-full bg-primary/12" aria-hidden="true" />
            <Flower2 className="relative mb-1 size-9" strokeWidth={1.6} aria-hidden="true" />
            <span className="relative font-heading text-base leading-tight">松弛一点</span>
            <span className="relative mt-1 font-mono text-[7px] font-semibold tracking-[0.18em] opacity-75">
              TAKE IT EASY
            </span>
          </span>
        )}

        <span className="absolute inset-x-2 bottom-2 flex min-h-7 items-center justify-center gap-1.5 rounded-full bg-background/78 px-2 text-[10px] font-medium text-foreground opacity-0 shadow-sm backdrop-blur-md transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
          <ImagePlus className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
          {isSaving ? '保存中…' : '换图'}
        </span>
      </label>
    </div>
  );
}

export default StickerWidget;
