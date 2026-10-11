import { describe, expect, it } from "vitest";
import { DEFAULT_SCENE, parseScene } from "../scene/schema";
import { controlSections } from "./controlLayout";

const uniforms = {
  u_a: { type: "float" as const, value: 1 },
  u_b: { type: "float" as const, value: 1 },
  u_c: { type: "bool" as const, value: false },
};

describe("controlSections", () => {
  it("is one unlabeled section without groups", () => {
    expect(controlSections({ uniforms })).toEqual([{ label: null, names: ["u_a", "u_b", "u_c"] }]);
  });

  it("lists groups first and the rest under Other, skipping unknown and repeated names", () => {
    const sections = controlSections({ uniforms, controls: [{ label: "Main", uniforms: ["u_b", "u_x", "u_b"] }] });
    expect(sections).toEqual([
      { label: "Main", names: ["u_b"] },
      { label: "Other", names: ["u_a", "u_c"] },
    ]);
  });
});

describe("widget hints", () => {
  const errors = (def: object, extra: object = {}) => {
    const r = parseScene({ ...DEFAULT_SCENE, uniforms: { u_x: def }, ...extra });
    return r.ok ? "" : r.errors.join("\n");
  };

  it("accepts widgets on matching types", () => {
    expect(errors({ type: "float", value: 0.5, widget: "knob" })).toBe("");
    expect(errors({ type: "vec2", value: [0, 0], widget: "pad" })).toBe("");
    expect(errors({ type: "int", value: 0, widget: "select", options: [{ label: "A", value: 0 }] })).toBe("");
    expect(errors({ type: "bool", value: false, widget: "button" })).toBe("");
  });

  it("explains mismatches", () => {
    expect(errors({ type: "float", value: 1, widget: "pad" })).toContain('widget "pad" needs a vec2 uniform');
    expect(errors({ type: "int", value: 0, widget: "select" })).toContain("needs options");
    expect(errors({ type: "float", value: 1 }, { controls: [{ label: "G", uniforms: ["u_nope"] }] })).toContain('"u_nope", which is not a uniform');
  });
});
