import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui/toast";
import { SettingsError, clearSettingsSecret, revealSettingsSecret } from "@/domain/service-settings/settings-client";
import {
  readSpeechSettings, replaceSpeechKey, saveSpeechConfig, speechConfigs,
  type SpeechKeyTarget, type SpeechPatch, type SpeechSettings, type SpeechTarget,
} from "@/domain/speech-settings/speech-settings";

export type SpeechScope = "page" | "provider" | SpeechTarget | `${SpeechKeyTarget}-key`;
type Operation = { scope: SpeechScope; kind: "read" | "save" | "reveal" | "replace" | "clear" };
type Write = { kind: "save"; scope: "provider" | SpeechTarget; patch: SpeechPatch }
  | { kind: "replace"; target: SpeechKeyTarget; key: string }
  | { kind: "clear"; target: SpeechKeyTarget; ref: string };

export function useSpeechSettings() {
  const [snapshot, setSnapshot] = useState<SpeechSettings | null>(null);
  const [current, setCurrent] = useState(false);
  const [pending, setPending] = useState<Operation | null>(null);
  const [error, setError] = useState<{ scope: SpeechScope; text: string } | null>(null);
  const [secret, setSecret] = useState<{ target: SpeechKeyTarget; value: string } | null>(null);
  const active = useRef<AbortController | null>(null);
  const toast = useToast("speech-settings");

  function run(operation: Operation, task: (signal: AbortSignal) => Promise<void>) {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setPending(operation);
    setError(null);
    return task(controller.signal).finally(() => {
      if (active.current !== controller) return;
      active.current = null;
      setPending(null);
    });
  }

  async function read(signal: AbortSignal, expected?: SpeechPatch) {
    try {
      const result = await readSpeechSettings(signal, expected);
      if (signal.aborted) return;
      setSnapshot(result.snapshot);
      setCurrent(true);
      return result;
    } catch {
      if (!signal.aborted) setCurrent(false);
    }
  }

  function refresh(scope: SpeechScope = "page") {
    return run({ kind: "read", scope }, async signal => {
      setSecret(null);
      if (!await read(signal) && !signal.aborted) setError({ scope, text: "无法读取语音服务配置，请重试。" });
    });
  }

  useEffect(() => {
    void refresh();
    return () => {
      active.current?.abort();
      active.current = null;
    };
  }, []);

  function hide(target: SpeechKeyTarget) {
    setSecret(previous => previous?.target === target ? null : previous);
    if (pending?.kind !== "reveal" || pending.scope !== `${target}-key`) return;
    active.current?.abort();
    active.current = null;
    setPending(null);
  }

  function reveal(target: SpeechKeyTarget) {
    const ref = snapshot?.configs[target].credential?.secret_ref;
    if (!current || !ref) return;
    const scope = `${target}-key` as const;
    return run({ kind: "reveal", scope }, async signal => {
      setSecret(null);
      try {
        const value = await revealSettingsSecret(ref, signal);
        if (!signal.aborted) setSecret({ target, value });
      } catch (failure) {
        if (signal.aborted) return;
        const stale = failure instanceof SettingsError && failure.code === "stale";
        if (stale) {
          const observed = await read(signal);
          if (!signal.aborted) setError({ scope, text: observed
            ? "凭据引用已失效。已读回当前状态，请重新确认。"
            : "凭据引用已失效。请重新读取后再查看。" });
        } else setError({ scope, text: "无法查看凭据，请重试。" });
      }
    });
  }

  function write(change: Write, onSuccess?: () => void) {
    if (!snapshot || !current) return;
    const credential = change.kind === "save" ? null : snapshot.configs[change.target].credential;
    if (change.kind === "clear" && credential?.secret_ref !== change.ref) return;
    const scope = change.kind === "save" ? change.scope : `${change.target}-key` as const;
    return run({ kind: change.kind, scope }, async signal => {
      setSecret(null);
      let failed: SettingsError | null = null;
      try {
        if (change.kind === "save") await saveSpeechConfig(change.patch, signal);
        else if (change.kind === "replace") await replaceSpeechKey(change.target, change.key, credential?.masked ?? "", signal);
        else await clearSettingsSecret(change.ref, signal);
      } catch (failure) {
        failed = failure instanceof SettingsError ? failure : new SettingsError("unconfirmed");
      }
      if (signal.aborted) return;
      // Credential drafts leave the dialog as soon as the write is acknowledged.
      if (!failed && change.kind !== "save") onSuccess?.();
      const observed = await read(signal, change.kind === "save" ? change.patch : undefined);
      if (signal.aborted) return;
      if (failed) {
        const reason = failed.code === "stale" ? "凭据引用已失效，请重新确认。"
          : failed.code === "auth" ? "登录后才能保存。"
          : failed.code === "persistence" ? "保存失败。" : "保存结果未确认。";
        setError({ scope, text: reason + (observed ? "已读回当前状态，请核对后再操作。" : "读回失败，请重新读取。") });
        return;
      }
      if (!observed) {
        setError({ scope, text: "已收到保存回执，当前状态读回失败。请重新读取。" });
        return;
      }
      const matches = change.kind === "save" ? observed.matches
        : observed.snapshot.configs[change.target].credential?.configured === (change.kind === "replace");
      if (!matches) {
        setError({ scope, text: "读回状态与本次操作不一致，请核对当前配置。" });
        return;
      }
      if (change.kind === "save") onSuccess?.();
      const label = change.kind === "save" ? (change.scope === "provider" ? "语音合成 Provider" : speechConfigs[change.scope].name + " 配置")
        : speechConfigs[change.target].name + " Key";
      toast.show({ type: "success", text: label + (change.kind === "clear" ? " 已清除" : " 已保存") });
    });
  }

  return { snapshot, current, pending, error, secret, refresh, hide, reveal, write };
}
