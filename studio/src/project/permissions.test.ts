import { describe, expect, it } from "vitest";
import { NO_GRANTS, approvalNeeded, grant, parseGrants, programName } from "./permissions";

const py = (packages: string[]) => ({ kind: "python" as const, packages, argv: [] });
const cmd = (...argv: string[]) => ({ kind: "command" as const, packages: [], argv });

describe("runtime permissions", () => {
  it("asks before Python first runs and before each new package", () => {
    const first = approvalNeeded(NO_GRANTS, py(["trimesh==4.5.3"]));
    expect(first?.items).toEqual([expect.stringContaining("Run Python code"), "Install trimesh==4.5.3 from PyPI"]);
    const grants = grant(NO_GRANTS, py(["Trimesh == 4.5.3"]));
    expect(approvalNeeded(grants, py(["trimesh==4.5.3"]))).toBeNull();
    expect(approvalNeeded(grants, py([]))).toBeNull();
    expect(approvalNeeded(grants, py(["trimesh==4.5.3", "numpy"]))?.items).toEqual(["Install numpy from PyPI"]);
    // A different version is a different approval.
    expect(approvalNeeded(grants, py(["trimesh==4.6.0"]))).not.toBeNull();
  });

  it("asks once per program", () => {
    expect(approvalNeeded(NO_GRANTS, cmd("ffmpeg", "-i", "in/a.mp4"))?.title).toContain("ffmpeg");
    const grants = grant(NO_GRANTS, cmd("/usr/local/bin/ffmpeg"));
    expect(grants.programs).toEqual(["ffmpeg"]);
    expect(approvalNeeded(grants, cmd("ffmpeg", "-y"))).toBeNull();
    expect(approvalNeeded(grants, cmd("blender"))).not.toBeNull();
    expect(programName("C:\\Tools\\FFmpeg.exe")).toBe("ffmpeg");
  });

  it("reads stored grants defensively", () => {
    expect(parseGrants(undefined)).toEqual(NO_GRANTS);
    expect(parseGrants("{bad")).toEqual(NO_GRANTS);
    expect(parseGrants('{"python":true,"packages":["a",1],"programs":"x"}')).toEqual({ python: true, packages: ["a"], programs: [] });
  });
});
