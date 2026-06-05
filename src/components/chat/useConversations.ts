import { useState, useCallback } from "react";
import type { Conversation } from "./types";
import { MOCK_CONVERSATIONS } from "./mock-data";

export function useConversations() {
  const [conversations, setConversations] =
    useState<Conversation[]>(MOCK_CONVERSATIONS);
  const [activeId, setActiveId] = useState<string | null>(
    MOCK_CONVERSATIONS[0]?.id ?? null,
  );
  const [loading] = useState(false);

  // 创建新会话
  const create = useCallback(async (title?: string) => {
    const conv: Conversation = {
      id: `conv_${Date.now()}`,
      title: title ?? "新对话",
      model: "claude-sonnet-4-20250514",
      created_at: Date.now() / 1000,
      updated_at: Date.now() / 1000,
      message_count: 0,
    };
    setConversations((prev) => [conv, ...prev]);
    setActiveId(conv.id);
    return conv;
  }, []);

  // 删除会话
  const remove = useCallback(
    (id: string) => {
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeId === id) {
        setConversations((prev) => {
          setActiveId(prev.find((c) => c.id !== id)?.id ?? null);
          return prev;
        });
      }
    },
    [activeId],
  );

  // 重命名
  const rename = useCallback((id: string, title: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title } : c)),
    );
  }, []);

  // 激活会话
  const setActive = useCallback((id: string) => {
    setActiveId(id);
  }, []);

  const load = useCallback(() => {}, []);

  const activeConversation =
    conversations.find((c) => c.id === activeId) ?? null;

  return {
    conversations,
    activeId,
    activeConversation,
    loading,
    load,
    create,
    remove,
    rename,
    setActive,
  };
}
