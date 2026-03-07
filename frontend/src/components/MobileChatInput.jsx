import { useState, useCallback } from "react";

export default function MobileChatInput({ onSend, isProcessing, pendingQuestion, onAnswer, onCancel }) {
  const [input, setInput] = useState("");

  const handleSubmit = useCallback(() => {
    const text = input.trim();
    if (!text) return;

    if (pendingQuestion) {
      onAnswer?.(text);
    } else {
      onSend?.(text);
    }
    setInput("");
  }, [input, pendingQuestion, onAnswer, onSend]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  return (
    <div
      className="fixed bottom-10 left-0 right-0 z-30 flex items-end gap-2 px-3 py-1.5"
      style={{ background: "var(--chrome-bg)", borderTop: "1px solid var(--chrome-border)" }}
    >
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={pendingQuestion ? "Type your answer..." : isProcessing ? "Send while agent works..." : "Type a prompt..."}
        rows={1}
        className="flex-1 resize-none rounded px-2 py-1.5 text-sm outline-none"
        style={{
          background: "var(--input-bg)",
          border: "1px solid var(--input-border)",
          color: "var(--input-text)",
          maxHeight: 80,
        }}
      />
      {isProcessing && !pendingQuestion ? (
        <button
          onClick={onCancel}
          className="shrink-0 px-3 py-1.5 rounded text-sm font-medium bg-red-600 hover:bg-red-500 text-white"
        >
          Stop
        </button>
      ) : (
        <button
          onClick={handleSubmit}
          disabled={!input.trim()}
          className="shrink-0 px-3 py-1.5 rounded text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Send
        </button>
      )}
    </div>
  );
}
