// Replaces the chat when an external agent (Claude Code, Codex…) drives the
// viewer over MCP: the conversation happens in that agent's own app, and this
// panel shows what it did here.
import { useEffect, useRef } from "react";
import { setExamplesOpen } from "../session";
import { useApp, type ExternalAgent } from "../state";
import { Spinner } from "./icons";
import { ApprovalCard } from "./Approval";
import { ToolChip } from "./Chat";

export function Activity() {
  const external = useApp((s) => s.external);
  const activity = useApp((s) => s.activity);
  const approval = useApp((s) => s.approval);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [activity, approval]);

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="activity">
      {external && <Status external={external} />}
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 text-sm">
        {!activity.length && (
          <div className="pt-6 text-center text-xs text-faint">
            <p>Ask your agent for a visual. What it does here shows up in this panel.</p>
            <button type="button" onClick={() => setExamplesOpen(true)} className="mt-3 text-muted underline-offset-2 hover:text-fg hover:underline">
              Or open an example
            </button>
          </div>
        )}
        {activity.map((entry) => (
          <div key={entry.id} data-activity={entry.tool}>
            {entry.output ? (
              <ToolChip
                name={entry.tool}
                result={{ type: "tool_result", tool_use_id: String(entry.id), content: entry.output.content, ...(entry.output.isError ? { is_error: true } : {}) }}
              />
            ) : (
              <ToolChip name={entry.tool} running />
            )}
          </div>
        ))}
        <ApprovalCard />
      </div>
    </div>
  );
}

function Status({ external }: { external: ExternalAgent }) {
  const agent = external.client ?? "your agent";
  const text = {
    connecting: "Connecting to the agent…",
    connected: `Connected to ${agent}. Chat with it there; changes appear here.`,
    reconnecting: `Lost the connection to ${agent}. Reconnecting…`,
    ended: `The ${agent} session that opened this viewer has ended. Your work is saved; ask your agent to open the viewer again.`,
    replaced: "This viewer was opened in another tab. Use that one.",
  }[external.status];
  const tone = external.status === "connected" ? "text-muted" : external.status === "ended" || external.status === "replaced" ? "text-warn" : "text-faint";
  return (
    <div className={`flex items-start gap-2 border-b border-line px-4 py-2.5 text-xs ${tone}`} data-testid="external-status" data-status={external.status}>
      {external.status === "connecting" || external.status === "reconnecting" ? (
        <Spinner size={12} />
      ) : (
        <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${external.status === "connected" ? "bg-ok" : "bg-warn"}`} />
      )}
      <span>{text}</span>
    </div>
  );
}
