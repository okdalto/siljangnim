import { describe, expect, it } from "vitest";
import { RUNTIME_TOOLS, jobReport } from "./runtimeTools";
import { noRuntime, stubEnv } from "./testing";
import type { RuntimeJob, RuntimeRequest } from "./tools";

const tool = (name: string) => RUNTIME_TOOLS.find((t) => t.name === name)!;
const job = (over: Partial<RuntimeJob>): RuntimeJob => ({ id: "j1", state: "done", exitCode: 0, error: null, log: "", assets: [], resolved: [], seconds: 1.5, ...over });

describe("runtime tools", () => {
  it("explain when there is no runtime", async () => {
    const out = await tool("python_run").run(tool("python_run").input.parse({ code: "print(1)" }), stubEnv());
    expect(out).toEqual({ isError: true, content: "no runtime in tests" });
  });

  it("send python and command runs with defaults", async () => {
    const seen: RuntimeRequest[] = [];
    const env = stubEnv({
      runtime: { ...noRuntime, unavailable: async () => null, run: async (r) => (seen.push(r), job({ assets: ["mesh.obj"] })) },
    });
    const py = await tool("python_run").run(tool("python_run").input.parse({ code: "x", packages: ["trimesh==4.5.3"], inputs: ["a.png"] }), env);
    expect(String(py.content)).toContain("Saved to the project as assets: mesh.obj");
    await tool("command_run").run(tool("command_run").input.parse({ argv: ["ffmpeg", "-version"] }), env);
    expect(seen).toEqual([
      { kind: "python", code: "x", packages: ["trimesh==4.5.3"], argv: [], inputs: ["a.png"], timeoutS: 120, waitS: 90 },
      { kind: "command", code: "", packages: [], argv: ["ffmpeg", "-version"], inputs: [], timeoutS: 120, waitS: 90 },
    ]);
    expect(tool("python_run").input.safeParse({ code: "x", wait_s: 500 }).success).toBe(false);
  });

  it("report running, failed and finished jobs actionably", () => {
    expect(String(jobReport(job({ state: "installing", seconds: 12 })).content)).toContain('still installing packages (12s so far). Call job_status with id "j1"');
    const failed = jobReport(job({ state: "failed", exitCode: 1, error: "exited with code 1", log: 'Traceback…\n  File "main.py", line 3\nValueError: bad' }));
    expect(failed.isError).toBe(true);
    expect(String(failed.content)).toMatch(/failed: exited with code 1[\s\S]*ValueError: bad[\s\S]*Fix the problem/);
    const long = jobReport(job({ log: "x".repeat(10_000) }));
    expect(String(long.content).length).toBeLessThan(4300);
    expect(String(jobReport(job({})).content)).toContain("No files were written to out/");
  });
});
