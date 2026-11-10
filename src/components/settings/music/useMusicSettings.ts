import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui/toast";
import { readMusicAuthStatus, readMusicCredential, replaceMusicCredential, type MusicAuthStatus } from "@/domain/music-settings/music-settings-client";
import {
  clearSettingsSecret, revealSettingsSecret, SettingsError, type SettingsCredential,
} from "@/domain/service-settings/settings-client";

type Operation = "read" | "reveal" | "replace" | "clear";
type Write = { kind: "replace"; key: string } | { kind: "clear"; ref: string };
type LoginRead = { kind: "loading" | "error" } | { kind: "ready"; value: MusicAuthStatus };

export function useMusicSettings() {
  const [credential, setCredential] = useState<SettingsCredential | null>(null);
  const [current, setCurrent] = useState(false);
  const [pending, setPending] = useState<Operation | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [login, setLogin] = useState<LoginRead>({ kind: "loading" });
  const active = useRef<{ kind: Operation; controller: AbortController } | null>(null);
  const loginRequest = useRef<AbortController | null>(null);
  const toast = useToast("music-settings");

  function run(kind: Operation, action: (signal: AbortSignal) => Promise<void>) {
    if (active.current) return;
    const controller = new AbortController();
    active.current = { kind, controller };
    setPending(kind);
    setError("");
    return action(controller.signal).finally(() => {
      if (active.current?.controller !== controller) return;
      active.current = null;
      setPending(null);
    });
  }

  async function readCredential(signal: AbortSignal) {
    try {
      const observed = await readMusicCredential(signal);
      if (signal.aborted) return;
      setCredential(observed);
      setCurrent(true);
      return observed;
    } catch {
      if (!signal.aborted) setCurrent(false);
    }
  }

  function refreshCredential() {
    return run("read", async signal => {
      setSecret(null);
      if (!await readCredential(signal) && !signal.aborted) setError("无法读取凭据配置，请重试。");
    });
  }

  async function refreshLogin() {
    loginRequest.current?.abort();
    const controller = new AbortController();
    loginRequest.current = controller;
    setLogin({ kind: "loading" });
    try {
      const value = await readMusicAuthStatus(controller.signal);
      if (!controller.signal.aborted) setLogin({ kind: "ready", value });
    } catch {
      if (!controller.signal.aborted) setLogin({ kind: "error" });
    } finally {
      if (loginRequest.current === controller) loginRequest.current = null;
    }
  }

  useEffect(() => {
    void refreshCredential();
    void refreshLogin();
    return () => {
      active.current?.controller.abort();
      active.current = null;
      loginRequest.current?.abort();
      loginRequest.current = null;
    };
  }, []);

  function hide() {
    setSecret(null);
    if (active.current?.kind !== "reveal") return;
    active.current.controller.abort();
    active.current = null;
    setPending(null);
  }

  function reveal() {
    const ref = credential?.secret_ref;
    if (!current || !ref) return;
    return run("reveal", async signal => {
      try {
        const value = await revealSettingsSecret(ref, signal);
        if (!signal.aborted) setSecret(value);
      } catch (failure) {
        if (signal.aborted) return;
        if (failure instanceof SettingsError && failure.code === "stale") {
          const observed = await readCredential(signal);
          if (signal.aborted) return;
          void refreshLogin();
          setError(observed ? "凭据引用已失效。已读回当前配置，请重新查看。" : "凭据引用已失效。请重新读取后再查看。");
        } else setError("无法查看凭据，请重试。");
      }
    });
  }

  function write(change: Write, onAcknowledged: () => void) {
    if (!current || !credential) return;
    if (change.kind === "clear" && change.ref !== credential.secret_ref) return;
    return run(change.kind, async signal => {
      setSecret(null);
      loginRequest.current?.abort();
      setLogin({ kind: "loading" });
      let failed: SettingsError | null = null;
      try {
        if (change.kind === "replace") await replaceMusicCredential(change.key, credential.masked, signal);
        else await clearSettingsSecret(change.ref, signal);
      } catch (failure) {
        failed = failure instanceof SettingsError ? failure : new SettingsError("unconfirmed");
      }
      if (signal.aborted) return;
      if (!failed) onAcknowledged();
      const observed = await readCredential(signal);
      if (signal.aborted) return;
      // Start the Worker read after the Settings readback, without holding the credential lane.
      void refreshLogin();
      if (failed) {
        const reason = failed.code === "stale" ? "凭据引用已失效，请重新确认。"
          : failed.code === "auth" ? "登录后才能保存。"
          : failed.code === "persistence" ? "保存失败。" : "保存结果未确认。";
        setError(reason + (observed ? "已读回当前配置，请核对后再操作。" : "读回失败，请重新读取。"));
      } else if (!observed) {
        setError("已收到保存回执，当前配置读回失败。请重新读取。");
      } else if (observed.configured !== (change.kind === "replace")) {
        setError("读回状态与本次操作不一致，请核对当前配置。");
      } else {
        toast.show({ type: "success", text: change.kind === "clear" ? "MUSIC_U 已清除" : "MUSIC_U 已保存" });
      }
    });
  }

  return { credential, current, pending, secret, error, login, refreshCredential, refreshLogin, hide, reveal, write };
}
