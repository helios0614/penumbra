import { Bot, User } from "lucide-react";
import aiAvatarPlaceholder from "@/assets/chat/avatar-ai-placeholder.png";
import userAvatarPlaceholder from "@/assets/chat/avatar-user-placeholder.png";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAvatarImage } from "@/domain/appearance/appearance-store";
import { cn } from "@/lib/utils";

export function AppearanceAvatar({ kind, size = "sm", className }: {
  kind: "user" | "assistant";
  size?: "sm" | "lg";
  className?: string;
}) {
  const customImage = useAvatarImage(kind);
  const isUser = kind === "user";
  return (
    <Avatar
      size={size}
      className={cn("overflow-hidden bg-transparent shadow-none after:border-border/55 after:mix-blend-normal dark:after:mix-blend-normal", className)}
      data-avatar-kind={kind}
    >
      <AvatarImage src={customImage ?? (isUser ? userAvatarPlaceholder : aiAvatarPlaceholder)} alt="" />
      <AvatarFallback className="bg-surface-secondary/45">
        {isUser ? <User className="size-3.5 text-muted-foreground" aria-hidden="true" />
          : <Bot className="size-3.5 text-ai" aria-hidden="true" />}
      </AvatarFallback>
    </Avatar>
  );
}
