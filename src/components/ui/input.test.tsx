import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Input } from "@/components/ui/input";

describe("Input", () => {
  it("keeps the stable surface as the default", () => {
    const html = renderToStaticMarkup(<Input aria-label="Default input" />);

    expect(html).toContain('aria-label="Default input"');
    expect(html).toContain('data-surface="solid"');
    expect(html).toContain("mist-solid");
    expect(html).not.toContain("bg-background/25");
  });

  it("renders a translucent, accessible surface without the stable surface", () => {
    const html = renderToStaticMarkup(
      <Input aria-label="Translucent input" surface="translucent" />,
    );

    expect(html).toContain('aria-label="Translucent input"');
    expect(html).toContain('data-surface="translucent"');
    expect(html).toContain("border-border-strong/50");
    expect(html).toContain("bg-background/25");
    expect(html).not.toContain("mist-solid");
  });

  it("uses one restrained focus-visible ring without the global outline stacking", () => {
    const html = renderToStaticMarkup(<Input aria-label="Focused input" />);

    expect(html).toContain("focus-visible:border-ring/55");
    expect(html).toContain("focus-visible:outline-none!");
    expect(html).toContain("focus-visible:ring-2");
    expect(html).toContain("focus-visible:ring-ring/20");
    expect(html).not.toContain("focus-visible:ring-3");
    expect(html).not.toContain("focus-visible:ring-ring/50");
  });
});
