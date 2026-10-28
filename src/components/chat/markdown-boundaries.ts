import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import type { Root, Nodes } from "mdast";

const parser = unified().use(remarkParse).use(remarkGfm);
const protectedBlocks = new Set(["code", "list", "blockquote", "table"]);

/** Visibility only; never remove characters from retained source or code. */
export function hasVisibleText(content: string): boolean {
  return content.replace(/[\p{Cc}\p{Default_Ignorable_Code_Point}]/gu, "").trim().length > 0;
}

export function parseBubbleMarkdown(content: string): Root {
  return parser.parse(content);
}

/** Top-level containers already include their nested lists, quotes and code. */
export function protectedMarkdownLines(tree: Root): readonly (readonly [number, number])[] {
  return tree.children.flatMap(node => protectedBlocks.has(node.type) && node.position
    ? [[node.position.start.line, node.position.end.line] as const] : []);
}

/** Match the current renderer: hr/definitions are hidden, code has a toolbar,
 * images have media or fallback UI, and lists/tables have visible decorations.
 * This deliberately does not use DOM textContent (media need not contain text).
 */
export function hasMarkdownOutput(tree: Root): boolean {
  const visible = (node: Nodes): boolean => {
    if (node.type === "definition" || node.type === "thematicBreak") return false;
    if (["code", "inlineCode", "image", "imageReference", "list", "table", "break"].includes(node.type)) return true;
    if ("value" in node) return hasVisibleText(node.value);
    if ("children" in node) return node.children.some(visible);
    return true; // Conservatively retain future extension nodes.
  };
  return tree.children.some(visible);
}
