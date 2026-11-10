import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToastProvider } from "@/components/ui/toast";
import { ResourceStatus } from "../ResourceList";
import { SettingsCredentialActions } from "../SettingsCredentialActions";
import { useMusicSettings } from "./useMusicSettings";

const loginLabels = { success: "最近登录成功", failed: "最近登录失败", unverified: "尚未验证" };
const loginErrors = {
  login_failed: "登录尝试失败。",
  login_rejected: "网易云音乐未认可当前凭据。",
  login_not_confirmed: "本次尝试未能确认登录结果。",
};
const attemptTime = new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "medium" });

export function MusicSettingsPage() {
  return <ToastProvider mobileClearance={16}><MusicSettingsPanel /></ToastProvider>;
}

function MusicSettingsPanel() {
  const music = useMusicSettings();
  const { credential, current, pending, error, login } = music;
  const [dialog, setDialog] = useState(false);
  const busy = pending !== null;
  const feedback = error ? <div className="space-y-2">
    <p role="alert" className="text-xs leading-relaxed text-destructive">{error}</p>
    {!current && <Button type="button" variant="outline" size="compact" disabled={busy} onClick={() => { void music.refreshCredential(); }}>
      <RefreshCw aria-hidden="true" />重新读取凭据
    </Button>}
  </div> : undefined;

  return <section aria-label="Music 服务设置" className="mist-glass min-w-0 divide-y divide-border/60 rounded-[22px] bg-background/70! dark:bg-background/50!">
    <section aria-label="MUSIC_U 凭据" className="space-y-2 px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">MUSIC_U 凭据</h3>
        {credential && <ResourceStatus active={credential.configured} label={credential.configured ? "已配置" : "未配置"} stateLabel="MUSIC_U 配置状态" />}
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">用于网易云音乐登录。清除后，服务会尝试匿名登录。</p>
      {credential && <SettingsCredentialActions label="MUSIC_U" credential={credential} secret={music.secret}
        disabled={!current || busy} busy={busy} pending={pending === "read" || pending === null ? undefined : pending}
        feedback={feedback} onDialogChange={setDialog}
        replaceCopy={{ description: "输入新的 MUSIC_U 以替换当前凭据。", action: "保存凭据" }}
        clearDescription="清除 MUSIC_U 后，网易云音乐将尝试匿名登录。"
        onReveal={() => { void music.reveal(); }} onHide={music.hide}
        onReplace={(key, done) => { void music.write({ kind: "replace", key }, done); }}
        onClear={(ref, done) => { void music.write({ kind: "clear", ref }, done); }} />}
      {pending === "read" && <p role="status" className="text-xs text-muted-foreground">正在读取凭据配置…</p>}
      {!dialog && !current && credential && <p className="text-xs text-muted-foreground">当前显示上次读取的配置。</p>}
      {!dialog && feedback}
    </section>
    <section aria-label="登录状态" className="space-y-2 px-4 py-4 sm:px-5">
      <h3 className="text-sm font-semibold">登录状态</h3>
      <p className="text-xs leading-relaxed text-muted-foreground">这里展示最近一次实际登录结果，不代表当前会话持续有效。</p>
      {login.kind === "loading" && <p role="status" className="text-xs text-muted-foreground">正在读取登录状态…</p>}
      {login.kind === "error" && <div className="space-y-2">
        <p role="alert" className="text-xs text-destructive">登录状态暂不可读取。</p>
        <Button type="button" variant="outline" size="compact" disabled={pending === "replace" || pending === "clear"}
          onClick={() => { void music.refreshLogin(); }}><RefreshCw aria-hidden="true" />重新读取登录状态</Button>
      </div>}
      {login.kind === "ready" && <div aria-live="polite" className="space-y-1.5">
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
          <dt className="text-muted-foreground">登录模式</dt>
          <dd>{login.value.mode === "credential" ? "凭据登录" : "匿名模式"}</dd>
          <dt className="text-muted-foreground">登录结果</dt>
          <dd className={login.value.status === "failed" ? "text-destructive" : undefined}>{loginLabels[login.value.status]}</dd>
          <dt className="text-muted-foreground">最近尝试时间</dt>
          <dd>{login.value.checkedAt ? <time dateTime={login.value.checkedAt}>{attemptTime.format(new Date(login.value.checkedAt))}</time> : "—"}</dd>
        </dl>
        {login.value.errorCode && <p className="text-xs text-muted-foreground">{loginErrors[login.value.errorCode]}</p>}
      </div>}
    </section>
  </section>;
}
