import { useId, useRef, useState } from "react";
import { ChevronRight, Copy, Eye, EyeOff, Pencil, RefreshCw, Trash2 } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { validBraveKey } from "@/domain/web-settings/web-settings-client";
import { ResourceAction, ResourceActions, ResourceStatus } from "../ResourceList";
import { useWebSettings } from "./useWebSettings";

type CredentialDialog = { kind: "replace" } | { kind: "clear"; ref: string; attempted: boolean };

type WebPageProps = { onManageCompression: () => void };

export function WebSettingsPage(props: WebPageProps) {
  return <ToastProvider mobileClearance={16}><WebSettingsPanel {...props} /></ToastProvider>;
}

function WebSettingsPanel({ onManageCompression }: WebPageProps) {
  const web = useWebSettings();
  const [dialog, setDialog] = useState<CredentialDialog | null>(null);
  const [draft, setDraft] = useState("");
  const toast = useToast("brave-copy");
  const editButton = useRef<HTMLButtonElement>(null);
  const clearButton = useRef<HTMLButtonElement>(null);
  const accessDescription = useId();
  const brave = web.snapshot?.brave;
  const disabled = !web.current || web.pending !== null;
  const ref = brave?.secret_ref;
  const valid = validBraveKey(draft, brave?.masked ?? "");

  function closeDialog() {
    setDraft("");
    web.hide();
    setDialog(null);
  }

  function openDialog(target: CredentialDialog) {
    if (disabled) return;
    web.hide();
    setDialog(target);
  }

  const feedback = <>
    {web.error && <p role="alert" className="text-xs leading-relaxed text-destructive">{web.error}</p>}
    {!web.current && web.snapshot && <p className="text-xs text-muted-foreground">当前显示上次读取的状态。</p>}
    {!web.current && web.error && <Button type="button" variant="outline" size="compact" disabled={web.pending !== null}
      onClick={() => { void web.refresh(); }}><RefreshCw aria-hidden="true" />重新读取</Button>}
  </>;

  return <>
    <section aria-label="Web 服务设置" className="mist-glass min-w-0 divide-y divide-border/60 rounded-[22px] bg-background/70! dark:bg-background/50!">
      <section aria-labelledby={accessDescription + "-title"} className="px-4 py-4 sm:px-5">
        <div className="flex min-w-0 items-center justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <h3 id={accessDescription + "-title"} className="text-sm font-semibold">联网访问</h3>
            <p id={accessDescription} className="text-xs leading-relaxed text-muted-foreground">允许 AI 在新消息中使用网页读取与搜索能力。关闭后不会删除已有的联网证据。</p>
          </div>
          {web.enabled !== undefined && <Switch aria-label="联网访问" aria-describedby={accessDescription} checked={web.enabled}
            disabled={disabled} busy={web.pending === "access"} onCheckedChange={enabled => { void web.write({ kind: "access", enabled }); }} />}
        </div>
        {web.pending === "access" && <p role="status" className="mt-2 text-xs text-muted-foreground">正在保存联网许可…</p>}
      </section>

      <section aria-label="Brave Search 凭据" className="space-y-2 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Brave Search</h3>
          {brave && <ResourceStatus active={brave.configured} label={brave.configured ? "已配置" : "未配置"} stateLabel="Brave Key 状态" />}
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">用于 AI 的网页搜索。URL 直接读取不依赖此 Key。</p>
        {brave && <>
          {brave.configured && <p aria-label="Brave Key 掩码" className="select-none break-all font-mono text-xs text-muted-strong">{brave.masked}</p>}
          <ResourceActions aria-label="Brave Key 操作" separated={false}>
            {brave.configured && <>
              {web.secret !== null || web.pending === "reveal"
                ? <ResourceAction icon={EyeOff} label="隐藏凭据" onClick={web.hide} />
                : <ResourceAction icon={Eye} label="查看凭据" disabled={disabled} onClick={() => { void web.reveal(); }} />}
              {web.secret !== null && <ResourceAction icon={Copy} label="复制凭据" onClick={() => {
                const value = web.secret;
                if (value !== null) void copyWithFeedback(value, text => navigator.clipboard.writeText(text), toast.show);
              }} />}
            </>}
            <ResourceAction ref={editButton} icon={Pencil} label="编辑凭据" disabled={disabled}
              onClick={() => openDialog({ kind: "replace" })} />
            {ref && <ResourceAction ref={clearButton} icon={Trash2} label="清除凭据" danger disabled={disabled}
              onClick={() => openDialog({ kind: "clear", ref, attempted: false })} />}
          </ResourceActions>
        </>}
        {web.pending === "reveal" && <p role="status" className="text-xs text-muted-foreground">正在查看凭据…</p>}
        {web.secret !== null && <p aria-label="临时 Brave Key 明文" className="select-text break-all rounded-xl border border-border/60 px-3 py-2 font-mono text-xs">{web.secret}</p>}
      </section>

      <Button type="button" variant="ghost" onClick={onManageCompression}
        className="flex w-full min-w-0 justify-between gap-3 rounded-none rounded-b-[22px] px-4 py-4 text-left sm:px-5">
        <span className="min-w-0 space-y-1">
          <span className="block text-sm font-semibold">网页内容压缩模型</span>
          <span className="block text-xs font-normal leading-relaxed text-muted-foreground">模型和连接由模型与任务分配统一管理。</span>
        </span>
        <ChevronRight className="size-4 text-primary-ink" aria-hidden="true" />
      </Button>
      {((!dialog && web.error) || web.pending === "read") && <div className="space-y-2 px-4 py-3 sm:px-5">
        {web.pending === "read" && <p role="status" className="text-xs text-muted-foreground">正在读取 Web 设置…</p>}
        {!dialog && feedback}
      </div>}
    </section>

    {dialog?.kind === "replace" && <Dialog open onOpenChange={open => { if (!open && !web.pending) closeDialog(); }}>
      <DialogContent finalFocus={() => editButton.current} closeButtonProps={{ disabled: web.pending !== null, "aria-label": "关闭编辑凭据" }}>
        <DialogHeader>
          <DialogTitle>编辑 Brave Key</DialogTitle>
          <DialogDescription>输入新 Key 以替换当前凭据。</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3" render={<form id="brave-key-form" autoComplete="off" onSubmit={event => {
          event.preventDefault();
          if (valid && !disabled) void web.write({ kind: "replace", key: draft }, closeDialog);
        }} />}>
          <label className="grid gap-2 text-xs">
            <span>新 Brave Key</span>
            <Input surface="translucent" controlSize="comfortable" type="password" autoComplete="new-password" autoCapitalize="none" spellCheck={false}
              value={draft} disabled={web.pending !== null} onChange={event => setDraft(event.target.value)} />
          </label>
          {web.error && brave && <p className="break-all text-xs text-muted-strong">凭据状态 · {brave.configured ? `已配置 · ${brave.masked}` : "未配置"}</p>}
          {feedback}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" disabled={web.pending !== null} onClick={closeDialog}>取消</Button>
          <Button type="submit" form="brave-key-form" disabled={!valid || disabled} loading={web.pending === "replace"}>
            {web.pending === "replace" ? "正在保存…" : "保存 Key"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>}

    {dialog?.kind === "clear" && <AlertDialog open onOpenChange={open => { if (!open && !web.pending) closeDialog(); }}>
      <AlertDialogContent finalFocus={() => clearButton.current ?? editButton.current}>
        <AlertDialogHeader className="space-y-2">
          <AlertDialogTitle>清除 Brave Key</AlertDialogTitle>
          <AlertDialogDescription>清除后 Brave 搜索将无法使用。联网许可和 URL 读取保持原设置。</AlertDialogDescription>
          {feedback}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel variant="outline" disabled={web.pending !== null}>取消</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={disabled || dialog.attempted || dialog.ref !== brave?.secret_ref}
            loading={web.pending === "clear"} onClick={() => {
              setDialog({ ...dialog, attempted: true });
              void web.write({ kind: "clear", ref: dialog.ref }, closeDialog);
            }}>{web.pending === "clear" ? "正在清除…" : "确认清除"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>}
  </>;
}
