import { useState, type ReactNode } from "react";
import type { ExampleGroup } from "../../project/exampleGroups";

/** Opening a folder only reveals metadata/cards; downloads still require Open. */
export function ExampleFolders<T>({ groups, renderItem, korean, searching = false, compact = false }: {
  groups: ExampleGroup<T>[];
  renderItem: (item: T) => ReactNode;
  korean: boolean;
  searching?: boolean;
  compact?: boolean;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const grid = compact ? "grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2" : "grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3";
  return <div className={grid}>
    {groups.map((group) => {
      if (!group.folder) return renderItem(group.items[0]!);
      const open = searching || expanded.has(group.id);
      return <section key={group.id} className={`rounded-lg border border-line bg-panel ${open ? "col-span-full" : ""}`} data-example-folder={group.label}>
        <button type="button" aria-expanded={open} onClick={() => {
          setExpanded((before) => {
            const next = new Set(before);
            if (next.has(group.id)) next.delete(group.id); else next.add(group.id);
            return next;
          });
        }} disabled={searching} className="flex w-full items-center gap-3 p-4 text-left text-fg hover:bg-raised disabled:cursor-default">
          <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="shrink-0 text-muted"><path d="M3 7V5a1 1 0 0 1 1-1h5l2 3h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Z" /></svg>
          <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{group.label}</span><span className="text-xs text-muted">{korean ? `예제 ${group.items.length}개` : `${group.items.length} examples`}</span></span>
          <span aria-hidden="true" className="text-muted">{open ? "▾" : "▸"}</span>
        </button>
        {open && <div className={`${grid} border-t border-line p-3`}>{group.items.map(renderItem)}</div>}
      </section>;
    })}
  </div>;
}
