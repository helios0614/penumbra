import { useState } from "react";
import { Feather, PencilLine } from "lucide-react";

const SIGNATURE_STORAGE_KEY = "penumbra-editorial-signature";
const DEFAULT_SIGNATURE = "慢一点，也是在向前。";

function loadSignature(): string {
  if (typeof window === "undefined") return DEFAULT_SIGNATURE;
  try {
    return localStorage.getItem(SIGNATURE_STORAGE_KEY) || DEFAULT_SIGNATURE;
  } catch {
    return DEFAULT_SIGNATURE;
  }
}

export function EditorialSignature() {
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
    <section className="overflow-hidden rounded-[24px] border border-border bg-card shadow-sm">
      <div className="flex min-h-14 items-center gap-3 px-4 sm:px-5">
        <Feather className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.7} aria-hidden="true" />
        <span className="hidden shrink-0 font-mono text-[9px] font-semibold uppercase tracking-[0.22em] text-muted-foreground sm:inline">
          Signature
        </span>
        <span className="hidden h-5 w-px shrink-0 bg-border sm:block" />
        <input
          type="text"
          value={signature}
          onChange={(event) => updateSignature(event.target.value)}
          maxLength={64}
          placeholder="写下一句今天的签名…"
          className="editorial-serif min-w-0 flex-1 border-0 bg-transparent py-2.5 text-base italic text-foreground placeholder:text-muted-foreground focus:outline-none sm:text-lg"
          aria-label="今日签名"
        />
        <PencilLine className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.7} aria-hidden="true" />
      </div>

      <div className="editorial-photo-pair h-40 border-t border-border sm:h-44" aria-hidden="true">
        <div className="editorial-photo-stage">
          <span className="editorial-photo-seal editorial-serif">make space</span>
          <div className="editorial-photo-card editorial-photo-card-left">
            <div className="editorial-botanical" />
          </div>
          <div className="editorial-photo-card editorial-photo-card-right">
            <div className="editorial-botanical" />
          </div>
          <span className="editorial-photo-tape" />
        </div>
      </div>
    </section>
  );
}
