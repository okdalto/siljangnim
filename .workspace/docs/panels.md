# CUSTOM PANELS

You can create custom HTML/CSS/JS panels that appear as draggable nodes in the UI.
Use `open_panel` to create a panel and `close_panel` to remove it.

## Bridge API

Every panel iframe automatically has a `window.panel` object:

```js
// ── Uniforms ──
panel.setUniform("u_speed", 2.5);
panel.uniforms   // {u_speed: 2.5, u_color: [1,0,0], ...}

// ── Timeline state (updated every frame) ──
panel.time       // current time in seconds
panel.frame      // current frame number
panel.mouse      // [x, y, pressed, prevPressed]
panel.duration   // timeline duration in seconds
panel.loop       // whether timeline loops

// ── Keyframes ──
panel.keyframes  // { u_speed: [{time, value, inTangent, outTangent, linear}, ...], ... }

// Set keyframes for a uniform (replaces the entire track)
panel.setKeyframes("u_pos_x", [
  { time: 0, value: 0, inTangent: 0, outTangent: 0, linear: false },
  { time: 5, value: 2.0, inTangent: 0, outTangent: 0.5, linear: false },
]);

// Clear all keyframes for a uniform
panel.clearKeyframes("u_pos_x");

// Set timeline duration and loop
panel.setDuration(60);
panel.setLoop(false);

// Register a callback that runs every frame
panel.onUpdate = function(p) {
  document.getElementById('time').textContent = p.time.toFixed(2);
};
```

The keyframe bridge enables building custom animation editors as panels —
for example, a 3D path editor where the user can visually place keyframes
and adjust Bezier curves for object positions.

All panel iframes (both full HTML panels and inline html controls) automatically
receive app theme CSS: dark background, styled form elements, and CSS variables
(--bg-primary, --bg-secondary, --border, --accent, --text-primary, etc.).
No manual dark-theme styling needed.

**Example pattern:** Use `panel.setUniform('u_speed', val)` on input events,
and `panel.onUpdate = function(p) { /* sync UI from p.uniforms */ }` to keep
the panel in sync.

**When to use custom panels:** Interactive controls beyond simple sliders
(2D pickers, curve editors), keyframe animation editors, data dashboards,
debugging tools, or any custom UI that standard inspector controls cannot provide.

**Hybrid panels:** Use native controls (slider, color, toggle) for standard
parameters and `{"type":"html",...}` blocks for custom UI — all in the same
controls array. Native controls get full undo/keyframe integration; html blocks
get undo via `panel.setUniform()` and theme CSS automatically.

## Panel Templates

Use `template` + `config` in open_panel for pre-built interactive panels:

- **"controls"** (PREFERRED): Native React controls panel. Renders the app's own
slider, color picker, toggle, dropdown, etc. components — fully integrated with
undo/redo (Cmd+Z), keyframe editing, and the app's dark theme.
Config must contain a `controls` array (same format as UI CONFIG FORMAT in the system prompt).
Example:
  open_panel(id="controls", title="Parameters", template="controls",
    config={"controls":[
      {"type":"slider","label":"Speed","uniform":"u_speed","min":0,"max":5,"step":0.1,"default":1},
      {"type":"color","label":"Color","uniform":"u_color","default":"#4499ff"},
      {"type":"toggle","label":"Wireframe","uniform":"u_wireframe","default":false}
    ]})
- "orbit_camera": 3D arcball camera with orbit, pan, zoom, wireframe cube preview.
  Config: { posUniforms: [3 uniform names], targetUniforms: [3 uniform names],
initialPosition: [x,y,z], initialTarget: [x,y,z] }
- "pad2d": 2D XY pad with crosshair visualization.
  Config: { uniform: "u_name", min: [x,y], max: [x,y], default: [x,y] }

**When to use each:**
- `template="controls"`: ALWAYS use this for parameter UI (sliders, colors, toggles,
dropdowns, buttons, graphs, text inputs, separators, and html blocks). This is the default choice.
- `template="orbit_camera"` / `template="pad2d"`: Use for specialized spatial controls.
- Raw `html`: Only for fully custom interactive panels that need HTML/JS
(data dashboards, custom visualizations, animation path editors).
