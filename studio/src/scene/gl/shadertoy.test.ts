import { describe, expect, it } from "vitest";
import { headerLines, shadertoyMouse, wrapShadertoy } from "./shadertoy";

describe("shadertoy", () => {
  it("wraps mainImage into a GLSL ES 3.00 shader with Shadertoy's inputs", () => {
    const src = wrapShadertoy("void mainImage(out vec4 c, in vec2 p) { c = vec4(p / iResolution.xy, 0.5 + 0.5 * sin(iTime), 1.0); }");
    expect(src.startsWith("#version 300 es")).toBe(true);
    for (const name of ["iResolution", "iTime", "iMouse", "iChannel3", "iChannelResolution[4]"]) expect(src).toContain(name);
    expect(src).toContain("mainImage(color, gl_FragCoord.xy)");
  });

  it("drops a #version line the code brings and puts Common first", () => {
    const src = wrapShadertoy("#version 300 es\nvoid mainImage(out vec4 c, in vec2 p) { c = f(); }", "vec4 f() { return vec4(1); }");
    expect(src.match(/#version/g)).toHaveLength(1);
    expect(src.indexOf("vec4 f()")).toBeLessThan(src.indexOf("void mainImage"));
    expect(headerLines("a\nb")).toBe(headerLines() + 2);
  });

  it("follows Shadertoy's iMouse convention", () => {
    const frame = { time: 0, dt: 0, frame: 0, resolution: [200, 100] as [number, number], mouse: [0.5, 0.25, 0.1, 0.2] as [number, number, number, number], mouseDown: true };
    // Press frame: z and w positive, origin bottom-left.
    expect(shadertoyMouse(frame, false, [0, 0]).mouse).toEqual([100, 75, 20, 80]);
    // Held: w turns negative.
    expect(shadertoyMouse(frame, true, [0, 0]).mouse[3]).toBe(-80);
    // Released: keeps the last position, click negated.
    expect(shadertoyMouse({ ...frame, mouseDown: false }, true, [100, 75]).mouse).toEqual([100, 75, -20, -80]);
  });
});
