import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SCENE } from "../scene/schema";
import { displayedValue, redo, setUniformValue, toggleKey, undo, updateTimeline } from "./session";
import { useApp } from "./state";

const speed = () => useApp.getState().scene.uniforms.u_speed!.value;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("controls, keyframes and undo (no scene host)", () => {
  beforeEach(() => {
    useApp.setState({ scene: structuredClone(DEFAULT_SCENE), overrides: [], runtime: { state: "running", fps: 60, time: 0, errors: [] } });
    // Start each test with empty undo history.
    while (useApp.getState().canUndo) undo();
    while (useApp.getState().canRedo) redo();
    useApp.setState({ scene: structuredClone(DEFAULT_SCENE), overrides: [] });
  });

  it("merges a slider drag into one undo step and redoes it", async () => {
    setUniformValue("u_speed", 2);
    setUniformValue("u_speed", 3);
    expect(speed()).toBe(3);
    undo();
    expect(speed()).toBe(1);
    expect(useApp.getState().canRedo).toBe(true);
    redo();
    expect(speed()).toBe(3);
    // A new change after undo/redo is its own step.
    await wait(1);
    setUniformValue("u_speed", 4);
    undo();
    expect(speed()).toBe(3);
  });

  it("adds a key at the playhead (creating a timeline) and removes it on the second click", async () => {
    setUniformValue("u_speed", 2.5);
    useApp.setState((s) => ({ runtime: { ...s.runtime, time: 1.234 } }));
    await toggleKey("u_speed");
    const { scene } = useApp.getState();
    expect(scene.timeline).toEqual({ duration: 10, loop: true, preserveStateOnLoop: false });
    expect(scene.keyframes.u_speed).toEqual([{ time: 1.23, value: 2.5 }]);

    await toggleKey("u_speed");
    expect(useApp.getState().scene.keyframes.u_speed).toBeUndefined();
    undo();
    expect(useApp.getState().scene.keyframes.u_speed).toHaveLength(1);
    undo();
    expect(useApp.getState().scene.timeline).toBeUndefined();
  });

  it("shows keyframe values until the person moves the slider", async () => {
    updateTimeline({ duration: 4 });
    await toggleKey("u_speed"); // key at 0 with value 1
    useApp.setState((s) => ({ runtime: { ...s.runtime, time: 4 } }));
    setUniformValue("u_speed", 3);
    expect(displayedValue("u_speed")).toBe(3); // overridden
    await toggleKey("u_speed"); // key at 4 with value 3, overrides cleared
    useApp.setState((s) => ({ runtime: { ...s.runtime, time: 2 } }));
    expect(useApp.getState().overrides).toEqual([]);
    expect(displayedValue("u_speed")).toBeCloseTo(2); // smooth between 1 and 3, midpoint
  });

  it("keeps keys inside a shortened timeline and drops them with it", () => {
    updateTimeline({ duration: 8 });
    useApp.setState((s) => ({ scene: { ...s.scene, keyframes: { u_speed: [{ time: 6, value: 2 }] } } }));
    updateTimeline({ duration: 5 });
    expect(useApp.getState().scene.keyframes.u_speed).toEqual([{ time: 5, value: 2 }]);
    updateTimeline(null);
    expect(useApp.getState().scene.timeline).toBeUndefined();
    expect(useApp.getState().scene.keyframes).toEqual({});
  });
});
