import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui/toast";
import {
  matchesEmbeddingWrite, readEmbeddingSettings, writeEmbeddingSettings, type EmbeddingSettings, type EmbeddingWrite,
} from "@/domain/embedding-settings/embedding-settings-client";
import { revealSettingsSecret, SettingsError } from "@/domain/service-settings/settings-client";

export type EmbeddingScope = "page" | "address" | "key";
type Operation = "read" | "reveal" | EmbeddingWrite["kind"];

export function useEmbeddingSettings() {
  const [snapshot, setSnapshot] = useState<EmbeddingSettings | null>(null);
  const [current, setCurrent] = useState(false);
  const [pending, setPending] = useState<Operation | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<{ scope: EmbeddingScope; text: string } | null>(null);
  const active = useRef<{ kind: Operation; controller: AbortController } | null>(null);
  const toast = useToast("embedding-settings");

  function run(kind: Operation, task: (signal: AbortSignal) => Promise<void>) {
    if (active.current) return;
    const controller = new AbortController();
    active.current = { kind, controller };
    setPending(kind);
    setError(null);
    return task(controller.signal).finally(() => {
      if (active.current?.controller !== controller) return;
      active.current = null;
      setPending(null);
    });
  }

  async function read(signal: AbortSignal) {
    try {
      const observed = await readEmbeddingSettings(signal);
      if (signal.aborted) return;
      setSnapshot(observed);
      setCurrent(true);
      return observed;
    } catch {
      if (!signal.aborted) setCurrent(false);
    }
  }

  function refresh(scope: EmbeddingScope = "page") {
    return run("read", async signal => {
      setSecret(null);
      if (!await read(signal) && !signal.aborted) setError({ scope, text: "无法读取 Embedding 服务配置，请重试。" });
    });
  }

  useEffect(() => {
    void refresh();
    return () => {
      active.current?.controller.abort();
      active.current = null;
    };
  }, []);

  useEffect(() => {
    if (secret === null) return;
    const timer = window.setTimeout(() => setSecret(null), 30_000);
    return () => window.clearTimeout(timer);
  }, [secret]);

  function hide() {
    setSecret(null);
    if (active.current?.kind !== "reveal") return;
    active.current.controller.abort();
    active.current = null;
    setPending(null);
  }

  function reveal() {
    const ref = snapshot?.credential.secret_ref;
    if (!current || !ref) return;
    return run("reveal", async signal => {
      try {
        const value = await revealSettingsSecret(ref, signal);
        if (!signal.aborted) setSecret(value);
      } catch (failure) {
        if (signal.aborted) return;
        if (failure instanceof SettingsError && failure.code === "stale") {
          const observed = await read(signal);
          if (!signal.aborted) setError({ scope: "key", text: observed
            ? "凭据引用已失效。已读回当前配置，请重新查看。"
            : "凭据引用已失效。请重新读取后再查看。" });
        } else setError({ scope: "key", text: "无法查看凭据，请重试。" });
      }
    });
  }

  function write(change: EmbeddingWrite, onVerified: () => void) {
    if (!current || !snapshot) return;
    if (change.kind === "clear" && change.ref !== snapshot.credential.secret_ref) return;
    const scope = change.kind === "address" ? "address" : "key";
    return run(change.kind, async signal => {
      setSecret(null);
      let failure: SettingsError | null = null;
      try {
        await writeEmbeddingSettings(change, snapshot, signal);
      } catch (error) {
        failure = error instanceof SettingsError ? error : new SettingsError("unconfirmed");
      }
      if (signal.aborted) return;
      const observed = await read(signal);
      if (signal.aborted) return;
      if (failure) {
        const reason = failure.code === "stale" ? "凭据引用已失效，请重新确认。"
          : failure.code === "auth" ? "登录后才能保存。"
          : failure.code === "persistence" ? "保存失败。" : "保存结果未确认。";
        setError({ scope, text: reason + (observed ? "已读回当前配置，请核对后再操作。" : "读回失败，请重新读取。") });
        return;
      }
      if (!observed) {
        setError({ scope, text: "已收到保存回执，当前配置读回失败。请重新读取。" });
        return;
      }
      if (!matchesEmbeddingWrite(change, observed)) {
        setError({ scope, text: "读回状态与本次操作不一致，请核对当前配置。" });
        return;
      }
      onVerified();
      const text = change.kind === "address" ? "API 地址配置状态已确认"
        : change.kind === "replace" ? "Embedding API Key 已保存" : "Embedding API Key 已清除";
      toast.show({ type: "success", text });
    });
  }

  return { snapshot, current, pending, error, secret, refresh, hide, reveal, write };
}
