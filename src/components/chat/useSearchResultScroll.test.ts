import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  centerSelectedSearchResult,
  useSearchResultScroll,
} from "./useSearchResultScroll";
import { hookSession } from "./test-utils/hook-session";

vi.mock("react", async (original) => {
  const actual = await original<typeof React>();
  return {
    ...actual,
    ...Object.fromEntries(
      [
        "useState",
        "useRef",
        "useEffect",
        "useLayoutEffect",
        "useCallback",
        "useId",
      ].map((key) => [key, vi.fn(actual[key as keyof typeof actual] as never)]),
    ),
  };
});
afterEach(() => vi.restoreAllMocks());

function geometry() {
  let offset = 600,
    height = 80,
    available = true;
  const list = {
    scrollTop: 200,
    scrollHeight: 1000,
    clientHeight: 200,
    clientTop: 0,
    getBoundingClientRect: () => ({ top: 100 }),
    querySelector: vi.fn(() =>
      available
        ? {
            getBoundingClientRect: () => ({
              top: 100 + offset - list.scrollTop,
              height,
            }),
          }
        : null,
    ),
  };
  return {
    list: list as unknown as HTMLDivElement,
    row: (next: number, size = 80) => {
      offset = next;
      height = size;
    },
    missing: () => {
      available = false;
    },
  };
}

describe("search result list selection", () => {
  it("centers the selected row in its own viewport", () => {
    const g = geometry();
    centerSelectedSearchResult(g.list);
    expect(g.list.scrollTop).toBe(540);
    expect(g.list.querySelector).toHaveBeenCalledWith(
      '[role="listitem"][aria-current="true"]',
    );
  });
  it("clamps first/last rows and keeps oversized rows readable from the top", () => {
    const g = geometry();
    g.row(0);
    centerSelectedSearchResult(g.list);
    expect(g.list.scrollTop).toBe(0);
    g.row(920);
    centerSelectedSearchResult(g.list);
    expect(g.list.scrollTop).toBe(800);
    g.row(300, 280);
    centerSelectedSearchResult(g.list);
    expect(g.list.scrollTop).toBe(296);
  });
  it("does nothing for a missing selection or a hidden list", () => {
    const g = geometry();
    g.missing();
    centerSelectedSearchResult(g.list);
    expect(g.list.scrollTop).toBe(200);
    const hidden = geometry();
    Object.defineProperty(hidden.list, "clientHeight", { value: 0 });
    centerSelectedSearchResult(hidden.list);
    expect(hidden.list.querySelector).not.toHaveBeenCalled();
    centerSelectedSearchResult(null);
    expect(g.list.scrollTop).toBe(200);
  });
  it("follows next/previous selection changes without snapping back on result appends or close", () => {
    const g = geometry();
    let selected = "a",
      open = true;
    const hooks = hookSession(() => useSearchResultScroll(open, selected));
    hooks.render().current = g.list;
    hooks.commit();
    expect(g.list.scrollTop).toBe(540);
    g.list.scrollTop = 170;
    hooks.render();
    hooks.commit();
    expect(g.list.scrollTop).toBe(170);
    selected = "b";
    g.row(800);
    hooks.render();
    hooks.commit();
    expect(g.list.scrollTop).toBe(740);
    selected = "a";
    g.row(600);
    hooks.render();
    hooks.commit();
    expect(g.list.scrollTop).toBe(540);
    open = false;
    selected = "c";
    g.row(920);
    hooks.render();
    hooks.commit();
    expect(g.list.scrollTop).toBe(540);
    hooks.dispose();
  });
});
