import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";

type BodyNode = { type: string; value?: string; lang?: string | null; children?: BodyNode[] };
const parser = unified().use(remarkParse).use(remarkGfm);

/** Same Markdown dialect as the renderer; public text only, without HTML,
 * image URLs, link destinations, code toolbar labels, or hidden definitions. */
export function insertableBody(content: string, previewMarkdownCode = true): string {
  const read = (node: BodyNode): string => {
    if (["html", "image", "imageReference", "definition", "thematicBreak"].includes(node.type)) return "";
    if (node.type === "break") return "\n";
    if (node.type === "code") {
      const text = previewMarkdownCode && /^(md|markdown)$/i.test(node.lang ?? "")
        ? insertableBody(node.value ?? "", false) : node.value ?? "";
      return text + "\n\n";
    }
    if (node.type === "text" || node.type === "inlineCode") return node.value ?? "";
    const text = node.children?.map(read).join("") ?? "";
    if (["paragraph", "heading", "blockquote"].includes(node.type)) return text ? text + "\n\n" : "";
    if (node.type === "listItem" || node.type === "tableRow") return text.trimEnd() + "\n";
    if (node.type === "tableCell") return text + "\t";
    return text;
  };
  return read(parser.parse(content) as BodyNode).replace(/^\n+|\n+$/g, "");
}
