import { useState, useEffect, useRef } from "react";

export default function ChatNode({ data }) {
  const [input, setInput] = useState("");
  const { messages = [], onSend, isProcessing = false } = data;
  const messagesEndRef = useRef(null);
  const messagesRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    const handleWheel = (e) => {
      e.stopPropagation();
    };
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim() || isProcessing) return;
    onSend?.(input.trim());
    setInput("");
  };

  return (
    <div className="w-80 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2 bg-zinc-800 border-b border-zinc-700 text-sm font-semibold text-zinc-300 cursor-grab">
        Chat
      </div>

      {/* Messages */}
      <div ref={messagesRef} className="flex-1 min-h-48 max-h-72 overflow-y-auto p-3 space-y-2 text-sm nowheel">
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
            {msg.text}
          </div>
        ))}
        {isProcessing && (
          <div className="px-3 py-2 rounded-lg max-w-[90%] bg-zinc-800 text-zinc-500 italic">
            Thinking...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-2 border-t border-zinc-700 flex gap-2 nodrag">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={isProcessing ? "Waiting for response..." : "Type a prompt..."}
          disabled={isProcessing}
          className="flex-1 bg-zinc-800 text-zinc-100 text-sm rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <button
          type="submit"
          disabled={isProcessing}
          className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-indigo-600"
        >
          Send
        </button>
      </form>
    </div>
  );
}
