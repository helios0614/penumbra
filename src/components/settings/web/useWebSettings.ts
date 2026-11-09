import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui/toast";
import {
  WebSettingsError, clearBraveKey, readWebSettings, replaceBraveKey, revealBraveKey, saveWebAccess,
  type WebSettings,
} from "@/domain/web-settings/web-settings-client";

type Operation = "read" | "reveal" | "access" | "replace" | "clear";
type Write = { kind: "access"; enabled: boolean } | { kind: "replace"; key: string } | { kind: "clear"; ref: string };

export function useWebSettings() {
  const [snapshot, setSnapshot] = useState<WebSettings | null>(null);
  const [current, setCurrent] = useState(false);
  const [pending, setPending] = useState<Operation | null>(null);
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState("");
  const active = useRef<AbortController | null>(null);
  const toast = useToast("web-settings");

  function run(kind: Operation, action: (signal: AbortSignal) => Promise<void>) {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setPending(kind);
    setError("");
    return action(controller.signal).finally(() => {
      if (active.current !== controller) return;
      active.current = null;
      setPending(null);
    });
  }

  async function read(signal: AbortSignal) {
    try {
      const observed = await readWebSettings(signal);
      if (!signal.aborted) {
        setSnapshot(observed);
        setCurrent(true);
        return observed;
      }
    } catch (failure) {
      if (!signal.aborted) {
        setCurrent(false);
        return failure instanceof WebSettingsError ? failure : new WebSettingsError("unconfirmed");
      }
    }
  }

  function refresh() {
    return run("read", async signal => {
      setSecret(null);
      const observed = await read(signal);
      if (observed instanceof WebSettingsError) setError(observed.code === "auth" ? "登录后重新读取 Web 设置。" : "无法读取 Web 设置，请重试。");
    });
  }

  useEffect(() => {
    void refresh();
    return () => {
      active.current?.abort();
      active.current = null;
    };
  }, []);

  function hide() {
    setSecret(null);
    if (pending !== "reveal") return;
    active.current?.abort();
    active.current = null;
    setPending(null);
  }

  function reveal() {
    const ref = snapshot?.brave.secret_ref;
    if (!current || !ref) return;
    return run("reveal", async signal => {
      try {
        const value = await revealBraveKey(ref, signal);
        if (!signal.aborted) setSecret(value);
      } catch (failure) {
        if (signal.aborted) return;
        if (failure instanceof WebSettingsError && failure.code === "stale") {
          const observed = await read(signal);
          if (!signal.aborted) setError(observed instanceof WebSettingsError
            ? "凭据引用已失效。请重新读取后再查看。"
            : "凭据引用已失效。请核对当前状态后再查看。");
        } else {
          setError(failure instanceof WebSettingsError && failure.code === "auth"
            ? "登录后重新查看凭据。" : "无法查看凭据，请重试。");
        }
      }
    });
  }

  function write(change: Write, onAcknowledged?: () => void) {
    if (!current || !snapshot) return;
    if (change.kind === "clear" && change.ref !== snapshot.brave.secret_ref) return;
    return run(change.kind, async signal => {
      setSecret(null);
      if (change.kind === "access") setOptimistic(change.enabled);
      let failed: WebSettingsError | null = null;
      try {
        if (change.kind === "access") await saveWebAccess(change.enabled, signal);
        else if (change.kind === "replace") await replaceBraveKey(change.key, snapshot.brave.masked, signal);
        else await clearBraveKey(change.ref, signal);
      } catch (failure) {
        if (signal.aborted) return;
        failed = failure instanceof WebSettingsError ? failure : new WebSettingsError("unconfirmed");
        setOptimistic(null);
      }
      if (signal.aborted) return;
      if (!failed) onAcknowledged?.();
      const observed = await read(signal);
      if (signal.aborted) return;
      setOptimistic(null);
      const readFailed = !observed || observed instanceof WebSettingsError;
      if (failed) {
        const status = readFailed ? "读回失败，请重新读取。" : "已读回当前状态，请核对后再操作。";
        const reason = failed.code === "stale" ? "凭据引用已失效，请重新确认。"
          : failed.code === "auth" ? "登录后才能保存。"
          : failed.code === "persistence" ? "保存失败。"
          : "保存结果未确认。";
        setError(reason + status);
        return;
      }
      if (readFailed) {
        setError("已收到保存回执，当前状态读回失败。请重新读取。");
        return;
      }
      const matches = change.kind === "access" ? observed.enabled === change.enabled : observed.brave.configured === (change.kind === "replace");
      if (!matches) {
        setError("读回状态与本次操作不一致，请核对当前配置。");
        return;
      }
      toast.show({ type: "success", text: change.kind === "clear" ? "Brave Key 已清除" : change.kind === "replace" ? "Brave Key 已保存" : "联网访问已保存" });
    });
  }

  return { snapshot, current, pending, enabled: optimistic ?? snapshot?.enabled, secret, error, refresh, reveal, hide, write };
}
