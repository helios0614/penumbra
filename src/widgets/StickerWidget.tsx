import { useState, type ChangeEvent } from 'react';
import { Flower2, ImagePlus } from 'lucide-react';
import {
  APPEARANCE_IMAGE_ACCEPT, appearanceImageUrl, appearanceSaveError, uploadAppearanceImage,
} from '@/domain/appearance/appearance-client';
import { saveAppearance, useAppearance } from '@/domain/appearance/appearance-store';

export function StickerWidget() {
  const { config, status, saving } = useAppearance();
  const imageUrl = appearanceImageUrl('sticker', config.stickerImage);
  const [error, setError] = useState<string | null>(null);

  const handleImageChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    setError(null);
    try {
      await saveAppearance(() => uploadAppearanceImage('sticker', file));
    } catch (error) {
      setError(appearanceSaveError(error, '保存贴纸失败，请稍后重试'));
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
          accept={APPEARANCE_IMAGE_ACCEPT}
          disabled={status !== 'ready' || saving}
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
          换图
        </span>
        {error && <span role="alert" className="absolute inset-x-1 bottom-1 rounded-lg bg-background/95 px-1.5 py-1 text-center text-[10px] text-destructive">{error}</span>}
      </label>
    </div>
  );
}

export default StickerWidget;
