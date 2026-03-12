/**
 * Guess MIME type from filename extension.
 * Used as a fallback when File.type is empty (some browsers/OS combos).
 */

const EXT_MIME = {
  // Images
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  avif: "image/avif",
  // Audio
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  flac: "audio/flac",
  aac: "audio/aac",
  // Video
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  // Fonts
  ttf: "font/ttf",
  otf: "font/otf",
  woff: "font/woff",
  woff2: "font/woff2",
  // Data
  json: "application/json",
  xml: "application/xml",
  csv: "text/csv",
  txt: "text/plain",
  md: "text/markdown",
  yaml: "text/yaml",
  yml: "text/yaml",
  toml: "text/plain",
  html: "text/html",
  css: "text/css",
  js: "text/javascript",
  // 3D
  obj: "text/plain",
  mtl: "text/plain",
  gltf: "model/gltf+json",
  glb: "model/gltf-binary",
  fbx: "application/octet-stream",
  // Archives
  zip: "application/zip",
};

export function guessMimeType(filename) {
  const ext = (filename.split(".").pop() || "").toLowerCase();
  return EXT_MIME[ext] || "application/octet-stream";
}
