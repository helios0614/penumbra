import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { find, hookSession } from "@/components/chat/test-utils/hook-session";
import { MediaImage } from "./MediaImage";
import { ImageViewer } from "./ImageViewer";
import { ViewerStage } from "./ViewerStage";
import { ChatAudio } from "./ChatAudio";
import { DialogContent } from "@/components/ui/dialog";
import { createAudioController } from "@/application/chat-media/audio-controller";
vi.mock("react", async original => {
  const actual = await original<typeof React>();
  return { ...actual, ...Object.fromEntries(["useState", "useRef", "useCallback", "useId", "useEffect", "useLayoutEffect", "useSyncExternalStore"].map(key => [key, vi.fn(actual[key as keyof typeof actual] as never)])) };
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe("shared media interactions with synthetic UI geometry", () => {
  it("does not reset a cached load event when passive mount effects flush later", () => {
    const s = hookSession(() => MediaImage({ image: { url: "cached-image", label: "cached" } }));
    find(s.render(), "img").props.onLoad?.({ currentTarget: { naturalHeight: 100, naturalWidth: 200 } } as never);
    s.render(); s.commit();
    expect((find(s.render(), "span").props as unknown as { "data-status": string })["data-status"]).toBe("ready"); s.dispose();
  });
  it("failed thumbnails retry locally and the viewer holds/releases a draft resource lease", () => {
    const release = vi.fn(), lease = vi.fn(() => release);
    const s = hookSession(() => MediaImage({ image: { url: "blob:synthetic", label: "草稿" }, lease }));
    find(s.render(), "img").props.onError?.({} as never);
    expect(find(s.render(), "button").props["aria-label"]).toBe("重试显示 草稿");
    find(s.render(), "button").props.onClick?.({} as never); expect(lease).not.toHaveBeenCalled();
    find(s.render(), "img").props.onLoad?.({ currentTarget: { naturalHeight: 1200, naturalWidth: 400 } } as never);
    find(s.render(), "button").props.onClick?.({} as never); expect(lease).toHaveBeenCalledOnce();
    find(s.render(), ImageViewer).props.onClose(); expect(release).toHaveBeenCalledOnce(); s.dispose();
  });
  it("desktop arrows navigate the same image group and retain the return-focus reference", () => {
    const finalFocus = { current: null }, close = vi.fn();
    const s = hookSession(() => ImageViewer({ images: [{ url: "a", label: "A" }, { url: "b", label: "B" }], initialIndex: 0, onClose: close, finalFocus }));
    const popup = () => find(s.render(), DialogContent).props;
    expect(popup().finalFocus).toBe(finalFocus);
    popup().onKeyDown?.({ key: "ArrowRight", preventDefault: vi.fn() } as never);
    expect(find(s.render(), ViewerStage).props.image.label).toBe("B");
    popup().onKeyDown?.({ key: "ArrowLeft", preventDefault: vi.fn() } as never);
    expect(find(s.render(), ViewerStage).props.image.label).toBe("A");
    s.dispose();
  });
  it("touch swipes navigate, pinch changes scale, and zoomed panning stays bounded", () => {
    let scale = 1; const navigate = vi.fn();
    const s = hookSession(() => ViewerStage({ image: { url: "synthetic", label: "image" }, scale, onScale: next => { scale = next; }, onNavigate: navigate }));
    let tree = s.render();
    (find(tree, "div").props.ref as React.RefObject<unknown>).current = { clientWidth: 300, clientHeight: 300 };
    (find(tree, "img").props.ref as React.RefObject<unknown>).current = { naturalWidth: 900, naturalHeight: 600 };
    find(tree, "img").props.onLoad?.({} as never);
    const frame = () => find(s.render(), "div").props;
    const pointer = (id: number, x: number, y = 100) => ({ button: 0, pointerId: id, clientX: x, clientY: y, currentTarget: { setPointerCapture: vi.fn() }, type: "pointerup" });
    frame().onPointerDown?.(pointer(1, 200) as never); frame().onPointerUp?.(pointer(1, 100) as never); expect(navigate).toHaveBeenCalledWith(1);
    frame().onPointerDown?.(pointer(1, 100) as never); frame().onPointerDown?.(pointer(2, 200) as never);
    frame().onPointerMove?.(pointer(2, 300) as never); expect(scale).toBe(2);
    frame().onPointerCancel?.({ ...pointer(1, 100), type: "pointercancel" } as never); frame().onPointerCancel?.({ ...pointer(2, 300), type: "pointercancel" } as never);
    frame().onPointerDown?.(pointer(3, 0, 0) as never); frame().onPointerMove?.(pointer(3, 500, 500) as never);
    expect(find(s.render(), "img").props.style).toMatchObject({ "--image-x": "150px", "--image-y": "50px" });
    expect(navigate).toHaveBeenCalledTimes(1); s.dispose();
  });
  it("the page Audio scope stops on conversation change, removed HTTP identity, and unmount", () => {
    const audio = { paused: true, src: "", play: vi.fn(async () => {}), pause: vi.fn(), load: vi.fn(), removeAttribute: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const controller = createAudioController(() => audio as unknown as HTMLAudioElement);
    let scope = "A", identities = ["A:42"];
    const s = hookSession(() => ChatAudio({ scope, identities, children: null, createController: () => controller }));
    s.render(); s.commit(); controller.play("A:42", 42); expect(controller.getState().identity).toBe("A:42");
    scope = "B"; s.render(); s.commit(); expect(controller.getState().identity).toBeNull();
    identities = ["B:43"]; s.render(); s.commit(); controller.play("B:43", 43);
    identities = []; s.render(); s.commit(); expect(controller.getState().status).toBe("idle"); s.dispose();
    expect(audio.removeAttribute).toHaveBeenCalledWith("src");
  });
});
