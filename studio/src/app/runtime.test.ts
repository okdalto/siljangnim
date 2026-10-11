import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { setHubProvider } from "./hubClient";
import { answerRuntimeApproval, runtimeController } from "./session";
import { useApp } from "./state";

const PROJECT = { id: "p-runtime", name: "R", createdAt: 0, updatedAt: 0 };

/** A stand-in hub: records requests and finishes every job with one output file. */
function fakeHub() {
  const requests: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string, init: RequestInit = {}) => {
    const url = new URL(input);
    const method = init.method ?? "GET";
    requests.push(`${method} ${url.pathname}`);
    const job = { id: "j1", kind: "python", state: "created", packages: ["trimesh==4.5.3"], argv: [], exit_code: null, error: null, log: "", outputs: [], resolved: [], seconds: 0 };
    if (url.pathname === "/jobs" && method === "POST") return Response.json(job, { status: 201 });
    if (url.pathname.startsWith("/jobs/j1/inputs/")) return Response.json({ ok: true });
    if (url.pathname === "/jobs/j1/start") return Response.json({ ...job, state: "queued" });
    if (url.pathname === "/jobs/j1/outputs/mesh.json") return new Response('{"vertices":8}');
    if (url.pathname === "/jobs/j1") {
      return Response.json({ ...job, state: "done", exit_code: 0, log: "made a cube\n", outputs: [{ name: "mesh.json", size: 14 }], resolved: ["trimesh==4.5.3", "numpy==2.3.1"], seconds: 2 });
    }
    return Response.json({ error: "unexpected" }, { status: 500 });
  }) as typeof fetch;
  return { requests, restore: () => (globalThis.fetch = realFetch) };
}

async function answerWhenAsked(answer: "project" | "once" | "deny") {
  for (let i = 0; i < 100 && !useApp.getState().approval; i++) await new Promise((r) => setTimeout(r, 5));
  expect(useApp.getState().approval).not.toBeNull();
  answerRuntimeApproval(answer);
}

describe("runtime controller", () => {
  afterEach(() => setHubProvider(async () => "no hub"));

  it("asks once per project, uploads inputs, saves outputs as assets and records the lock", async () => {
    useApp.setState({ project: PROJECT, assets: [], approval: null });
    setHubProvider(async () => ({ url: "http://127.0.0.1:9", token: "t" }));
    const hub = fakeHub();
    try {
      const runtime = runtimeController(PROJECT.id);
      const request = { kind: "python" as const, code: "x", packages: ["trimesh==4.5.3"], argv: [], inputs: [], timeoutS: 60, waitS: 5 };
      const signal = new AbortController().signal;

      const first = runtime.run(request, signal);
      await answerWhenAsked("project");
      const job = await first;
      expect(job).toMatchObject({ state: "done", assets: ["mesh.json"], resolved: ["trimesh==4.5.3", "numpy==2.3.1"] });
      expect(useApp.getState().assets.map((a) => a.name)).toEqual(["mesh.json"]);
      expect(hub.requests).toEqual(["POST /jobs", "POST /jobs/j1/start", "GET /jobs/j1", "GET /jobs/j1/outputs/mesh.json"]);

      // Allowed for the project: no question the second time, and job_status doesn't import twice.
      await runtime.run(request, signal);
      expect(useApp.getState().approval).toBeNull();
      expect((await runtime.job("j1", 0)).assets).toEqual(["mesh.json"]);
      expect(useApp.getState().assets).toHaveLength(1);

      const { ProjectStore } = await import("../project/store");
      const store = new ProjectStore();
      expect(JSON.parse(String(await store.readFile(PROJECT.id, "runtime/permissions.json")))).toEqual({ python: true, packages: ["trimesh==4.5.3"], programs: [] });
      expect(JSON.parse(String(await store.readFile(PROJECT.id, "project.lock.json")))).toEqual({
        python: [{ packages: ["trimesh==4.5.3"], resolved: ["trimesh==4.5.3", "numpy==2.3.1"] }],
      });
    } finally {
      hub.restore();
    }
  });

  it("stops at a denial and checks inputs first", async () => {
    useApp.setState({ project: { ...PROJECT, id: "p-deny" }, assets: [], approval: null });
    setHubProvider(async () => ({ url: "http://127.0.0.1:9", token: "t" }));
    const hub = fakeHub();
    try {
      const runtime = runtimeController("p-deny");
      const request = { kind: "command" as const, code: "", packages: [], argv: ["ffmpeg", "-version"], inputs: [], timeoutS: 60, waitS: 5 };
      const denied = runtime.run(request, new AbortController().signal);
      await answerWhenAsked("deny");
      await expect(denied).rejects.toThrow(/did not allow/);
      await expect(runtime.run({ ...request, inputs: ["missing.png"] }, new AbortController().signal)).rejects.toThrow(/No asset named missing.png/);
      expect(hub.requests).toEqual([]);
    } finally {
      hub.restore();
    }
  });

  it("says why when there is no hub", async () => {
    setHubProvider(async () => "needs the desktop app");
    expect(await runtimeController("p").unavailable()).toBe("needs the desktop app");
  });
});
