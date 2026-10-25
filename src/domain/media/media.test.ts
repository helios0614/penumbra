import { describe, expect, it } from "vitest";
import { MAX_UPLOAD_BYTES, UPLOAD_MIME_TYPES, validateUpload } from "./media-types";
import { mapMediaAttachments, mapUploadResponse } from "./media-mappers";
import { markdownImageResource, uploadResource } from "./media-resources";

describe("public media boundaries", () => {
  it("uses real MIME/byte limits, not filename extensions", () => {
    for (const type of UPLOAD_MIME_TYPES) expect(validateUpload({ type, size: MAX_UPLOAD_BYTES })).toBeNull();
    for (const type of ["", "image/svg+xml", "image/heic", "application/pdf", "text/plain", "audio/mp3"]) expect(validateUpload({ type, size: 12 })).toBeTruthy();
    expect(validateUpload({ type: "image/png", size: MAX_UPLOAD_BYTES + 1 })).toBeTruthy();
    expect(validateUpload({ type: "image/png", size: 0 })).toBeTruthy();
  });
  it("accepts both legacy timestamps and new UUIDs, separates video and unknown", () => {
    expect(mapMediaAttachments(["/uploads/1700000000000.jpg", "/uploads/1700000000001.mov", "/uploads/1700000000002.pdf"], "user").map(a => a.kind)).toEqual(["image", "video", "unsupported"]);
    expect(uploadResource(`/uploads/${"a".repeat(32)}.webp`)?.kind).toBe("image");
  });
  it("never opens hidden camera roots, credentials, arbitrary local routes or URL schemes", () => {
    for (const path of ["/uploads/cam_check_1.jpg", "/uploads/core_wake_1.jpg", "/uploads/monitor_1.jpg", "/screenshots/1.jpg", "/uploads/../screenshots/1.jpg", "/uploads/1700000000000.png\n", "/api/image", "data:image/png;base64,a", "blob:private", "//cdn.example/image.png", "https://u:p@cdn.example/a.png", "https://cdn.example/a.png?token=secret", "https://127.0.0.1/private.png"]) {
      expect(uploadResource(path)).toBeNull(); expect(markdownImageResource(path)).toBeNull();
    }
    expect(markdownImageResource("https://images.example/photo.png")).toBe("https://images.example/photo.png");
  });
  it("treats 2xx error DTOs and malformed successes as failed uploads", () => {
    for (const data of [{ error: "unsupported" }, { url: "blob:local", type: "image/png", name: "x" }, { url: "/uploads/1700000000000.jpg", type: "video/mp4", name: "x" }]) expect(() => mapUploadResponse(data)).toThrow();
    expect(mapUploadResponse({ url: "/uploads/1700000000000.png", type: "image/png", name: "photo.png" }).name).toBe("photo.png");
  });
  it("music identity comes only from assistant attachment schema, never system text", () => {
    expect(mapMediaAttachments([{ type: "music", id: 42, name: "Song", artist: "Artist", audio_url: "https://private/secret" }], "assistant")).toEqual([{ kind: "music", id: 42, name: "Song", artist: "Artist" }]);
    expect(mapMediaAttachments([{ id: 42, name: "untyped", artist: "unknown" }], "assistant")[0].kind).toBe("unsupported");
    expect(mapMediaAttachments([{ type: "music", id: 42, name: "Song", artist: "Artist" }], "user")[0].kind).toBe("unsupported");
    expect(mapMediaAttachments([{ type: "music", id: "wrong", name: "Song", artist: "Artist" }], "assistant")[0]).toMatchObject({ id: null });
  });
});
