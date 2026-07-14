import { useState, useCallback, useMemo, useRef } from "react";
import type {
  ChatMessage,
  HeartWhisperEvent,
  SendMessageRequest,
} from "./types";
import {
  MOCK_HEART_WHISPERS,
  MOCK_MESSAGES,
  MOCK_STREAMING_TEXT,
} from "./mock-data";

export function useChat(convId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [heartWhispers, setHeartWhispers] = useState<HeartWhisperEvent[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState("");
  const [loadingMessages, setLoadingMessages] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 加载消息列表
  const loadMessages = useCallback(async (id: string) => {
    setLoadingMessages(true);
    // 模拟加载延迟
    await new Promise((r) => setTimeout(r, 100));
    setMessages(MOCK_MESSAGES[id] ?? []);
    setHeartWhispers(MOCK_HEART_WHISPERS[id] ?? []);
    setLoadingMessages(false);
  }, []);

  // 切换会话时加载消息
  const switchConversation = useCallback(
    async (id: string | null) => {
      setMessages([]);
      setHeartWhispers([]);
      setStreamingId(null);
      setStreamingContent("");
      if (id) {
        await loadMessages(id);
      }
    },
    [loadMessages],
  );

  // 模拟流式发送
  const sendMessage = useCallback(
    async (content: string, _options?: Partial<SendMessageRequest>) => {
      if (!convId || isStreaming) return;

      const clientMsgId = `msg_${Date.now()}`;
      const now = Date.now() / 1000;

      // 乐观插入用户消息
      const userMsg: ChatMessage = {
        id: clientMsgId,
        conv_id: convId,
        role: "user",
        content,
        created_at: now,
        attachments: [],
        simple_think: "",
        thinking: "",
        mcp_tool_calls: [],
        cache_region: "",
        is_carryover: 0,
      };
      setMessages((prev) => [...prev, userMsg]);

      // 创建 AI 占位
      const aiPlaceholderId = `streaming_${Date.now()}`;
      const aiPlaceholder: ChatMessage = {
        id: aiPlaceholderId,
        conv_id: convId,
        role: "assistant",
        content: "",
        created_at: now + 0.5,
        attachments: [],
        simple_think: "",
        thinking: "",
        mcp_tool_calls: [],
        cache_region: "",
        is_carryover: 0,
      };
      setMessages((prev) => [...prev, aiPlaceholder]);
      setStreamingId(aiPlaceholderId);
      setStreamingContent("");
      setIsStreaming(true);

      // 模拟逐字流式输出
      const text = MOCK_STREAMING_TEXT;
      let idx = 0;
      const controller = new AbortController();
      abortRef.current = controller;

      const tick = () => {
        if (controller.signal.aborted || idx >= text.length) {
          // 流结束
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aiPlaceholderId
                ? { ...m, id: `msg_ai_${Date.now()}`, content: text.slice(0, idx) }
                : m,
            ),
          );
          setIsStreaming(false);
          setStreamingId(null);
          setStreamingContent("");
          return;
        }

        // 每次增加 1~3 个字符，模拟真实流速
        const step = Math.floor(Math.random() * 3) + 1;
        idx = Math.min(idx + step, text.length);
        const partial = text.slice(0, idx);
        setStreamingContent(partial);

        // 随机间隔 20~60ms
        const delay = Math.floor(Math.random() * 40) + 20;
        timerRef.current = setTimeout(tick, delay);
      };

      // 延迟 300ms 开始，模拟网络延迟
      timerRef.current = setTimeout(tick, 300);
    },
    [convId, isStreaming],
  );

  // 停止生成
  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setIsStreaming(false);
    setStreamingId(null);
    setStreamingContent("");
  }, []);

  // 重新生成（mock：直接用相同逻辑重新流式）
  const regenerate = useCallback(
    async (msgId: string) => {
      if (!convId || isStreaming) return;

      // 移除目标消息
      setMessages((prev) => prev.filter((m) => m.id !== msgId));

      setIsStreaming(true);
      const aiPlaceholderId = `streaming_${Date.now()}`;
      setStreamingId(aiPlaceholderId);
      setStreamingContent("");

      const aiPlaceholder: ChatMessage = {
        id: aiPlaceholderId,
        conv_id: convId,
        role: "assistant",
        content: "",
        created_at: Date.now() / 1000,
        attachments: [],
        simple_think: "",
        thinking: "",
        mcp_tool_calls: [],
        cache_region: "",
        is_carryover: 0,
      };
      setMessages((prev) => [...prev, aiPlaceholder]);

      const text = "这是重新生成的回复。✨\n\n" + MOCK_STREAMING_TEXT;
      let idx = 0;
      const controller = new AbortController();
      abortRef.current = controller;

      const tick = () => {
        if (controller.signal.aborted || idx >= text.length) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aiPlaceholderId
                ? { ...m, id: `msg_ai_${Date.now()}`, content: text.slice(0, idx) }
                : m,
            ),
          );
          setIsStreaming(false);
          setStreamingId(null);
          setStreamingContent("");
          return;
        }
        const step = Math.floor(Math.random() * 3) + 1;
        idx = Math.min(idx + step, text.length);
        setStreamingContent(text.slice(0, idx));
        const delay = Math.floor(Math.random() * 40) + 20;
        timerRef.current = setTimeout(tick, delay);
      };

      timerRef.current = setTimeout(tick, 300);
    },
    [convId, isStreaming],
  );

  // 删除消息
  const removeMessage = useCallback((msgId: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== msgId));
    setHeartWhispers((prev) => prev.filter((item) => item.msg_id !== msgId));
  }, []);

  const heartWhisperMessageIds = useMemo(
    () => new Set(heartWhispers.map((item) => item.msg_id)),
    [heartWhispers],
  );

  return {
    messages,
    heartWhisperMessageIds,
    isStreaming,
    streamingId,
    streamingContent,
    loadingMessages,
    loadMessages,
    switchConversation,
    sendMessage,
    stopStreaming,
    regenerate,
    removeMessage,
  };
}
