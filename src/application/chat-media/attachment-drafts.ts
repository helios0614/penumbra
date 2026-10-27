import { validateUpload, type UploadedMedia } from "@/domain/media/media-types";
import { uploadMedia } from "@/domain/media/media-client";

export type DraftAttachment = {
  readonly id: string; readonly owner: string; readonly revision: number; readonly requestId: number;
  readonly file: File; readonly previewUrl: string | null; readonly kind: "image" | "video";
  readonly status: "uploading" | "uploaded" | "failed"; readonly error: string | null;
  readonly uploaded: UploadedMedia | null; readonly retryable: boolean;
};
export type AttachmentSubmissionRecovery = {
  readonly id: string; readonly owner: string; readonly content: string; readonly items: readonly DraftAttachment[];
  readonly clientMessageId?: string;
};
type Entry = { item: DraftAttachment; refs: number; abort: AbortController | null };
type Dependencies = {
  upload: typeof uploadMedia; createUrl: (file: File) => string; revokeUrl: (url: string) => void; id: () => string;
};

/** Page-owned drafts. Upload completion never changes the selected conversation. */
export function createAttachmentDraftStore(overrides: Partial<Dependencies> = {}) {
  let nextId = 0;
  // Draft IDs are local to this store, never server file IDs or client_msg_id.
  const deps: Dependencies = { upload: uploadMedia, createUrl: file => URL.createObjectURL(file), revokeUrl: url => URL.revokeObjectURL(url), id: () => `draft:${++nextId}`, ...overrides };
  const drafts = new Map<string, readonly DraftAttachment[]>(), entries = new Map<string, Entry>();
  const recoveries = new Map<string, readonly AttachmentSubmissionRecovery[]>(), ownerEpochs = new Map<string, number>();
  const listeners = new Set<() => void>();
  let revision = 0, submissionId = 0, alive = true;
  const emit = () => listeners.forEach(fn => fn());
  const get = (owner: string) => drafts.get(owner) ?? EMPTY;
  const getRecoveries = (owner: string) => recoveries.get(owner) ?? EMPTY_RECOVERIES;
  const release = (id: string) => {
    const entry = entries.get(id);
    if (!entry || --entry.refs > 0) return;
    entry.abort?.abort();
    if (entry.item.previewUrl) deps.revokeUrl(entry.item.previewUrl);
    entries.delete(id);
  };
  const retain = (ids: readonly string[]) => {
    ids.forEach(id => { const e = entries.get(id); if (e) e.refs++; });
    let held = true;
    return () => { if (!held) return; held = false; ids.forEach(release); };
  };
  const update = (entry: Entry, item: DraftAttachment) => {
    entry.item = item;
    drafts.set(item.owner, get(item.owner).map(old => old.id === item.id ? item : old)); emit();
  };
  const upload = async (entry: Entry) => {
    const before = entry.item;
    entry.abort?.abort();
    const abort = new AbortController(); entry.abort = abort;
    const requestId = before.requestId + 1;
    update(entry, { ...before, requestId, status: "uploading", error: null });
    const current = () => alive && !abort.signal.aborted && entries.get(before.id) === entry &&
      entry.item.requestId === requestId && get(before.owner).some(item => item.id === before.id);
    try {
      const uploaded = await deps.upload(before.file, abort.signal);
      if (current()) update(entry, { ...entry.item, status: "uploaded", uploaded, error: null });
    } catch {
      if (current()) update(entry, { ...entry.item, status: "failed", error: "上传未确认，文件已保留。请检查网络和文件后显式重试。" });
    } finally { if (entry.abort === abort) entry.abort = null; }
  };
  const remove = (owner: string, id: string) => {
    if (!get(owner).some(item => item.id === id)) return;
    entries.get(id)?.abort?.abort();
    drafts.set(owner, get(owner).filter(item => item.id !== id)); release(id); emit();
  };
  return {
    get, getRecoveries, owners: () => [...new Set([...drafts.keys(), ...recoveries.keys()])], subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; }, retain,
    add(owner: string, files: readonly File[]) {
      if (!alive || !owner) return;
      for (const file of files) {
        const error = validateUpload(file);
        let previewUrl: string | null = null;
        if (!error) { try { previewUrl = deps.createUrl(file); } catch { /* The file can still be uploaded. */ } }
        const item: DraftAttachment = { id: deps.id(), owner, revision: ++revision, requestId: 0, file, previewUrl,
          kind: file.type.startsWith("video/") ? "video" : "image", status: error ? "failed" : "uploading", error, uploaded: null, retryable: !error };
        const entry: Entry = { item, refs: 1, abort: null }; entries.set(item.id, entry);
        drafts.set(owner, [...get(owner), item]); emit();
        if (!error) void upload(entry);
      }
    },
    remove,
    retry(owner: string, id: string) {
      const e = entries.get(id);
      if (alive && e && e.item.owner === owner && e.item.status === "failed" && e.item.retryable && get(owner).some(item => item.id === id)) void upload(e);
    },
    capture(owner: string) {
      const items = get(owner);
      if (!alive || !owner || items.some(item => item.status !== "uploaded" || !item.uploaded)) return null;
      const ids = items.map(item => item.id), done = retain(ids);
      const epoch = ownerEpochs.get(owner), id = `submission:${++submissionId}`;
      let settled = false, released = false;
      const current = () => alive && ownerEpochs.get(owner) === epoch;
      // Transfer draft ownership to the immutable submission before the optimistic row appears.
      drafts.set(owner, EMPTY); ids.forEach(release); emit();
      return { urls: items.map(item => item.uploaded!.url),
        accept: () => { settled = true; },
        preserve: (content: string, clientMessageId?: string) => {
          if (released || settled || !current()) return;
          settled = true;
          ids.forEach(id => { entries.get(id)!.refs++; });
          recoveries.set(owner, [...getRecoveries(owner), { id, owner, content, items, clientMessageId }]); emit();
        },
        release: () => {
          if (released) return;
          released = true;
          if (!settled && current()) {
            ids.forEach(id => { entries.get(id)!.refs++; });
            drafts.set(owner, [...items, ...get(owner)]); emit();
          }
          done();
        } };
    },
    restoreRecovery(owner: string, id: string) {
      const recovery = getRecoveries(owner).find(item => item.id === id);
      if (!alive || !recovery) return null;
      drafts.set(owner, [...recovery.items, ...get(owner)]);
      recoveries.set(owner, getRecoveries(owner).filter(item => item.id !== id)); emit();
      return recovery.content;
    },
    discardRecovery(owner: string, id: string) {
      const recovery = getRecoveries(owner).find(item => item.id === id);
      if (!recovery) return;
      recoveries.set(owner, getRecoveries(owner).filter(item => item.id !== id));
      recovery.items.forEach(item => release(item.id)); emit();
    },
    delete(owner: string) {
      ownerEpochs.set(owner, (ownerEpochs.get(owner) ?? 0) + 1);
      get(owner).forEach(item => remove(owner, item.id)); drafts.delete(owner);
      getRecoveries(owner).forEach(item => item.items.forEach(item => release(item.id))); recoveries.delete(owner); emit();
    },
    activate() { alive = true; },
    dispose() {
      alive = false;
      [...drafts.keys()].forEach(owner => get(owner).forEach(item => remove(owner, item.id)));
      [...new Set([...drafts.keys(), ...recoveries.keys()])].forEach(owner => {
        ownerEpochs.set(owner, (ownerEpochs.get(owner) ?? 0) + 1);
        getRecoveries(owner).forEach(item => item.items.forEach(item => release(item.id)));
      });
      recoveries.clear();
      drafts.clear();
      // Viewer/snapshot leases may outlive the draft but still release their handles.
    },
  };
}
const EMPTY: readonly DraftAttachment[] = Object.freeze([]);
const EMPTY_RECOVERIES: readonly AttachmentSubmissionRecovery[] = Object.freeze([]);
export type AttachmentDraftStore = ReturnType<typeof createAttachmentDraftStore>;
