import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Button, buttonVariants } from "./button";
import { FilterChip, SegmentedControlItem } from "./selection-control";
import { AppSelect } from "./app-select";
import { Input } from "./input";
import { Textarea } from "./textarea";
import { SelectContent, SelectItem } from "./select";

describe("Control interaction and density contracts", () => {
  it("reserves the action label while loading, disables activation and keeps an accessible name", () => {
    const html = renderToStaticMarkup(<Button loading>保存配置</Button>);
    expect(html).toContain('disabled=""');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("opacity-0");
    expect(html).not.toContain("invisible");
    expect(html).toContain("保存配置");
    expect(html).toContain("motion-reduce:animate-none");
    expect(renderToStaticMarkup(<Button disabled aria-busy>核对中</Button>)).toContain('aria-busy="true"');
  });

  it("uses real theme tokens for primary/secondary states and keeps compact toolbar dimensions", () => {
    const primary = buttonVariants();
    expect(primary).toContain("hover:bg-primary-hover active:bg-primary-active");
    expect(primary).toContain("min-h-9");
    expect(primary).not.toMatch(/(?:^|\s)h-\d/);
    expect(buttonVariants({ variant: "secondary" })).toContain("hover:bg-secondary-hover");
    expect(buttonVariants({ variant: "secondary" })).not.toContain("var(--secondary)");
    expect(buttonVariants({ size: "icon-xs" })).toContain("size-6");
    expect(buttonVariants({ size: "icon-sm" })).toContain("size-7");
    expect(buttonVariants({ size: "sm" })).toContain("min-h-7");
  });

  it("keeps filtering and date switching distinct, with one accessible button per target", () => {
    const filter = renderToStaticMarkup(<FilterChip selected>今天</FilterChip>);
    const segment = renderToStaticMarkup(<SegmentedControlItem selected>今天</SegmentedControlItem>);
    for (const html of [filter, segment]) {
      expect(html.match(/<button\b/g)).toHaveLength(1);
      expect(html).toContain('aria-pressed="true"');
      expect(html).toContain("min-h-11");
      expect(html).toContain("min-h-9");
      expect(html).toContain("whitespace-normal");
      expect(html).not.toContain("absolute");
    }
    expect(filter).toContain("border-primary/45 bg-primary/12 text-primary-ink");
    expect(filter).toContain("group-hover/button:bg-primary/18");
    expect(segment).toContain("border-primary bg-primary text-primary-foreground");
    expect(segment).toContain("group-hover/button:bg-primary-hover");
    const inactive = renderToStaticMarkup(<FilterChip selected={false} disabled>电脑</FilterChip>);
    expect(inactive).toContain('aria-pressed="false"');
    expect(inactive).toContain('disabled=""');
  });

  it("keeps input size attributes native, offers opt-in density and leaves multiline editors in control of height", () => {
    const input = renderToStaticMarkup(<Input size={12} controlSize="compact" disabled aria-invalid aria-label="名称" />);
    expect(input).toContain('size="12"');
    expect(input).toContain('data-control-size="compact"');
    expect(input).toContain("min-h-8");
    expect(input).toContain('disabled=""');
    expect(input).toContain('aria-invalid="true"');
    const editor = renderToStaticMarkup(<Textarea rows={12} controlSize="comfortable" aria-label="正文" />);
    expect(editor).toContain('rows="12"');
    expect(editor).not.toContain("min-h-11");
  });

  it("forwards only enabled choices from the current option set", () => {
    const change = vi.fn();
    const options = [{ value: "one", label: "一" }, { value: "two", label: "二", disabled: true }];
    const props = { value: "one", options, onValueChange: change, ariaLabel: "分类" };
    const select = AppSelect(props);
    for (const value of [null, "missing", "two"]) select.props.onValueChange(value);
    expect(change).not.toHaveBeenCalled();
    select.props.onValueChange("one");
    expect(change).toHaveBeenCalledExactlyOnceWith("one");
    change.mockClear();
    AppSelect({ ...props, disabled: true }).props.onValueChange("one");
    expect(change).not.toHaveBeenCalled();
  });

  it("retains full long labels while constraining the trigger and wrapping popup options", () => {
    const label = "这是一个较长的地点分类".repeat(8);
    const html = renderToStaticMarkup(<AppSelect value="one" options={[{ value: "one", label }]} ariaLabel="分类" onValueChange={vi.fn()} />);
    expect(html).toContain(label);
    expect(html).toContain(`title="${label}"`);
    expect(html).toContain("min-w-0 truncate");
    const item = SelectItem({ value: "one", children: label });
    expect(item.props.children[0].props.className).toContain("whitespace-normal");
    expect(item.props.children[0].props.className).toContain("[overflow-wrap:anywhere]");
    const form = AppSelect({ value: "one", options: [{ value: "one", label }], ariaLabel: "类型", onValueChange: vi.fn(), contentClassName: "text-sm" });
    const formOptions = form.props.children[1];
    expect(formOptions.props.className).toContain("text-sm");
    expect(formOptions.props.className).not.toContain("text-xs");
    expect(formOptions.props.children[0].props.className).toContain("text-[length:inherit]");
    const popup = SelectContent({}).props.children.props.children;
    expect(popup.props.className).toContain("max-w-[min(var(--available-width),calc(100vw-2rem))]");
  });
});
