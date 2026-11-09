import { useRef, useState, type ReactNode } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { speechConfigs, validSiliconFlowAddress } from "@/domain/speech-settings/speech-settings";

const { defaultUrl } = speechConfigs.siliconflow;

export function SiliconFlowAddress({ customAddress, draft, disabled, busy, saving, feedback, onOpen, onEdit, onSave }: {
  customAddress: boolean;
  draft: string;
  disabled: boolean;
  busy: boolean;
  saving: boolean;
  feedback: ReactNode;
  onOpen: () => void;
  onEdit: (value: string) => void;
  onSave: (value: string, verified: () => void) => void;
}) {
  const [dialog, setDialog] = useState<"edit" | "reset" | null>(null);
  const [resetAttempted, setResetAttempted] = useState(false);
  const editButton = useRef<HTMLButtonElement>(null);
  const resetButton = useRef<HTMLButtonElement>(null);
  const address = draft.trim();
  const valid = validSiliconFlowAddress(address);
  const status = customAddress ? "已配置自定义地址" : "使用默认地址 · " + defaultUrl;

  function open(kind: "edit" | "reset") {
    onOpen();
    setResetAttempted(false);
    setDialog(kind);
  }

  function close() {
    setDialog(null);
  }

  function onOpenChange(open: boolean) {
    if (!open && !busy) close();
  }

  return <div className="grid min-w-0 content-start gap-1.5 text-xs">
    <span>API 地址</span>
    <p className="break-all text-muted-foreground">{status}</p>
    <div className="flex flex-wrap gap-2">
      <Button ref={editButton} variant="outline" size="compact" disabled={disabled} onClick={() => open("edit")}>修改 API 地址</Button>
      {customAddress && <Button ref={resetButton} variant="ghost" size="compact" disabled={disabled}
        onClick={() => open("reset")}>恢复默认地址</Button>}
    </div>
    {!dialog && feedback}

    {dialog === "edit" && <Dialog open onOpenChange={onOpenChange}>
      <DialogContent aria-modal="true" finalFocus={() => editButton.current} closeButtonProps={{ disabled: busy, "aria-label": "关闭地址编辑" }}>
        <DialogHeader>
          <DialogTitle>修改 SiliconFlow TTS API 地址</DialogTitle>
          <DialogDescription>为保护历史地址中可能包含的敏感信息，当前自定义地址不会回显。填写新地址将替换现有地址。</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <label className="grid gap-2 text-xs">
            <span>新 API 地址</span>
            <Input surface="translucent" controlSize="comfortable" inputMode="url" autoComplete="off" autoCapitalize="none"
              spellCheck={false} value={draft} disabled={busy} onChange={event => onEdit(event.target.value)}
              placeholder="https://" aria-invalid={!!address && !valid || undefined} />
            {!!address && !valid && <span className="text-destructive">请输入无内嵌凭据、查询参数或片段的 HTTPS 基础地址。</span>}
          </label>
          <p className="text-xs leading-relaxed text-muted-strong">修改 API 地址后，现有 API Key 将用于新的目标地址。</p>
          {feedback && <p className="break-all text-xs text-muted-foreground">{status}</p>}
          {feedback}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={close}>关闭</Button>
          <Button disabled={disabled || !valid} loading={saving} onClick={() => onSave(address, close)}>确认保存地址</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>}

    {dialog === "reset" && <AlertDialog open onOpenChange={onOpenChange}>
      <AlertDialogContent aria-modal="true" finalFocus={() => resetButton.current ?? editButton.current}>
        <AlertDialogHeader className="space-y-2">
          <AlertDialogTitle>恢复默认 API 地址</AlertDialogTitle>
          <AlertDialogDescription>语音合成将使用默认地址 {defaultUrl}。现有 API Key 会保留，并用于该地址。</AlertDialogDescription>
          {feedback && <p className="break-all text-xs text-muted-foreground">{status}</p>}
          {feedback}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel variant="outline" disabled={busy}>取消</AlertDialogCancel>
          <AlertDialogAction disabled={disabled || !customAddress || resetAttempted} loading={saving} onClick={() => {
            setResetAttempted(true);
            onSave("", close);
          }}>确认恢复默认</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>}
  </div>;
}
