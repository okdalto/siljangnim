import { describe, expect, it } from "vitest";
import { exampleFamily, groupExamples } from "./exampleGroups";
import { EXAMPLES } from "./examples";

describe("example library folders", () => {
  it("groups related modules without swallowing unrelated or mixed examples", () => {
    const items = [
      { slug: "a", uses: ["d3-force"] },
      { slug: "mix", uses: ["d3-force", "opencv"] },
      { slug: "b", uses: ["d3-contour"] },
      { slug: "custom" },
      { slug: "wire", uses: ["glsl-solid-wireframe"] },
      { slug: "noise", uses: ["glsl-random"] },
    ];
    const groups = groupExamples(items, (e) => e);
    expect(groups.map((g) => [g.label, g.folder, g.items.map((e) => e.slug)])).toEqual([
      ["D3", true, ["a", "b"]], ["", false, ["mix"]], ["", false, ["custom"]],
      ["glsl-solid-wireframe", false, ["wire"]], ["glsl-random", false, ["noise"]],
    ]);
  });
  it("also groups multiple examples of a single library", () => {
    expect(groupExamples([{ slug: "a", uses: ["opencv"] }, { slug: "b", uses: ["opencv"] }], (e) => e)[0]?.folder).toBe(true);
  });
  it("leaves a lone search hit visible without another folder click", () => {
    const groups = groupExamples([{ slug: "a", uses: ["d3-force"] }], (e) => e);
    expect(groups[0]?.folder).toBe(false);
    expect(exampleFamily(groups[0]!.items[0]!)?.label).toBe("D3");
  });
  it("preserves every shipped example exactly once, without loading payloads", () => {
    const groups = groupExamples(EXAMPLES, (e) => e);
    const slugs = groups.flatMap((g) => g.items.map((e) => e.slug));
    expect(slugs.sort()).toEqual(EXAMPLES.map((e) => e.slug).sort());
    expect(new Set(slugs).size).toBe(EXAMPLES.length);
    expect(groups.find((g) => g.label === "D3")?.items.length).toBe(21);
  });
});
