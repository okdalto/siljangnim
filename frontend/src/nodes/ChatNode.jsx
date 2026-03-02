import { useState, useEffect, useRef, useCallback } from "react";
import { NodeResizer } from "@xyflow/react";
import FileChip from "../components/chat/FileChip.jsx";
import MarkdownMessage from "../components/chat/MarkdownMessage.jsx";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

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

export default function ChatNode({ data }) {
  const [input, setInput] = useState("");
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const { messages = [], onSend, isProcessing = false, agentStatus, onNewChat, onCancel, pendingQuestion, onAnswer } = data;
  const messagesEndRef = useRef(null);
  const messagesRef = useRef(null);
  const fileInputRef = useRef(null);
  const thinkingRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-scroll thinking detail to bottom as new content arrives
  useEffect(() => {
    if (thinkingRef.current) {
      thinkingRef.current.scrollTop = thinkingRef.current.scrollHeight;
    }
  }, [agentStatus?.detail]);

  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    const handleWheel = (e) => {
      e.stopPropagation();
    };
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  const processFiles = useCallback(async (fileList) => {
    const newFiles = [];
    for (const file of fileList) {
      if (file.size > MAX_FILE_SIZE) {
        alert(`File "${file.name}" exceeds 10 MB limit.`);
        continue;
      }
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

    onSend?.(input.trim(), files);
    setInput("");
    // Clean up preview URLs
    attachedFiles.forEach((f) => { if (f.preview) URL.revokeObjectURL(f.preview); });
    setAttachedFiles([]);
  };

  return (
    <div
      className="w-full h-full bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl flex flex-col overflow-hidden"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <NodeResizer minWidth={280} minHeight={200} lineStyle={{ borderColor: "transparent" }} handleStyle={{ opacity: 0 }} />
      {/* Header */}
      <div className="px-4 py-2 bg-zinc-800 border-b border-zinc-700 text-sm font-semibold text-zinc-300 cursor-grab flex items-center justify-between">
        Chat
        <button
          type="button"
          onClick={onNewChat}
          disabled={isProcessing}
          className="text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed p-0.5 rounded hover:bg-zinc-700"
          title="New Chat"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

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
          <p className="text-zinc-500 italic">Describe what you want to create...</p>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`px-3 py-2 rounded-lg max-w-[90%] ${
              msg.role === "user"
                ? "bg-indigo-600 text-white ml-auto"
                : "bg-zinc-800 text-zinc-300"
            }`}
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
          </div>
        ))}
        {isProcessing && !pendingQuestion && (
          <div className="px-3 py-2 rounded-lg max-w-[90%] bg-zinc-800 text-zinc-500">
            <div className="flex items-center gap-1.5">
              <span className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce [animation-delay:300ms]" />
              </span>
              <span className="italic text-sm">
                {agentStatus?.status === "tool_use"
                  ? `Calling ${agentStatus.detail}...`
                  : agentStatus?.status === "thinking"
                  ? "Thinking..."
                  : "Thinking"}
              </span>
            </div>
            {agentStatus?.status === "thinking" && agentStatus.detail && (
              <p ref={thinkingRef} className="mt-1.5 text-xs text-zinc-600 italic leading-relaxed max-h-24 overflow-y-auto">
                {agentStatus.detail}
              </p>
            )}
          </div>
        )}
        {pendingQuestion && (
          <div className="px-3 py-2 rounded-lg max-w-[90%] bg-zinc-800 text-zinc-300 space-y-2">
            <p className="text-sm font-medium">{pendingQuestion.question}</p>
            <div className="flex flex-col gap-1.5">
              {pendingQuestion.options.map((opt, i) => (
                <button
                  key={i}
                  onClick={() => onAnswer?.(opt.label)}
                  className="text-left px-3 py-2 rounded-lg bg-zinc-700 hover:bg-indigo-600 transition-colors text-sm"
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
        <div ref={messagesEndRef} />
      </div>

      {/* Attached files preview */}
      {attachedFiles.length > 0 && (
        <div className="px-2 pt-2 flex flex-wrap gap-1 border-t border-zinc-700/50">
          {attachedFiles.map((file, i) => (
            <FileChip key={i} file={file} onRemove={() => removeFile(i)} />
          ))}
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-2 border-t border-zinc-700 flex gap-2 nodrag">
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
          className="flex-1 bg-zinc-800 text-zinc-100 text-sm rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
          style={{ maxHeight: "120px", overflowY: "auto" }}
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
    </div>
  );
}
