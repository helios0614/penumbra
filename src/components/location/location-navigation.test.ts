import { describe, expect, it, vi } from "vitest";
import { createLocationNavigation } from "./location-navigation";

function setup() {
  const host = new EventTarget(), location = { href: "https://test.invalid/app/location" };
  let state: unknown = { penumbraApp: "location" }, dirty = true, busy = false, proceed: (() => void) | null = null;
  const history = {
    get state() { return state; },
    pushState: vi.fn((value: unknown, _unused: string, url?: string | URL | null) => { state = value; location.href = String(url); }),
    back: vi.fn(() => { state = null; location.href = "https://test.invalid/"; host.dispatchEvent(new Event("popstate")); }),
  };
  const confirm = vi.fn((action: () => void) => { proceed = action; }), discard = vi.fn(() => { dirty = false; });
  const add = vi.spyOn(host, "addEventListener");
  const guard = createLocationNavigation(Object.assign(host, { history, location }), { dirty: () => dirty, busy: () => busy, confirm, discard });
  return { host, location, history, guard, confirm, discard, add, setDirty: (next: boolean) => { dirty = next; }, setBusy: (next: boolean) => { busy = next; }, accept: () => proceed?.() };
}
describe("Location draft exit protection", () => {
  it("confirms explicit exit and keeps the draft on cancellation", () => {
    const s = setup(), exit = vi.fn(); s.guard.exit(exit);
    expect(exit).not.toHaveBeenCalled(); expect(s.discard).not.toHaveBeenCalled();
    s.accept(); expect(s.discard).toHaveBeenCalledOnce(); expect(exit).toHaveBeenCalledOnce(); s.guard.dispose();
  });
  it("captures browser back before desktop unmount and restores the route while asking", () => {
    const s = setup(), desktop = vi.fn(); s.host.addEventListener("popstate", desktop);
    expect(s.add).toHaveBeenCalledWith("popstate", expect.any(Function), true);
    s.history.back(); expect(desktop).not.toHaveBeenCalled(); expect(s.location.href).toContain("/app/location");
    expect(s.history.pushState).toHaveBeenCalledWith({ penumbraApp: "location" }, "", "https://test.invalid/app/location");
    s.accept(); expect(desktop).toHaveBeenCalledOnce(); expect(s.location.href).toBe("https://test.invalid/"); s.guard.dispose();
  });
  it("protects browser reload, blocks leaving during a pending operation, and removes listeners", () => {
    const s = setup(), unload = new Event("beforeunload", { cancelable: true }); s.host.dispatchEvent(unload); expect(unload.defaultPrevented).toBe(true);
    s.setBusy(true); s.guard.exit(vi.fn()); expect(s.confirm).not.toHaveBeenCalled();
    s.guard.dispose(); const next = new Event("beforeunload", { cancelable: true }); s.host.dispatchEvent(next); expect(next.defaultPrevented).toBe(false);
  });
  it("allows clean exits without confirmations", () => {
    const s = setup(), exit = vi.fn(); s.setDirty(false); s.guard.exit(exit); expect(exit).toHaveBeenCalledOnce(); expect(s.confirm).not.toHaveBeenCalled(); s.guard.dispose();
  });
});
