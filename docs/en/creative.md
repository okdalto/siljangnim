# Making things with Siljangnim

[한국어](../creative.md)

Siljangnim isn't a collection of examples to download and run. It's a **studio**. You start by describing what you
want, refine it in conversation, mix it with other work, play it live on stage, and export it as video. The agent
writes the code; you set the direction.

## 1. Start by describing it

Describe the result you want, like "jellyfish drifting in a dark sea" or "a hatching drawing of this photo, denser where
it's closer." The agent picks the tools it needs (shaders, physics engines, geometry libraries, Python packages, ML
models), writes the scene, runs it and fixes its errors, and captures the screen to look at the result itself before
answering.

You can also start from an example. Open any piece from **Examples** and it becomes your own project as is.

Examples download their scene and prepared images, audio and data when first opened. Each card shows the
size; the gallery shows progress and lets you cancel. Downloads are cached in this browser/app for reuse.
If a download fails or is cancelled, open it again to retry; verified files are reused.
**Clear downloads** removes only the example cache, keeping projects you already created.

Viewing an AI example does not install large models or tools; those are prepared separately when you regenerate it.
Cached example files can be reused offline, but external JS libraries, cameras and online services may still be required.
Clearing site data or browser storage eviction removes the cache and requires downloading again.

Shader examples run original GLSL included with its license. MuJoCo, VTK, PyVista, Taichi, FiPy and NEURON examples load locally computed results. Their controls select stored time steps or results; rerun the included recipe to change computation inputs. U²Net and YOLO weights download and cache only when their recipes run. The nanoGPT example shows a locally trained small model’s loss curve and generated text from an original sentence corpus. Prepared outputs also cover Mitsuba CPU rendering, Draco compression, xatlas UV unwrapping, libigl deformation, font shaping and rasterization, JPEG encoding, and a PySSTV signal.

### Bringing in Shadertoy code

You can paste Shadertoy shader code into the chat and say "run this" or "mix this into the current scene." Not just
the Image tab: Common, Buffer A–D and iChannel connections all run as written (`ctx.utils.shadertoy`).

However, **only shaders that state an open-source license** are used. Shadertoy's default license is CC BY-NC-SA 3.0
(non-commercial), which isn't open source. The agent only ports a shader when a license such as MIT, CC0, Unlicense,
public domain, Apache-2.0 or BSD is written at the top of the code, and it keeps the author, link and license in the
code and in the conversation. If there's no license, it tells you so and offers to write a new shader with a similar
feel.

## 2. Change it in conversation

Look at the result and keep talking.

- "Slower, with sunset colors", "Twice the particles", "Have the camera look down from above"
- "Give me sliders for these values" — anything you want to change becomes a control (slider, knob, 2D pad, menu,
  button, color) you can play with by hand.
- "Use this image as a texture" — drag in images, video, sound, fonts, 3D models or data and the agent uses them.

### Try next

When you're not sure where to take it, look at the **Try next** cards under the chat. They pick techniques that fit
the scene on screen: a height-map 3D or volumetric rendering for a 2D pattern, PBR, SSAO or path tracing for a 3D
scene. Press a card and the agent applies that technique to the scene.

**Pick from the full list** opens the remix list: all 46 techniques and every example as cards. Pick several and they
are mixed in at once — say pixel sorting + the Hydra example + beat sync, "in purple tones" — and the agent blends them
into one piece. Techniques include SSAO, shadow mapping, SSR, GPU instancing, perspective warp (corner pin), Gaussian
splatting, volumetric rendering, path tracing, fluid, cloth and boids simulations, pixel sorting, datamosh, slit-scan,
CRT/VHS, color grading, beat sync (librosa), stem-reactive (Demucs), hand tracking, MIDI mapping, pen-plotter SVG and
seamless loops. Ones marked "GPU heavy", "Python" or "ML model" are slow or run a tool on your computer (it asks
first). Asking "what should we try next?" in the chat picks from the same list.

Every change is kept in **History** with a thumbnail, so you can go back to any moment you liked and branch off from
there. In the **Assets** tab you can read the code and shaders the agent wrote.

## 3. Mix

Try joining two pieces into one.

- Open an example's **About** and press **Mix in**: the example's scene and assets come into the project you have
  open, and the agent is asked to blend them into a single scene. For example: paint swirls over REBOUND star
  orbits, or a Hydra video synth in an L-system garden.
- Or drag a card in the examples gallery: a "Drop to mix it in" bar appears at the bottom; drop it there.
- You can also paste a `project.md` someone sent you, or part of a project you made earlier, into the chat and say
  "merge this into the current scene."

## 4. Play it live

- **Input:** mouse and keyboard, microphone and audio files (spectrum, bands), camera, MIDI controllers, OSC (TouchOSC,
  Ableton, TouchDesigner and others). Say something like "MIDI knob 1 for color, knob 2 for speed" and the agent wires
  it up. OSC works in the desktop app or over MCP.
- **Perform:** press **Perform** at the bottom right of the viewport to show only the scene, full screen. Send it to a
  projector or a second monitor, and play it with the control panel and MIDI, OSC and audio. Press Esc to exit.
- **Timeline:** to stage a piece with a set length, switch to **Timeline** and keyframe the control values.

## 5. Aspect ratio and exporting video

Pick the shape of the frame from the frame menu at the bottom right of the viewport: fit to window (Fit), landscape
16:9 or 4:3, portrait 9:16 or 4:5, square 1:1, an exact resolution such as 1920×1080, 1080×1920 or 3840×2160, or your
own (for example `1280x720`, `21:9`). With an exact resolution, the scene renders at exactly that many pixels. Each
project remembers its choice. Scenes the agent writes are built to re-fit on their own when the size changes mid-run
(window size, Perform, a frame change).

Record with the **Rec** button (or ask the agent: "export a 10-second vertical video").

- **Offline:** renders every frame exactly, from the start. At any size (for example 1080×1920 vertical, 4K) and fps,
  with no stutter even for slow scenes. MP4, WebM or a PNG sequence.
- **Realtime:** records the screen as it is, so what you played with the mouse and MIDI is kept exactly (WebM).

Recordings are also saved as project assets, so you can reuse them as material for other scenes. The intro video for
this repository was made by recording the examples this way.

## 6. Pass it on

Export a project as `project.md` (what was asked, and which tools were used and how) or as a zip. The recipient's agent
rebuilds it from that document, then changes and mixes it further. Tool integrations that worked become recipes that
speed up the next piece of work. See [Sharing](sharing.md) for details.
