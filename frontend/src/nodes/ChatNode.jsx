import { useState } from "react";

export default function ChatNode({ data }) {
  const [input, setInput] = useState("");
  const { messages = [], onSend } = data;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim()) return;
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
      <div className="flex-1 min-h-48 max-h-72 overflow-y-auto p-3 space-y-2 text-sm">
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
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-2 border-t border-zinc-700 flex gap-2 nodrag">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a prompt..."
          className="flex-1 bg-zinc-800 text-zinc-100 text-sm rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <button
          type="submit"
          className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm px-4 py-2 rounded-lg transition-colors"
        >
          Send
        </button>
      </form>
    </div>
  );
}
