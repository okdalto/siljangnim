import { describe, expect, it } from "vitest";
import { DEFAULT_SCENE, parseScene, type Scene } from "../scene/schema";
import { PANEL_CHANNEL, panelDocument, panelValues, readPanelMessage } from "./panel";

const scene: Scene = {
  ...DEFAULT_SCENE,
  uniforms: {
    u_speed: { type: "float", value: 1, min: 0, max: 4 },
    u_count: { type: "int", value: 3 },
    u_on: { type: "bool", value: false },
    u_tint: { type: "color", value: [1, 0, 0] },
  },
};
const msg = (body: object) => ({ channel: PANEL_CHANNEL, ...body });

describe("panel messages", () => {
  it("ignores other channels and accepts ready", () => {
    expect(readPanelMessage({ channel: "x" }, scene)).toBeNull();
    expect(readPanelMessage("nope", scene)).toBeNull();
    expect(readPanelMessage(msg({ type: "ready" }), scene)).toEqual({ type: "ready" });
  });

  it("validates, rounds and clamps values to the uniform", () => {
    expect(readPanelMessage(msg({ type: "set", name: "u_speed", value: 9 }), scene)).toEqual({ type: "set", name: "u_speed", value: 4 });
    expect(readPanelMessage(msg({ type: "set", name: "u_count", value: 2.6 }), scene)).toEqual({ type: "set", name: "u_count", value: 3 });
    expect(readPanelMessage(msg({ type: "set", name: "u_on", value: true }), scene)).toEqual({ type: "set", name: "u_on", value: true });
    expect(readPanelMessage(msg({ type: "set", name: "u_tint", value: [0, 1, 0] }), scene)).toEqual({ type: "set", name: "u_tint", value: [0, 1, 0] });
    expect(readPanelMessage(msg({ type: "set", name: "u_tint", value: [0, 1] }), scene)).toEqual({ error: "u_tint needs an array of 3 numbers" });
    expect(readPanelMessage(msg({ type: "set", name: "u_speed", value: "fast" }), scene)).toEqual({ error: "u_speed needs a number" });
    expect(readPanelMessage(msg({ type: "set", name: "u_missing", value: 1 }), scene)).toEqual({ error: 'panel set unknown uniform "u_missing"' });
  });

  it("builds a sandboxable document with no network and the API first", () => {
    const doc = panelDocument('<button id="b">Go</button>');
    expect(doc).toContain("default-src 'none'");
    expect(doc.indexOf("window.siljangnim = api")).toBeLessThan(doc.indexOf('<button id="b">'));
    expect(panelValues({ u_speed: 2 }, { fps: { value: 60 } })).toEqual({ channel: PANEL_CHANNEL, type: "values", uniforms: { u_speed: 2 }, monitors: { fps: 60 } });
  });

  it("is part of the scene format", () => {
    const parsed = parseScene({ ...DEFAULT_SCENE, panel: { html: "<b>hi</b>" } });
    expect(parsed.ok && parsed.scene.panel).toEqual({ html: "<b>hi</b>", height: 220 });
  });
});
