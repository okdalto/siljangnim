import { useCallback, useEffect, useRef, useState } from "react";
import { loadJson } from "../utils/localStorage.js";

export default function useChat(sendRef) {
  const [messages, setMessages] = useState(() => loadJson("siljangnim:messages", []));
  const [isProcessing, setIsProcessing] = useState(false);
  const [agentStatus, setAgentStatus] = useState(null);
  const [pendingQuestion, setPendingQuestion] = useState(null);
  const [debugLogs, setDebugLogs] = useState(() => loadJson("siljangnim:debugLogs", []));

  // Streaming text delta buffering with RAF throttle
  const streamBufferRef = useRef("");
  const rafRef = useRef(null);

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem("siljangnim:messages", JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    localStorage.setItem("siljangnim:debugLogs", JSON.stringify(debugLogs));
  }, [debugLogs]);

  const handleSend = useCallback(
    (text, files, sceneReferences) => {
      const msg = { role: "user", text };
      if (files?.length) {
        msg.files = files.map((f) => ({ name: f.name, mime_type: f.mime_type, size: f.size }));
      }
      if (sceneReferences?.length) {
        msg.sceneReferences = sceneReferences.map((r) => ({ nodeId: r.nodeId, title: r.title }));
      }
      setMessages((prev) => [...prev, msg]);
      setIsProcessing(true);

      const wsMsg = { type: "prompt", text };
      if (files?.length) wsMsg.files = files;
      if (sceneReferences?.length) wsMsg.sceneReferences = sceneReferences;
      sendRef.current?.(wsMsg);
    },
    [sendRef]
  );

  const handleNewChat = useCallback(() => {
    // Cancel any in-progress agent before clearing
    sendRef.current?.({ type: "cancel_agent" });
    setMessages([]);
    setIsProcessing(false);
    setAgentStatus(null);
    setPendingQuestion(null);
    sendRef.current?.({ type: "new_chat" });
  }, [sendRef]);

  const handleAnswer = useCallback(
    (text) => {
      setMessages((prev) => [...prev, { role: "user", text }]);
      setPendingQuestion(null);
      sendRef.current?.({ type: "user_answer", text });
    },
    [sendRef]
  );

  const handleCancel = useCallback(() => {
    sendRef.current?.({ type: "cancel_agent" });
  }, [sendRef]);

  // Dispatcher methods for handleMessage
  const addAssistantText = useCallback((text) => {
    setMessages((prev) => [...prev, { role: "assistant", text }]);
  }, []);

  const addAssistantTextDelta = useCallback((chunk) => {
    streamBufferRef.current += chunk;
    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(() => {
        const buffered = streamBufferRef.current;
        streamBufferRef.current = "";
        rafRef.current = null;
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant" && last.streaming) {
            const updated = [...prev];
            updated[updated.length - 1] = { ...last, text: (last.text || "") + buffered };
            return updated;
          }
          return [...prev, { role: "assistant", text: buffered, streaming: true }];
        });
      });
    }
  }, []);

  const finalizeAssistantText = useCallback(() => {
    // Flush any remaining buffered text
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const remaining = streamBufferRef.current;
    streamBufferRef.current = "";
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === "assistant" && last.streaming) {
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...last,
          text: (last.text || "") + remaining,
          streaming: false,
        };
        return updated;
      }
      return prev;
    });
  }, []);

  const addLog = useCallback((entry) => {
    setDebugLogs((prev) => [...prev, entry]);
  }, []);

  const addSystemMessage = useCallback((text) => {
    setMessages((prev) => [...prev, { role: "system", text }]);
  }, []);

  const addInterruptedMessage = useCallback((prompt) => {
    setMessages((prev) => [...prev, {
      role: "system",
      text: `이전 대화가 새로고침으로 중단되었습니다.`,
      interrupted: true,
      interruptedPrompt: prompt,
    }]);
  }, []);

  /** Retry an interrupted prompt without duplicating the user message. */
  const handleRetryInterrupted = useCallback((prompt) => {
    // Remove the interrupted system message from UI
    setMessages((prev) => prev.filter((m) => !m.interrupted));
    setIsProcessing(true);
    // Send with _isRetry so agentEngine skips chatHistory push
    sendRef.current?.({ type: "prompt", text: prompt, _isRetry: true });
  }, [sendRef]);

  const addErrorLog = useCallback((text) => {
    setDebugLogs((prev) => [
      ...prev,
      { agent: "System", message: text, level: "error" },
    ]);
  }, []);

  const restoreMessages = useCallback((history) => {
    setMessages(history);
  }, []);

  const clearAll = useCallback(() => {
    setMessages([]);
    setDebugLogs([]);
  }, []);

  return {
    messages,
    isProcessing,
    agentStatus,
    pendingQuestion,
    debugLogs,
    handleSend,
    handleNewChat,
    handleAnswer,
    handleCancel,
    addAssistantText,
    addAssistantTextDelta,
    finalizeAssistantText,
    addSystemMessage,
    addInterruptedMessage,
    handleRetryInterrupted,
    addLog,
    addErrorLog,
    setProcessing: setIsProcessing,
    setAgentStatus,
    setPendingQuestion,
    restoreMessages,
    setDebugLogs,
    clearAll,
  };
}
