import type { ChatSetupViewModel } from "@/application/chat-setup";
import { useAiName } from "@/components/identity/AiNameContext";
import type { MainSelection } from "@/domain/runtime";
import { mainDiagnosticMessage } from "@/components/chat-workspace/chat-sender-policy";
import { useMainModelSelectionDraft } from "./useMainModelSelectionDraft";
import { ModelSelectionPanel } from "./ModelSelectionPanel";

type Props = {
  readonly setup: ChatSetupViewModel;
  readonly disabled: boolean;
  readonly configurationPending?: boolean;
  readonly configurationLoading?: boolean;
  readonly onSave?: (conversationId: string, selection: MainSelection) => Promise<void>;
  readonly onRefresh?: () => Promise<void>;
  readonly onPendingChange?: (pending: boolean) => void;
};
/** Main retains its existing automatic save and execution policy. */
export function MainModelSelection(props: Props) {
  const aiName = useAiName();
  const editor = useMainModelSelectionDraft(props);
  const { setup, onSave, onRefresh } = props;
  const configuration = setup.configuration;
  const diagnostic = configuration?.diagnostic ?? (setup.readiness.kind === "available" && !setup.readiness.value.ready ? setup.readiness.value.reason : null);
  const needsRecovery = !configuration || !!diagnostic || setup.readiness.kind === "unavailable" || !setup.readiness.value.ready;
  const modelStatus = props.configurationLoading ? "正在读取模型配置…" : diagnostic ? mainDiagnosticMessage(diagnostic) : setup.readiness.kind === "unavailable" ? "暂时无法确认模型状态。"
    : setup.readiness.value.ready ? "请核对模型选择。" : mainDiagnosticMessage(setup.readiness.value.reason);
  return <ModelSelectionPanel configuration={configuration} ownerId={setup.conversationId} editor={editor}
    canSave={!!onSave} canRefresh={!!onRefresh} diagnostic={diagnostic} needsRecovery={needsRecovery} recoveryMessage={modelStatus}
    description={`切换模型也可能影响${aiName}之后的主动消息与提醒。`} />;
}
