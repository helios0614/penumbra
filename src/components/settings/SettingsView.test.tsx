import { readFileSync } from "node:fs"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { SettingsView } from "@/components/settings/SettingsView"

const settingsViewSource = readFileSync(
  new URL("./SettingsView.tsx", import.meta.url),
  "utf8",
)

describe("SettingsView page header", () => {
  it("uses the shared header without changing its copy or controls", () => {
    const html = renderToStaticMarkup(<SettingsView onBack={vi.fn()} />)
    const pageHeader = html.match(
      /<header[^>]*data-slot="page-header"[^>]*>/,
    )?.[0]
    const actions = html.match(
      /<div[^>]*data-slot="page-header-actions"[^>]*>/,
    )?.[0]

    expect(html).toMatch(/<div[^>]*aria-labelledby="settings-page-title"[^>]*>/)
    expect(pageHeader).toContain("mist-glass")
    expect(html).toContain('<h1 id="settings-page-title"')
    expect(html).toContain("Settings")
    expect(html).toContain("设置")
    expect(html).toContain("设备外观偏好与安全只读运行状态。")
    expect(actions).toBeDefined()
    expect(html.match(/data-slot="page-header-action"/g)).toHaveLength(2)
    expect(html).toContain('aria-label="正在重新加载设置状态"')
    expect(html).toContain('aria-label="返回桌面"')
    expect(html).toContain("界面外观")
    expect(html).toContain("桌面背景")
    expect(html).toContain("运行状态概览")
  })

  it("keeps refresh and close wired to their existing callbacks", () => {
    expect(settingsViewSource).toContain("onClick={reloadOverview}")
    expect(settingsViewSource).toContain("onClick={onBack}")

    const html = renderToStaticMarkup(<SettingsView />)
    expect(html.match(/data-slot="page-header-action"/g)).toHaveLength(1)
    expect(html).not.toContain('aria-label="返回桌面"')
  })
})
