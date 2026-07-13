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
    <div className="relative flex h-full items-center overflow-hidden rounded-[14px] px-1">
      <span
        className="pointer-events-none absolute -left-1 -top-8 font-heading text-[88px] leading-none text-primary/10"
        aria-hidden="true"
      >
        “
      </span>
      <span
        className="pointer-events-none absolute inset-y-2 left-[52px] w-px bg-gradient-to-b from-transparent via-border-strong to-transparent"
        aria-hidden="true"
      />

      <div className="relative grid size-10 shrink-0 place-items-center rounded-full border border-primary/18 bg-primary/10 text-primary-ink">
        <Quote className="size-4" strokeWidth={1.7} aria-hidden="true" />
        <Sparkles className="absolute -right-1 -top-1 size-3 text-primary" strokeWidth={1.8} aria-hidden="true" />
      </div>

      <div className="relative min-w-0 flex-1 pl-5 pr-2 sm:pr-4">
        <div className="mb-0.5 flex items-center gap-2">
          <span className="font-mono text-[8px] font-semibold uppercase tracking-[0.2em] text-muted-strong">
            Personal note
          </span>
          <span className="h-px flex-1 bg-border" aria-hidden="true" />
        </div>
        <input
          type="text"
          value={signature}
          onChange={(event) => updateSignature(event.target.value)}
          maxLength={64}
          placeholder="写下一句今天的签名…"
          className="block w-full border-0 bg-transparent p-0 font-heading text-lg leading-tight text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:outline-none sm:text-xl"
          aria-label="个性签名"
        />
      </div>

      <div className="relative hidden shrink-0 items-center gap-2 border-l border-border pl-4 pr-1 sm:flex">
        <span className="font-mono text-[8px] uppercase tracking-[0.18em] text-muted-foreground">Be yourself</span>
        <PencilLine className="size-3.5 text-muted-strong" strokeWidth={1.6} aria-hidden="true" />
      </div>
    </div>
  );
}

export default SignatureWidget;
