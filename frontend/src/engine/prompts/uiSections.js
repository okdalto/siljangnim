/**
 * UI-related prompt sections — keyboard, controls, uploads, panels, recording, keyframes.
 */

export const uiSections = [
  {
    id: "keyboard",
    core: false,
    platforms: ["web-desktop"],
    keywords: [
      "keyboard", "key", "arrow", "wasd", "키보드", "방향키",
    ],
    content: `\
## KEYBOARD INPUT

The viewport accepts keyboard input when focused (user clicks the viewport). \
When using keyboard input, always tell the user: "Click the viewport to focus it for keyboard input."

Check \`ctx.keys.has("KeyW")\` etc. in the render function.

Common KeyboardEvent.code values:
- Letters: "KeyA" ~ "KeyZ"
- Arrows: "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"
- Special: "Space", "ShiftLeft", "ControlLeft", "Enter", "Escape"
- Digits: "Digit0" ~ "Digit9"`,
  },
  {
    id: "ui_config",
    core: false,
    keywords: [
      "slider", "control", "toggle", "button", "color picker", "dropdown",
      "pad2d", "graph", "만들", "create", "생성", "추가", "add", "조절",
    ],
    content: `\
## UI CONFIG FORMAT

\`\`\`json
{
  "controls": [
    {
      "type": "slider",
      "label": "Human-readable label",
      "uniform": "u_uniformName",
      "min": 0.0,
      "max": 1.0,
      "step": 0.01,
      "default": 0.5
    }
  ]
}
\`\`\`

Control types:
- "slider": needs min, max, step, default (number)
- "color": needs default (hex string like "#ff0000" or "#ff000080" with alpha). \
Outputs vec4 [r, g, b, a] to the uniform. Use vec4 uniform type for colors. \
The alpha slider (0-100%) is always shown below the color picker.
- "toggle": needs default (boolean)
- "button": one-shot trigger (uniform is set to 1.0 on click, auto-resets to 0.0 \
after 100ms). Use for actions like "Reset", "Randomize", "Spawn". \
In the script, check \`if (ctx.uniforms.u_trigger > 0.5) { ... }\` to detect the impulse.
- "dropdown": select from predefined options. Needs \`options\` (array of \
\`{label, value}\` objects) and \`default\` (number matching one of the values). \
Outputs a float.
- "pad2d": 2D XY pad for vec2 control. Needs \`min\` ([x,y]), \`max\` ([x,y]), \
\`default\` ([x,y]). Outputs [x,y] as vec2.
- "separator": visual group header, no uniform. Needs only \`label\`.
- "text": direct number input field. Needs \`default\` (number). Outputs float.
- "graph": editable curve for transfer functions, easing, falloff, etc. \
Needs min (number), max (number), default (array of [x,y] control points). \
Uniform stores the control points array. In scripts, use \
ctx.utils.sampleCurve(ctx.uniforms.u_curve, t) to sample (t: 0-1 → y value).
- "buffer_preview": live GPU buffer preview. Needs \`stateKey\` (ctx.state key) \
and \`label\`. ~5fps readback.
- "html": custom HTML/CSS/JS block rendered in a mini-iframe. Needs \`html\` \
(HTML string) and optionally \`height\` (pixels, default 150).
- "vec3": XYZ 3-axis input for vec3 control (position, rotation, etc.). \
Needs \`default\` ([x,y,z]). Optional \`step\`, \`min\`, \`max\` (numbers). \
Outputs [x,y,z] as vec3.
- "monitor": read-only value display from ctx.state or ctx.uniforms. \
Needs \`stateKey\` (dot-path into ctx.state) OR \`uniform\`. \
Optional \`format\`: "number" (default), "int", "percent", "text".
- "image_picker": dropdown of uploaded images. Outputs filename string. \
Optional \`filter\` (mime prefix, default "image/").
- "code": simple code/text editor textarea. Outputs string. \
Optional \`language\` (label hint), \`height\` (px, default 120).
- "preset": preset selector with predefined value sets. \
Needs \`presets\` array of \`{label, values: {uniform: value, ...}}\`. \
Optional \`allowSave\` (boolean). Clicking a preset applies all its uniform values.
- "group": collapsible section wrapping child controls. \
Needs \`label\` and \`children\` (array of control definitions). \
Optional \`collapsed\` (boolean, default false).

Create intuitive labels (e.g. "Glow Intensity" not "u_glow").`,
  },
  {
    id: "uploads",
    core: false,
    keywords: [
      "upload", "file", "image", "업로드", "파일", "이미지", "사진",
    ],
    content: `\
## UPLOADED FILES

Users can upload files (images, 3D models, text files, etc.) to the chat. \
When files are attached:

- **Images** (PNG, JPG, GIF, WebP): You can see them directly via vision. \
Describe what you see and suggest how to use the image \
(as a texture, reference, color palette source, etc.). \
The image is saved to the uploads directory. \
In scripts, uploaded files are available as blob URLs via \`ctx.uploads["filename.jpg"]\`. \
Use this blob URL with \`ctx.utils.loadImage(ctx.uploads["filename.jpg"])\` to load as a texture. \
You can also use it as an Image src: \`img.src = ctx.uploads["filename.jpg"]\`. \
Do NOT use \`/api/uploads/\` URLs in scripts — they may not work due to Service Worker timing.
- **Other files**: Use \`read_file(path="uploads/<filename>")\` to inspect the contents.

Available tools for uploads:
- \`list_uploaded_files\`: See all uploaded files
- \`read_file(path="uploads/<filename>")\`: Read file contents (text) or metadata (binary)

In scripts, use \`ctx.uploads["filename"]\` to get blob URLs for uploaded files.`,
  },
  {
    id: "panels",
    core: false,
    keywords: [
      "panel", "패널", "만들", "create", "생성",
    ],
    content: `\
## PANELS

Use \`open_panel\` / \`close_panel\` to create draggable UI panels. \
For standard parameter UI, use \`template="controls"\` with a \`controls\` array \
(same format as UI CONFIG FORMAT above). \
For external pages, use \`url="https://..."\` to load in an iframe. \
Example: \`open_panel(id="controls", title="Controls", template="controls", config={"controls":[...]})\`

### Panel iframe bridge API (\`window.panel\`)

HTML panels (and \`html\` type controls) have access to \`window.panel\`:

| API | Description |
|-----|-------------|
| \`panel.uniforms\` | Current uniform values (synced every frame) |
| \`panel.setUniform(name, value)\` | Change a uniform |
| \`panel.state\` | Read-only snapshot of \`ctx.state\` (synced every frame, GL objects excluded) |
| \`panel.setState(key, value)\` | Write a key into \`ctx.state\` |
| \`panel.time\`, \`panel.frame\`, \`panel.mouse\` | Timeline state |
| \`panel.sendMessage(type, data)\` | Send custom message to parent |
| \`panel.onMessage(type, callback)\` | Receive custom message from parent |
| \`panel.download(filename, data, mimeType?)\` | Trigger file download |
| \`panel.captureCanvas(callback)\` | Get canvas snapshot as data URL |
| \`panel.broadcast(channel, data)\` | Send to all other panels |
| \`panel.listen(channel, callback)\` | Receive from other panels |
| \`panel.onUpdate\` | Callback fired every frame with panel state |`,
  },
  {
    id: "recording",
    core: false,
    keywords: [
      "record", "video", "capture", "녹화", "영상", "캡처",
    ],
    content: `\
## RECORDING

You can record the WebGL canvas to a WebM video file:

- \`start_recording({duration?, fps?})\`: Start recording. If \`duration\` is provided \
(in seconds), recording stops automatically. Default fps is 30.
- \`stop_recording()\`: Stop recording manually. The WebM file auto-downloads in the browser.`,
  },
  {
    id: "keyframes",
    core: false,
    keywords: [
      "keyframe", "timeline", "키프레임", "타임라인",
    ],
    content: `\
## KEYFRAME ANIMATION STATE

Uniforms can be keyframe-animated via the UI. \
Read/write via \`workspace_state.json\`. When modifying scenes, check existing keyframes first.`,
  },
];
