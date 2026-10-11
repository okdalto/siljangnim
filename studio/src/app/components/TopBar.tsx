import { useEffect, useRef, useState } from "react";
import { createProject, deleteProject, openProject, renameProject, setExamplesOpen, setSettingsOpen } from "../session";
import { useApp } from "../state";
import { ChevronIcon, GearIcon, Logo, PlusIcon, TrashIcon } from "./icons";

export function TopBar() {
  const project = useApp((s) => s.project);
  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line bg-panel px-3 text-sm">
      <Logo size={20} />
      <span className="font-semibold tracking-tight">Siljangnim</span>
      <span className="text-faint">/</span>
      {project && <ProjectName key={project.id} name={project.name} />}
      <ProjectMenu />
      <div className="flex-1" />
      <button
        type="button"
        onClick={() => setSettingsOpen(true)}
        className="rounded-md p-1.5 text-muted hover:bg-raised hover:text-fg"
        title="Settings"
      >
        <GearIcon />
      </button>
    </header>
  );
}

function ProjectName({ name }: { name: string }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)} className="truncate rounded px-1 hover:bg-raised" title="Rename project">
        {name}
      </button>
    );
  }
  const commit = () => {
    setEditing(false);
    if (value.trim() && value !== name) void renameProject(value);
    else setValue(name);
  };
  return (
    <input
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") {
          setValue(name);
          setEditing(false);
        }
      }}
      className="w-48 rounded border border-line bg-bg px-1 outline-none focus:border-muted"
    />
  );
}

function ProjectMenu() {
  const [open, setOpen] = useState(false);
  const projects = useApp((s) => s.projects);
  const current = useApp((s) => s.project);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(!open)} className="rounded p-1 text-muted hover:bg-raised hover:text-fg" title="Projects">
        <ChevronIcon size={14} />
      </button>
      {open && (
        <div className="absolute left-0 top-8 z-20 w-72 overflow-hidden rounded-lg border border-line bg-raised shadow-2xl">
          <div className="max-h-80 overflow-y-auto py-1">
            {projects.map((p) => (
              <div key={p.id} className={`group flex items-center gap-2 px-3 py-1.5 ${p.id === current?.id ? "bg-line/60" : "hover:bg-line/40"}`}>
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left"
                  onClick={() => {
                    setOpen(false);
                    void openProject(p.id);
                  }}
                >
                  {p.name}
                  <span className="ml-2 text-xs text-faint">{new Date(p.updatedAt).toLocaleDateString()}</span>
                </button>
                <button
                  type="button"
                  title="Delete project"
                  className="invisible rounded p-1 text-faint hover:text-danger group-hover:visible"
                  onClick={() => {
                    if (confirm(`Delete "${p.name}"? This cannot be undone.`)) void deleteProject(p.id);
                  }}
                >
                  <TrashIcon size={14} />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="flex w-full items-center gap-2 border-t border-line px-3 py-2 text-left hover:bg-line/40"
            onClick={() => {
              setOpen(false);
              void createProject("Untitled");
            }}
          >
            <PlusIcon size={14} /> New project
          </button>
          <button
            type="button"
            data-testid="open-examples"
            className="flex w-full items-center gap-2 border-t border-line px-3 py-2 text-left hover:bg-line/40"
            onClick={() => {
              setOpen(false);
              setExamplesOpen(true);
            }}
          >
            <span className="w-3.5 text-center text-faint">◇</span> Examples…
          </button>
        </div>
      )}
    </div>
  );
}
