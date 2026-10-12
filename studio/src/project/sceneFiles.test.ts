import { describe, expect, it } from "vitest";
import { DEFAULT_SCENE, type Scene } from "../scene/schema";
import { projectFolderName, sceneCodeFiles } from "./sceneFiles";

describe("sceneCodeFiles", () => {
  it("lists the scripts, the shaders inside them and scene.json", () => {
    const scene: Scene = {
      ...DEFAULT_SCENE,
      script: {
        setup: "const vs = `#version 300 es\nvoid main(){}`;\nconst fs = `#version 300 es\nout vec4 o; void main(){o=vec4(1);}`;",
        render: "const fs = `  #version 300 es\nvoid main(){}`;",
        cleanup: "  ",
      },
    };
    const files = sceneCodeFiles(scene);
    expect(files.map((f) => f.path)).toEqual([
      "code/setup.js",
      "code/render.js",
      "code/shaders/vs.glsl",
      "code/shaders/fs.glsl",
      "code/shaders/fs-2.glsl",
      "scene.json",
    ]);
    expect(files[2]).toMatchObject({ language: "glsl", text: "#version 300 es\nvoid main(){}\n", extracted: "setup.js" });
    expect(files[4]!.extracted).toBe("render.js");
    expect(JSON.parse(files.at(-1)!.text)).toEqual(scene);
  });

  it("finds shaders passed inline and WGSL, named after what holds them", () => {
    const setup = [
      "const sim=ctx.utils.createProgram(vs, `#version 300 es\nvoid main(){}`);",
      "const mod = device.createShaderModule({ code: `@fragment fn main() {}` });",
      "draw(`#version 300 es\nvoid main(){}`);",
      "const label = `not a shader`;",
      'const p = createProgram(vs, "#version 300 es\\nvoid main(){}");',
      "const draw = regl({ vert: `\n  precision highp float;\n  void main(){ gl_Position = vec4(0); }` });",
    ].join("\n");
    const files = sceneCodeFiles({ ...DEFAULT_SCENE, script: { setup, render: "x", cleanup: "" } });
    expect(files.filter((f) => f.path.includes("shaders/")).map((f) => [f.path, f.language])).toEqual([
      ["code/shaders/sim.glsl", "glsl"],
      ["code/shaders/code.wgsl", "wgsl"],
      ["code/shaders/shader.glsl", "glsl"],
      ["code/shaders/p.glsl", "glsl"],
      ["code/shaders/vert.glsl", "glsl"],
    ]);
    expect(files.find((f) => f.path === "code/shaders/p.glsl")?.text).toBe("#version 300 es\nvoid main(){}\n");
  });

  it("includes the custom panel", () => {
    const files = sceneCodeFiles({ ...DEFAULT_SCENE, panel: { html: "<b>hi</b>", height: 200 } });
    expect(files.find((f) => f.path === "code/panel.html")?.text).toBe("<b>hi</b>");
  });
});

describe("projectFolderName", () => {
  it("keeps the name readable and adds part of the id", () => {
    expect(projectFolderName("My scene: v2", "abc-123-def")).toBe("My-scene-v2-abc123");
    expect(projectFolderName("물결 ✨", "x")).toBe("물결-x");
    expect(projectFolderName("../..", "id")).toBe("project-id");
  });
});
