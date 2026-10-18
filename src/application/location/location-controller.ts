import * as client from "@/domain/location/location-client";
import { type LocationConfig } from "@/domain/location";
import { buildLocationPatch, changedFields, draftFromConfig, NUMBER_KEYS, rebaseDraft, SETTINGS_KEYS, validateDraft, type LocationDraft, type LocationSaveSection } from "./location-draft";
import { INITIAL_LOCATION_STATE, locationFailure, type LocationState } from "./location-state";

export function createLocationController(api = client) {
  let state: LocationState = { ...INITIAL_LOCATION_STATE }, disposed = false;
  let secretGeneration = 0, secretTimer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<(value: LocationState) => void>();
  const reads = new Map<"config" | "status", { abort: AbortController; promise: Promise<boolean> }>();
  let mutation: AbortController | null = null;
  const publish = (change: Partial<LocationState>) => {
    if (disposed) return;
    const next = { ...state, ...change };
    state = { ...next, dirty: Boolean(next.replacementKey.trim() || (next.baseline && next.draft && changedFields(next.baseline, next.draft).length)) };
    listeners.forEach((listener) => listener(state));
  };
  const feedback = (text: string, error = false, section?: LocationSaveSection) => publish({ feedback: { text, error, section } });
  const cancelRead = (key: "config" | "status") => { reads.get(key)?.abort.abort(); reads.delete(key); };
  const hideKey = () => { secretGeneration++; clearTimeout(secretTimer); publish({ revealedKey: null }); };
  const applyConfig = (config: LocationConfig, resetFields: readonly (keyof LocationDraft)[] = []) => {
    const next = draftFromConfig(config);
    const homeChanged = state.config && (["home_lng", "home_lat", "home_threshold"] as const).some((key) => state.config!.values[key] !== config.values[key]);
    const draft = state.draft && state.baseline ? rebaseDraft(state.baseline, state.draft, next) : next;
    Object.assign(draft, Object.fromEntries(resetFields.map((key) => [key, next[key]])));
    if (config.credential.secretRef !== state.config?.credential.secretRef) hideKey();
    publish({ config, baseline: next, draft, configError: null, homeAwaitingReport: homeChanged && state.homeAwaitingReport === null ? state.status?.updatedAt ?? 0 : state.homeAwaitingReport });
  };
  const read = (key: "config" | "status", force = false, resetFields: readonly (keyof LocationDraft)[] = []): Promise<boolean> => {
    if (disposed) return Promise.resolve(false);
    if (force) cancelRead(key);
    const current = reads.get(key);
    if (current) return current.promise;
    const abort = new AbortController();
    publish(key === "config" ? { configLoading: true } : { statusLoading: true });
    const promise = (async () => {
      try {
        if (key === "config") {
          const config = await api.getLocationConfig({ signal: abort.signal });
          if (disposed || abort.signal.aborted) return false;
          applyConfig(config, resetFields);
        } else {
          const status = await api.getLocationStatus({ signal: abort.signal });
          if (disposed || abort.signal.aborted) return false;
          publish({ status, statusError: null });
        }
        return true;
      } catch (error) {
        if (!disposed && !abort.signal.aborted) publish(key === "config" ? { configError: locationFailure(error) } : { statusError: locationFailure(error) });
        return false;
      } finally {
        if (reads.get(key)?.abort === abort) {
          reads.delete(key);
          publish(key === "config" ? { configLoading: false } : { statusLoading: false });
        }
      }
    })();
    reads.set(key, { abort, promise });
    return promise;
  };
  const refresh = async (force = true, reportedAt?: number | null) => {
    if (state.pending) return; // Writes reconcile after acknowledgement; do not race their config read.
    const marker = state.homeAwaitingReport;
    const [, statusRead] = await Promise.all([read("config", force), read("status", force)]);
    // Quiet/no-key heartbeats also advance updated_at, but do not recalculate distance or broadcast.
    if (statusRead && !state.pending && marker !== null && marker === state.homeAwaitingReport && reportedAt && reportedAt > marker && (state.status?.updatedAt ?? 0) >= reportedAt) publish({ homeAwaitingReport: null });
  };
  const run = async (pending: NonNullable<LocationState["pending"]>, operation: (signal: AbortSignal) => Promise<void>, section?: LocationSaveSection) => {
    if (disposed || state.pending) return;
    mutation = new AbortController();
    publish({ pending, feedback: null });
    try { await operation(mutation.signal); }
    catch (error) { if (!disposed) feedback(locationFailure(error), true, section); }
    finally { mutation = null; publish({ pending: null }); }
  };
  const canWrite = () => Boolean(state.config && state.draft && !state.configError && !state.configLoading && !state.pending);
  const savedConfig = async (resetFields: readonly (keyof LocationDraft)[] = [], section?: LocationSaveSection) => {
    const verified = await read("config", true, resetFields);
    if (!verified) feedback("操作已提交，但配置尚未重新读取成功；请刷新显示确认，当前草稿已保留。", true, section);
    await read("status", true);
    return verified;
  };
  const saveSection = async (section: LocationSaveSection) => {
    if (!canWrite() || !state.config || !state.draft) return;
    const fields: readonly (keyof LocationDraft)[] = section === "settings" ? SETTINGS_KEYS : section === "position" ? NUMBER_KEYS : [];
    const validation = validateDraft(state.draft, fields);
    publish({ validation: { ...Object.fromEntries(Object.entries(state.validation).filter(([key]) => !fields.includes(key as keyof LocationDraft))), ...validation } });
    if (Object.keys(validation).length) { feedback("请检查此区域的输入。", true, section); return; }
    const patch = buildLocationPatch(state.config, state.draft, section === "key" ? state.replacementKey : "", fields);
    if (!Object.keys(patch).length) { feedback("没有需要保存的更改。", false, section); return; }
    const resetFields = Object.keys(patch).filter((key) => key !== "amap_key") as (keyof LocationDraft)[];
    await run(section === "settings" ? "save" : section === "position" ? "save-position" : "save-key", async (signal) => {
      cancelRead("config"); hideKey();
      await api.saveLocationConfig(patch, { signal });
      if (disposed) return;
      if ("home_lng" in patch || "home_lat" in patch || "home_threshold" in patch) publish({ homeAwaitingReport: state.status?.updatedAt ?? 0 });
      if (await savedConfig(resetFields, section)) {
        if (section === "key") publish({ replacementKey: "" });
        feedback(section === "key" ? "Key 已保存。" : section === "position" ? "位置参数已保存。" : "配置已保存。", false, section);
      }
    }, section);
  };
  return {
    getState: () => state,
    subscribe(listener: (value: LocationState) => void) { listeners.add(listener); listener(state); return () => { listeners.delete(listener); }; },
    refresh,
    async refreshDisplay() { await refresh(); if (!state.configError && !state.statusError) feedback(state.dirty ? "显示已更新，未保存的修改已保留。" : "已重新读取最近上报的数据。"); },
    edit<K extends keyof LocationDraft>(key: K, value: LocationDraft[K]) {
      if (state.pending || !state.draft) return;
      publish({ draft: { ...state.draft, [key]: value }, validation: {}, feedback: null });
    },
    clearPeriod(kind: "weekday" | "weekend") {
      if (state.pending || !state.draft) return;
      publish({ draft: { ...state.draft, [`quiet_hours_${kind}_start`]: "", [`quiet_hours_${kind}_end`]: "" }, validation: {}, feedback: null });
    },
    replaceKey(value: string) { if (!state.pending) publish({ replacementKey: value, feedback: null }); },
    discard() { if (!state.pending && state.baseline) { hideKey(); publish({ draft: { ...state.baseline }, replacementKey: "", validation: {}, feedback: null }); } },
    save: () => saveSection("settings"),
    savePosition: () => saveSection("position"),
    saveKey: () => saveSection("key"),
    async setHome() {
      if (!canWrite() || !state.status?.coordinate) return;
      await run("set-home", async (signal) => {
        cancelRead("config");
        const result = await api.setLocationHome({ signal });
        if (disposed) return;
        publish({ homeAwaitingReport: state.status?.updatedAt ?? 0,
          draft: state.draft ? { ...state.draft, home_lng: String(result.coordinate.lng), home_lat: String(result.coordinate.lat) } : null });
        // The endpoint uses the newest server coordinate, which may differ from the confirmation snapshot.
        if (await savedConfig(["home_lng", "home_lat"])) feedback(`家庭位置已设为 ${result.coordinate.lng}, ${result.coordinate.lat}；状态与距离等待后续上报重新计算。`);
      });
    },
    async clearKey() {
      const ref = state.config?.credential.secretRef;
      if (!canWrite() || !ref) return;
      await run("clear-key", async (signal) => {
        cancelRead("config"); hideKey();
        await api.clearLocationKey(ref, { signal });
        if (await savedConfig()) feedback("已清除已保存的高德 Key，其他草稿保持不变。");
      });
    },
    hideKey,
    async useKey(copy?: (value: string) => Promise<void>) {
      const ref = state.config?.credential.secretRef;
      if (!ref || !canWrite()) return;
      hideKey();
      const generation = secretGeneration;
      await run(copy ? "copy-key" : "reveal-key", async (signal) => {
        const secret = await api.revealLocationKey(ref, { signal });
        const current = () => !disposed && generation === secretGeneration && ref === state.config?.credential.secretRef;
        if (!current()) return;
        if (copy) { await copy(secret); if (current()) feedback("Key 已复制。"); }
        else { publish({ revealedKey: secret }); secretTimer = setTimeout(hideKey, 15_000); }
      });
    },
    async search(category: string) {
      if (!category.trim() || category.includes("|") || !state.status?.coordinate || !state.config?.credential.configured || state.configError) return;
      await run("search", async (signal) => {
        publish({ searchError: null });
        try {
          const result = await api.searchLocationPois(category, { signal });
          if (disposed) return;
          publish({ searchResult: result, status: state.status ? { ...state.status, pois: { ...state.status.pois, [result.category]: result.items } } : null });
        } catch (error) { publish({ searchError: locationFailure(error) }); }
        await read("status", true);
      });
    },
    dispose() {
      hideKey(); disposed = true; mutation?.abort(); cancelRead("config"); cancelRead("status"); listeners.clear();
      state = { ...state, revealedKey: null, replacementKey: "" };
    },
  };
}
export type LocationController = ReturnType<typeof createLocationController>;
