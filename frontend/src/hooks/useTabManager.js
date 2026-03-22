import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { loadJson } from "../utils/localStorage.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function genId() {
  return crypto.randomUUID().slice(0, 8);
}

function createTabState(chatId, label = "New Chat") {
  return {
    chatId,
    label,
    messages: [],
    isProcessing: false,
    agentStatus: null,
    pendingQuestion: null,
    debugLogs: [],
  };
}

function loadPersistedTabs() {
  const meta = loadJson("siljangnim:tabs", null);
  if (!meta || !Array.isArray(meta.tabs) || meta.tabs.length === 0) return null;

  const tabs = new Map();
  const tabOrder = [];
  for (const t of meta.tabs) {
    const messages = loadJson(`siljangnim:messages:${t.chatId}`, []);
    const debugLogs = loadJson(`siljangnim:debugLogs:${t.chatId}`, []);
    tabs.set(t.chatId, {
      ...createTabState(t.chatId, t.label),
      messages,
      debugLogs,
    });
    tabOrder.push(t.chatId);
  }
  const activeTabId = tabs.has(meta.activeTabId) ? meta.activeTabId : tabOrder[0];
  return { tabs, activeTabId, tabOrder };
}

/** Migrate old single-chat localStorage to first tab */
function migrateOldStorage(chatId) {
  const oldMessages = loadJson("siljangnim:messages", null);
  const oldDebugLogs = loadJson("siljangnim:debugLogs", null);
  if (oldMessages !== null) {
    localStorage.setItem(`siljangnim:messages:${chatId}`, JSON.stringify(oldMessages));
    localStorage.removeItem("siljangnim:messages");
  }
  if (oldDebugLogs !== null) {
    localStorage.setItem(`siljangnim:debugLogs:${chatId}`, JSON.stringify(oldDebugLogs));
    localStorage.removeItem("siljangnim:debugLogs");
  }
  return {
    messages: oldMessages || [],
    debugLogs: oldDebugLogs || [],
  };
}

function initState() {
  const persisted = loadPersistedTabs();
  if (persisted) return persisted;

  // First boot or migration from old single-chat
  const chatId = genId();
  const { messages, debugLogs } = migrateOldStorage(chatId);
  const tab = { ...createTabState(chatId, "Chat 1"), messages, debugLogs };
  const tabs = new Map([[chatId, tab]]);
  return { tabs, activeTabId: chatId, tabOrder: [chatId] };
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

function reducer(state, action) {
  switch (action.type) {
    case "CREATE_TAB": {
      const { chatId, label } = action;
      const tab = createTabState(chatId, label);
      const tabs = new Map(state.tabs);
      tabs.set(chatId, tab);
      return { ...state, tabs, activeTabId: chatId, tabOrder: [...state.tabOrder, chatId] };
    }
    case "CLOSE_TAB": {
      const { chatId } = action;
      if (state.tabs.size <= 1) return state;
      const tabs = new Map(state.tabs);
      tabs.delete(chatId);
      const tabOrder = state.tabOrder.filter((id) => id !== chatId);
      let activeTabId = state.activeTabId;
      if (activeTabId === chatId) {
        const idx = state.tabOrder.indexOf(chatId);
        activeTabId = tabOrder[Math.min(idx, tabOrder.length - 1)];
      }
      return { ...state, tabs, activeTabId, tabOrder };
    }
    case "SWITCH_TAB": {
      if (!state.tabs.has(action.chatId)) return state;
      return { ...state, activeTabId: action.chatId };
    }
    case "UPDATE_TAB": {
      const { chatId, updates } = action;
      const existing = state.tabs.get(chatId);
      if (!existing) return state;
      const tabs = new Map(state.tabs);
      // Support functional updates for fields that need access to current state
      const resolved = typeof updates === "function" ? updates(existing) : updates;
      tabs.set(chatId, { ...existing, ...resolved });
      return { ...state, tabs };
    }
    case "SET_TAB_LABEL": {
      const existing = state.tabs.get(action.chatId);
      if (!existing) return state;
      const tabs = new Map(state.tabs);
      tabs.set(action.chatId, { ...existing, label: action.label });
      return { ...state, tabs };
    }
    case "APPEND_STREAM_DELTA": {
      const { chatId, buffered } = action;
      const existing = state.tabs.get(chatId);
      if (!existing) return state;
      const msgs = existing.messages;
      const last = msgs[msgs.length - 1];
      let newMessages;
      if (last?.role === "assistant" && last.streaming) {
        newMessages = [...msgs];
        newMessages[newMessages.length - 1] = { ...last, text: (last.text || "") + buffered };
      } else {
        newMessages = [...msgs, { role: "assistant", text: buffered, streaming: true }];
      }
      const tabs = new Map(state.tabs);
      tabs.set(chatId, { ...existing, messages: newMessages });
      return { ...state, tabs };
    }
    case "FINALIZE_STREAM": {
      const { chatId, remaining } = action;
      const existing = state.tabs.get(chatId);
      if (!existing) return state;
      const msgs = existing.messages;
      const last = msgs[msgs.length - 1];
      if (last?.role === "assistant" && last.streaming) {
        const newMessages = [...msgs];
        newMessages[newMessages.length - 1] = { ...last, text: (last.text || "") + remaining, streaming: false };
        const tabs = new Map(state.tabs);
        tabs.set(chatId, { ...existing, messages: newMessages });
        return { ...state, tabs };
      }
      return state;
    }
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export default function useTabManager(sendRef) {
  const [state, dispatch] = useReducer(reducer, undefined, initState);
  const { tabs, activeTabId, tabOrder } = state;
  const activeTab = tabs.get(activeTabId);

  // Stream buffering per tab
  const streamBuffersRef = useRef(new Map()); // chatId -> { buffer, handle }

  // ---- Persistence ----

  // Save tab meta
  useEffect(() => {
    const meta = {
      activeTabId,
      tabs: tabOrder.map((id) => ({ chatId: id, label: tabs.get(id)?.label || "Chat" })),
    };
    localStorage.setItem("siljangnim:tabs", JSON.stringify(meta));
  }, [tabs, activeTabId, tabOrder]);

  // Save per-tab messages & debugLogs
  useEffect(() => {
    for (const [chatId, tab] of tabs) {
      localStorage.setItem(`siljangnim:messages:${chatId}`, JSON.stringify(tab.messages));
      localStorage.setItem(`siljangnim:debugLogs:${chatId}`, JSON.stringify(tab.debugLogs));
    }
  }, [tabs]);

  // Clean up localStorage for closed tabs
  const prevTabOrderRef = useRef(tabOrder);
  useEffect(() => {
    const prev = prevTabOrderRef.current;
    prevTabOrderRef.current = tabOrder;
    for (const id of prev) {
      if (!tabOrder.includes(id)) {
        localStorage.removeItem(`siljangnim:messages:${id}`);
        localStorage.removeItem(`siljangnim:debugLogs:${id}`);
      }
    }
  }, [tabOrder]);

  // ---- Tab actions ----

  const createTab = useCallback(() => {
    const chatId = genId();
    const label = `Chat ${tabOrder.length + 1}`;
    dispatch({ type: "CREATE_TAB", chatId, label });
    return chatId;
  }, [tabOrder.length]);

  const closeTab = useCallback((chatId) => {
    // Cancel agent for this tab before closing
    sendRef.current?.({ type: "cancel_agent", chatId });
    sendRef.current?.({ type: "new_chat", chatId });
    dispatch({ type: "CLOSE_TAB", chatId });
    // Clean up stream buffer
    const buf = streamBuffersRef.current.get(chatId);
    if (buf?.handle) clearTimeout(buf.handle);
    streamBuffersRef.current.delete(chatId);
  }, [sendRef]);

  const switchTab = useCallback((chatId) => {
    dispatch({ type: "SWITCH_TAB", chatId });
  }, []);

  // ---- Per-tab chat methods (used by message handlers) ----

  const updateTab = useCallback((chatId, updates) => {
    dispatch({ type: "UPDATE_TAB", chatId, updates });
  }, []);

  const setTabLabel = useCallback((chatId, label) => {
    dispatch({ type: "SET_TAB_LABEL", chatId, label });
  }, []);

  // ---- Dispatcher methods (active tab delegated) ----

  const handleSend = useCallback((text, files, sceneReferences) => {
    const msg = { role: "user", text };
    if (files?.length) msg.files = files.map((f) => ({ name: f.name, mime_type: f.mime_type, size: f.size }));
    if (sceneReferences?.length) msg.sceneReferences = sceneReferences.map((r) => ({ nodeId: r.nodeId, title: r.title }));

    dispatch({
      type: "UPDATE_TAB",
      chatId: activeTabId,
      updates: (tab) => ({ messages: [...tab.messages, msg], isProcessing: true }),
    });

    const wsMsg = { type: "prompt", text, chatId: activeTabId };
    if (files?.length) wsMsg.files = files;
    if (sceneReferences?.length) wsMsg.sceneReferences = sceneReferences;
    sendRef.current?.(wsMsg);
  }, [sendRef, activeTabId]);

  const handleNewChat = useCallback(() => {
    sendRef.current?.({ type: "cancel_agent", chatId: activeTabId });
    dispatch({
      type: "UPDATE_TAB",
      chatId: activeTabId,
      updates: { messages: [], isProcessing: false, agentStatus: null, pendingQuestion: null },
    });
    sendRef.current?.({ type: "new_chat", chatId: activeTabId });
  }, [sendRef, activeTabId]);

  const handleAnswer = useCallback((text) => {
    dispatch({
      type: "UPDATE_TAB",
      chatId: activeTabId,
      updates: (tab) => ({
        messages: [...tab.messages, { role: "user", text }],
        pendingQuestion: null,
      }),
    });
    sendRef.current?.({ type: "user_answer", text, chatId: activeTabId });
  }, [sendRef, activeTabId]);

  const handleCancel = useCallback(() => {
    sendRef.current?.({ type: "cancel_agent", chatId: activeTabId });
  }, [sendRef, activeTabId]);

  // ---- Methods for message handlers (chatId-scoped) ----

  const addAssistantText = useCallback((text, chatId) => {
    const id = chatId || activeTabId;
    dispatch({ type: "UPDATE_TAB", chatId: id, updates: (tab) => ({ messages: [...tab.messages, { role: "assistant", text }] }) });
  }, [activeTabId]);

  const addAssistantTextDelta = useCallback((chunk, chatId) => {
    const id = chatId || activeTabId;
    if (!streamBuffersRef.current.has(id)) {
      streamBuffersRef.current.set(id, { buffer: "", handle: null });
    }
    const entry = streamBuffersRef.current.get(id);
    entry.buffer += chunk;
    if (!entry.handle) {
      entry.handle = setTimeout(() => {
        const buffered = entry.buffer;
        entry.buffer = "";
        entry.handle = null;
        dispatch({ type: "APPEND_STREAM_DELTA", chatId: id, buffered });
      }, 16);
    }
  }, [activeTabId]);

  const finalizeAssistantText = useCallback((chatId) => {
    const id = chatId || activeTabId;
    const entry = streamBuffersRef.current.get(id);
    let remaining = "";
    if (entry) {
      if (entry.handle) { clearTimeout(entry.handle); entry.handle = null; }
      remaining = entry.buffer;
      entry.buffer = "";
    }
    dispatch({ type: "FINALIZE_STREAM", chatId: id, remaining });
  }, [activeTabId]);

  const addLog = useCallback((entry, chatId) => {
    const id = chatId || activeTabId;
    dispatch({ type: "UPDATE_TAB", chatId: id, updates: (tab) => ({ debugLogs: [...tab.debugLogs, entry] }) });
  }, [activeTabId]);

  const addSystemMessage = useCallback((text, chatId) => {
    const id = chatId || activeTabId;
    dispatch({ type: "UPDATE_TAB", chatId: id, updates: (tab) => ({ messages: [...tab.messages, { role: "system", text }] }) });
  }, [activeTabId]);

  const addInterruptedMessage = useCallback((prompt, chatId) => {
    const id = chatId || activeTabId;
    dispatch({
      type: "UPDATE_TAB",
      chatId: id,
      updates: (tab) => ({
        messages: [...tab.messages, {
          role: "system",
          text: `이전 대화가 새로고침으로 중단되었습니다.`,
          interrupted: true,
          interruptedPrompt: prompt,
        }],
      }),
    });
  }, [activeTabId]);

  const handleRetryInterrupted = useCallback((prompt) => {
    dispatch({
      type: "UPDATE_TAB",
      chatId: activeTabId,
      updates: (tab) => ({
        messages: tab.messages.filter((m) => !m.interrupted),
        isProcessing: true,
      }),
    });
    sendRef.current?.({ type: "prompt", text: prompt, _isRetry: true, chatId: activeTabId });
  }, [sendRef, activeTabId]);

  const addErrorLog = useCallback((text, chatId) => {
    const id = chatId || activeTabId;
    dispatch({
      type: "UPDATE_TAB",
      chatId: id,
      updates: (tab) => ({ debugLogs: [...tab.debugLogs, { agent: "System", message: text, level: "error" }] }),
    });
  }, [activeTabId]);

  const setProcessing = useCallback((val, chatId) => {
    const id = chatId || activeTabId;
    dispatch({ type: "UPDATE_TAB", chatId: id, updates: { isProcessing: val } });
  }, [activeTabId]);

  const setAgentStatus = useCallback((val, chatId) => {
    const id = chatId || activeTabId;
    dispatch({ type: "UPDATE_TAB", chatId: id, updates: { agentStatus: val } });
  }, [activeTabId]);

  const setPendingQuestion = useCallback((val, chatId) => {
    const id = chatId || activeTabId;
    dispatch({ type: "UPDATE_TAB", chatId: id, updates: { pendingQuestion: val } });
  }, [activeTabId]);

  const restoreMessages = useCallback((history, chatId) => {
    const id = chatId || activeTabId;
    dispatch({ type: "UPDATE_TAB", chatId: id, updates: { messages: history } });
  }, [activeTabId]);

  const setDebugLogs = useCallback((val, chatId) => {
    const id = chatId || activeTabId;
    if (typeof val === "function") {
      dispatch({ type: "UPDATE_TAB", chatId: id, updates: (tab) => ({ debugLogs: val(tab.debugLogs || []) }) });
    } else {
      dispatch({ type: "UPDATE_TAB", chatId: id, updates: { debugLogs: val } });
    }
  }, [activeTabId]);

  const clearAll = useCallback((chatId) => {
    const id = chatId || activeTabId;
    dispatch({ type: "UPDATE_TAB", chatId: id, updates: { messages: [], debugLogs: [] } });
  }, [activeTabId]);

  // ---- getChatForTab: returns per-tab chat interface for message handlers ----
  const getChatForTab = useCallback((chatId) => {
    const id = chatId || activeTabId;
    return {
      addAssistantText: (text) => addAssistantText(text, id),
      addAssistantTextDelta: (chunk) => addAssistantTextDelta(chunk, id),
      finalizeAssistantText: () => finalizeAssistantText(id),
      addLog: (entry) => addLog(entry, id),
      addSystemMessage: (text) => addSystemMessage(text, id),
      addInterruptedMessage: (prompt) => addInterruptedMessage(prompt, id),
      addErrorLog: (text) => addErrorLog(text, id),
      setProcessing: (val) => setProcessing(val, id),
      setAgentStatus: (val) => setAgentStatus(val, id),
      setPendingQuestion: (val) => setPendingQuestion(val, id),
      restoreMessages: (history) => restoreMessages(history, id),
      setDebugLogs: (val) => setDebugLogs(val, id),
      clearAll: () => clearAll(id),
    };
  }, [activeTabId, addAssistantText, addAssistantTextDelta, finalizeAssistantText, addLog, addSystemMessage, addInterruptedMessage, addErrorLog, setProcessing, setAgentStatus, setPendingQuestion, restoreMessages, setDebugLogs, clearAll]);

  // Memoize getMessages/getDebugLogs getters for active tab (used by chatHandlers for tree creation)
  const getMessages = useCallback(() => activeTab?.messages || [], [activeTab?.messages]);
  const getDebugLogs = useCallback(() => activeTab?.debugLogs || [], [activeTab?.debugLogs]);

  return {
    // Active tab state (backwards compatible with useChat API)
    messages: activeTab?.messages || [],
    isProcessing: activeTab?.isProcessing || false,
    agentStatus: activeTab?.agentStatus || null,
    pendingQuestion: activeTab?.pendingQuestion || null,
    debugLogs: activeTab?.debugLogs || [],
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
    setProcessing,
    setAgentStatus,
    setPendingQuestion,
    restoreMessages,
    setDebugLogs,
    clearAll,
    getMessages,
    getDebugLogs,

    // Tab management
    tabs,
    activeTabId,
    tabOrder,
    createTab,
    closeTab,
    switchTab,
    setTabLabel,
    getChatForTab,
  };
}
