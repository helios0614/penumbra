import { ArrowLeft, Plus } from "lucide-react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { PageHeader, PageHeaderAction } from "@/components/ui/page-header"

describe("PageHeader", () => {
  it("renders the shared functional-page hierarchy without requiring actions", () => {
    const html = renderToStaticMarkup(
      <PageHeader
        eyebrow="Memories"
        title="记忆库"
        titleId="memory-page-title"
        description="那些留下来的片段，会在需要时重新浮上来。"
      />,
    )
    const header = html.match(/<header[^>]*data-slot="page-header"[^>]*>/)?.[0]
    const eyebrow = html.match(/<p[^>]*data-slot="page-header-eyebrow"[^>]*>/)?.[0]
    const heading = html.match(/<h1[^>]*id="memory-page-title"[^>]*>/)?.[0]

    expect(header).toContain("mist-glass")
    expect(header).toContain("rounded-[24px]")
    expect(header).toContain("py-3.5")
    expect(header).toContain("sm:py-4")
    expect(eyebrow).toContain("font-decorative")
    expect(eyebrow).toContain("font-normal")
    expect(eyebrow).toContain("uppercase")
    expect(eyebrow).not.toContain("font-medium")
    expect(heading).toContain("text-xl")
    expect(html).toContain("Memories")
    expect(html).toContain("记忆库")
    expect(html).toContain("那些留下来的片段，会在需要时重新浮上来。")
    expect(html).toContain("text-[13px]")
    expect(html).toContain("leading-5")
    expect(html).not.toContain('data-slot="page-header-actions"')
  })

  it("lays out one or multiple actions through the same slot", () => {
    const oneAction = renderHeaderWithActions(
      <PageHeaderAction aria-label="返回桌面">
        <ArrowLeft />
      </PageHeaderAction>,
    )
    const multipleActions = renderHeaderWithActions(
      <>
        <PageHeaderAction aria-label="添加记忆">
          <Plus />
        </PageHeaderAction>
        <PageHeaderAction aria-label="返回桌面">
          <ArrowLeft />
        </PageHeaderAction>
      </>,
    )

    expect(oneAction).toContain('data-slot="page-header-actions"')
    expect(oneAction.match(/data-slot="page-header-action"/g)).toHaveLength(1)
    expect(multipleActions.match(/data-slot="page-header-action"/g)).toHaveLength(2)
    expect(multipleActions).toContain('aria-label="添加记忆"')
    expect(multipleActions).toContain('aria-label="返回桌面"')
  })
})

describe("PageHeaderAction", () => {
  it("keeps a 44px hit target around the shared 36px visual surface", () => {
    const html = renderToStaticMarkup(
      <PageHeaderAction aria-label="返回桌面" disabled>
        <ArrowLeft className="size-8" />
      </PageHeaderAction>,
    )
    const button = html.match(/<button[^>]*data-slot="page-header-action"[^>]*>/)?.[0]

    expect(button).toContain("size-11")
    expect(button).toContain("before:inset-1")
    expect(button).toContain("before:rounded-xl")
    expect(button).toContain("before:border-border-strong/50")
    expect(button).toContain("before:bg-background/25")
    expect(button).toContain("before:shadow-sm")
    expect(button).toContain("hover:before:border-primary/30")
    expect(button).toContain("hover:before:bg-primary/10")
    expect(button).toContain("active:before:bg-primary/15")
    expect(button).toContain("[&amp;_svg]:size-4!")
    expect(button).toContain("focus-visible:outline-none!")
    expect(button).toContain("focus-visible:ring-2")
    expect(button).toContain("disabled=")
    expect(button).toContain('aria-label="返回桌面"')
    expect(button).toContain('title="返回桌面"')
  })

  it("gives every header icon action the same button recipe and preserves behavior", () => {
    const onBack = vi.fn()
    const action = PageHeaderAction({
      "aria-label": "返回桌面",
      onClick: onBack,
      children: <ArrowLeft />,
    })
    const html = renderToStaticMarkup(
      <>
        <PageHeaderAction aria-label="重新加载">
          <Plus />
        </PageHeaderAction>
        <PageHeaderAction aria-label="返回桌面">
          <ArrowLeft />
        </PageHeaderAction>
      </>,
    )
    const buttonClasses = Array.from(
      html.matchAll(/<button[^>]*data-slot="page-header-action"[^>]*>/g),
      (match) => match[0].match(/class="([^"]+)"/)?.[1],
    )

    expect(action.props.onClick).toBe(onBack)
    expect(action.props.variant).toBe("ghost")
    expect(action.props.size).toBe("icon-lg")
    expect(buttonClasses).toHaveLength(2)
    expect(buttonClasses[0]).toBe(buttonClasses[1])
  })
})

function renderHeaderWithActions(actions: React.ReactNode) {
  return renderToStaticMarkup(
    <PageHeader
      eyebrow="Settings"
      title="设置"
      description="设备外观偏好与安全只读运行状态。"
      actions={actions}
    />,
  )
}
