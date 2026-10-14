import { describe, expect, it } from "vitest";
import { SceneInputs } from "./inputs";

/** Just what sync() touches on an HTMLAudioElement. */
function fakeElement(duration: number, loop: boolean) {
  return {
    duration,
    loop,
    currentTime: 0,
    paused: false,
    plays: 0,
    play() {
      this.paused = false;
      this.plays++;
      return Promise.resolve();
    },
    pause() {
      this.paused = true;
    },
  };
}

function withElement(element: ReturnType<typeof fakeElement>) {
  const inputs = new SceneInputs();
  (inputs as unknown as { element: unknown }).element = element;
  return inputs;
}

describe("soundtrack on the scene clock", () => {
  it("pauses with the scene and resumes where the scene is", () => {
    const el = fakeElement(20, false);
    const inputs = withElement(el);
    inputs.sync(3, false);
    expect(el.paused).toBe(true);
    expect(el.currentTime).toBe(3); // scrubbed while paused
    inputs.sync(7, true);
    expect(el.paused).toBe(false);
    expect(el.currentTime).toBe(7);
  });

  it("only seeks when it drifts, follows timeline loops and stops after a one-shot ends", () => {
    const el = fakeElement(10, true);
    const inputs = withElement(el);
    el.currentTime = 5.1;
    inputs.sync(5, true);
    expect(el.currentTime).toBe(5.1); // small drift: left alone, no audible jump
    inputs.sync(12.5, true);
    expect(el.currentTime).toBeCloseTo(2.5);
    const once = fakeElement(10, false);
    const oneShot = withElement(once);
    oneShot.sync(11, true);
    expect(once.paused).toBe(true);
  });
});
