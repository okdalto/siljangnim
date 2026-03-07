/**
 * GitHubProjectPicker — select a project from a multi-project repo.
 */
export default function GitHubProjectPicker({ projects, onSelect }) {
  if (!projects?.length) return null;

  return (
    <div className="space-y-1">
      <div className="text-[11px] font-medium mb-2" style={{ color: "var(--chrome-text-secondary)" }}>
        This repository contains multiple projects. Select one:
      </div>
      {projects.map((p, i) => (
        <button
          key={p.path || i}
          onClick={() => onSelect(p)}
          className="w-full text-left px-3 py-2 rounded transition-colors hover:bg-white/5"
          style={{ border: "1px solid var(--chrome-border)", color: "var(--chrome-text)" }}
        >
          <div className="text-xs font-medium">{p.display_name || p.path}</div>
          {p.description && (
            <div className="text-[10px] mt-0.5" style={{ color: "var(--chrome-text-muted)" }}>
              {p.description}
            </div>
          )}
          <div className="text-[10px] mt-0.5 font-mono" style={{ color: "var(--chrome-text-muted)" }}>
            /{p.path}
          </div>
        </button>
      ))}
    </div>
  );
}
