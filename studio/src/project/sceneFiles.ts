// The scene as files a person can read (the Assets tab's code view) and keep on disk
// (Open folder): setup.js, render.js, cleanup.js, the shaders found in them, scene.json.
import type { Scene } from "../scene/schema";

export interface CodeFile {
  /** Path in the project folder, e.g. `code/setup.js`. */
  path: string;
  language: "js" | "glsl" | "wgsl" | "json" | "html";
  text: string;
  /** Shaders are copies pulled out of setup/render for reading; editing them changes nothing. */
  extracted?: string;
}

// Shaders live in template literals: `const fs = \`#version 300 es…\``,
// `createProgram(vs, \`#version…\`)`, `{ code: \`@fragment…\` }`, sometimes "#version…\\n…".
const LITERAL = /`([^`]*)`|"(#version(?:[^"\\\n]|\\.)*)"/g;
const WGSL = /@(?:vertex|fragment|compute)\b/;
// The variable or key the literal is assigned to, read back from the text before it on its line.
const OWNER = /([A-Za-z_$][\w$]*)\s*[=:][^=:;\n]*$/;

function shaderLanguage(text: string): "glsl" | "wgsl" | null {
  if (/^\s*#version\b/.test(text)) return "glsl";
  // GLSL ES 1.0 (regl, three's ShaderMaterial) has no #version line.
  if (/\bvoid\s+main\s*\(/.test(text) && /\b(?:gl_\w+|precision\s+\w+p\s+float)\b/.test(text)) return "glsl";
  return WGSL.test(text) ? "wgsl" : null;
}

export function sceneCodeFiles(scene: Scene): CodeFile[] {
  const files: CodeFile[] = [];
  const parts = [
    ["setup", scene.script.setup],
    ["render", scene.script.render],
    ["cleanup", scene.script.cleanup],
  ] as const;
  for (const [name, text] of parts) if (text.trim()) files.push({ path: `code/${name}.js`, language: "js", text });
  const used = new Set<string>();
  for (const [name, text] of parts) {
    for (const match of text.matchAll(LITERAL)) {
      let body = match[1];
      if (body === undefined) {
        try {
          body = JSON.parse(`"${match[2]!}"`) as string;
        } catch {
          continue;
        }
      }
      const language = shaderLanguage(body);
      if (!language) continue;
      const line = text.slice(text.lastIndexOf("\n", match.index) + 1, match.index);
      const base = `code/shaders/${line.match(OWNER)?.[1] ?? "shader"}`;
      let path = `${base}.${language}`;
      for (let i = 2; used.has(path); i++) path = `${base}-${i}.${language}`;
      used.add(path);
      files.push({ path, language, text: `${body.trim()}\n`, extracted: `${name}.js` });
    }
  }
  if (scene.panel) files.push({ path: "code/panel.html", language: "html", text: scene.panel.html });
  files.push({ path: "scene.json", language: "json", text: `${JSON.stringify(scene, null, 2)}\n` });
  return files;
}

/** A folder name for a project: readable, filesystem-safe, and distinct per project. */
export function projectFolderName(name: string, id: string): string {
  const slug = name.trim().replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^[-.]+|-+$/g, "").slice(0, 60) || "project";
  return `${slug}-${id.replace(/[^A-Za-z0-9]/g, "").slice(0, 6)}`;
}
