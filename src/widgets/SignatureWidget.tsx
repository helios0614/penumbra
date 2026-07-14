import { useState } from 'react';
import { PencilLine, Quote, Sparkles } from 'lucide-react';

const SIGNATURE_STORAGE_KEY = 'penumbra-desktop-signature';
const DEFAULT_SIGNATURE = '慢一点，也是在向前。';

function loadSignature(): string {
  if (typeof window === 'undefined') return DEFAULT_SIGNATURE;

  try {
    return localStorage.getItem(SIGNATURE_STORAGE_KEY) ?? DEFAULT_SIGNATURE;
  } catch {
    return DEFAULT_SIGNATURE;
  }
}

export function SignatureWidget() {
  const [signature, setSignature] = useState(loadSignature);

  const updateSignature = (value: string) => {
    setSignature(value);

    try {
      localStorage.setItem(SIGNATURE_STORAGE_KEY, value);
    } catch {
      // 存储受限时仍保留本次页面内的编辑结果。
    }
  };

  return (
    <div className="group/signature relative flex h-full items-center px-2 sm:px-4">
      <span
        className="pointer-events-none absolute -left-0.5 -top-6 font-heading text-[76px] leading-none text-primary/16 sm:left-1"
        aria-hidden="true"
      >
        “
      </span>
      <span
        className="pointer-events-none absolute bottom-2 left-14 right-[18%] h-px bg-gradient-to-r from-white/46 via-white/24 to-transparent sm:left-[74px]"
        aria-hidden="true"
      />

      <div className="relative grid size-9 shrink-0 place-items-center text-white drop-shadow-md sm:size-10">
        <Quote className="size-4" strokeWidth={1.7} aria-hidden="true" />
        <Sparkles className="absolute -right-1 -top-1 size-3 text-primary" strokeWidth={1.8} aria-hidden="true" />
      </div>

      <div className="relative min-w-0 flex-1 pl-4 pr-2 sm:pl-5 sm:pr-4">
        <div className="mb-0.5 flex items-center gap-2">
          <span className="signature-wallpaper-text font-mono text-[8px] font-semibold uppercase tracking-[0.22em] text-white">
            Personal note
          </span>
          <span className="h-px flex-1 bg-gradient-to-r from-white/38 to-transparent" aria-hidden="true" />
        </div>
        <input
          type="text"
          value={signature}
          onChange={(event) => updateSignature(event.target.value)}
          maxLength={64}
          placeholder="写下一句今天的签名…"
          className="signature-wallpaper-text block w-full border-0 bg-transparent p-0 font-heading text-lg leading-tight text-white placeholder:text-white/58 focus:outline-none focus-visible:outline-none sm:text-xl"
          aria-label="个性签名"
        />
      </div>

      <div className="relative hidden shrink-0 items-center gap-2 px-1 sm:flex">
        <span className="signature-wallpaper-text font-mono text-[8px] uppercase tracking-[0.18em] text-white">Be yourself</span>
        <PencilLine className="size-3.5 text-white drop-shadow-md" strokeWidth={1.6} aria-hidden="true" />
      </div>
    </div>
  );
}

export default SignatureWidget;
