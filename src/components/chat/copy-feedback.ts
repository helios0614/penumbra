import { useToast } from "@/components/ui/toast";
import type { ToastInput } from "@/components/ui/toast-store";

export async function copyWithFeedback(text: string, write: (text: string) => Promise<void>, notify: (input: ToastInput) => unknown) {
  try { await write(text); }
  catch { notify({ type: "error", text: "复制失败，请重试", dedupeKey: "copy" }); return false; }
  notify({ type: "success", text: "已复制", dedupeKey: "copy" });
  return true;
}
export function useCopyFeedback(content: string) {
  const toast = useToast(content);
  return () => copyWithFeedback(content, async (text) => {
    if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
    await navigator.clipboard.writeText(text);
  }, toast.show);
}
