import { memo, useMemo, useRef, useState, type ComponentProps } from "react";
import { JsonView } from "react-json-view-lite";
import { Button } from "./button";
import { useCopyFeedback } from "./copy-feedback";
import { cn } from "@/lib/utils";
import { initiallyExpandJson, JSON_AUTO_TREE_CHARS, JSON_TREE_LIMIT_MESSAGE, jsonSource, mightBeJson, readJson, type JsonValue } from "./json-viewer-model";
import "./json-viewer.css";

export type { JsonValue } from "./json-viewer-model";
export type JsonViewerProps = {
  /** Already sanitized, parsed JSON. Strings are JSON string values, not source text. */
  data?: JsonValue;
  /** Already sanitized complete source; takes precedence for raw display. */
  rawText?: string;
  /** Exact safe clipboard payload, if different from the displayed source. */
  copyText?: string;
  label?: string;
  className?: string;
  showCopy?: boolean;
  /** Called before local layout changes; the host may capture its reading anchor. */
  onBeforeLayoutChange?: (element: HTMLElement) => void;
};

// Every library class is replaced; its default stylesheet is deliberately not imported.
const treeStyle: ComponentProps<typeof JsonView>["style"] = {
  container: "json-viewer-tree", basicChildStyle: "json-viewer-node", childFieldsContainer: "json-viewer-children",
  label: "json-viewer-key", clickableLabel: "json-viewer-key", nullValue: "json-viewer-null",
  undefinedValue: "json-viewer-null", numberValue: "json-viewer-number", stringValue: "json-viewer-string",
  booleanValue: "json-viewer-boolean", otherValue: "json-viewer-null", punctuation: "json-viewer-punctuation",
  collapseIcon: "json-viewer-arrow json-viewer-arrow-open", expandIcon: "json-viewer-arrow",
  collapsedContent: "json-viewer-collapsed", quotesForFieldNames: true, stringifyStringValues: false,
  ariaLables: { collapseJson: "收起 JSON 节点", expandJson: "展开 JSON 节点" },
};

/** Read-only JSON, no business interpretation, HTML rendering, or internal scroll areas. */
export const JsonViewer = memo(function JsonViewer(props: JsonViewerProps) {
  const source = useMemo(() => jsonSource(props.data, props.rawText), [props.data, props.rawText]);
  // Reset local reading state when the source is replaced, never on unrelated Chat renders.
  return <JsonReadingContent key={source} {...props} source={source} />;
});

function JsonReadingContent({ data, source, copyText, label = "JSON 内容", className, showCopy = true, onBeforeLayoutChange }: JsonViewerProps & { source: string }) {
  const root = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"tree" | "raw">("tree");
  const [requested, setRequested] = useState(false);
  const large = source.length > JSON_AUTO_TREE_CHARS && (data !== undefined || mightBeJson(source));
  const ready = !large || requested;
  // Mounted only inside the host's open detail. Large inputs wait for an explicit request.
  const reading = useMemo(() => ready ? readJson(source, data) : null, [source, data, ready]);
  const copy = useCopyFeedback(showCopy ? copyText ?? source : "json-viewer");
  const json = reading?.kind === "json";
  const beforeChange = () => { if (root.current) onBeforeLayoutChange?.(root.current); };
  const select = (next: "tree" | "raw") => { if (next !== mode) { beforeChange(); setMode(next); } };
  return <div ref={root} className={cn("json-viewer", className)} data-mode={json ? mode : "raw"} onKeyDown={event => {
    // The library owns arrow navigation; make its role=button arrows also obey
    // the usual Enter/Space activation contract without introducing a tree controller.
    if ((event.key === "Enter" || event.key === " ") && event.target instanceof HTMLElement && event.target.matches(".json-viewer-arrow")) {
      event.preventDefault(); event.target.click();
    }
  }}>
    <div className="json-viewer-toolbar">
      {json && <div role="group" aria-label={`${label}阅读模式`} className="json-viewer-modes">
        <Button variant="ghost" size="xs" aria-pressed={mode === "tree"} onClick={() => select("tree")}>结构化</Button>
        <Button variant="ghost" size="xs" aria-pressed={mode === "raw"} onClick={() => select("raw")}>原文</Button>
      </div>}
      {json && <span className="json-viewer-summary">{reading.summary}</span>}
      {showCopy && <Button variant="ghost" size="xs" className="json-viewer-copy" aria-label={`复制${label}`} onClick={copy}>复制</Button>}
    </div>
    {!ready && <div className="json-viewer-hint">
      <span>内容较大，先展示完整原文。</span>
      <Button variant="ghost" size="sm" onClick={() => { beforeChange(); setRequested(true); }}>查看结构</Button>
    </div>}
    {reading?.kind === "limited" && <p className="json-viewer-hint" role="status">{JSON_TREE_LIMIT_MESSAGE}</p>}
    {json && mode === "tree"
      ? <JsonView data={reading.value as object} style={treeStyle} shouldExpandNode={initiallyExpandJson}
          aria-label={label} beforeExpandChange={() => { beforeChange(); return true; }} />
      : <pre aria-label={label} className={cn("json-viewer-raw", !json && "json-viewer-text")}>{source || "（无内容）"}</pre>}
  </div>;
}
