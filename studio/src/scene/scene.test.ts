import { describe, expect, it } from "vitest";
import { excerptAround, parseShaderLog } from "./gl/shader";
import { scriptLocation, toSceneError } from "./runtime/runner";
import { DEFAULT_SCENE, parseScene } from "./schema";

describe("parseScene", () => {
  it("accepts the default scene", () => {
    expect(parseScene(DEFAULT_SCENE)).toEqual({ ok: true, scene: DEFAULT_SCENE });
  });

  it("fills defaults and reports precise problems", () => {
    const result = parseScene({ version: 2, script: { render: "" }, uniforms: { "bad name": { type: "float", value: 1 } } });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join("\n")).toContain("script.render");
    expect(result.errors.join("\n")).toContain("not a valid GLSL identifier");
  });

  it("checks uniform value shapes", () => {
    const result = parseScene({ ...DEFAULT_SCENE, uniforms: { u_c: { type: "vec3", value: [1, 2] } } });
    expect(result.ok).toBe(false);
  });

  it("migrates v1 script scenes", () => {
    const result = parseScene({
      render_mode: "script",
      script: { setup: "a", render: "b" },
      uniforms: { u_x: { type: "float", value: 2 }, u_weird: { type: "sampler", value: 0 } },
      backendTarget: "auto",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scene.version).toBe(2);
    expect(result.scene.backend).toBe("webgl2");
    expect(Object.keys(result.scene.uniforms)).toEqual(["u_x"]);
  });
});

describe("shader diagnostics", () => {
  it("parses ANGLE logs", () => {
    const log = "ERROR: 0:7: 'foo' : undeclared identifier\nERROR: 0:9: '' : syntax error\n";
    expect(parseShaderLog(log)).toEqual([
      { line: 7, message: "'foo' : undeclared identifier" },
      { line: 9, message: "'' : syntax error" },
    ]);
  });

  it("marks the failing line in the excerpt", () => {
    const excerpt = excerptAround("a\nb\nc\nd\ne", 3, 1);
    expect(excerpt.split("\n")).toEqual(["     2 | b", ">    3 | c", "     4 | d"]);
  });
});

describe("script error locations", () => {
  it("maps new Function frames back to body lines", () => {
    const fn = new Function("ctx", "const a = 1;\nctx.missing.call();") as (ctx: object) => void;
    let caught: unknown;
    try {
      fn({});
    } catch (err) {
      caught = err;
    }
    expect(scriptLocation(caught as Error)?.line).toBe(2);
    expect(toSceneError("render", caught).message).toMatch(/^TypeError:/);
  });
});
