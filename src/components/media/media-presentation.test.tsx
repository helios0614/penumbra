import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Bubble } from "@/components/chat/Bubble";
import { MarkdownRenderer } from "@/components/chat/MarkdownRenderer";
import { presentChatMessage } from "@/components/chat-workspace/presentation/chat-message-presenter";
import { mapMessage } from "@/domain/message/message-mappers";
import { ChatAudio } from "./ChatAudio";
import { clampPan, clampZoom, swipeDirection } from "./viewer-geometry";

describe("media presentation without backend resources", () => {
  it.each([1, 2, 3, 4, 6])("renders %i images as content without an empty text bubble or forced crop", count => {
    const message = presentChatMessage(mapMessage({ id: "user", conv_id: "A", role: "user", content: "", created_at: 1, attachments: Array.from({ length: count }, (_, i) => `/uploads/${1700000000000 + i}.png`), drift: null, thinking: null, mcp_tool_calls: [], cache_region: "slide", is_carryover: 0 }))!;
    const html = renderToStaticMarkup(<Bubble message={message} />);
    expect(html).toContain(`data-count="${count}"`); expect(html).not.toContain("data-user-bubble"); expect(html).not.toContain("附件暂不支持");
    expect(html.match(/查看 聊天图片/g)).toHaveLength(count);
  });
  it("keeps video distinct, music real and unknown/Camera items inert", () => {
    const message = { kind: "assistant" as const, id: "ai", content: "Media", createdAt: 1, thinking: null, simpleThink: null,
      attachments: [{ kind: "video" as const, url: "/uploads/1700000000001.mp4", label: "聊天视频" }, { kind: "music" as const, id: 42, name: "Song", artist: "Artist" }] };
    const html = renderToStaticMarkup(<ChatAudio scope="A" identities={["ai:media:1:42"]}><Bubble message={message} /></ChatAudio>);
    expect(html).toContain("<video"); expect(html).toContain("controls"); expect(html).toContain("播放 Song"); expect(html).not.toContain("<audio"); expect(html).not.toContain("animate-pulse");
    const markdown = renderToStaticMarkup(<MarkdownRenderer content={"![private](/uploads/cam_check_1.jpg) ![safe](https://images.example/photo.png)"} />);
    expect(markdown).not.toContain('src="/uploads/cam_check'); expect(markdown).toContain("图片引用不可用"); expect(markdown).toContain("查看 safe");
  });
  it("clamps zoom and panning against fitted image dimensions; swipe requires horizontal intent", () => {
    expect(clampZoom(0)).toBe(1); expect(clampZoom(20)).toBe(8);
    expect(clampPan({ x: 500, y: 500 }, 2, { width: 300, height: 300 }, { width: 300, height: 900 })).toEqual({ x: 0, y: 150 });
    expect(swipeDirection(-90, 10)).toBe(1); expect(swipeDirection(90, 10)).toBe(-1); expect(swipeDirection(30, 90)).toBe(0);
  });
});
