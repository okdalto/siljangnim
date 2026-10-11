// The runtime's job queue: what is installing or running on this computer
// (long model jobs especially), with logs and a way to stop them.
import { useEffect, useState } from "react";
import type { HubJob } from "../hubClient";
import { cancelJob, listJobs } from "../session";
import { Spinner } from "./icons";

const ACTIVE = new Set(["created", "queued", "installing", "running"]);
const POLL_MS = 1500;

function duration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  return m < 60 ? `${m}m ${Math.round(seconds % 60)}s` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function Jobs() {
  const [jobs, setJobs] = useState<HubJob[] | string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const next = await listJobs().catch((err: unknown) => (err instanceof Error ? err.message : String(err)));
      if (stopped) return;
      setJobs(next);
      timer = setTimeout(poll, POLL_MS);
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, []);

  if (jobs === null) return <div className="p-4 text-xs text-faint">Loading…</div>;
  if (typeof jobs === "string") return <div className="p-4 text-xs text-muted">{jobs}</div>;
  const active = jobs.filter((j) => ACTIVE.has(j.state)).length;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 text-xs" data-testid="jobs">
      <p className="px-1 pb-2 text-faint">
        {active ? `${active} job${active === 1 ? "" : "s"} waiting or running. Jobs run one at a time.` : "Open-source tools the agent ran on this computer."}
      </p>
      {!jobs.length && <p className="px-1 text-muted">No jobs yet.</p>}
      <ul className="space-y-1.5">
        {jobs.map((job) => {
          const running = ACTIVE.has(job.state);
          const tone = job.state === "failed" ? "text-danger" : job.state === "done" ? "text-ok" : "text-muted";
          return (
            <li key={job.id} data-job={job.id} data-job-state={job.state} className="rounded-md border border-line">
              <div className="flex items-center gap-2 px-2.5 py-2">
                <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setOpen(open === job.id ? null : job.id)}>
                  {running ? <Spinner size={11} /> : <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${job.state === "done" ? "bg-ok" : job.state === "failed" ? "bg-danger" : "bg-faint"}`} />}
                  <span className="truncate text-fg">{job.label || job.kind}</span>
                  <span className={`shrink-0 ${tone}`}>{job.state === "installing" ? "installing packages" : job.state}</span>
                  <span className="ml-auto shrink-0 tabular-nums text-faint">{duration(job.seconds)}</span>
                </button>
                {running && (
                  <button type="button" data-cancel-job={job.id} onClick={() => void cancelJob(job.id)} className="shrink-0 rounded px-1.5 py-0.5 text-muted hover:bg-raised hover:text-danger">
                    Cancel
                  </button>
                )}
              </div>
              {open === job.id && (
                <div className="border-t border-line px-2.5 py-2">
                  {job.error && <p className="mb-1.5 text-danger">{job.error}</p>}
                  {job.outputs.length > 0 && <p className="mb-1.5 text-muted">Outputs: {job.outputs.map((o) => o.name).join(", ")}</p>}
                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all font-mono text-[10.5px] leading-snug text-muted">{job.log || "(no output yet)"}</pre>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
