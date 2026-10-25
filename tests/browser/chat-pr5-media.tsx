/* Standalone manual fixture. No Chat API, uploads, remote music or user data. */
import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { ChatShell } from "/src/components/chat/ChatShell.tsx";
import { BubbleList } from "/src/components/chat/BubbleList.tsx";
import { Sender } from "/src/components/chat/Sender.tsx";
import { SubmissionRecovery } from "/src/components/chat/SubmissionRecovery.tsx";
import { AttachmentDrafts, AttachmentDrop, AttachmentPicker } from "/src/components/chat/AttachmentDrafts.tsx";
import { createAttachmentDraftStore } from "/src/application/chat-media/attachment-drafts.ts";
import { createAudioController } from "/src/application/chat-media/audio-controller.ts";
import { TooltipProvider } from "/src/components/ui/tooltip.tsx";
import { ToastProvider } from "/src/components/ui/toast.tsx";
import type { ChatMessageViewModel } from "/src/components/chat/chat-ui-types.ts";
import type { UploadMime } from "/src/domain/media/media-types.ts";
import type { SenderDraft, SenderHandle } from "/src/components/chat/composer-draft.ts";
import { localTone, pictures, samplePicture, sampleVideo } from "./pr5-synthetic-media";
import "/src/index.css";

const originalFetch = window.fetch.bind(window);
window.fetch = (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.href);
  if (url.origin !== location.origin || !url.pathname.startsWith("/tests/browser/")) return Promise.reject(new Error("合成验收禁止业务/远端请求"));
  return originalFetch(input, init);
};
const tone = localTone();
const audioFactory = () => createAudioController(() => new Audio(), id => id === 43 ? new URL("./media-fixtures/missing.wav", import.meta.url).href : tone);
const images = (count: number) => Array.from({ length: count }, (_, i) => ({ kind: "image" as const, url: pictures[i % 3], label: `合成图片 ${i + 1}` }));
const base = { createdAt: 1792886400 };
const initial: ChatMessageViewModel[] = [
  ...[1, 2, 3, 4, 6].map((count, i) => ({ ...base, id: `media-${i}`, kind: i % 2 ? "assistant" as const : "user" as const,
    content: i === 0 ? "一张横图，完整保留画面。" : i === 2 ? "长文与多图\n\n" + "让内容自然融入聊天，保留每一张图的完整构图。".repeat(12) : "",
    thinking: null, simpleThink: null, attachments: images(count) })),
  { ...base, id: "portrait", kind: "assistant", content: "单张竖图", thinking: null, simpleThink: null, attachments: [images(3)[1]] },
  { ...base, id: "long", kind: "user", content: "", attachments: [images(3)[2]] },
  { ...base, id: "missing", kind: "assistant", content: "坏图与未知附件不影响正文。", thinking: null, simpleThink: null, attachments: [{ kind: "image", url: "/tests/browser/media-fixtures/missing.png", label: "失败图片" }, { kind: "unsupported", label: "附件暂不支持" }] },
  { ...base, id: "songs", kind: "assistant", content: "这里是本机生成的轻音调，用真实 Audio 验证播放、暂停和互斥。第二首使用 404 测试失败。", thinking: null, simpleThink: null,
    attachments: [{ kind: "music", id: 42, name: "A quiet afternoon", artist: "Synthetic · 本机音调", album: "Paper / Mist", cover: pictures[0] }, { kind: "music", id: 43, name: "Missing resource", artist: "合成失败资源" }, { kind: "music", id: 44, name: "Another quiet note", artist: "Synthetic · 互斥检查" }, { kind: "music", id: null, name: "旧记录缺少 ID", artist: "只读展示" }] },
];
function Fixture() {
  const [owner, setOwner] = useState("A"), [messages, setMessages] = useState<Record<string, ChatMessageViewModel[]>>({ A: initial, B: [] }), [notice, setNotice] = useState("");
  const textDrafts = useRef(new Map<string, SenderDraft>());
  const sender = useRef<SenderHandle | null>(null);
  const [phase, setPhase] = useState<"idle" | "submitting" | "streaming" | "unknown">("idle");
  const pending = useRef<((outcome: "accept" | "reject" | "unknown") => void) | null>(null);
  const failUpload = useRef(false), failSend = useRef(false), assets = useRef(new Map<string, { url: string; kind: "image" | "video" }>());
  const [store] = useState(() => createAttachmentDraftStore({ upload: async (file, signal) => {
    const shouldFail = failUpload.current; failUpload.current = false;
    await new Promise(resolve => setTimeout(resolve, 1000));
    if (signal.aborted || shouldFail) throw new Error("合成上传失败");
    const path = `/uploads/${crypto.randomUUID().replaceAll("-", "")}.${file.type.startsWith("video/") ? "webm" : "png"}`;
    assets.current.set(path, { url: URL.createObjectURL(file), kind: file.type.startsWith("video/") ? "video" : "image" });
    return { url: path, type: file.type as UploadMime, name: file.name };
  } }));
  const items = useSyncExternalStore(store.subscribe, () => store.get(owner));
  const recoveries = useSyncExternalStore(store.subscribe, () => store.getRecoveries(owner));
  useEffect(() => () => { store.dispose(); assets.current.forEach(item => URL.revokeObjectURL(item.url)); URL.revokeObjectURL(tone); }, [store]);
  const add = (files: readonly File[]) => store.add(owner, files);
  const sample = async (video: boolean) => { try { add([await (video ? sampleVideo() : samplePicture())]); } catch (e) { setNotice(String(e)); } };
  return <main className="flex h-dvh flex-col bg-background">
    <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border px-3 py-2 text-xs text-muted-strong">
      <strong>PR5 · 合成验收</strong><button onClick={() => document.documentElement.classList.toggle("dark")}>切换明暗</button>
      <button disabled={phase !== "idle"} onClick={() => setOwner(value => value === "A" ? "B" : "A")}>切换会话 · {owner}</button>
      <button onClick={() => void sample(false)}>添加合成 PNG</button><button onClick={() => void sample(true)}>添加合成视频</button>
      <label><input type="checkbox" onChange={e => { failUpload.current = e.currentTarget.checked; }} />下次上传失败</label>
      <label><input type="checkbox" onChange={e => { failSend.current = e.currentTarget.checked; }} />下次发送拒绝</label>
      {phase === "submitting" && <><button onClick={() => pending.current?.("accept")}>接受本次提交</button><button onClick={() => pending.current?.("reject")}>明确拒绝本次提交</button><button onClick={() => pending.current?.("unknown")}>本次结果未知</button></>}
      {phase === "streaming" && <button onClick={() => { setPhase("idle"); setNotice("合成保存完成；下一轮草稿保持不变。"); }}>完成回复与保存</button>}
      {phase === "unknown" && <button onClick={() => { setPhase("idle"); setNotice("仅模拟人工核对后解除锁定，不确认提交不存在；仍须手动恢复或丢弃暂存。"); }}>已核对历史，解除锁定</button>}
      <span>没有真实上传或远端音乐。{notice}</span>
    </header>
    <ChatShell header={<div className="px-4 py-2 text-xs text-muted-foreground">会话 {owner} · 提交后使用顶部按钮控制响应及完成；期间可继续编辑文字、添加附件。歌曲信息请求被禁用。</div>}
      composer={<AttachmentDrop disabled={false} onFiles={add}><Sender key={owner} apiRef={sender} initialDraft={textDrafts.current.get(owner)} onDraftChange={draft => textDrafts.current.set(owner, draft)} onFiles={add} hasAttachments={items.length > 0} attachmentsReady={items.every(item => item.status === "uploaded")} submitDisabled={phase !== "idle"}
        attachments={<AttachmentDrafts owner={owner} items={items} store={store} disabled={false} />}
        feedback={<SubmissionRecovery items={recoveries} locked={phase !== "idle"} onRestore={item => {
          if (!store.getRecoveries(owner).some(current => current.id === item.id)) return;
          if (item.content && !sender.current?.append(item.content)) return;
          store.restoreRecovery(owner, item.id);
        }} onDiscard={id => store.discardRecovery(owner, id)} />}
        tools={<><AttachmentPicker disabled={false} onFiles={add} /><p className="px-4 py-3 text-xs">模型入口保留在同一菜单；此页不调用模型。</p></>}
        onSend={async content => {
          const snap = store.capture(owner); if (!snap) return false;
          const id = crypto.randomUUID();
          setPhase("submitting");
          setMessages(old => ({ ...old, [owner]: [...old[owner], { ...base, id, kind: "user", content,
            attachments: snap.urls.map(url => ({ ...assets.current.get(url)!, label: "本地合成发送" })) }] }));
          try {
            const outcome = failSend.current ? "reject" : await new Promise<"accept" | "reject" | "unknown">((resolve) => { pending.current = resolve; });
            failSend.current = false; pending.current = null;
            if (outcome === "accept") { snap.accept(); setPhase("streaming"); return true; }
            snap.preserve(content); setPhase(outcome === "unknown" ? "unknown" : "idle");
            if (outcome === "reject") setMessages(old => ({ ...old, [owner]: old[owner].filter(message => message.id !== id) }));
            setNotice(outcome === "unknown" ? "合成结果未知：不重传、不重发，暂存与下一轮草稿分开。" : "合成发送明确拒绝：原提交单独暂存，已上传 URL 可手动恢复复用。");
            return "retained" as const;
          } finally { snap.release(); }
        }} /></AttachmentDrop>}>
      <BubbleList timelineKey={owner} messages={messages[owner]} audioControllerFactory={audioFactory} />
    </ChatShell>
  </main>;
}
createRoot(document.getElementById("root")!).render(<ToastProvider><TooltipProvider><Fixture /></TooltipProvider></ToastProvider>);
