import * as activity from "@/domain/activity";
import * as device from "@/domain/device-context";
import { INITIAL_ACTIVITY_STATE, activityFailure, activityReadFailure, type ActivityReads, type ActivityState, type ReadState } from "./activity-state";

const defaultClient = { ...activity, ...device };
type ReadKey = keyof ActivityReads;
type ReadValue<K extends ReadKey> = NonNullable<ActivityReads[K]["data"]>;

export function createActivityController(client = defaultClient, clock = () => performance.now()) {
  let state: ActivityState = { ...INITIAL_ACTIVITY_STATE, clockNow: clock() };
  let disposed = false, dirty = false, feedbackGeneration = 0;
  const listeners = new Set<(state: ActivityState) => void>();
  const requests = new Map<ReadKey, { abort: AbortController; promise: Promise<void> }>();
  const mutations = new Set<AbortController>();
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let expiry: ReturnType<typeof setTimeout> | undefined;
  const publish = (change: Partial<ActivityState>) => {
    if (disposed) return;
    state = { ...state, ...change, clockNow: clock() };
    listeners.forEach((listener) => listener(state));
  };
  const put = <K extends ReadKey>(key: K, value: ReadState<ReadValue<K>>) => publish({ [key]: value });
  const cancel = (key: ReadKey) => { requests.get(key)?.abort.abort(); requests.delete(key); };
  const read = <K extends ReadKey>(key: K, loader: (signal: AbortSignal) => Promise<ReadValue<K>>, force = false): Promise<void> => {
    if (disposed) return Promise.resolve();
    if (force) cancel(key);
    const active = requests.get(key);
    if (active) return active.promise;
    const abort = new AbortController();
    put(key, { ...state[key], loading: true, error: null, failure: undefined } as ReadState<ReadValue<K>>);
    const promise = Promise.resolve().then(() => loader(abort.signal)).then((data) => {
      if (!disposed && !abort.signal.aborted) put(key, { data, loading: false, error: null });
    }).catch((error: unknown) => {
      if (!disposed && !abort.signal.aborted) put(key, { data: key === "phone" ? null : state[key].data, loading: false, error: activityFailure(error), failure: activityReadFailure(error) } as ReadState<ReadValue<K>>);
    }).finally(() => { if (requests.get(key)?.abort === abort) requests.delete(key); });
    requests.set(key, { abort, promise });
    return promise;
  };
  const loadDates = (force = false) => read("dates", (signal) => client.getActivityDates({ signal }), force);
  const loadVisibility = (force = false) => read("visibility", (signal) => client.getDeviceAiVisible({ signal }), force);
  const loadWifi = (force = false) => read("wifi", (signal) => client.getWifiConfig({ signal }), force);
  const loadLegacy = () => read("legacyEnabled", (signal) => client.getActivityEnabled({ signal }));
  const loadSummary = (force = false) => read("summary", (signal) => client.getActivitySummary({ signal }), force);
  const armExpiry = () => {
    clearTimeout(expiry);
    if (disposed || !state.phone.data) return;
    const { status, startedAt } = state.phone.data;
    const deadlines = [status.battery.expiresAt, status.wifi.expiresAt].filter((stamp): stamp is number => stamp !== null)
      .map((stamp) => startedAt + (stamp - status.evaluatedAt) * 1000 - clock()).filter((delay) => delay > 0);
    if (deadlines.length) expiry = setTimeout(() => {
      publish({}); // Mask only groups whose server deadline has passed, even if GET is slow.
      armExpiry(); // The other group's deadline must still fire during an in-flight GET.
      void loadPhone();
    }, Math.max(1, Math.ceil(Math.min(...deadlines))));
  };
  const loadPhone = async () => {
    await read("phone", async (signal) => {
      const startedAt = clock();
      return { status: await client.getDeviceStatus({ signal }), startedAt };
    });
    armExpiry();
  };
  const scheduleLogs = () => {
    if (disposed || state.query.kind !== "recent" || debounce !== undefined) return;
    debounce = setTimeout(() => { debounce = undefined; void loadLogs(); }, 600);
  };
  const loadLogs = async (force = false) => {
    if (!requests.has("logs") || force) dirty = false;
    const query = state.query;
    await read("logs", (signal) => client.getActivityRecords(query, { signal }), force);
    if (!disposed && dirty && state.query.kind === "recent") { dirty = false; scheduleLogs(); }
  };
  const invalidateLogs = () => {
    if (state.query.kind !== "recent") return;
    if (requests.has("logs")) dirty = true;
    else scheduleLogs();
  };
  const selectQuery = async (query: activity.ActivityQuery) => {
    if (JSON.stringify(query) === JSON.stringify(state.query)) return;
    clearTimeout(debounce); debounce = undefined; dirty = false;
    cancel("logs");
    feedbackGeneration++;
    publish({ query, notice: null, logs: { data: null, loading: false, error: null } });
    await loadLogs();
  };
  const refreshPhone = () => Promise.all([loadPhone(), loadVisibility(), loadWifi()]);
  const refresh = () => Promise.all([loadLogs(), loadDates(), refreshPhone(), loadLegacy()]);
  const mutate = async (kind: NonNullable<ActivityState["pending"]>, operation: (signal: AbortSignal) => Promise<string>, reconcile: () => Promise<unknown>, source: NonNullable<ActivityState["notice"]>["source"] = kind) => {
    if (disposed || state.pending) return false;
    let acknowledged = false;
    const generation = feedbackGeneration;
    const abort = new AbortController(); mutations.add(abort);
    publish({ pending: kind, notice: null });
    try {
      const text = await operation(abort.signal);
      acknowledged = true;
      if (!disposed && generation === feedbackGeneration) publish({ notice: { error: false, text, source } });
    } catch (error) {
      if (!disposed && generation === feedbackGeneration) publish({ notice: { error: true, text: `${activityFailure(error)} 操作结果需核对，请先重新读取；不会自动重复提交。`, source } });
    } finally {
      if (!disposed) await reconcile();
      mutations.delete(abort);
      publish({ pending: null });
    }
    return acknowledged && !disposed;
  };
  return {
    getState: () => state,
    subscribe(listener: (state: ActivityState) => void) { listeners.add(listener); listener(state); return () => listeners.delete(listener); },
    start: refresh, refresh, refreshPhone, loadLogs, loadDates, loadSummary, loadWifi, loadVisibility, loadLegacy, selectQuery, invalidateLogs,
    selectDevice(device: activity.ActivityDevice) { if (device !== state.device) { feedbackGeneration++; publish({ device, notice: null }); } },
    setVisibility(visible: boolean) {
      if (state.pending || disposed) return Promise.resolve(false);
      cancel("visibility");
      return mutate("visibility", async (signal) => { await client.setDeviceAiVisible(visible, { signal }); return visible ? "已允许 AI 查看手机状态" : "已关闭 AI 手机状态读取"; }, () => loadVisibility(true));
    },
    saveMapping(ssid: string, scene: device.WifiMapping["scene"] | null, source: "wifi" | "wifi-dialog" = "wifi") {
      const config = state.wifi.data;
      if (disposed || state.pending || !config || state.wifi.loading || state.wifi.error) return Promise.resolve(false);
      const mappings = config.mappings.filter((entry) => entry.ssid !== ssid);
      if (scene) mappings.push({ ssid, scene });
      cancel("wifi");
      return mutate("wifi", async (signal) => {
        const data = await client.saveWifiConfig(config, mappings, { signal });
        put("wifi", { data, loading: false, error: null });
        return scene ? "网络标记已更新" : "网络标记已移除";
      }, () => loadWifi(true), source);
    },
    clearAll() {
      return mutate("clear", async (signal) => {
        const deleted = await client.clearActivityLogs({ signal });
        cancel("logs"); cancel("summary");
        publish({ logs: { data: null, loading: true, error: null }, summary: { data: null, loading: false, error: null } });
        return `已清空 ${deleted} 个活动日志文件`;
      }, () => Promise.all([loadLogs(true), loadDates(true), loadSummary(true)]));
    },
    dispose() {
      disposed = true;
      clearTimeout(debounce); clearTimeout(expiry);
      requests.forEach(({ abort }) => abort.abort()); requests.clear();
      mutations.forEach((abort) => abort.abort()); mutations.clear(); listeners.clear();
    },
  };
}
export type ActivityController = ReturnType<typeof createActivityController>;
