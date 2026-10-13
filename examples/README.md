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
| [Shapes by hill climbing (Primitive)](oss-primitive/) | [Primitive](https://github.com/fogleman/primitive) (MIT, ported into the scene) | image, geometry, hill climbing |
| [Falling sand (sandspiel)](oss-sandspiel/) | [sandspiel](https://github.com/MaxBittker/sandspiel) (MIT, rules ported into the scene) | falling sand, elements, mouse |
| [Regrowing creatures (Growing NCA)](oss-growing-nca/) | [Growing Neural Cellular Automata](https://github.com/google-research/self-organising-systems) (Apache-2.0, pretrained weights as GPU shaders) | neural CA, regeneration, mouse |
| [Slime mould networks (Slime-Simulation)](oss-slime-simulation/) | [Slime-Simulation](https://github.com/SebLague/Slime-Simulation) (GPL-3.0) | agent simulation, physarum, gpu simulation, emergent networks |
| [Black hole with a glowing disc (Black Hole Shader)](oss-black-hole/) | [Black Hole Shader](https://github.com/ebruneton/black_hole_shader) (BSD-3-Clause) | ray tracing, general relativity, gravitational lensing, precomputed lookup textures |
| [Procedurally animated fish, snake and lizard (animal-proc-anim)](oss-animal-proc-anim/) | [animal-proc-anim](https://github.com/argonautcode/animal-proc-anim) (MIT) | procedural animation, inverse kinematics, FABRIK, follow the pointer |
| [Paintings of flowers that don't exist (Nonflowers)](oss-nonflowers/) | [Nonflowers](https://github.com/LingDong-/nonflowers) (MIT) | procedural painting, generative botany, stroke animation, web worker |
| [Growing coral line (differential-line)](oss-differential-line/) | [differential-line](https://github.com/inconvergent/differential-line) (MIT) | differential growth, generative art, simulation, spatial hashing |
| [Growing branches (space-colonization)](oss-space-colonization/) | [space-colonization](https://github.com/nicknikolov/space-colonization) (MIT) | space colonization, procedural trees, leaf venation, growth animation |
| [Diffusion-limited growth (dlaf)](oss-dlaf/) | [dlaf](https://github.com/fogleman/dlaf) (MIT) | diffusion-limited aggregation, random walk, spatial grid, point sprites |
| [Sand-painted splines (sand-spline)](oss-sand-spline/) | [sand-spline](https://github.com/inconvergent/sand-spline) (MIT) | generative art, sand painting, splines, gpu points |
| [Cut-paper rosette (earcut)](oss-earcut/) | [earcut](https://github.com/mapbox/earcut) (ISC, in the scene) | triangulation, polygon holes, mouse |
| [Poster sunset (Pillow)](oss-pillow/) | [Pillow](https://github.com/python-pillow/Pillow) (HPND, Python, recipe) | image, quantization, palette, recipe |
| [Path lanterns (svgpathtools)](oss-svgpathtools/) | [svgpathtools](https://github.com/mathandy/svgpathtools) (MIT, Python, recipe) | SVG, arc length, motion, recipe |

| [Shorter pen journeys (vpype)](oss-vpype/) | [vpype](https://github.com/abey79/vpype) (MIT) | plotter, svg, pen plot |
| [Touching cells (scikit-image)](oss-scikit-image/) | [scikit-image](https://github.com/scikit-image/scikit-image) (BSD-3-Clause) | image, segmentation, contours |
| [Voxel constellation (Open3D)](oss-open3d/) | [Open3D](https://github.com/isl-org/Open3D) (MIT) | point cloud, mesh, 3d |
| [Less mesh, same shape (PyMeshLab)](oss-pymeshlab/) | [PyMeshLab](https://github.com/cnr-isti-vclab/PyMeshLab) (GPL-3.0) | mesh, remesh, decimate |
| [Inference waves (ONNX Runtime)](oss-onnxruntime-web/) | [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) (MIT) | ml, onnx, inference |
| [Studio still life (Blender)](oss-blender/) | [Blender](https://projects.blender.org/blender/blender) (GPL-2.0-or-later) | 3d, render, mesh |
| [Perforated lantern (OpenSCAD)](oss-openscad/) | [OpenSCAD](https://github.com/openscad/openscad) (GPL-2.0) | cad, csg, 3d |
| [Etched light (ImageMagick)](oss-imagemagick/) | [ImageMagick](https://github.com/ImageMagick/ImageMagick) (ImageMagick) | image, convert, batch |
| [Vector rosette (Inkscape)](oss-inkscape/) | [Inkscape](https://gitlab.com/inkscape/inkscape) (GPL-2.0-or-later) | svg, vector, export |
| [A leaf becomes vector (Potrace)](oss-potrace/) | [Potrace](https://potrace.sourceforge.net) (GPL-2.0-or-later) | trace, vectorize, bitmap |
| [Near and far (Depth Anything V2)](oss-depth-anything-v2/) | [Depth Anything V2](https://github.com/DepthAnything/Depth-Anything-V2) (Apache-2.0) | depth, image, 3d |
| [A new backdrop (rembg)](oss-rembg/) | [rembg](https://github.com/danielgatis/rembg) (MIT) | background removal, matting, segmentation |
| [Three prompts (SAM)](oss-segment-anything/) | [Segment Anything (SAM)](https://github.com/facebookresearch/segment-anything) (Apache-2.0) | segmentation, mask, image |
| [Words in time (Whisper)](oss-whisper/) | [Whisper](https://github.com/openai/whisper) (MIT) | speech, transcription, audio |
| [Inside the mix (Demucs)](oss-demucs/) | [Demucs](https://github.com/facebookresearch/demucs) (MIT) | audio, music, stems |
| [Rebuilt detail (Real-ESRGAN)](oss-real-esrgan/) | [Real-ESRGAN](https://github.com/xinntao/Real-ESRGAN) (BSD-3-Clause) | upscale, super resolution, image |
| [Out of the noise (Diffusers)](oss-diffusers/) | [Diffusers (Stable Diffusion and others)](https://github.com/huggingface/diffusers) (Apache-2.0) | image generation, diffusion, text to image |

| [A shoreline around points (concaveman)](oss-concaveman/) | [concaveman](https://github.com/mapbox/concaveman) (ISC, in the scene) | Concaveman wraps an original point cloud in a concave hull. Concavity controls how closely its boundary follows the points. |
| [A lighter coastline (Simplify.js)](oss-simplify-js/) | [Simplify.js](https://github.com/mourner/simplify-js) (BSD-2-Clause, in the scene) | Simplify.js reduces a noisy polyline with Douglas–Peucker simplification. The original line remains visible for comparison. |
| [Points where a curve bends (adaptive-bezier-curve)](oss-adaptive-bezier-curve/) | [adaptive-bezier-curve](https://github.com/mattdesl/adaptive-bezier-curve) (BSD-3-Clause, in the scene) | adaptive-bezier-curve subdivides a cubic curve more finely near bends. Quality changes its adaptive sampling scale. |
| [Cut and combine (Martinez polygon clipping)](oss-martinez-polygon-clipping/) | [Martinez polygon clipping](https://github.com/w8r/martinez) (MIT, in the scene) | Martinez computes boolean operations between a star and a movable disk, including holes in the resulting polygon. |
| [Polygon logic (PolyBool)](oss-polybool/) | [PolyBool](https://github.com/velipso/polybool) (0BSD, in the scene) | PolyBool combines the regions of two polygons with union, intersection, difference and XOR. |
| [Corners into silk (chaikin-smooth)](oss-chaikin-smooth/) | [chaikin-smooth](https://github.com/experience-monks/chaikin-smooth) (MIT, in the scene) | Chaikin smoothing repeatedly cuts corners from an open zigzag. Endpoints remain fixed while the path rounds out. |
| [Triangles around a courtyard (cdt2d)](oss-cdt2d/) | [cdt2d](https://github.com/mikolalysenko/cdt2d) (MIT, in the scene) | cdt2d creates a constrained Delaunay mesh around a courtyard. Boundary edges and the hole remain intact. |
| [Pebbles that do not overlap (pack-spheres)](oss-pack-spheres/) | [pack-spheres](https://github.com/mattdesl/pack-spheres) (MIT, in the scene) | pack-spheres grows circles while keeping them separate. A fixed random seed makes comparisons reproducible. |
| [One rhythm, six curves (d3-shape)](oss-d3-shape/) | [d3-shape](https://github.com/d3/d3-shape) (ISC, in the scene) | D3 Shape draws the same sample points with six curve interpolators, from straight segments to smooth natural splines. |
| [A leaf made of facets (svg-mesh-3d)](oss-svg-mesh-3d/) | [svg-mesh-3d](https://github.com/mattdesl/svg-mesh-3d) (MIT, in the scene) | svg-mesh-3d converts an original cubic SVG leaf into an indexed triangle mesh. Sampling quality changes the boundary detail. |
| [An island from scattered points (alpha-shape)](oss-alpha-shape/) | [alpha-shape](https://github.com/mikolalysenko/alpha-shape) (MIT, in the scene) | alpha-shape extracts the boundary of an alpha complex. Increasing Alpha rejects larger circumcircles and can split the boundary. |
| [A ribbon and its normals (polyline-normals)](oss-polyline-normals/) | [polyline-normals](https://github.com/mattdesl/polyline-normals) (MIT, in the scene) | polyline-normals computes vertex normals and miter lengths for a zigzag ribbon. Width moves its two sides along those normals. |
| [A glass mosaic (Delaunator)](oss-delaunator/) | [Delaunator](https://github.com/mapbox/delaunator) (ISC, in the scene) | Delaunator triangulates an original point cloud. Each triangle gets a color while the points remain visible on request. |
| [A noisy line becomes ink (fit-curve)](oss-fit-curve/) | [fit-curve](https://github.com/soswow/fit-curve) (MIT, in the scene) | fit-curve approximates a noisy sampled stroke with cubic Bézier segments. Error controls the fitting tolerance. |
| [A stretched rubber band (monotone-convex-hull-2d)](oss-monotone-convex-hull-2d/) | [monotone-convex-hull-2d](https://github.com/mikolalysenko/monotone-convex-hull-2d) (MIT, in the scene) | monotone-convex-hull-2d finds the convex hull indices of a point cloud using a monotone chain. |
| [Inside, outside, boundary (robust-point-in-polygon)](oss-robust-point-in-polygon/) | [robust-point-in-polygon](https://github.com/mikolalysenko/robust-point-in-polygon) (MIT, in the scene) | robust-point-in-polygon classifies a movable probe and a grid of points as inside, outside or on the polygon boundary. |
| [A star split into convex pieces (poly-decomp.js)](oss-poly-decomp-js/) | [poly-decomp.js](https://github.com/schteppe/poly-decomp.js) (MIT, in the scene) | poly-decomp decomposes a concave star into convex polygons with quickDecomp. Explode separates the resulting pieces for inspection. |
| [Rooms inside a stepped plan (rectangle-decomposition)](oss-rectangle-decomposition/) | [rectangle-decomposition](https://github.com/mikolalysenko/rectangle-decomposition) (MIT, in the scene) | rectangle-decomposition partitions a rectilinear region into non-overlapping rectangles. A movable courtyard remains empty. |
| [A stroke made of triangles (extrude-polyline)](oss-extrude-polyline/) | [extrude-polyline](https://github.com/mattdesl/extrude-polyline) (MIT, in the scene) | extrude-polyline builds a triangle mesh for a thick polyline with miter or bevel joins and butt or square caps. |
| [Contours growing outward (polygon-offset)](oss-polygon-offset/) | [polygon-offset](https://github.com/w8r/polygon-offset) (MIT, in the scene) | polygon-offset computes rounded parallel outlines of an original concave polygon. Distance changes the offset margin. |
| [Weighted spline (b-spline)](oss-b-spline/) | [b-spline](https://github.com/thibauts/b-spline) (MIT, in the scene) | b-spline evaluates a rational B-spline with de Boor’s algorithm. Degree changes continuity and Weight pulls the curve toward one control point. |
| [A place for the label (polylabel)](oss-polylabel/) | [polylabel](https://github.com/mapbox/polylabel) (ISC, in the scene) | Polylabel searches for the point farthest from a polygon’s edges and hole. The circle shows its clearance from the boundary. |
| [A compact atlas (potpack)](oss-potpack/) | [potpack](https://github.com/mapbox/potpack) (ISC, in the scene) | Potpack packs rectangles into a compact texture atlas. Colors track each rectangle and Fill reports occupied area. |
| [Which side of the line? (robust-predicates)](oss-robust-predicates/) | [robust-predicates](https://github.com/mourner/robust-predicates) (Unlicense, in the scene) | robust-predicates evaluates orient2d for points around a directed line. The moving probe displays the signed orientation result. |
| [Finding overlaps (box-intersect)](oss-box-intersect/) | [box-intersect](https://github.com/mikolalysenko/box-intersect) (MIT, in the scene) | box-intersect reports overlapping pairs in a moving set of axis-aligned boxes. Matching pairs are connected at their centers. |
| [A polygon’s balance point (d3-polygon)](oss-d3-polygon/) | [d3-polygon](https://github.com/d3/d3-polygon) (ISC, in the scene) | D3 Polygon measures area, perimeter and centroid of a changing polygon. The bright point marks its geometric centroid. |
| [Three colors, one triangle (barycentric)](oss-barycentric/) | [barycentric](https://github.com/mikolalysenko/barycentric) (MIT, in the scene) | barycentric computes coordinates relative to a triangle. The three weights become red, green and blue for the probe and the interior grid. |
| [Evenly spaced currents (streamlines)](oss-streamlines/) | [streamlines](https://github.com/anvaka/streamlines) (MIT, in the scene) | Streamlines integrates an original vector field with RK4 while keeping paths apart. Four spacing settings are computed when the scene opens. |

## Remixes

Two examples blended into one by an agent with **Mix in** (example details), to show what mixing looks like.

| Example | Mixed from | Shows |
|---|---|---|
| [Letters in the wind (opentype.js × simplex-noise)](mix-opentype-flow/) | [Type particles](oss-opentype/) (opentype.js) × [Flow field](oss-simplex-noise/) (simplex-noise) | remix, particles, curl noise, trails |
| [Creature in the current (Growing NCA × WebGL Fluid)](mix-nca-fluid/) | [Regrowing creatures](oss-growing-nca/) (Growing NCA) × [Fluid](oss-webgl-fluid/) (WebGL-Fluid-Simulation) | remix, neural CA, fluid, regeneration, mouse |

Recipe examples were generated by running their recipe through the hub (save → verify → run).
Copyleft tools (Trianglify GPL-3.0, Hydra AGPL-3.0, REBOUND GPL-3.0, p5.js LGPL-2.1) are fetched or run at use
time, not bundled. Slime-Simulation (GPL-3.0) is ported into its example's shaders, which is fine because Siljangnim itself is GPL-3.0. Third-party
material: the Bungee font is under the SIL Open Font License (`oss-opentype/FONT-LICENSE.txt`); Hokusai's
*The Great Wave off Kanagawa* is in the public domain (via Wikimedia Commons).

To add one, put a folder here with the files above. `npm test` checks every example parses, ships the assets its
scene names, names catalog tools that exist and ships the same recipe as the registry; `npm run smoke` opens each one
in the desktop app and checks it renders without errors. Thumbnails: `node mcp/scripts/capture-example.mjs <folder>`
(after `npm --prefix studio run build`).

앱에서 **프로젝트 메뉴 → Examples…**를 열면 예제가 새 프로젝트로 열린다. 대부분은 **오픈소스 하나를 실장님에 붙인 것**이다.
씬이 가져오는 라이브러리이거나, 에이전트가 레시피로 실행한 Python 패키지·프로그램의 결과를 씬이 쓴다.
에이전트에게는 참고 구현이 된다(`catalog_get`이 그 도구로 만든 예제의 코드를 보여 준다).

새 예제: **조각 종이 로제트(earcut)**는 구멍이 있는 도형의 삼각분할을, **포스터 노을(Pillow)**은 4·8·16·32색 변환을, **곡선 위의 등불(svgpathtools)**은 SVG 곡선의 등간격 이동을 보여 줍니다. Python 예제는 결과물과 재생성 레시피를 함께 포함합니다.

## Local-tool and model examples / 로컬 도구와 모델 예제

All catalog tools now have an example. ONNX Runtime Web executes an original computation graph in the browser.
The Python, native-program and pretrained-model examples include actual generated output, the original inputs,
and the recipe that produced them. Viewing those outputs needs no Python, native application, model download or API key.
To change a model input or CAD design, rerun its recipe locally; moving a viewer control does not rerun the model.
First-time model runs download weights separately. The model source and license are listed in each example's credits;
Diffusers uses the Apache-2.0 DDPM CIFAR-10 model, not a text-to-image service. Whisper and Demucs start silently;
use **Listen** to hear the included synthetic audio. The Whisper sentence is original text synthesized with macOS speech.

카탈로그의 모든 도구에 예제가 있습니다. ONNX Runtime Web은 브라우저에서 직접 만든 계산 그래프를 실행합니다.
Python·외부 프로그램·학습 모델 예제에는 실제 생성 결과, 원본 입력, 재생성 레시피가 들어 있습니다.
결과 감상에는 Python, 외부 앱, 모델 다운로드나 API 키가 필요 없습니다. 입력 이미지나 CAD 설계를 바꾸려면
로컬에서 레시피를 다시 실행하세요. 화면 컨트롤을 움직이는 것만으로 모델을 다시 실행하지는 않습니다.
모델을 처음 실행할 때는 가중치를 별도로 받습니다. 출처와 라이선스는 각 예제에 표시돼 있습니다.
Diffusers는 Apache-2.0 라이선스의 DDPM CIFAR-10 모델로 작은 이미지를 만듭니다.
Whisper와 Demucs는 무음으로 시작하며 **Listen**을 켜면 포함된 합성 음원을 들을 수 있습니다.
Whisper의 음성은 직접 작성한 문장을 macOS 음성 합성으로 만든 것입니다.

## Geometry and vector examples / 기하·벡터 예제

The 28 geometry examples added from index.opensource run their pinned JavaScript libraries in the scene.
They calculate their results from original input geometry; no model download or Python installation is needed.
Opening an example downloads and caches its scene. Its library is fetched separately from a CDN on first use.
Controls recompute the geometry; Streamlines computes four spacing variants when it opens.

index.opensource에서 추가한 기하·벡터 예제 28개는 고정 버전의 JavaScript 라이브러리를 장면 안에서 실행해요.
직접 만든 입력 도형으로 결과를 계산하며, 모델 다운로드나 Python 설치가 필요하지 않아요.
예제를 열면 장면을 내려받아 캐시하고, 라이브러리는 처음 사용할 때 CDN에서 별도로 받아요.
컨트롤을 바꾸면 기하 데이터를 다시 계산해요. Streamlines는 열 때 네 가지 선 간격을 계산해 둬요.
