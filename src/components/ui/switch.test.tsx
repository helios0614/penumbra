import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Switch } from "./switch";

describe("Shared controlled Switch", () => {
  it.each([true, false])("requests a change without changing its controlled value (%s)", (checked) => {
    const change = vi.fn();
    const toggle = Switch({ checked, onCheckedChange: change, "aria-label": "定位" });
    toggle.props.onClick?.({} as never);
    expect(change).toHaveBeenCalledExactlyOnceWith(!checked);
    expect(toggle.props["aria-checked"]).toBe(checked);
    // Native button activation supplies Space/Enter, without double key handlers.
    expect(toggle.props.type).toBe("button");
    expect(toggle.props.onKeyDown).toBeUndefined();
  });

  it.each([{ disabled: true }, { busy: true }, { disabled: true, busy: true }])("blocks changes for %o", (state) => {
    const change = vi.fn();
    const toggle = Switch({ checked: false, onCheckedChange: change, "aria-label": "定位", ...state });
    expect(toggle.props.disabled).toBe(true);
    toggle.props.onClick?.({} as never);
    expect(change).not.toHaveBeenCalled();
    const html = renderToStaticMarkup(toggle);
    expect(html).toContain('disabled=""');
    if (state.busy) {
      expect(html).toContain('aria-busy="true"');
      expect(html).toContain("motion-reduce:animate-none");
    }
  });

  it("supports an associated visible label, a stable small track and reduced motion", () => {
    const html = renderToStaticMarkup(<>
      <label id="quiet-label" htmlFor="quiet">静默时段</label>
      <Switch id="quiet" aria-labelledby="quiet-label" checked onCheckedChange={vi.fn()} />
    </>);
    expect(html).toContain('for="quiet"');
    expect(html).toContain('id="quiet"');
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-labelledby="quiet-label"');
    expect(html).toContain('aria-checked="true"');
    expect(html).not.toContain('type="checkbox"');
    expect(html).toContain("h-6 w-11");
    expect(html).toContain("motion-reduce:transition-none");
  });
});
