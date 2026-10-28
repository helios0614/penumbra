import { defaultUrlTransform } from "react-markdown";
import { isDefinitionOnly, parseBubbleMarkdown } from "./markdown-boundaries";

export function markdownSurface(content: string): "code" | "rule" | "definitions" | "body" {
  const tree = parseBubbleMarkdown(content);
  if (isDefinitionOnly(tree)) return "definitions";
  const nodes = tree.children.filter(node => node.type !== "definition");
  if (nodes.length === 1 && nodes[0].type === "code") return "code";
  if (nodes.length > 0 && nodes.every(node => node.type === "thematicBreak")) return "rule";
  return "body";
}

/** Same protocol policy as react-markdown anchors; never use a raw definition
 * destination as href or reconstruct hidden source before presentation. */
export function definitionLinks(content: string) {
  const tree = parseBubbleMarkdown(content);
  if (!isDefinitionOnly(tree)) return [];
  return tree.children.flatMap(node => node.type === "definition"
    ? [{ label: node.label || node.identifier, href: defaultUrlTransform(node.url) }] : []);
}
