import { Paperclip } from "lucide-react";
import { useAiName } from "@/components/identity/AiNameContext";
import type { MessageReaction } from "@/domain/message/capability-types";
import type { MediaAttachment } from "@/domain/media/media-types";
import { MediaImage } from "./MediaImage";
import { MusicCard } from "./MusicCard";
import { AI_BUBBLE_SURFACE } from "@/components/chat/bubble-surface";
import { cn } from "@/lib/utils";
import { VideoMedia } from "./VideoMedia";
import { musicIdentity } from "./media-identity";
import "./media.css";

export function ChatAttachments({ attachments, messageId, reaction, kind }: { attachments: readonly MediaAttachment[]; messageId: string; reaction?: MessageReaction | null; kind?: "user" | "assistant" }) {
  const aiName = useAiName();
  const images = attachments.flatMap(a => a.kind === "image" ? [{ url: a.url, label: a.label }] : []);
  let imageIndex = 0;
  return <div className={cn("chat-media relative", reaction && "mb-5")} aria-label="消息附件" data-message-role={kind} data-reaction-anchor={reaction?.targetMessageId}>
    <div className="chat-media-grid" data-count={attachments.filter(a => a.kind === "image" || a.kind === "video").length}
      data-density={attachments.filter(a => a.kind === "image" || a.kind === "video").length >= 5 ? "many" : "few"}>
      {attachments.map((a, index) => a.kind === "image" ? <MediaImage key={index} image={a} images={images} index={imageIndex++} />
        : a.kind === "video" ? <VideoMedia key={index} url={a.url} label={a.label} /> : null)}
    </div>
    {attachments.map((a, index) => a.kind === "music" ? <MusicCard key={musicIdentity(messageId, index, a)} song={a} identity={musicIdentity(messageId, index, a)} />
      : a.kind === "unsupported" ? <span key={index} className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-surface-secondary/60 px-2 py-1.5 text-xs text-muted-strong"><Paperclip className="size-3.5" />{a.label}</span> : null)}
    {reaction && <span role="img" data-reaction-target={reaction.targetMessageId} data-reaction-source={reaction.sourceMessageId ?? undefined}
      aria-label={`${aiName}的表情回应 ${reaction.emoji}`} className={cn("chat-reaction-sticker border", AI_BUBBLE_SURFACE)}>{reaction.emoji}</span>}
  </div>;
}
