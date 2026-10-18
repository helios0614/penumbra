import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Desktop } from "@/widgets/Desktop";
import { EditorialDesktop } from "@/components/desktop-v2/EditorialDesktop";

afterEach(() => vi.unstubAllGlobals());

function render(Page: typeof Desktop, pathname: string) {
  vi.stubGlobal("window", { location: { pathname }, innerWidth: 390 });
  return renderToStaticMarkup(<Page />);
}

describe("desktop scroll ownership", () => {
  it("bounds app viewports in both shells instead of adding an outer scroll owner", () => {
    for (const [Page, route] of [[Desktop, "/app/memory"], [EditorialDesktop, "/editorial/app/memory"]] as const) {
      const html = render(Page, route);
      expect(html).toContain('data-testid="desktop-app-view"');
      expect(html).toContain("h-dvh");
      expect(html).not.toContain("overflow-y-auto");
    }
  });
  it("keeps Editorial home scrolling and navigation while hiding its scrollbar", () => {
    const html = render(EditorialDesktop, "/editorial");
    const main = html.match(/<main[^>]*>/)?.[0];
    expect(main).toContain("scrollbar-none overflow-y-auto pb-28 sm:pb-32");
    expect(html).toContain("editorial-home");
    expect(html).not.toContain('data-testid="desktop-app-view"');
  });
  it("keeps Classic horizontal paging and its original overflow axes", () => {
    const html = render(Desktop, "/");
    expect(html).toContain("scrollbar-none desktop-home-pager");
    expect(html).toContain("snap-x snap-mandatory overflow-x-auto overflow-y-hidden");
  });
});
