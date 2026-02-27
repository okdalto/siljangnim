import { useState } from "react";

export default function ApiKeyModal({ onSubmit, error, loading }) {
  const [key, setKey] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!key.trim() || loading) return;
    onSubmit(key.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <form
        onSubmit={handleSubmit}
        className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl p-8 w-full max-w-md mx-4 space-y-5"
      >
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">
            Anthropic API Key
          </h2>
          <p className="text-sm text-zinc-400 mt-1">
            PromptGL uses Claude to generate shaders. Enter your API key to get
            started.
          </p>
        </div>

        <div className="space-y-2">
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="sk-ant-api03-..."
            autoFocus
            className="w-full bg-zinc-800 text-zinc-100 text-sm rounded-lg px-4 py-3 outline-none border border-zinc-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-mono"
          />
          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={!key.trim() || loading}
          className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-medium px-4 py-3 rounded-lg transition-colors"
        >
          {loading ? "Validating..." : "Connect"}
        </button>
      </form>
    </div>
  );
}
