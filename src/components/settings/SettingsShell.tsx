import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { ArrowLeft, ArrowUpRight, ChevronRight, X } from "lucide-react";
import { PageHeader, PageHeaderAction } from "@/components/ui/page-header";
import { PageScrollArea } from "@/components/ui/page-scroll-area";
import { cn } from "@/lib/utils";
import { backSettingsPage, pushSettingsPage, readSettingsPath } from "./settings-navigation";

export interface SettingsPageContext {
  readonly active: boolean;
  readonly navigate: (pageId: string) => void;
  readonly goBack: () => void;
}

export interface SettingsPage {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly icon: ComponentType<{ className?: string }>;
  readonly render: (context: SettingsPageContext) => ReactNode;
  /** Fill the available height when the page owns its internal scrolling. */
  readonly layout?: "fill";
  /** Nested pages reuse the shell and return stack without adding a category. */
  readonly nested?: boolean;
  readonly parentId?: string;
}

const plannedCategories = ["服务集成", "MCP 工具（独立页面）", "高级设置"];

/** Desktop hosts own the Settings route; categories use history state without storing drafts. */
export function SettingsShell({ pages, onClose }: {
  readonly pages: readonly SettingsPage[];
  readonly onClose?: () => void;
}) {
  const [path, setPath] = useState<readonly string[]>(() => typeof window === "undefined" ? [] : readSettingsPath(window.history.state, pages.map(page => page.id)));
  const titleRef = useRef<HTMLHeadingElement>(null);
  const categoryRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const activeId = path[path.length - 1];
  const pathRef = useRef(path);
  pathRef.current = path;
  const activePage = pages.find(page => page.id === activeId);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const pop = () => {
      const previousId = pathRef.current[pathRef.current.length - 1];
      const next = readSettingsPath(window.history.state, pages.map(page => page.id));
      setPath(next);
      requestAnimationFrame(() => {
        if (next.length === 0 && previousId) categoryRefs.current[previousId]?.focus();
        else titleRef.current?.focus();
      });
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, [pages]);
  const changePath = (next: readonly string[]) => {
    if (typeof window !== "undefined") pushSettingsPage(window, next);
    setPath(next);
  };
  const navigate = (pageId: string) => {
    if (!pages.some(page => page.id === pageId) || pageId === activeId) return;
    changePath([...path, pageId]);
    requestAnimationFrame(() => titleRef.current?.focus());
  };
  const goBack = () => {
    if (typeof window !== "undefined" && backSettingsPage(window)) return;
    setPath(previous => previous.slice(0, -1));
    requestAnimationFrame(() => {
      if (path.length <= 1 && activeId) categoryRefs.current[activeId]?.focus();
      else titleRef.current?.focus();
    });
  };

  return <div className="mx-auto flex h-full min-h-0 w-full max-w-6xl flex-col overflow-hidden" aria-labelledby="settings-page-title">
    <PageHeader eyebrow="Settings" title="设置" titleId="settings-page-title"
      description="本机外观、API 连接、功能分配与运行状态。"
      actions={onClose && <PageHeaderAction onClick={onClose} aria-label="返回桌面"><X aria-hidden="true" /></PageHeaderAction>} />
    <div className="mt-3 flex min-h-0 flex-1 gap-4">
      <aside className={cn("mist-glass min-h-0 w-full shrink-0 rounded-[22px] md:w-52", activePage && "hidden md:block")}>
        <PageScrollArea label="设置分类" topLabel="回到分类顶部" className="h-full" contentClassName="space-y-4 pb-4">
          <nav aria-label="设置分类" className="space-y-1 p-2">
            {pages.filter(page => !page.nested).map(page => {
              const Icon = page.icon;
              return <button key={page.id} ref={element => { categoryRefs.current[page.id] = element; }} type="button"
                aria-current={(activeId === page.id || activePage?.parentId === page.id) ? "page" : undefined}
                onClick={() => {
                  if (path.length !== 1 || activeId !== page.id) changePath([page.id]);
                  requestAnimationFrame(() => titleRef.current?.focus());
                }}
                className={cn("flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring",
                  (activeId === page.id || activePage?.parentId === page.id) ? "bg-primary/12 text-primary-ink" : "text-foreground hover:bg-background/35")}>
                <Icon className="size-4 shrink-0" />
                <span className="min-w-0 flex-1"><span className="block font-medium">{page.title}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground md:hidden">{page.description}</span></span>
                <ChevronRight className="size-4 shrink-0 md:hidden" aria-hidden="true" />
              </button>;
            })}
          </nav>
          <section className="px-3" aria-label="后续分类规划">
            <p className="mb-2 text-xs font-medium text-muted-foreground">后续开放</p>
            <ul className="space-y-2 text-xs text-muted-foreground">{plannedCategories.map(label => <li key={label}>{label}</li>)}</ul>
          </section>
          <section className="border-t border-border px-3 pt-3" aria-label="其他版本">
            <a href="/" target="_top" aria-describedby="frontend-version-note"
              className="inline-flex min-h-11 items-center gap-1 text-xs font-medium text-primary-ink focus-visible:outline-2 focus-visible:outline-ring">
              返回旧版知远<ArrowUpRight className="size-3.5" aria-hidden="true" />
            </a>
            <p id="frontend-version-note" className="text-xs leading-relaxed text-muted-foreground">已保存的数据可继续读取；草稿与未保存内容不跨版本保留，生成中的任务可能继续执行。</p>
          </section>
        </PageScrollArea>
      </aside>
      <section className={cn("min-h-0 min-w-0 flex-1 flex-col", activePage ? "flex" : "hidden md:flex")} aria-label="设置页面">
        <div className={cn("mist-glass mb-3 flex shrink-0 items-center gap-2 rounded-2xl px-3 py-2", activeId === "connections" && "mb-2 px-2 py-1 md:mb-3 md:px-3 md:py-2")}>
          {activePage && <button type="button" onClick={goBack} aria-label={path.length > 1 ? "返回上级设置" : "返回设置分类"}
            className="grid size-9 shrink-0 place-items-center rounded-xl hover:bg-background/40 focus-visible:outline-2 focus-visible:outline-ring"><ArrowLeft className="size-4" aria-hidden="true" /></button>}
          <div className="min-w-0">
            <h2 ref={titleRef} tabIndex={-1} className="text-sm font-semibold text-foreground outline-none">{activePage?.title ?? "设置分类"}</h2>
            <p className={cn("text-xs text-muted-foreground", activeId === "connections" && "hidden md:block")}>{activePage?.description ?? "选择分类，查看或调整设置。"}</p>
          </div>
        </div>
        {/* Keep appearance mounted; pages with transient credentials mount only while active. */}
        {pages.map(page => page.layout === "fill" ? <div key={page.id} hidden={activeId !== page.id}
          role="region" aria-label={page.title} className="min-h-0 min-w-0 flex-1 overflow-hidden pb-4">
          {page.render({ active: activeId === page.id, navigate, goBack })}
        </div> : <PageScrollArea key={page.id} label={page.title} topLabel={`回到${page.title}顶部`}
          hidden={activeId !== page.id} contentClassName="pb-4" resetKey={activeId === page.id ? page.id : undefined}>
          {page.render({ active: activeId === page.id, navigate, goBack })}
        </PageScrollArea>)}
      </section>
    </div>
  </div>;
}
