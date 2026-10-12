# Examples / 예제

Scenes you can open right away: in the app, **Projects menu → Examples…** creates a new project from one
(scene and assets). Each is **an open-source tool connected to Siljangnim**: a library imported by the scene, or a
Python package or program the agent ran through a recipe, whose output the scene uses. They double as references:
`catalog_get` shows an agent the example built around a tool.

```
example.json   title, description (technical), summary / try / tool_about (plain words, also _ko),
               what it's made with, uses (catalog ids)
scene.json     the scene (format v2, studio/src/scene/schema.ts)
thumbnail.png
assets/        files the scene loads by name (ctx.assets[name])
recipe/        recipes that made the assets (also in ../registry)
pipeline.json  how the assets were made (copied into the project, so project.md can say it)
```

## Open source in Siljangnim

| Example | Tool | Shows |
|---|---|---|
| [Torus knot mesh](torus-knot/) | [trimesh](https://github.com/mikedh/trimesh) (MIT, Python, recipe) | mesh, assets, runtime, recipe |
| [Hand tracking (MediaPipe)](hand-tracking/) | [MediaPipe Tasks Vision](https://github.com/google-ai-edge/mediapipe) (Apache-2.0, in the scene) | camera, mediapipe, on-demand library |
| [Low-poly drift (d3-delaunay)](oss-d3-delaunay/) | [d3-delaunay](https://github.com/d3/d3-delaunay) (ISC, in the scene) | delaunay, dynamic mesh, mouse |
| [Blob pour (Matter.js)](oss-matter-js/) | [Matter.js](https://github.com/liabru/matter-js) (MIT, in the scene) | physics, metaballs, mouse |
| [Flow field (simplex-noise)](oss-simplex-noise/) | [simplex-noise](https://github.com/jwagner/simplex-noise.js) (MIT, in the scene) | noise, particles, trails |
| [Type particles (opentype.js)](oss-opentype/) | [opentype.js](https://github.com/opentypejs/opentype.js) (MIT, in the scene) | font, text, particles, mouse |
| [Color spaces (culori)](oss-culori/) | [culori](https://github.com/Evercoder/culori) (MIT, in the scene) | color, gradient, palette |
| [Arpeggio ring (Tone.js)](oss-tone/) | [Tone.js](https://github.com/Tonejs/Tone.js) (MIT, in the scene) | audio synthesis, sequencer, audio-reactive |
| [Chroma wheel (Meyda)](oss-meyda/) | [Meyda](https://github.com/meyda/meyda) (MIT, in the scene) | audio analysis, chroma, audio-reactive |
| [Beat runway (librosa)](oss-librosa/) | [librosa](https://github.com/librosa/librosa) (ISC, Python, recipe) | beat tracking, audio analysis, recipe |
| [Edge drawing (OpenCV)](oss-opencv/) | [OpenCV (opencv-python-headless)](https://github.com/opencv/opencv) (Apache-2.0, Python, recipe) | edge detection, line drawing, recipe |
| [Contour islands (Shapely)](oss-shapely/) | [Shapely](https://github.com/shapely/shapely) (BSD-3-Clause, Python, recipe) | geometry, offset curves, recipe |
| [Les Misérables network (NetworkX)](oss-networkx/) | [NetworkX](https://github.com/networkx/networkx) (BSD-3-Clause, Python, recipe) | graph layout, communities, mouse, recipe |
| [GLB sculpture (glTF Transform)](oss-gltf-transform/) | [glTF Transform](https://github.com/donmccurdy/glTF-Transform) (MIT, in the scene), [trimesh](https://github.com/mikedh/trimesh) (MIT, Python, recipe) | gltf, 3d model, orbit camera, recipe |
| [Fractal kaleidoscope (FFmpeg)](oss-ffmpeg/) | [FFmpeg](https://github.com/FFmpeg/FFmpeg) (LGPL-2.1-or-later, program, recipe) | video, kaleidoscope, recipe |
| [Ripple stipple (poisson-disk-sampling)](oss-poisson-disk-sampling/) | [poisson-disk-sampling](https://github.com/kchapelier/poisson-disk-sampling) (MIT, in the scene) | sampling, stipple, mouse |
| [Moving contours (d3-contour)](oss-d3-contour/) | [d3-contour](https://github.com/d3/d3-contour) (ISC, in the scene) | contours, marching squares, terrain, mouse |
| [Ink strokes (Perfect Freehand)](oss-perfect-freehand/) | [Perfect Freehand](https://github.com/steveruizok/perfect-freehand) (MIT, in the scene) | drawing, strokes, mouse |
| [Curve offsets (Bezier.js)](oss-bezier-js/) | [Bezier.js](https://github.com/Pomax/bezierjs) (MIT, in the scene) | bezier, offset curves, intersections, mouse |
| [Sketchy landscape (Rough.js)](oss-roughjs/) | [Rough.js](https://github.com/rough-stuff/rough) (MIT, in the scene) | hand-drawn, canvas texture, mouse |
| [Boolean shapes (Paper.js)](oss-paperjs/) | [Paper.js](https://github.com/paperjs/paper.js) (MIT, in the scene) | vector, boolean ops, mouse |
| [Morphing tiles (TactileJS)](oss-tactile/) | [TactileJS](https://github.com/isohedral/tactile-js) (BSD-3-Clause, in the scene) | tiling, tessellation, mouse |
| [Shape morph (Flubber)](oss-flubber/) | [Flubber](https://github.com/veltman/flubber) (MIT, in the scene) | morph, shapes, mouse |
| [Low-poly light (Trianglify)](oss-trianglify/) | [Trianglify](https://github.com/qrohlf/trianglify) (GPL-3.0, in the scene) | low-poly, pattern, lighting, mouse |
| [Offset ripples (Clipper2)](oss-clipper2/) | [Clipper2 (clipper2-ts)](https://github.com/countertype/clipper2-ts) (BSL-1.0, in the scene) | polygon offset, boolean ops, geometry, mouse |
| [Ripple columns (Three.js)](oss-three/) | [Three.js](https://github.com/mrdoob/three.js) (MIT, in the scene) | three.js, instancing, shadows, orbit camera |
| [Attractor glow (regl)](oss-regl/) | [regl](https://github.com/regl-project/regl) (MIT, in the scene) | regl, point cloud, attractor, orbit camera |
| [Orrery (OGL)](oss-ogl/) | [OGL](https://github.com/oframe/ogl) (Unlicense, in the scene) | ogl, scene graph, orbit camera |
| [Flip knot (glMatrix)](oss-gl-matrix/) | [glMatrix](https://github.com/toji/gl-matrix) (MIT, in the scene) | math, quaternions, instancing, orbit camera |
| [CSG part (JSCAD)](oss-jscad/) | [JSCAD modeling](https://github.com/jscad/OpenJSCAD.org) (MIT, in the scene) | csg, parametric, flat shading, orbit camera |
| [Live booleans (Manifold)](oss-manifold/) | [Manifold](https://github.com/elalish/manifold) (Apache-2.0, in the scene) | csg, wasm, dynamic mesh, orbit camera |
| [Metaball mesh (isosurface)](oss-isosurface/) | [isosurface](https://github.com/mikolalysenko/isosurface) (MIT, in the scene) | isosurface, metaballs, dynamic mesh, orbit camera |
| [Wall breaker (cannon-es)](oss-cannon-es/) | [cannon-es](https://github.com/pmndrs/cannon-es) (MIT, in the scene) | physics, rigid bodies, orbit camera |
| [Domino spiral (Rapier)](oss-rapier/) | [Rapier](https://github.com/dimforge/rapier) (Apache-2.0, in the scene) | physics, wasm, instancing, orbit camera |
| [Ray scanner (three-mesh-bvh)](oss-three-mesh-bvh/) | [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh) (MIT, in the scene), [Three.js](https://github.com/mrdoob/three.js) (MIT, in the scene) | raycasting, bvh, three.js, orbit camera |
| [Bubble swarm (d3-force)](oss-d3-force/) | [d3-force](https://github.com/d3/d3-force) (ISC, in the scene) | force simulation, collision, mouse |
| [Graph unfolding (ngraph.forcelayout)](oss-ngraph-forcelayout/) | [ngraph.forcelayout](https://github.com/anvaka/ngraph.forcelayout) (BSD-3-Clause, in the scene) | graph layout, force simulation, 3d, mouse |
| [L-system garden (lindenmayer)](oss-lindenmayer/) | [lindenmayer](https://github.com/nylki/lindenmayer) (MIT, in the scene) | l-system, procedural plants, growth animation |
| [Maze search (PathFinding.js)](oss-pathfinding/) | [PathFinding.js](https://github.com/qiao/PathFinding.js) (MIT, in the scene) | pathfinding, maze, a-star, mouse |
| [Rope bridge (planck.js)](oss-planck/) | [planck.js](https://github.com/piqnt/planck.js) (MIT, in the scene) | physics, joints, rigid body, mouse |
| [Pigment swirl (spectral.js)](oss-spectral/) | [spectral.js](https://github.com/rvanwijnen/spectral.js) (MIT, in the scene) | color mixing, pigment, fluid, mouse |
| [Hexbin swarms (d3-hexbin)](oss-d3-hexbin/) | [d3-hexbin](https://github.com/d3/d3-hexbin) (BSD-3-Clause, in the scene) | binning, data visualization, particles, mouse |
| [Boid flock (Flatbush)](oss-flatbush/) | [Flatbush](https://github.com/mourner/flatbush) (ISC, in the scene) | spatial index, boids, flocking, mouse |
| [Easing choreography (tween.js)](oss-tween-js/) | [tween.js](https://github.com/tweenjs/tween.js) (MIT, in the scene) | tweening, easing, motion design |
| [Sun over the plaza (SunCalc)](oss-suncalc/) | [SunCalc](https://github.com/mourner/suncalc) (BSD-2-Clause, in the scene) | sun position, raymarching, shadows, mouse |
| [Palette ridges (chroma.js)](oss-chroma/) | [chroma.js](https://github.com/gka/chroma.js) (BSD-3-Clause AND Apache-2.0, in the scene) | color, palette, color scale |
| [Color maps (d3-scale-chromatic)](oss-d3-scale-chromatic/) | [d3-scale-chromatic](https://github.com/d3/d3-scale-chromatic) (ISC, in the scene) | color map, scientific visualization, contours, mouse |
| [Perceptual hue wheel (hsluv)](oss-hsluv/) | [HSLuv](https://github.com/hsluv/hsluv-javascript) (MIT, in the scene) | color, perceptual color, palette |
| [Palette quantization (image-q)](oss-image-q/) | [image-q](https://github.com/ibezkrovnyi/image-quantization) (MIT, in the scene) | image, palette, dithering, mouse |
| [Raster to vector (imagetracerjs)](oss-imagetracerjs/) | [imagetracerjs](https://github.com/jankovicsandras/imagetracerjs) (Unlicense, in the scene) | vectorize, image tracing, paths, mouse |
| [Glyph distance fields (tiny-sdf)](oss-tiny-sdf/) | [TinySDF](https://github.com/mapbox/tiny-sdf) (BSD-2-Clause, in the scene) | text, sdf, font, mouse |
| [Video synth (Hydra)](oss-hydra/) | [Hydra](https://github.com/hydra-synth/hydra-synth) (AGPL-3.0, in the scene) | video synth, live coding, feedback, mouse |
| [Ink flow (p5.js)](oss-p5/) | [p5.js](https://github.com/processing/p5.js) (LGPL-2.1, in the scene) | creative coding, generative drawing, noise, mouse |
| [Perpendiculars (Pts)](oss-pts/) | [Pts](https://github.com/williamngan/pts) (Apache-2.0, in the scene) | creative coding, geometry, convex hull, mouse |
| [Tilt-shift city (glur)](oss-glur/) | [glur](https://github.com/nodeca/glur) (MIT, in the scene) | blur, tilt-shift, bloom, mouse |
| [Gyroid sphere (PyMCubes)](oss-pymcubes/) | [PyMCubes](https://github.com/pmneila/PyMCubes) (BSD-3-Clause, Python, recipe) | mesh, marching cubes, implicit surface, recipe |
| [Standard library bubbles (circlify)](oss-circlify/) | [circlify](https://github.com/elmotec/circlify) (MIT, Python, recipe) | circle packing, hierarchy, zoom, recipe |
| [Digits map (UMAP)](oss-umap/) | [UMAP](https://github.com/lmcinnes/umap) (BSD-3-Clause, Python, recipe) | dimensionality reduction, scatter, machine learning, recipe |
| [Stellar flyby (REBOUND)](oss-rebound/) | [REBOUND](https://github.com/hannorein/rebound) (GPL-3.0-only, Python, recipe) | n-body, gravity, simulation, recipe |
| [Satellite tracks (sgp4)](oss-sgp4/) | [python-sgp4](https://github.com/brandon-rhodes/python-sgp4) (MIT, Python, recipe) | orbits, satellites, globe, recipe |
| [Hilbert curve (hilbertcurve)](oss-hilbertcurve/) | [hilbertcurve](https://github.com/galtay/hilbertcurve) (MIT, Python, recipe) | space-filling curve, morph, plotter, recipe |
| [Meandering river (meanderpy)](oss-meanderpy/) | [meanderpy](https://github.com/zsylvester/meanderpy) (Apache-2.0, Python, recipe) | simulation, river, geomorphology, recipe |
| [Ink in water (WebGL Fluid Simulation)](oss-webgl-fluid/) | [WebGL Fluid Simulation](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation) (MIT, shaders adapted into the scene) | fluid, shaders, bloom, mouse |
| [Tile choreography (Anime.js)](oss-anime-js/) | [Anime.js](https://github.com/juliangarnier/anime) (MIT, in the scene) | timeline, easing, stagger |
| [Silk flow (PixiJS)](oss-pixijs/) | [PixiJS](https://github.com/pixijs/pixijs) (MIT, in the scene) | 2d renderer, particles, filters |
| [Material study (Babylon.js)](oss-babylonjs/) | [Babylon.js](https://github.com/BabylonJS/Babylon.js) (Apache-2.0, in the scene) | pbr, ibl, gpu particles, post-processing |
| [Tile collapse (WaveFunctionCollapse)](oss-wavefunctioncollapse/) | [WaveFunctionCollapse](https://github.com/mxgmn/WaveFunctionCollapse) (MIT, JS port in the scene) | procedural, tiles, constraint solving |
| [Bloom echoes (Lottie Web)](oss-lottie-web/) | [Lottie Web](https://github.com/airbnb/lottie-web) (MIT, in the scene) | vector animation, kaleidoscope, feedback |
| [Endless landscape scroll (Shan Shui Infinite)](oss-shan-shui/) | [Shan Shui Infinite](https://github.com/LingDong-/shan-shui-inf) (MIT, fetched from a pinned commit) | procedural landscape, ink painting, infinite scroll |
| [Plotter fish (fishdraw)](oss-fishdraw/) | [fishdraw](https://github.com/LingDong-/fishdraw) (MIT, fetched from a pinned commit) | procedural drawing, pen plotter |
| [Rewrite rules (MarkovJunior)](oss-markovjunior/) | [MarkovJunior](https://github.com/mxgmn/MarkovJunior) (MIT, interpreter ported into the scene) | rewrite rules, mazes, rivers, flowers |
| [Gliding creatures (Lenia)](oss-lenia/) | [Lenia](https://github.com/Chakazul/Lenia) (MIT, GPU shaders in the scene) | artificial life, cellular automata, mouse |

## Remixes

Two examples blended into one by an agent with **Mix in** (example details), to show what mixing looks like.

| Example | Mixed from | Shows |
|---|---|---|
| [Letters in the wind (opentype.js × simplex-noise)](mix-opentype-flow/) | [Type particles](oss-opentype/) (opentype.js) × [Flow field](oss-simplex-noise/) (simplex-noise) | remix, particles, curl noise, trails |

Recipe examples were generated by running their recipe through the hub (save → verify → run). Most tools come from the reference list [index.opensource](https://indexopensource.com/index) (by 현 @hyun2xyz).
Copyleft tools (Trianglify GPL-3.0, Hydra AGPL-3.0, REBOUND GPL-3.0, p5.js LGPL-2.1) are fetched or run at use
time, not bundled. Third-party
material: the Bungee font is under the SIL Open Font License (`oss-opentype/FONT-LICENSE.txt`); Hokusai's
*The Great Wave off Kanagawa* is in the public domain (via Wikimedia Commons).

To add one, put a folder here with the files above. `npm test` checks every example parses, ships the assets its
scene names, names catalog tools that exist and ships the same recipe as the registry; `npm run smoke` opens each one
in the desktop app and checks it renders without errors. Thumbnails: `node mcp/scripts/capture-example.mjs <folder>`
(after `npm --prefix studio run build`).

앱에서 **프로젝트 메뉴 → Examples…**를 열면 예제가 새 프로젝트로 열린다. 대부분은 **오픈소스 하나를 실장님에 붙인 것**이다.
씬이 가져오는 라이브러리이거나, 에이전트가 레시피로 실행한 Python 패키지·프로그램의 결과를 씬이 쓴다.
에이전트에게는 참고 구현이 된다(`catalog_get`이 그 도구로 만든 예제의 코드를 보여 준다).
