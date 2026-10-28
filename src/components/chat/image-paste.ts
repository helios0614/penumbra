/** Keep focused Sender and desktop page paste on the same image-only semantics. */
export function receiveClipboardImages(
  event: Pick<ClipboardEvent, "clipboardData" | "defaultPrevented" | "preventDefault">,
  onFiles: (files: readonly File[]) => void,
): boolean {
  if (event.defaultPrevented || !event.clipboardData) return false;
  const files = Array.from(event.clipboardData.items)
    .filter(item => item.kind === "file" && item.type.startsWith("image/"))
    .map(item => item.getAsFile()).filter((file): file is File => file !== null);
  if (!files.length) return false;
  event.preventDefault();
  onFiles(files);
  return true;
}
