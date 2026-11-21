import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { elements } from "@/components/chat/test-utils/hook-session";
import type { AppearanceConfig } from "@/domain/appearance/appearance-client";
import { DEFAULT_WALLPAPER_SETTINGS } from "@/lib/wallpaper";

vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot(),
}));

const userImage = `${"a".repeat(32)}.png`;
const assistantImage = `${"b".repeat(32)}.webp`;

function configResponse(avatars: Partial<AppearanceConfig["avatars"]> = { user: null, assistant: null }) {
  const config: Omit<AppearanceConfig, "avatars"> = {
    themeMode: "system",
    themeColor: null,
    aiColor: null,
    wallpaper: { ...DEFAULT_WALLPAPER_SETTINGS, image: null },
    stickerImage: null,
    stickers: [],
  };
  return Response.json({ ...config, avatars });
}

async function subject() {
  const { loadAppearance, useAppearance } = await import("@/domain/appearance/appearance-store");
  const { AvatarFallback, AvatarImage } = await import("@/components/ui/avatar");
  const { AppearanceAvatar } = await import("./AppearanceAvatar");
  const avatar = (kind: keyof AppearanceConfig["avatars"]) => {
    const children = elements(AppearanceAvatar({ kind }));
    return {
      src: children.find((child) => child.type === AvatarImage)?.props.src,
      hasFallback: children.some((child) => child.type === AvatarFallback),
    };
  };
  return { avatar, loadAppearance, useAppearance };
}

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

describe("appearance avatar image selection", () => {
  it("keeps the icon while reading and selects the default images after confirmation", async () => {
    let finish!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; })));
    const { avatar, loadAppearance } = await subject();

    const read = loadAppearance();
    expect(avatar("user")).toEqual({ src: undefined, hasFallback: true });
    expect(avatar("assistant")).toEqual({ src: undefined, hasFallback: true });
    finish(configResponse());
    await read;

    expect(avatar("user").src).toMatch(/avatar-user-placeholder\.png$/);
    expect(avatar("assistant").src).toMatch(/avatar-ai-placeholder\.png$/);
  });

  it.each([null, undefined])("selects a custom image and uses the default for an avatar set to %s", async (assistant) => {
    vi.stubGlobal("fetch", vi.fn(async () => configResponse({ user: userImage, assistant })));
    const { avatar, loadAppearance } = await subject();

    await loadAppearance();
    expect(avatar("user").src).toBe(`/api/appearance/images/user-avatar/${userImage}`);
    expect(avatar("assistant").src).toMatch(/avatar-ai-placeholder\.png$/);
  });

  it("keeps the icon after a failed read and uses the configured image on retry", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(configResponse({ user: null, assistant: assistantImage }));
    vi.stubGlobal("fetch", fetch);
    const { avatar, loadAppearance, useAppearance } = await subject();

    await loadAppearance();
    expect(useAppearance().status).toBe("error");
    expect(avatar("assistant")).toEqual({ src: undefined, hasFallback: true });

    await loadAppearance();
    expect(useAppearance().status).toBe("ready");
    expect(avatar("assistant").src).toBe(`/api/appearance/images/assistant-avatar/${assistantImage}`);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
