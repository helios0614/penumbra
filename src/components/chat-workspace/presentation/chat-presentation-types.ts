export type ChatConversationItemViewModel = {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string | null;
  readonly modelKey: string | null;
  readonly updatedAt: number | null;
  readonly isSelected: boolean;
  readonly isPending: boolean;
};

export type ChatAttachmentViewModel = {
  readonly kind: "unsupported";
  readonly label: "附件暂不支持";
};

type ChatVisibleMessageBase = {
  readonly id: string;
  readonly content: string;
  readonly createdAt: number;
  readonly executionStatus?:
    | "optimistic"
    | "streaming"
    | "finalizing"
    | "unconfirmed";
};

export type ChatMessageViewModel =
  | (ChatVisibleMessageBase & {
      readonly kind: "user";
      readonly attachments: readonly ChatAttachmentViewModel[];
    })
  | (ChatVisibleMessageBase & {
      readonly kind: "assistant";
      readonly thinking: string | null;
      readonly simpleThink: string | null;
      readonly attachments: readonly ChatAttachmentViewModel[];
    })
  | (ChatVisibleMessageBase & {
      readonly kind: "system";
    })
  | (ChatVisibleMessageBase & {
      readonly kind: "unknown";
      readonly rawRole: string;
    });

