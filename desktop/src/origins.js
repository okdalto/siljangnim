// The two origins the app uses: the app UI and the isolated scene runtime.
// In dev the Vite server serves both, on localhost and 127.0.0.1.

const PACKAGED = { app: "app://siljangnim", scene: "app://scene" };

/** scheme://host — URL.origin is the opaque "null" for custom schemes, shared with data: URLs. */
export function originOf(url) {
  try {
    const u = new URL(url);
    return u.protocol === "app:" ? `app://${u.host}` : u.origin;
  } catch {
    return null;
  }
}

export function resolveOrigins(devUrl) {
  if (!devUrl) return PACKAGED;
  const app = new URL(devUrl);
  const scene = new URL(devUrl);
  scene.hostname = app.hostname === "localhost" ? "127.0.0.1" : "localhost";
  return { app: app.origin, scene: scene.origin };
}
