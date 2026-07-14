import { memo } from "react";
import { normalizeSystemMessageText } from "./message-capabilities";

interface SystemMessageLineProps {
  content: string;
}

function SystemMessageLineInner({ content }: SystemMessageLineProps) {
  const displayText = normalizeSystemMessageText(content);
  if (!displayText) return null;

  return (
    <p className="max-w-full break-words py-1 text-xs leading-[1.6] text-muted-strong">
      {displayText}
    </p>
  );
}

export const SystemMessageLine = memo(SystemMessageLineInner);
