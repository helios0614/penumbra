import { memo, useState, useCallback } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── 辅助函数 ───

/**
 * 从 ReactNode 中提取纯文本内容
 * 解决 rehype-highlight 转换后 children 成为 React elements 的问题
 */
function getNodeText(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(getNodeText).join('');
  }

  if (node && typeof node === 'object' && 'props' in node) {
    const element = node as React.ReactElement<{ children?: React.ReactNode }>;
    const props = element.props;
    if (props.children) {
      return getNodeText(props.children);
    }
  }

  return '';
}

// ─── 代码块（带复制按钮）───

interface CodeBlockProps extends React.HTMLAttributes<HTMLElement> {
  children?: React.ReactNode;
  previewMarkdownCode?: boolean; // 控制是否递归渲染 Markdown 代码块
}

function CodeBlock({
  className,
  children,
  previewMarkdownCode = true,
  ...props
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  // 提取原始代码文本，避免 [object Object] 问题
  const rawCode = getNodeText(children).replace(/\n$/, '');

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(rawCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [rawCode]);

  // Extract language from className (e.g., "hljs language-markdown" -> "markdown")
  const languageMatch = className && /language-([\w-]+)/.exec(className);
  const language = languageMatch?.[1] || "";
  const displayLanguage = language === "markdown" || language === "md" ? "Markdown" : language || "Code";

  // 内联代码（没有 language-xxx class）
  if (!language) {
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

  if (shouldPreviewMarkdown) {
    return (
      <div className="ai-code-block group relative my-2 overflow-hidden rounded-lg border border-ai-foreground/15 bg-ai shadow-sm">
        <div className="flex items-center justify-between border-b border-ai-foreground/15 bg-ai-active px-4 py-2 text-xs text-ai-foreground/70">
          <span>{displayLanguage}</span>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 rounded-sm px-1 py-0.5 text-ai-foreground/70 transition-colors hover:bg-ai-foreground/10 hover:text-ai-foreground"
            aria-label="复制代码"
          >
            {copied ? (
              <>
                <Check className="size-3" />
                <span>已复制</span>
              </>
            ) : (
              <>
                <Copy className="size-3" />
                <span>复制</span>
              </>
            )}
          </button>
        </div>
        <div className="bg-ai p-4 text-sm text-ai-foreground">
          <div className="markdown-preview">
            <MarkdownRenderer content={rawCode} previewMarkdownCode={false} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ai-code-block group relative my-2 overflow-hidden rounded-lg border border-ai-foreground/15 bg-ai shadow-sm">
      <div className="flex items-center justify-between border-b border-ai-foreground/15 bg-ai-active px-4 py-2 text-xs text-ai-foreground/70">
        <span>{displayLanguage}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 rounded-sm px-1 py-0.5 text-ai-foreground/70 transition-colors hover:bg-ai-foreground/10 hover:text-ai-foreground"
          aria-label="复制代码"
        >
          {copied ? (
            <>
              <Check className="size-3" />
              <span>已复制</span>
            </>
          ) : (
            <>
              <Copy className="size-3" />
              <span>复制</span>
            </>
          )}
        </button>
      </div>
      <pre className="m-0 max-w-full overflow-x-auto whitespace-pre-wrap break-all bg-ai p-4 text-sm leading-relaxed text-ai-foreground">
        <code className={className} {...props}>
          {children}
        </code>
      </pre>
    </div>
  );
}

// ─── Markdown 渲染器 ───

interface MarkdownRendererProps {
  content: string;
  className?: string;
  previewMarkdownCode?: boolean; // 控制是否预览 Markdown 代码块，默认 true
}

function MarkdownRendererInner({ content, className, previewMarkdownCode = true }: MarkdownRendererProps) {
  return (
    <div
      className={cn(
        // 基础排版
        "text-[14px] leading-[1.6]",
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
        // 分割线 - minimal styling, low profile
        "[&_hr]:my-2 [&_hr]:border-0 [&_hr]:border-t [&_hr]:border-border/40 [&_hr]:h-px",
        // 图片
        "[&_img]:max-w-full [&_img]:rounded-lg [&_img]:my-2",
        className,
      )}
    >
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          code: (props: any) => <CodeBlock {...props} previewMarkdownCode={previewMarkdownCode} />,
          hr: () => null, // 不渲染 <hr>，避免空白块
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}

export const MarkdownRenderer = memo(MarkdownRendererInner);
