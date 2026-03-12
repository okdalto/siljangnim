import { memo, useState, useEffect, useRef, useCallback } from "react";
import { NodeResizer } from "@xyflow/react";
import FileChip from "../components/chat/FileChip.jsx";
import MarkdownMessage from "../components/chat/MarkdownMessage.jsx";
import useStopWheelPropagation from "../hooks/useStopWheelPropagation.js";
import BranchSelector from "../components/BranchSelector.jsx";
import { useCollapsedState } from "../hooks/useCollapsedState.js";
import { TOOL_LABELS } from "../constants/toolLabels.js";
import { useChatContext } from "../contexts/ChatContext.js";

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const b64 = reader.result.split(",")[1];
      resolve(b64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function ChatNode({ data, standalone = false, hideHeader = false }) {
  const chatCtx = useChatContext();
  const [collapsed, setCollapsed] = useCollapsedState(data.initialCollapsed, data.onCollapsedChange);
  const [input, setInput] = useState("");
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const {
    messages = chatCtx?.messages ?? [],
    onSend = chatCtx?.onSend,
    onRetryInterrupted,
    isProcessing = chatCtx?.isProcessing ?? false,
    agentStatus = chatCtx?.agentStatus,
    onNewChat = chatCtx?.onNewChat,
    onCancel = chatCtx?.onCancel,
    pendingQuestion = chatCtx?.pendingQuestion,
    onAnswer = chatCtx?.onAnswer,
    hideInput = false,
    activeNodeTitle = null,
    promptMode = "hybrid",
    treeNodes = [],
    activeTreeNodeId = null,
    onBranchFromNode,
    onSwitchToNode,
    overwriteMode = false,
    onToggleOverwrite,
    sceneReferences = [],
    onRemoveReference,
    onClearReferences,
  } = data;
  const messagesRef = useRef(null);
  const fileInputRef = useRef(null);
  const thinkingRef = useRef(null);

  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!isProcessing) { setElapsed(0); return; }
    const start = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, [isProcessing]);

  useEffect(() => {
    // Scroll within the messages container only (not the page)
    const container = messagesRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages]);

  // Auto-scroll thinking detail to bottom as new content arrives
  useEffect(() => {
    if (thinkingRef.current) {
      thinkingRef.current.scrollTop = thinkingRef.current.scrollHeight;
    }
  }, [agentStatus?.detail]);

  useStopWheelPropagation(messagesRef);

  const processFiles = useCallback(async (fileList) => {
    const newFiles = [];
    for (const file of fileList) {
      const b64 = await readFileAsBase64(file);
      const entry = {
        name: file.name,
        mime_type: file.type || "application/octet-stream",
        size: file.size,
        data_b64: b64,
      };
      // Create preview URL for images
      if (file.type?.startsWith("image/")) {
        entry.preview = URL.createObjectURL(file);
      }
      newFiles.push(entry);
    }
    if (newFiles.length > 0) {
      setAttachedFiles((prev) => [...prev, ...newFiles]);
    }
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (e.dataTransfer?.files?.length) {
      processFiles(Array.from(e.dataTransfer.files));
    }
  }, [processFiles]);

  const handleFileInputChange = useCallback((e) => {
    if (e.target.files?.length) {
      processFiles(Array.from(e.target.files));
    }
    // Reset so the same file can be selected again
    e.target.value = "";
  }, [processFiles]);

  const removeFile = useCallback((index) => {
    setAttachedFiles((prev) => {
      const file = prev[index];
      if (file.preview) URL.revokeObjectURL(file.preview);
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim() && attachedFiles.length === 0) return;

    // If a question is pending, send answer instead of normal prompt
    if (pendingQuestion) {
      if (input.trim()) {
        onAnswer?.(input.trim());
        setInput("");
      }
      return;
    }

    // While processing, allow text-only injection (no files)
    if (isProcessing) {
      if (input.trim()) {
        onSend?.(input.trim());
        setInput("");
      }
      return;
    }

    const files = attachedFiles.length > 0
      ? attachedFiles.map(({ name, mime_type, size, data_b64 }) => ({ name, mime_type, size, data_b64 }))
      : undefined;

    onSend?.(input.trim(), files, sceneReferences.length > 0 ? sceneReferences : undefined);
    setInput("");
    // Clean up preview URLs
    attachedFiles.forEach((f) => { if (f.preview) URL.revokeObjectURL(f.preview); });
    setAttachedFiles([]);
    // Clear scene references after sending
    if (sceneReferences.length > 0) onClearReferences?.();
  };

  return (
    <div
      className={`node-container w-full ${collapsed ? "h-auto" : "h-full"} flex flex-col overflow-hidden ${standalone ? "" : "rounded-xl shadow-2xl"}`}
      style={standalone ? { background: "var(--node-bg)" } : { background: "var(--node-bg)", border: "1px solid var(--node-border)" }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {!standalone && <NodeResizer minWidth={280} minHeight={200} lineStyle={{ borderColor: "transparent" }} handleStyle={{ opacity: 0 }} />}
      {/* Header */}
      {!(standalone && hideHeader) && (
      <div
        className={`px-4 py-2 text-sm font-semibold flex items-center justify-between ${standalone ? "" : "cursor-grab"}`}
        style={{ background: "var(--node-header-bg)", borderBottom: "1px solid var(--node-border)", color: "var(--chrome-text)" }}
        onDoubleClick={() => setCollapsed((v) => !v)}
      >
        Chat
        <button
          type="button"
          onClick={onNewChat}
          disabled={isProcessing}
          className="text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed px-1.5 py-0.5 rounded hover:bg-zinc-700"
        >
          New Chat
        </button>
      </div>
      )}

      {!collapsed && <>
      {/* Drag overlay */}
      {isDragOver && (
        <div className="absolute inset-0 z-50 bg-indigo-600/20 border-2 border-dashed border-indigo-400 rounded-xl flex items-center justify-center pointer-events-none">
          <div className="text-indigo-300 text-sm font-medium flex items-center gap-2">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            Drop files here
          </div>
        </div>
      )}

      {/* Messages */}
      <div ref={messagesRef} className="flex-1 overflow-y-auto p-3 space-y-2 text-sm nowheel nodrag">
        {messages.length === 0 && (
          <p className="italic" style={{ color: "var(--chrome-text-muted)" }}>Describe what you want to create...</p>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`px-3 py-2 rounded-lg max-w-[90%] ${
              msg.role === "user" ? "ml-auto" : msg.role === "system" ? "mx-auto text-center" : ""
            }`}
            style={
              msg.role === "user"
                ? { background: "var(--accent)", color: "var(--accent-text)" }
                : msg.role === "system"
                ? { background: "transparent", color: "var(--chrome-text-muted)", fontSize: "11px", fontStyle: "italic" }
                : { background: "var(--chrome-bg-elevated)", color: "var(--chrome-text)" }
            }
          >
            {/* Show attached file chips on user messages */}
            {msg.role === "user" && msg.files?.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-1.5">
                {msg.files.map((f, j) => (
                  <FileChip key={j} file={f} />
                ))}
              </div>
            )}
            {msg.role === "user" ? (
              msg.text
            ) : (
              <MarkdownMessage text={msg.text} />
            )}
            {msg.interrupted && msg.interruptedPrompt && (
              <button
                className="mt-1.5 px-2.5 py-1 rounded text-xs font-medium"
                style={{ background: "var(--accent)", color: "var(--accent-text)" }}
                onClick={() => onRetryInterrupted?.(msg.interruptedPrompt)}
              >
                다시 시도
              </button>
            )}
          </div>
        ))}
        {isProcessing && !pendingQuestion && (
          <div className="px-3 py-2 rounded-lg max-w-[90%]" style={{ background: "var(--chrome-bg-elevated)", color: "var(--chrome-text-muted)" }}>
            <div className="flex items-center gap-1.5">
              <span className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce [animation-delay:300ms]" />
              </span>
              <span className="italic text-sm">
                {agentStatus?.status === "tool_use"
                  ? (TOOL_LABELS[agentStatus.detail] || "처리 중...")
                  : agentStatus?.status === "thinking"
                  ? "생각하는 중..."
                  : "생각하는 중"}
              </span>
              {elapsed > 2 && (
                <span className="text-[10px] opacity-60">{elapsed}초</span>
              )}
            </div>
            {agentStatus?.detail && agentStatus?.status !== "tool_use" && (
              <p ref={thinkingRef} className="mt-1.5 text-xs italic leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap break-words" style={{ color: "var(--chrome-text-muted)" }}>
                {agentStatus.detail}
              </p>
            )}
          </div>
        )}
        {pendingQuestion && (
          <div className="px-3 py-2 rounded-lg max-w-[90%] space-y-2" style={{ background: "var(--chrome-bg-elevated)", color: "var(--chrome-text)" }}>
            <p className="text-sm font-medium">{pendingQuestion.question}</p>
            <div className="flex flex-col gap-1.5">
              {pendingQuestion.options.map((opt, i) => (
                <button
                  key={i}
                  onClick={() => onAnswer?.(opt.label)}
                  className="text-left px-3 py-2 rounded-lg hover:bg-indigo-600 transition-colors text-sm"
                  style={{ background: "var(--input-bg)" }}
                >
                  <span className="font-medium text-zinc-100">{opt.label}</span>
                  {opt.description && (
                    <span className="block text-xs text-zinc-400 mt-0.5">{opt.description}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
        {/* Art/Hybrid iterative action chips */}
        {!isProcessing && !pendingQuestion && messages.length > 0 && messages[messages.length - 1].role === "assistant" && (promptMode === "art" || promptMode === "hybrid") && (
          <div className="flex flex-wrap gap-1 px-1 mt-1">
            {["Push further", "Make calmer", "More surreal", "Simplify", "Add motion"].map((label) => (
              <button
                key={label}
                onClick={() => onSend?.(label)}
                className="text-[10px] px-2 py-1 rounded-md border transition-colors hover:bg-white/10"
                style={{ color: "var(--chrome-text-secondary)", borderColor: "var(--chrome-border)", background: "transparent" }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <div />
      </div>

      {/* Attached files preview */}
      {!hideInput && attachedFiles.length > 0 && (
        <div className="px-2 pt-2 flex flex-wrap gap-1" style={{ borderTop: "1px solid var(--node-border)" }}>
          {attachedFiles.map((file, i) => (
            <FileChip key={i} file={file} onRemove={() => removeFile(i)} />
          ))}
        </div>
      )}

      {/* Scene references */}
      {!hideInput && sceneReferences.length > 0 && (
        <div className="px-2 py-1.5 flex flex-wrap gap-1 nodrag" style={{ borderTop: "1px solid var(--node-border)" }}>
          {sceneReferences.map((ref) => (
            <span
              key={ref.nodeId}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
              style={{ background: "rgba(99,102,241,0.2)", color: "#a5b4fc" }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
              </svg>
              {ref.title}
              <button
                onClick={() => onRemoveReference?.(ref.nodeId)}
                className="hover:text-red-400 transition-colors"
                style={{ lineHeight: 1 }}
              >
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Input */}
      {!hideInput && (
      <form onSubmit={handleSubmit} className="p-2 flex gap-2 nodrag" style={{ borderTop: "1px solid var(--node-border)" }}>
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileInputChange}
        />
        {/* Attach button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isProcessing && !pendingQuestion}
          className="text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed p-1"
          title="Attach files"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
          </svg>
        </button>
        <textarea
          value={input}
          ref={(el) => {
            if (el) {
              el.style.height = "auto";
              el.style.height = Math.min(el.scrollHeight, 120) + "px";
            }
          }}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (input.trim() || attachedFiles.length > 0) {
                e.target.form.requestSubmit();
              }
            }
          }}
          placeholder={pendingQuestion ? "Type your answer..." : isProcessing ? "Type to send while agent is working..." : "Type a prompt... (Shift+Enter for newline)"}
          rows={1}
          className="flex-1 text-sm rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
          style={{ background: "var(--input-bg)", color: "var(--input-text)", maxHeight: "120px", overflowY: "auto" }}
        />
        <button
          type="submit"
          disabled={!input.trim() && (!attachedFiles.length || isProcessing)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-indigo-600"
        >
          Send
        </button>
        {isProcessing && !pendingQuestion && (
          <button
            type="button"
            onClick={onCancel}
            className="bg-red-600 hover:bg-red-500 text-white text-sm px-4 py-2 rounded-lg transition-colors"
          >
            Stop
          </button>
        )}
      </form>
      )}
      </>}
    </div>
  );
}

export default memo(ChatNode);
