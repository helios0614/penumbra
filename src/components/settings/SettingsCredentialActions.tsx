import { useId, useRef, useState, type ReactNode } from "react";
import { Copy, Eye, EyeOff, Pencil, Trash2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { copyWithFeedback } from "@/components/ui/copy-feedback";
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { validSettingsKey, type SettingsCredential } from "@/domain/service-settings/settings-client";
import { ResourceAction, ResourceActions } from "./ResourceList";

type CredentialDialog = { kind: "replace" } | { kind: "clear"; ref: string; attempted: boolean };

export function SettingsCredentialActions({
  label, credential, secret, disabled, busy, pending, feedback, clearDescription, onReveal, onHide, onReplace, onClear, onDialogChange,
  replaceCopy = { description: "输入新 Key 以替换当前凭据。", action: "保存 Key" },
}: {
  label: string;
  credential: SettingsCredential;
  secret: string | null;
  disabled: boolean;
  busy: boolean;
  pending?: "reveal" | "replace" | "clear";
  feedback?: ReactNode;
  clearDescription: string;
  replaceCopy?: { description: string; action: string };
  onReveal: () => void;
  onHide: () => void;
  onReplace: (key: string, acknowledged: () => void) => void;
  onClear: (ref: string, acknowledged: () => void) => void;
  onDialogChange?: (open: boolean) => void;
}) {
  const [dialog, setDialog] = useState<CredentialDialog | null>(null);
  const [draft, setDraft] = useState("");
  const formId = useId();
  const toast = useToast("settings-credential-copy");
  const editButton = useRef<HTMLButtonElement>(null);
  const clearButton = useRef<HTMLButtonElement>(null);
  const ref = credential.secret_ref;
  const valid = validSettingsKey(draft, credential.masked);

  function closeDialog() {
    setDraft("");
    onHide();
    setDialog(null);
    onDialogChange?.(false);
  }

  function openDialog(target: CredentialDialog) {
    if (disabled) return;
    onHide();
    setDialog(target);
    onDialogChange?.(true);
  }

  return <>
    {credential.configured && <p aria-label={label + " 掩码"} className="select-none break-all font-mono text-xs text-muted-strong">{credential.masked}</p>}
    <ResourceActions aria-label={label + " 操作"} separated={false}>
      {credential.configured && <>
        {secret !== null || pending === "reveal"
          ? <ResourceAction icon={EyeOff} label="隐藏凭据" onClick={onHide} />
          : <ResourceAction icon={Eye} label="查看凭据" disabled={disabled} onClick={onReveal} />}
        {secret !== null && <ResourceAction icon={Copy} label="复制凭据" onClick={() => {
          void copyWithFeedback(secret, text => navigator.clipboard.writeText(text), toast.show);
        }} />}
      </>}
      <ResourceAction ref={editButton} icon={Pencil} label="编辑凭据" disabled={disabled}
        onClick={() => openDialog({ kind: "replace" })} />
      {ref && <ResourceAction ref={clearButton} icon={Trash2} label="清除凭据" danger disabled={disabled}
        onClick={() => openDialog({ kind: "clear", ref, attempted: false })} />}
    </ResourceActions>
    {pending === "reveal" && <p role="status" className="text-xs text-muted-foreground">正在查看凭据…</p>}
    {secret !== null && <p aria-label={`临时 ${label} 明文`} className="select-text break-all rounded-xl border border-border/60 px-3 py-2 font-mono text-xs">{secret}</p>}

    {dialog?.kind === "replace" && <Dialog open onOpenChange={open => { if (!open && !busy) closeDialog(); }}>
      <DialogContent aria-modal="true" finalFocus={() => editButton.current} closeButtonProps={{ disabled: busy, "aria-label": "关闭编辑凭据" }}>
        <DialogHeader>
          <DialogTitle>编辑 {label}</DialogTitle>
          <DialogDescription>{replaceCopy.description}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3" render={<form id={formId} autoComplete="off" onSubmit={event => {
          event.preventDefault();
          if (valid && !disabled) onReplace(draft, closeDialog);
        }} />}>
          <label className="grid gap-2 text-xs">
            <span>新 {label}</span>
            <Input surface="translucent" controlSize="comfortable" type="password" autoComplete="new-password" autoCapitalize="none" spellCheck={false}
              value={draft} disabled={busy} onChange={event => setDraft(event.target.value)} />
          </label>
          {feedback && <p className="break-all text-xs text-muted-strong">凭据状态 · {credential.configured ? `已配置 · ${credential.masked}` : "未配置"}</p>}
          {feedback}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={closeDialog}>取消</Button>
          <Button type="submit" form={formId} disabled={!valid || disabled} loading={pending === "replace"}>
            {pending === "replace" ? "正在保存…" : replaceCopy.action}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>}

    {dialog?.kind === "clear" && <AlertDialog open onOpenChange={open => { if (!open && !busy) closeDialog(); }}>
      <AlertDialogContent aria-modal="true" finalFocus={() => clearButton.current ?? editButton.current}>
        <AlertDialogHeader className="space-y-2">
          <AlertDialogTitle>清除 {label}</AlertDialogTitle>
          <AlertDialogDescription>{clearDescription}</AlertDialogDescription>
          {feedback}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel variant="outline" disabled={busy}>取消</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={disabled || dialog.attempted || dialog.ref !== ref}
            loading={pending === "clear"} onClick={() => {
              setDialog({ ...dialog, attempted: true });
              onClear(dialog.ref, closeDialog);
            }}>{pending === "clear" ? "正在清除…" : "确认清除"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>}
    {!dialog && onDialogChange === undefined && feedback}
  </>;
}
