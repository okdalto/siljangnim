import { describe, expect, it } from "vitest";
import { packUniforms, uniformLayout, wgslDiagnostics } from "./wgsl";

describe("uniform layout", () => {
  it("follows WGSL alignment for the standard values and scene uniforms", () => {
    const layout = uniformLayout({
      u_speed: { type: "float", value: 1 },
      u_tint: { type: "color", value: [1, 0.5, 0] },
      u_on: { type: "bool", value: true },
      u_offset: { type: "vec2", value: [3, 4] },
    });
    expect(layout.fields.map((f) => [f.name, f.offset])).toEqual([
      ["time", 0],
      ["dt", 4],
      ["frame", 8],
      ["resolution", 16],
      ["mouse", 32],
      ["audio", 48],
      ["u_speed", 64],
      ["u_tint", 80], // vec3f aligns to 16
      ["u_on", 92], // and an f32 fits in its last slot
      ["u_offset", 96],
    ]);
    expect(layout.size).toBe(112);
    expect(layout.wgsl).toContain("u_tint: vec3f,");

    const data = packUniforms(layout, { time: 2, resolution: [640, 480], audio: [0.5, 0, 0, 0], u_speed: 1.5, u_tint: [1, 0.5, 0], u_on: true, u_offset: [3, 4] });
    expect(data.length).toBe(28);
    expect([data[0], data[4], data[5], data[12], data[16], data[20], data[21], data[23], data[24], data[25]]).toEqual([2, 640, 480, 0.5, 1.5, 1, 0.5, 1, 3, 4]);
  });
});

describe("wgsl diagnostics", () => {
  it("keeps errors with line and column", () => {
    expect(
      wgslDiagnostics([
        { type: "warning", lineNum: 2, linePos: 1, message: "unused" },
        { type: "error", lineNum: 7, linePos: 12, message: "unresolved identifier 'colr'" },
      ]),
    ).toEqual([{ line: 7, message: "unresolved identifier 'colr' (column 12)" }]);
  });
});
