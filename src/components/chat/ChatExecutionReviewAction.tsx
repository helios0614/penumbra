import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";

export function ChatExecutionReviewAction({ ready, onRelease }: {
  readonly ready: boolean;
  readonly onRelease: () => void;
}) {
  const [open, setOpen] = useState(false);
  if (!ready) return null;
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger render={<Button type="button" variant="ghost" size="compact" />}>返回编辑</PopoverTrigger>
    <PopoverContent side="top" align="start" className="chat-composer-menu p-3 text-xs leading-relaxed">
      <PopoverTitle>上一次请求可能仍在运行</PopoverTitle>
      <p className="my-3">上一次生成尚未确认结束。返回编辑不会取消后台任务，也不会自动重新发送。如果后台稍后完成，回复仍可能出现在聊天记录中。</p>
      <Button type="button" variant="outline" size="compact" onClick={() => { setOpen(false); onRelease(); }}>保留临时回复，返回编辑</Button>
    </PopoverContent>
  </Popover>;
}
