import { createContext, useContext, type ReactNode } from "react";

export type SearchHighlight = {
  query: string;
  active: boolean;
  segments?: readonly string[];
  bodyQueries?: readonly string[];
};
export const SearchHighlightContext = createContext<SearchHighlight>({
  query: "",
  active: false,
});
export function normalizeSearch(value: string) {
  return [...value.matchAll(/[^\p{M}]\p{M}*|\p{M}+/gu)]
    .map((m) => m[0].normalize("NFC").toUpperCase().toLowerCase())
    .join("")
    .replace(/\s+/gu, " ")
    .trim();
}
/** Match text nodes only. Original text remains the React/copy source. */
export function searchTextRanges(
  value: string,
  query: string,
): [number, number][] {
  const target = normalizeSearch(query);
  if (!target) return [];
  let normalized = "";
  const spans: [number, number][] = [];
  const clusters = value.matchAll(/[^\p{M}]\p{M}*|\p{M}+/gu);
  for (const match of clusters) {
    const start = match.index,
      end = start + match[0].length;
    for (const char of match[0].normalize("NFC").toUpperCase().toLowerCase()) {
      if (/\s/u.test(char)) {
        if (normalized && !normalized.endsWith(" ")) {
          normalized += " ";
          spans.push([start, end]);
        } else if (normalized) spans[spans.length - 1]![1] = end;
      } else {
        normalized += char;
        for (let i = 0; i < char.length; i++) spans.push([start, end]);
      }
    }
  }
  const result: [number, number][] = [];
  for (
    let i = normalized.indexOf(target);
    i >= 0;
    i = normalized.indexOf(target, i + target.length)
  ) {
    const a = spans[i]![0],
      b = spans[i + target.length - 1]![1],
      last = result[result.length - 1];
    if (last && last[1] > a) last[1] = Math.max(last[1], b);
    else result.push([a, b]);
  }
  return result;
}
function rangesForQueries(text: string, query: string | readonly string[]) {
  const all = (typeof query === "string" ? [query] : query)
    .flatMap((q) => searchTextRanges(text, q))
    .sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const range of all) {
    const previous = merged[merged.length - 1];
    if (previous && previous[1] >= range[0])
      previous[1] = Math.max(previous[1], range[1]);
    else merged.push([...range]);
  }
  return merged;
}
export function highlightSearchText(
  text: string,
  query: string | readonly string[],
): ReactNode {
  const ranges = rangesForQueries(text, query);
  if (!ranges.length) return text;
  const result: ReactNode[] = [];
  let start = 0;
  ranges.forEach(([a, b], index) => {
    if (a > start) result.push(text.slice(start, a));
    result.push(
      <mark className="chat-search-term" key={index}>
        {text.slice(a, b)}
      </mark>,
    );
    start = b;
  });
  result.push(text.slice(start));
  return result;
}
export function SearchText({ text }: { text: string }) {
  const search = useContext(SearchHighlightContext);
  return (
    <>
      {search.active
        ? highlightSearchText(text, search.bodyQueries ?? search.query)
        : text}
    </>
  );
}
type TextNode = {
  type: string;
  value?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: TextNode[];
};
/** Runs after Markdown/code highlighting; operates on a flattened visible block. */
export function rehypeSearchHighlight(options: {
  query: string | readonly string[];
}) {
  return (tree: TextNode) => {
    if (
      !(
        typeof options.query === "string" ? [options.query] : options.query
      ).some((q) => normalizeSearch(q))
    )
      return;
    const visitBlock = (node: TextNode) => {
      const leaves: {
        node: TextNode;
        parent: TextNode;
        start: number;
        end: number;
      }[] = [];
      let value = "";
      const collect = (parent: TextNode) => {
        for (const child of parent.children ?? []) {
          if (child.type === "text") {
            const start = value.length;
            value += child.value ?? "";
            leaves.push({ node: child, parent, start, end: value.length });
          } else if (child.tagName === "br") value += "\n";
          else if (!["img", "script", "style"].includes(child.tagName ?? ""))
            collect(child);
          if (
            [
              "p",
              "h1",
              "h2",
              "h3",
              "h4",
              "h5",
              "h6",
              "pre",
              "tr",
              "li",
            ].includes(child.tagName ?? "")
          )
            value += "\n\n";
          else if (["td", "th"].includes(child.tagName ?? "")) value += "\t";
        }
      };
      collect(node);
      const ranges = rangesForQueries(value, options.query);
      for (const leaf of leaves) {
        const local = ranges.flatMap(([a, b]) =>
          a < leaf.end && b > leaf.start
            ? [
                [
                  Math.max(a, leaf.start) - leaf.start,
                  Math.min(b, leaf.end) - leaf.start,
                ] as const,
              ]
            : [],
        );
        if (!local.length) continue;
        const original = leaf.node.value ?? "",
          children: TextNode[] = [];
        let cursor = 0;
        for (const [a, b] of local) {
          if (a > cursor)
            children.push({ type: "text", value: original.slice(cursor, a) });
          children.push({
            type: "element",
            tagName: "mark",
            properties: { className: ["chat-search-term"] },
            children: [{ type: "text", value: original.slice(a, b) }],
          });
          cursor = b;
        }
        if (cursor < original.length)
          children.push({ type: "text", value: original.slice(cursor) });
        const index = leaf.parent.children!.indexOf(leaf.node);
        leaf.parent.children!.splice(index, 1, ...children);
      }
    };
    visitBlock(tree);
  };
}
