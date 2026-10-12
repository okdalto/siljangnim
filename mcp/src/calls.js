import { randomUUID } from "node:crypto";

export const CALL_STATUS_TOOL = {
  name: "viewer_call_status",
  description: "Continue waiting for a Siljangnim tool call that returned a call ID. Use this instead of repeating the original tool: that call is still running, including any runtime setup or approval. This is a bridge call ID, not a runtime job_status ID.",
  inputSchema: { type: "object", properties: { call_id: { type: "string" } }, required: ["call_id"], additionalProperties: false },
  annotations: { readOnlyHint: true },
};

/** Bound each MCP response, not the underlying operation. Never rerun a timed-out write. */
export class CallTracker {
  constructor({ waitMs = 45_000, retentionMs = 600_000, maxEntries = 128 } = {}) {
    this.waitMs = waitMs;
    this.retentionMs = retentionMs;
    this.maxEntries = maxEntries;
    this.entries = new Map();
  }

  prune() {
    for (const [id, entry] of this.entries) {
      if (entry.completedAt !== null && Date.now() - entry.completedAt >= this.retentionMs) this.entries.delete(id);
    }
  }

  async start(name, operation) {
    this.prune();
    if (this.entries.size >= this.maxEntries) {
      // Only evict a result the client has already retrieved, never an unread write result.
      for (const [id, entry] of this.entries) {
        if (entry.delivered) { this.entries.delete(id); break; }
      }
    }
    if (this.entries.size >= this.maxEntries) {
      return { isError: true, content: "Too many outstanding viewer calls. Retrieve their results with viewer_call_status before starting another tool." };
    }
    const id = randomUUID();
    const entry = { name, completedAt: null, delivered: false, promise: null };
    entry.promise = Promise.resolve().then(operation).catch((error) => ({
      isError: true, content: error instanceof Error ? error.message : String(error),
    })).then((result) => {
      entry.completedAt = Date.now();
      return result;
    });
    this.entries.set(id, entry);
    return this.wait(id, entry, true);
  }

  async poll(id) {
    this.prune();
    const entry = typeof id === "string" ? this.entries.get(id) : undefined;
    if (!entry) return { isError: true, content: "Unknown or expired viewer call ID. Check the viewer's Activity and Jobs before repeating a modifying tool." };
    return this.wait(id, entry, false);
  }

  async wait(id, entry, initial) {
    const waiting = Symbol("waiting");
    let timer;
    try {
      const result = await Promise.race([
        entry.promise,
        new Promise((resolve) => { timer = setTimeout(() => resolve(waiting), this.waitMs); }),
      ]);
      if (result !== waiting) {
        // Keep deferred results briefly so a lost poll response can be retried safely.
        if (initial) this.entries.delete(id);
        else entry.delivered = true;
        return result;
      }
      return { content: `${entry.name} is still pending (it may be setting up Python, waiting for approval, or running). Call viewer_call_status with call_id "${id}" to continue. Do not repeat the original tool. Results are retained for 10 minutes after completion.` };
    } finally {
      clearTimeout(timer);
    }
  }

  clear() { this.entries.clear(); }
}
