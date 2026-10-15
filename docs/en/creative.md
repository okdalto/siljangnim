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

Examples from the same library and its related extensions, such as D3, Three.js, p5.js and ngraph, appear in folders.
Click a folder to expand it; searching automatically reveals matching examples. The remix picker uses the same grouping.
Expanding a folder does not download example files.

Examples download their scene and prepared images, audio and data when first opened. Each card shows the
size; the gallery shows progress and lets you cancel. Downloads are cached in this browser/app for reuse.
If a download fails or is cancelled, open it again to retry; verified files are reused.
**Clear downloads** removes only the example cache, keeping projects you already created.

Viewing an AI example does not install large models or tools; those are prepared separately when you regenerate it.
Cached example files can be reused offline, but external JS libraries, cameras and online services may still be required.
Clearing site data or browser storage eviction removes the cache and requires downloading again.

Shader examples run original GLSL included with its license. MuJoCo, VTK, PyVista, Taichi, FiPy and NEURON examples load locally computed results. Their controls select stored time steps or results; rerun the included recipe to change computation inputs. U²Net and YOLO weights download and cache only when their recipes run. The nanoGPT example shows a locally trained small model’s loss curve and generated text from an original sentence corpus. Prepared outputs also cover Mitsuba CPU rendering, Draco compression, xatlas UV unwrapping, libigl deformation, font shaping and rasterization, JPEG encoding, and a PySSTV signal. Go examples cover gg, ln and pt rendering plus protein ribbons; C/C++ examples cover convex hulls, polygon partitioning and Spiro curves. Go modules and native source archives download and cache only when recipes rerun. Native recipes verify source checksums and require a local compiler. Further computed examples cover QMsolve, GWpy and SunPy, LAMMPS particles, SUMO traffic, fluid simulations and SAM 2.1 Tiny CPU segmentation. SAM 2 model and source files are verified and cached when its recipe reruns. Word packing, H3 grids, tile merging, voxelization, springs, hulls and graph layouts recompute in the browser as controls change. SDF surfaces, robot paths, dithering, triangle approximation and content-aware image resizing include directly computed outputs and recipes.

Rust examples include directly computed Kurbo, Lyon and Cavalier Contours curves, OpenSimplex2 terrain, Fidget slices and Truck solid models. Vello and Velato outputs were rendered on a local Metal GPU. Included Cargo lockfiles support rerunning; crates download and cache only when the recipe runs.

FastNoise Lite and libnoise terrain, Voro++ cells, RVO2 paths, Skeleton Tracing centerlines and MSDFgen distance fields are computed from original C++ sources. DaisySP, Maximilian and Pink Trombone examples let you select and listen to directly synthesized one-second clips.

CSG.js boolean solids, NDWFC tiles, p5-hershey-js stroke fonts, Fullik articulated chains and FloMat medial axes were computed by their original JavaScript in Node.js. Their Python recipes cache verified source archives and rerun them through Node.js.

Box2D, Bullet and Jolt rebound simulations, OpenSubdiv refinement and Embree CPU ray queries come from directly built and executed engines. These recipes install CMake and cache source archives and native builds. Computation runs on every invocation; the first build can take several minutes.

Leaflet, Sigma, 3D Force Graph, MapLibre GL and deck.gl examples draw synthetic shapes and graphs with their original renderers. Maps use no real street data, external tiles, accounts or API keys. canvas-sketch rerenders through its original manager; React Spring advances its real solver in fixed time steps.

GFPGAN v1.4 face restoration was run on CPU for three degraded crops of a public NASA photograph. Compare inputs, restorations and the reference crop. Its approximately 349 MB model and source archives are verified and cached only when the recipe reruns.

Doom fire, VoxelSpace terrain, the Ten Minute Physics pendulum and TinyRenderer cache verified source files and execute the original engines. psrdnoise runs the original GLSL on the GPU. Meep wave simulations were computed on CPU; their rerun recipe requires Conda and Apple Silicon macOS and downloads a pinned environment only on first use. Field colors are normalized separately for each result.

geometry-central surface distances, HatViz tilings, ORCA clocks, Spring-It-On damping, RoutingKit routes, Turing Patterns reaction-diffusion and PyTopo3D topology optimization were directly computed by their original engines. Recipes verify and cache only the needed source files. PyTopo3D is a small CPU demonstration with a 60-iteration budget; stored outputs include densities and actual material fractions.

SVGNest packing, Ray Optics lenses, LibRaw synthetic RAW development and Tesseract OCR include directly computed results and rerun recipes. React Three Fiber knots and Cesium ellipsoids render live in the browser. OCR weights and source files download and cache only when rerunning a recipe.

MapGenerator roads, triangulate-image triangles, TensorFlow Playground decision boundaries, LIC vector fields and aubio pitch examples directly execute their original engines. Select prepared results or rerun the recipes. p5.brush strokes render live through browser WebGL2.

CGAL constrained triangulation, COLMAP two-view reconstruction, Essentia audio analysis, GPlates synthetic plate rotation, SPlisHSPlasH fluid collision and PositionBasedDynamics cloth constraints directly execute their original native engines. Results load on demand; recipes rerun the small CPU demonstrations with original synthetic inputs.

PaddleOCR mobile detection and recognition models ran on CPU; KataGo neural analysis ran on Mac Metal. ByteTrack preserves identities through missing synthetic detections. Recipes verify and cache pinned model files only when rerun; the gallery downloads prepared results.

Faust compiles DSP to WAV using its official WASM engine; FontForge exports an original glyph as TrueType. AutoTrace traces a raster into SVG, and Tippecanoe builds and decodes vector tiles from synthetic roads. Each includes directly executed original-engine results and a rerunnable recipe.

The original myPhysicsLab pendulum solver is checked for energy conservation. glsl-fft runs its original GLSL on the GPU and checks forward/inverse reconstruction whenever the frequency changes.

Directly executed examples cover MyPaint native brushes, Astrometry.net synthetic plate solving, Simbody multibody dynamics, PyTorch3D native mesh rendering and diffvg differentiable rasterization. Prepared outputs and rerun recipes are included; large sources and runtime environments are verified and cached only when rerun.

Original-engine examples now cover Penrose constraint diagrams, Context Free recursive shape grammars, geometry3Sharp hole repair and ConvChain pattern synthesis, with prepared outputs and rerun recipes. gl-react runs a two-pass shader graph live in the viewer.

Directly executed examples also cover NanoVG native rendering, hole_fixer surface repair, ORIPA folding, FLAM3 fractals, differential-mesh growth and Csound synthesis. Listen to original Csound output; original engines and environments are downloaded and cached only when rerunning recipes.

Threading includes string art and native SVG exports computed from an original input, while mapgen4 shows rainfall-dependent drainage. Field Play particles and a v86 x86 boot program run live in their original engines; required engine assets are downloaded and cached when opening each example.

Hyphae growth, RubikTwoPhase cube solving, PGS circle packing, Galaxy Renderer stellar orbits, diamond-webgl refraction, py5 vector rendering and SuperCollider synthesis use results computed with the original engines. Compare prepared results or inspect the inputs and runtime requirements to rerun each recipe.

Original-engine results also cover libfive implicit solids, ASTRA tomography, SPECFEM2D wavefields, Origami Simulator GPU folding and THREE.js PathTracing Renderer materials. Larger runtimes are downloaded and cached only when rerunning their recipe.

Original-engine examples also include Goxel voxel exports, Ready reaction-diffusion, Instant Meshes quadrilateral remeshing, Powder Toy particle simulation, Mandelbulber fractals and glslViewer shaders. Recipes include fixed inputs and requirements for rerunning the native engines.

Compare locally executed Swingline and StippleGen stippling, the original GPU atmosphere model, ManimGL mathematical surfaces, and Motion Canvas timeline frames. Native packcircles circle layouts and GodotOceanWaves GPU waves are included too. Each recipe lists its desktop, Java or Node runtime requirements.

Native Potree point clouds, earth synthetic wind fields and prettymaps fictional maps are included. Listen to original DDSP synthesis and audio previews of Magenta Melody RNN MIDI output. ComfyUI with Stable Diffusion 1.5 was executed locally on MPS. Large models download only when running the recipe, with checksum verification and caching. Each recipe documents inputs, outputs, platform requirements, compatibility adjustments and model licenses.

Compare LuxCoreRender roughness and PBRT lens apertures computed by their original CPU renderers. Original Cinder derivative-noise flow lines and kepler.gl point, grid and hexagonal aggregation are also included. The map example uses synthetic coordinates and a blank background, without a map-service token.

Also included are a Unitree G1 pretrained walking policy executed in MuJoCo and TAPIR point tracking. The robot example computes six seconds of simulated walking without hardware; tracking predictions are checked against the known motion of supplied images.

Additional original-engine runs include LeRobot pushing a block onto its PushT target, three appleseed lighting setups and Mesh2Motion automatic skin weights. The robot runs in simulation; Mesh2Motion receives supplied geometry and skeleton joints.

Laya shows actual probabilities from its original English decision model for three support messages. Sonic Pi plays an offline rendering of a supplied six-note phrase through three original instrument definitions; it exercises instrument synthesis rather than the language editor.

Geant4 uses its original engine to calculate electron tracks and energy deposition in three water thicknesses. Each case uses an isolated process to avoid a Python-binding shutdown crash. This product includes software developed by Members of the Geant4 Collaboration ( http://cern.ch/geant4 ).

redner fits a triangle to a target image using gradients from its original CPU renderer. Its private Intel Python and original engine are verified and cached; Apple Silicon requires Rosetta 2.

PhysX uses its original CPU physics engine to simulate 36 falling boxes without an NVIDIA GPU. Repulsive Curves uses its original energy and gradients with a supplied optimization driver to relax a knot. Both examples compare three locally computed states and include rerunnable recipes.

Qwen3-TTS compares three built-in voices synthesized on this Mac’s CPU, with audio playback and waveforms. Its official model (about 2.5 GB) downloads only when running the recipe and is cached. Edit the sentence and rerun to synthesize new speech.

openFrameworks renders three terrains using its original C++ noise, mesh and OpenGL APIs. The first recipe run downloads the official release and caches the built app. Rerunning requires a macOS graphical session and Xcode build tools.

Tidal Cycles uses its original Haskell pattern engine to compute base, double-speed and reversed event times, including a double-reversal check. This example compares timing diagrams rather than synthesizing sound. Rerunning requires GHC.

TripoSR reconstructs geometry and color from an original chair drawing, with three native rendered views and mesh.ply output. Its roughly 1.68 GB model is downloaded on demand and cached. CPU reruns require C++ build tools. Unseen surfaces are model predictions.

LivePortrait synthesizes three head directions from a pre-aligned crop of a public-domain NASA photograph. Outputs are labeled as AI-generated pose variations. Its official models (about 522 MB) download on demand and are cached for CPU reruns. Automatic face detection and driving-video extraction are outside this example.

Stable Audio Tools combines its original DDIM sampler with a public pretrained Harmonai network to produce three short stereo textures. Its roughly 886 MB checkpoint downloads on demand and is cached for CPU reruns. This compares unconditional seeded audio textures, rather than prompt-conditioned music.

ACE-Step 1.5 creates ten-second piano, percussion and synthesizer sketches from text. These recordings come from the original model running on Apple Silicon. Reruns download and cache about 6.34 GB of model files; reserve at least 20 GB of free disk for dependencies and temporary memory swap.

OpenSplat uses its original CPU trainer to fit 96 Gaussian primitives to a target image, comparing initial, intermediate and final renders. The original engine and OpenCV compile on first use and are cached; Xcode C++ tools are required. This is single-view fitting rather than multi-view 3D reconstruction.

VoiceStudio runs its original KittenTTS speech backend to read the same English sentence in three preset voices. Its public model (about 82 MB) downloads on demand and is cached for CPU reruns. No reference recording or API key is needed. The full app’s editing and dubbing workflows are outside this example.

MT3: Three own 3.2-second harmonic-tone inputs are transcribed with the official pretrained model. Input WAV, predicted MIDI and a comparison piano roll are included. Predictions are not corrected by hand: pitch-set recall is 100%, 100% and 75%; estimated note endings and instrument labels can differ from the inputs. These short synthetic inputs do not establish accuracy on ensemble recordings. No upstream demonstration audio or outputs are used.

Nerfstudio: The driver supplies three analytical colored-sphere views at -25, 0 and 25 degrees, each 24 by 24 pixels, and fits the original model for 2,000 Adam updates. The training sampler mixes foreground and uniformly sampled rays. The gallery compares those training views before training and after 500 and 2,000 updates. These are low-resolution, imperfect training reconstructions; no held-out view accuracy, real photographs, camera estimation, GUI or Gaussian-splatting workflow is claimed. The AlexNet metric weights are loaded by the original constructor but do not supply or generate the displayed images.

CogVideoX: One own nine-frame, 96 by 96 pixel animation passes through the official pretrained causal video VAE. The original demo loads a lossless video, samples its latent distribution with seed 17, and decodes it. The gallery plays the actual input/reconstruction pairs and supports pausing and frame selection. This exercises the original video encoding/decoding demo; it does not run the text-conditioned diffusion transformer or claim text-to-video generation. No upstream demo video, pretrained latent or example output is used.

LTX-Video: One own 17-frame animation at 128 by 128 pixels is encoded and decoded with seed 17 and a clean-latent decoding timestep of zero. The gallery plays the actual input/reconstruction pairs and supports pausing and frame selection. This executes the original video VAE component. Text-to-video diffusion and prompt enhancement are outside this example. The extracted tensor values and reconstructed images matched those produced from the complete original checkpoint. No upstream demo video, supplied latent or example output is used.

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

When the scene plays a song or a sound file, the sound goes into the video too. Pausing or moving the timeline pauses
and moves the song with it. Offline recordings analyse the sound at each frame's time, so scenes that react to sound
stay on the beat in the video — a music video from a song needs no separate step to add the audio.

Recordings are also saved as project assets, so you can reuse them as material for other scenes. The intro video for
this repository was made by recording the examples this way.

## 6. Pass it on

Export a project as `project.md` (what was asked, and which tools were used and how) or as a zip. The recipient's agent
rebuilds it from that document, then changes and mixes it further. Tool integrations that worked become recipes that
speed up the next piece of work. See [Sharing](sharing.md) for details.
