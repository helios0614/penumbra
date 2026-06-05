import { Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface WelcomeProps {
  onSendPrompt: (content: string) => void;
  className?: string;
}

const QUICK_PROMPTS = [
  { label: "帮我写日记", prompt: "帮我写今天的日记" },
  { label: "查看日程", prompt: "今天有什么日程安排？" },
  { label: "回忆一下上周", prompt: "回忆一下上周发生了什么" },
  { label: "随便聊聊", prompt: "随便聊聊吧" },
];

export function Welcome({ onSendPrompt, className }: WelcomeProps) {
  return (
    <div
      className={cn(
        "flex-1 flex flex-col items-center justify-center px-6 py-12 overflow-hidden",
        className,
      )}
    >
      {/* AI 头像 */}
      <div className="size-20 rounded-full bg-ai-subtle border border-ai/20 flex items-center justify-center mb-6 shadow-sm">
        <Bot className="size-10 text-ai" />
      </div>

      {/* 名称 + 简介 */}
      <h2 className="text-xl font-semibold text-foreground mb-2">Aion</h2>
      <p className="text-sm text-muted-foreground text-center max-w-[300px] mb-8">
        你的 AI 伙伴，随时准备倾听、思考、回应。
      </p>

      {/* 快捷入口 */}
      <div className="grid grid-cols-2 gap-2 w-full max-w-[360px]">
        {QUICK_PROMPTS.map((item) => (
          <Button
            key={item.label}
            variant="outline"
            className="h-auto py-3 px-4 text-sm text-left justify-start whitespace-normal"
            onClick={() => onSendPrompt(item.prompt)}
          >
            {item.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
