import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { AppSelect } from "@/components/ui/app-select";
import { SelectContent, SelectItem } from "@/components/ui/select";

describe("AppSelect", () => {
  it("renders an accessible, business-agnostic selected value on shared select primitives", () => {
    const html = renderToStaticMarkup(
      <AppSelect
        value="second"
        options={[
          { value: "first", label: "First option" },
          { value: "second", label: "Second option" },
        ]}
        onValueChange={vi.fn()}
        ariaLabel="Choose an option"
      />,
    );

    expect(html).toContain('data-slot="select-trigger"');
    expect(html).toContain('data-surface="solid"');
    expect(html).toContain("mist-solid");
    expect(html).toContain('aria-label="Choose an option"');
    expect(html).toContain("Second option");
    expect(html).not.toMatch(/importance|memory|model/i);
  });

  it("renders a translucent trigger without changing its accessible value", () => {
    const html = renderToStaticMarkup(
      <AppSelect
        value="first"
        options={[{ value: "first", label: "First option" }]}
        onValueChange={vi.fn()}
        ariaLabel="Choose a translucent option"
        surface="translucent"
      />,
    );

    expect(html).toContain('aria-label="Choose a translucent option"');
    expect(html).toContain('data-surface="translucent"');
    expect(html).toContain("border-border-strong/50");
    expect(html).toContain("bg-background/25");
    expect(html).toContain("h-11");
    expect(html).toContain("min-h-11");
    expect(html).toContain("text-xs");
    expect(html).toContain("leading-5");
    expect(html).toContain("shadow-none");
    expect(html).toContain("focus-visible:outline-none!");
    expect(html).toContain("focus-visible:ring-2");
    expect(html).toContain("focus-visible:ring-ring/20");
    expect(html).not.toContain("focus-visible:ring-3");
    expect(html).not.toContain("focus-visible:ring-ring/50");
    expect(html).not.toContain("mist-solid");
  });

  it("keeps the dropdown on the strong glass surface", () => {
    const popup = findElementBySlot(
      SelectContent({
        children: <SelectItem value="first">First option</SelectItem>,
      }),
      "select-content",
    );

    expect(popup?.props.className).toContain("mist-glass-strong");
  });
});

function findElementBySlot(
  node: ReactNode,
  slot: string,
): ReactElement<{
  readonly children?: ReactNode;
  readonly className?: string;
  readonly "data-slot"?: string;
}> | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<{
      readonly children?: ReactNode;
      readonly className?: string;
      readonly "data-slot"?: string;
    }>(child)) {
      continue;
    }
    if (child.props["data-slot"] === slot) return child;
    const nested = findElementBySlot(child.props.children, slot);
    if (nested) return nested;
  }
  return undefined;
}
