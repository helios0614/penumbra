import type { ChangeEvent } from "react";
import { AppearanceAvatar } from "@/components/identity/AppearanceAvatar";
import { Button } from "@/components/ui/button";
import {
  APPEARANCE_IMAGE_ACCEPT, APPEARANCE_IMAGE_FORMATS, type AppearanceConfig,
} from "@/domain/appearance/appearance-client";

const roles = [
  { kind: "user", title: "用户头像", slot: "user-avatar" },
  { kind: "assistant", title: "AI 角色头像", slot: "assistant-avatar" },
] as const;

type AvatarSlot = typeof roles[number]["slot"];

export function AppearanceAvatars({ avatars, onUpload, onRemove }: {
  avatars: AppearanceConfig["avatars"];
  onUpload: (slot: AvatarSlot, file: File) => Promise<boolean>;
  onRemove: (slot: AvatarSlot) => Promise<boolean>;
}) {
  function choose(event: ChangeEvent<HTMLInputElement>, slot: AvatarSlot) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file) void onUpload(slot, file);
  }

  return (
    <section className="mist-glass rounded-[24px] p-4 sm:p-5" aria-label="聊天头像">
      <h3 className="text-sm font-semibold text-foreground">聊天头像</h3>
      <p className="mt-1 text-xs text-muted-foreground">支持 {APPEARANCE_IMAGE_FORMATS}，单张最大 20 MB。</p>
      <div className="mt-3 divide-y divide-border">
        {roles.map(({ kind, title, slot }) => (
          <div key={kind} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="flex items-center gap-3">
              <AppearanceAvatar kind={kind} size="lg" />
              <span className="text-sm font-medium">{title}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <label className="relative inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-border-strong px-3 text-xs font-medium hover:bg-background/55 focus-within:outline-2 focus-within:outline-ring has-[:disabled]:cursor-default has-[:disabled]:opacity-50">
                {avatars[kind] ? "替换" : "上传"}
                <input
                  className="sr-only"
                  type="file"
                  accept={APPEARANCE_IMAGE_ACCEPT}
                  aria-label={`${avatars[kind] ? "替换" : "上传"}${title}`}
                  onChange={event => choose(event, slot)}
                />
              </label>
              <Button type="button" variant="ghost" size="comfortable" className="min-h-11 text-xs"
                aria-label={`恢复默认${title}`} disabled={!avatars[kind]} onClick={() => void onRemove(slot)}>
                恢复默认
              </Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
