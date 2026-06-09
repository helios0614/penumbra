import { memo, useState, useCallback } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── 代码块（带复制按钮）───

function CodeBlock({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const code = String(children).replace(/\n$/, "");

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  // 内联代码（没有 language-xxx class）
  if (!className?.includes("language-")) {
    return (
      <code
        className="bg-surface-secondary text-foreground px-1.5 py-0.5 rounded-sm text-[13px] font-mono"
        {...props}
      >
        {children}
      </code>
    );
  }

  return (
    <div className="relative group my-2">
      <div className="flex items-center justify-between bg-[#1e1e1e] text-muted-foreground text-xs px-4 py-2 rounded-t-lg">
        <span>{className.replace("language-", "")}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
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
      <pre className="bg-[#1e1e1e] text-[#d4d4d4] p-4 rounded-b-lg overflow-x-hidden text-sm leading-relaxed whitespace-pre-wrap break-words">
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
}

function MarkdownRendererInner({ content, className }: MarkdownRendererProps) {
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
        // 分割线
        "[&_hr]:my-4 [&_hr]:border-border",
        // 图片
        "[&_img]:max-w-full [&_img]:rounded-lg [&_img]:my-2",
        className,
      )}
    >
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          code: CodeBlock as React.ComponentType<React.HTMLAttributes<HTMLElement>>,
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}

export const MarkdownRenderer = memo(MarkdownRendererInner);
