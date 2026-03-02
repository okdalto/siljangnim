import { useCallback, useEffect, useState } from "react";
import { loadJson } from "../utils/localStorage.js";

export default function useChat(sendRef) {
  const [messages, setMessages] = useState(() => loadJson("siljangnim:messages", []));
  const [isProcessing, setIsProcessing] = useState(false);
  const [agentStatus, setAgentStatus] = useState(null);
  const [pendingQuestion, setPendingQuestion] = useState(null);
  const [debugLogs, setDebugLogs] = useState(() => loadJson("siljangnim:debugLogs", []));

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem("siljangnim:messages", JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    localStorage.setItem("siljangnim:debugLogs", JSON.stringify(debugLogs));
  }, [debugLogs]);

  const handleSend = useCallback(
    (text, files) => {
      const msg = { role: "user", text };
      if (files?.length) {
        msg.files = files.map((f) => ({ name: f.name, mime_type: f.mime_type, size: f.size }));
      }
      setMessages((prev) => [...prev, msg]);
      setIsProcessing(true);

      const wsMsg = { type: "prompt", text };
      if (files?.length) wsMsg.files = files;
      sendRef.current?.(wsMsg);
    },
    [sendRef]
  );

  const handleNewChat = useCallback(() => {
    setMessages([]);
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

  const addLog = useCallback((entry) => {
    setDebugLogs((prev) => [...prev, entry]);
  }, []);

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
