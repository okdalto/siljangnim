import { describe, expect, it } from "vitest";
import { DEFAULT_SCENE } from "../scene/schema";
import { mixRequest, remixRequest } from "./mix";

describe("mixRequest", () => {
  it("carries the other scene and says where its assets went", () => {
    const text = mixRequest("Stellar flyby", DEFAULT_SCENE, new Map([["orbits.json", "orbits-2.json"], ["beat.wav", "beat.wav"]]));
    expect(text).toContain('"Stellar flyby"');
    expect(text).toContain("orbits.json is orbits-2.json here");
    expect(text).not.toContain("beat.wav is");
    expect(JSON.parse(text.slice(text.indexOf("```json") + 7, text.lastIndexOf("```")))).toEqual(DEFAULT_SCENE);
  });

  it("says nothing about assets when there are none", () => {
    expect(mixRequest("Waves", DEFAULT_SCENE, new Map())).not.toContain("assets");
  });
});

describe("remixRequest", () => {
  it("names every pick, points at move_get for techniques and embeds the pieces", () => {
    const scene = { ...DEFAULT_SCENE };
    const text = remixRequest(
      [{ id: "pixel-sorting", name: "Pixel sorting", summary: "Sort pixels." }],
      [{ title: "Video synth (Hydra)", scene, renamed: new Map([["a.png", "a-2.png"]]) }],
      "make it purple",
    );
    expect(text.split("\n")[0]).toBe("[Remix] Pixel sorting + Video synth (Hydra)");
    expect(text).toContain("- Pixel sorting (pixel-sorting): Sort pixels.");
    expect(text).toContain("move_get");
    expect(text).toContain("a.png is a-2.png here");
    expect(text).toContain('"version": 2');
    expect(text).toContain("The person adds: make it purple");
  });
});
