export default function RepoChooser({ onChooseNew, onChooseExisting }) {
  return (
    <div className="flex gap-2">
      <button
        onClick={onChooseNew}
        className="flex-1 px-3 py-3 rounded-lg text-left transition-colors hover:bg-white/5"
        style={{ border: "1px solid var(--chrome-border)", color: "var(--chrome-text)" }}
      >
        <div className="text-xs font-semibold mb-1">Create new repository</div>
        <div className="text-[10px]" style={{ color: "var(--chrome-text-muted)" }}>
          Create a new GitHub repo and push this project
        </div>
      </button>
      <button
        onClick={onChooseExisting}
        className="flex-1 px-3 py-3 rounded-lg text-left transition-colors hover:bg-white/5"
        style={{ border: "1px solid var(--chrome-border)", color: "var(--chrome-text)" }}
      >
        <div className="text-xs font-semibold mb-1">Existing repository</div>
        <div className="text-[10px]" style={{ color: "var(--chrome-text-muted)" }}>
          Save into an existing repo you own
        </div>
      </button>
    </div>
  );
}
