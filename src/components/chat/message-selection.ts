const EXCLUDED = 'button, input, textarea, script, style, [hidden], [aria-hidden="true"], [data-chat-non-body]';
const BLOCK = /^(P|DIV|LI|UL|OL|PRE|BLOCKQUOTE|H[1-6]|TR)$/;

/** Only read the native range inside this message's rendered, public body.
 * Full-message fallback comes from the presentation VM, never from DOM text. */
export function readMessageSelection(body: HTMLElement | null): string | null {
  if (!body?.isConnected) return null;
  const selection = body.ownerDocument.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount !== 1) return null;
  const range = selection.getRangeAt(0);
  if (!body.contains(range.startContainer) || !body.contains(range.endContainer)) return null;
  const excluded = (node: Node) => {
    const element = node.nodeType === 1 ? node as Element : node.parentElement;
    if (!element || element.closest(EXCLUDED)) return true;
    const style = body.ownerDocument.defaultView?.getComputedStyle(element);
    return style?.display === "none" || style?.visibility === "hidden";
  };
  if (excluded(range.startContainer) || excluded(range.endContainer)) return null;
  const read = (node: Node): string => {
    if (excluded(node) || !range.intersectsNode(node)) return "";
    if (node.nodeType === 3) {
      const start = node === range.startContainer ? range.startOffset : 0;
      const end = node === range.endContainer ? range.endOffset : node.textContent?.length ?? 0;
      return node.textContent?.slice(start, end) ?? "";
    }
    if (node.nodeType !== 1) return "";
    const element = node as HTMLElement;
    if (element.tagName === "BR") return "\n";
    const text = Array.from(node.childNodes).map(read).join("");
    const separator = element.tagName === "P" ? 2 : 1;
    const trailing = text.match(/\n*$/)?.[0].length ?? 0;
    return text && BLOCK.test(element.tagName)
      ? text + "\n".repeat(Math.max(0, separator - trailing)) : text;
  };
  const text = Array.from(body.childNodes).map(read).join("").replace(/^\n+|\n+$/g, "");
  return text.trim() ? text : null;
}
