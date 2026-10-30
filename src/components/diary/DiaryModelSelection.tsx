import { useEffect, useRef, useState } from "react";
import { ModelSelectionPanel } from "@/components/chat/ModelSelectionPanel";
import { mainDiagnosticMessage } from "@/components/chat-workspace/chat-sender-policy";
import { createDiaryModelController, initialDiaryModelState, type DiaryModelState } from "@/application/diary-chat/diary-model-controller";

export function DiaryModelSelection({ entryId, disabled, onPendingChange }: {
  readonly entryId: string; readonly disabled: boolean; readonly onPendingChange: (pending: boolean) => void;
}) {
  const [controller, setController] = useState<ReturnType<typeof createDiaryModelController> | null>(null);
  const live = useRef<typeof controller>(null);
  const [state, setState] = useState<DiaryModelState>(initialDiaryModelState);
  useEffect(() => {
    const active = createDiaryModelController(); live.current = active; setController(active);
    const unsubscribe = active.subscribe(setState);
    void active.open(entryId);
    return () => { live.current = null; unsubscribe(); active.dispose(); onPendingChange(false); };
  }, [entryId, onPendingChange]);
  const current = state.entryId === entryId ? state : initialDiaryModelState;
  const configuration = current.configuration?.display;
  const locked = !controller || disabled || current.loading || current.pending;
  const diagnostic = configuration?.diagnostic;
  const notice = current.loading ? "正在读取模型配置…" : current.notice;
  return <ModelSelectionPanel ownerId={entryId} configuration={configuration} explicitSave allowSaveUnchanged={current.configuration?.independent === false}
    editor={{ draft: current.draft, dirty: current.dirty, pending: current.pending, notice, locked,
      complete: !!current.draft.connectionId && !!current.draft.protocol && !!current.draft.model.trim(),
      change: patch => locked ? null : controller!.change(patch),
      commit: () => {
        if (locked || !controller) return;
        onPendingChange(true);
        void controller.save().finally(() => { if (live.current === controller) onPendingChange(false); });
      }, refresh: () => controller?.refresh() ?? Promise.resolve() }}
    canSave={!disabled} canRefresh={!disabled} needsRecovery={!!diagnostic} recoveryMessage={diagnostic ? mainDiagnosticMessage(diagnostic) : ""}
    sourceLabel={current.configuration ? current.configuration.independent ? "当前日记的独立配置" : "兼容配置（尚未独立保存）" : undefined}
    onCancel={() => controller?.cancel()} description="仅影响当前日记的回复与重新生成。" />;
}
