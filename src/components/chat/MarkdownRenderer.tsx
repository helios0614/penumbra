import {
  isValidElement,
  useContext,
  memo,
  type ComponentProps,
  type ReactNode,
} from "react";
import Markdown, { type Components, type ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Copy } from "lucide-react";
import { cn } from "@/lib/utils";

import { useCopyFeedback } from "./copy-feedback";
import { markdownImageResource } from "@/domain/media/media-resources";
import { MediaImage } from "@/components/media/MediaImage";
import { SearchHighlightContext, rehypeSearchHighlight } from "./search-highlight";
import { definitionLinks } from "./markdown-presentation";
import "./markdown.css";

// ─── 辅助函数 ───

/**
 * 从 ReactNode 中提取纯文本内容
 * 解决 rehype-highlight 转换后 children 成为 React elements 的问题
 */
function getNodeText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(getNodeText).join("");
  }

  if (isValidElement<{ children?: ReactNode }>(node)) {
    return getNodeText(node.props.children);
  }

  return "";
}

// ─── 代码块（带复制按钮）───

type MarkdownCodeProps = ComponentProps<"code"> & ExtraProps;
type MarkdownPreProps = ComponentProps<"pre"> & ExtraProps;

interface CodeBlockOptions {
  isBlock?: boolean;
  previewMarkdownCode?: boolean; // 控制是否递归渲染 Markdown 代码块
}

type CodeBlockProps = MarkdownCodeProps & CodeBlockOptions;

function CodeBlock({
  className,
  children,
  isBlock = false,
  previewMarkdownCode = true,
  node: _node,
  ...props
}: CodeBlockProps) {

  // 提取原始代码文本，避免 [object Object] 问题
  const rawCode = getNodeText(children).replace(/\n$/, "");

  const handleCopy = useCopyFeedback(rawCode);

  // Extract language from className (e.g., "hljs language-markdown" -> "markdown")
  const languageMatch = className && /language-([\w-]+)/.exec(className);
  const language = languageMatch?.[1] || "";
  const displayLanguage = language === "markdown" || language === "md" ? "Markdown" : language || "Code";

  if (!isBlock) {
    return (
      <code
        className="rounded-sm border border-ai/20 bg-ai/15 px-1.5 py-0.5 font-mono text-[13px] text-current"
        {...props}
      >
        {children}
      </code>
    );
  }

  // Markdown code block - render nested Markdown preview (仅在允许递归时)
  const shouldPreviewMarkdown = (language === "markdown" || language === "md") && previewMarkdownCode;

  return (
    <div className="ai-code-block">
      <div data-chat-non-body className="ai-code-toolbar">
        <span>{displayLanguage}</span>
        <button type="button" onClick={() => void handleCopy()} className="ai-code-copy" aria-label="复制代码">
          <Copy className="size-3" aria-hidden="true" /><span>复制</span>
        </button>
      </div>
      {shouldPreviewMarkdown ? (
        <div className="ai-code-preview"><div className="markdown-preview">
          <MarkdownRenderer content={rawCode} previewMarkdownCode={false} />
        </div></div>
      ) : (
        <pre className="markdown-scroll m-0 max-w-full overflow-x-auto whitespace-pre font-mono text-sm leading-relaxed">
          <code className={className} {...props}>{children}</code>
        </pre>
      )}
    </div>
  );
}

interface MarkdownPreRendererProps extends MarkdownPreProps {
  previewMarkdownCode: boolean;
}

function MarkdownPre({
  children,
  node,
  previewMarkdownCode,
  ...props
}: MarkdownPreRendererProps) {
  const hasSingleCodeChild =
    node?.children.length === 1 &&
    node.children[0].type === "element" &&
    node.children[0].tagName === "code";

  // react-markdown 将块级代码生成为 <pre><code>，内联代码则只有 <code>。
  // 由父节点判定块级语义，因此无语言 fence 也不会被误判成内联代码。
  if (hasSingleCodeChild && isValidElement<MarkdownCodeProps>(children)) {
    return (
      <CodeBlock
        {...children.props}
        isBlock
        previewMarkdownCode={previewMarkdownCode}
      />
    );
  }

  return <pre {...props}>{children}</pre>;
}

// ─── Markdown 渲染器 ───

interface MarkdownRendererProps {
  content: string;
  className?: string;
  previewMarkdownCode?: boolean; // 控制是否预览 Markdown 代码块，默认 true
}

function MarkdownRendererInner({ content, className, previewMarkdownCode = true }: MarkdownRendererProps) {
  const search=useContext(SearchHighlightContext);
  const components: Components = {
    table: ({ children, node: _node, ...props }) => (
      <div data-markdown-table-scroll tabIndex={0} role="region" aria-label="表格，可横向滚动"
        className="markdown-scroll max-w-full overflow-x-auto overscroll-x-contain">
        <table {...props}>{children}</table>
      </div>
    ),
    img: ({ src, alt }) => {
      const url = markdownImageResource(src);
      return url ? <MediaImage image={{ url, label: alt || "正文图片" }} /> : <span className="text-xs text-muted-strong">[图片引用不可用]</span>;
    },
    code: (props) => (
      <CodeBlock {...props} previewMarkdownCode={previewMarkdownCode} />
    ),
    pre: (props) => (
      <MarkdownPre {...props} previewMarkdownCode={previewMarkdownCode} />
    ),
    hr: () => <hr />,
  };

  return (
    <div
      className={cn(
        // 基础排版
        "chat-markdown text-[14px] leading-[1.6]",
        // 标题
        "[&_h1]:text-xl [&_h1]:font-semibold [&_h1]:m-0",
        "[&_h2]:text-lg [&_h2]:font-semibold [&_h2]:m-0",
        "[&_h3]:text-base [&_h3]:font-semibold [&_h3]:m-0",
        // 段落
        "[&_p]:my-0",
        // 列表
        "[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2",
        "[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-2",
        "[&_li]:my-0.5",
        // 链接
        "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2",
        "[&_a]:hover:text-primary-hover",
        // 引用
        "[&_blockquote]:border-l-2 [&_blockquote]:border-primary",
        "[&_blockquote]:pl-3 [&_blockquote]:my-2",
        "[&_blockquote]:text-muted-foreground [&_blockquote]:italic",
        // 表格
        "[&_table]:w-full [&_table]:my-2",
        "[&_th]:text-left [&_th]:py-1.5 [&_th]:px-2 [&_th]:border-b [&_th]:border-border",
        "[&_td]:py-1.5 [&_td]:px-2 [&_td]:border-b [&_td]:border-border",
        // 图片
        "[&_img]:max-w-full [&_img]:rounded-lg [&_img]:my-2",
        className,
      )}
    >
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight, [rehypeSearchHighlight, { query: search.active ? search.bodyQueries ?? search.query : "" }]]}
        components={components}
      >
        {content}
      </Markdown>
    </div>
  );
}

export const MarkdownRenderer = memo(MarkdownRendererInner);

/** Only Bubble's whole-message definition fallback opts into this view.
 * Mixed Markdown continues to use normal (hidden) definition semantics. */
export function MarkdownDefinitionLinks({ content }: { content: string }) {
  return <div className="chat-definition-links">
    {definitionLinks(content).map(({ label, href }, index) => <div key={index}>
      {href ? <a className="chat-definition-link" href={href}>
        <span className="chat-definition-label">{label}</span>
        <span className="chat-definition-url">{href}</span>
      </a> : <span className="chat-definition-unavailable">{label} · 链接不可用</span>}
    </div>)}
  </div>;
}
