// The person's OK before the agent runs code or installs packages on this
// computer (docs/runtime.md). Shown in the chat, or in Activity for external agents.
import { answerRuntimeApproval } from "../session";
import { useApp } from "../state";

export function ApprovalCard() {
  const approval = useApp((s) => s.approval);
  if (!approval) return null;
  return (
    <div className="rounded-lg border border-warn/40 bg-raised/50 p-3 text-xs" data-testid="approval">
      <p className="mb-2 text-sm text-fg">{approval.title}</p>
      <ul className="mb-3 list-disc space-y-1 pl-4 text-muted">
        {approval.items.map((item) => (
          <li key={item} className="break-words">
            {item}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" data-approval="project" onClick={() => answerRuntimeApproval("project")} className="rounded-md bg-accent px-2.5 py-1.5 font-medium text-white">
          Allow for this project
        </button>
        <button type="button" data-approval="once" onClick={() => answerRuntimeApproval("once")} className="rounded-md border border-line px-2.5 py-1.5 text-fg hover:border-faint">
          Allow once
        </button>
        <button type="button" data-approval="deny" onClick={() => answerRuntimeApproval("deny")} className="rounded-md px-2.5 py-1.5 text-muted hover:text-danger">
          Deny
        </button>
      </div>
    </div>
  );
}
