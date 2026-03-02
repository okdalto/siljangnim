# PROCESSED FILE DERIVATIVES

When files are uploaded, they are automatically preprocessed into WebGL-ready
derivatives. Use `list_uploaded_files` to see available derivatives for each file.

## Font files (.ttf, .otf, .woff, .woff2)
- `atlas.png`: Bitmap glyph atlas (48px, white glyphs on transparent background).
  Use as a texture with `atlas_metrics.json` UV coordinates to render text.
- `atlas_metrics.json`: Per-glyph metrics including UV coordinates, advance widths,
  and bearings. Load via `read_file(path="uploads/<filename>")` and use the `uv` array [u0, v0, u1, v1]
  to sample the correct glyph region from `atlas.png`.
- `outlines.json`: Vector outlines as SVG path data for each glyph.
  Can be used for SDF text rendering or path-based effects.
- `msdf_atlas.png` + `msdf_metrics.json`: MSDF atlas (if msdf-atlas-gen is installed).
  Provides resolution-independent text rendering.

## SVG files (.svg)
- `svg_data.json`: Parsed SVG structure with paths (d attribute), circles, rects,
  lines, polygons, and text elements. Use path `d` attributes for vector rendering
  in shaders, or extract coordinates for procedural effects.

## Audio files (.mp3, .wav, .ogg, .flac)
- `waveform.json`: Downsampled waveform (4096 samples). Load via
  `read_file(path="uploads/<filename>")` and use the `samples` array for static audio visualization.
- `spectrogram.png`: Spectrogram image (1024x512). Use as a texture input for
  static frequency-domain visualization.
- For real-time audio-reactive visuals, use `ctx.audio.load('/api/uploads/<filename>')`
  to load the original audio file and access live FFT data via
  `ctx.audio.bass/mid/treble/energy/fftTexture`.

## Video files (.mp4, .webm, .mov)
- `frame_NNN.png`: Uniformly sampled keyframes (up to 30, 512px max dimension).
  Use individual frames as texture inputs.
- `video_metadata.json`: Duration, FPS, resolution, and frame timestamps.

## 3D Model files (.obj, .fbx, .gltf, .glb)
- `geometry.json`: Contains mesh geometry and optional skeletal/animation data.
  Load via `read_file(path="uploads/<filename>")`. Fields:
  - **Always present**: `positions` (flat float array, 3 per vertex), `normals`,
    `uvs` (2 per vertex), `indices`, `vertex_count`, `face_count`, `bounds`.
  - **`materials`** (optional): Array of `{name, diffuse_color:[r,g,b],
    specular_color, emissive_color, opacity, shininess, diffuse_texture,
    normal_texture}`. When `diffuse_texture` is present, load it as an image:
    `ctx.utils.loadImage(derivativeUrl + '/' + mat.diffuse_texture)`.
  - **`skeleton`** (optional): `{bones: [{name, parent, inverse_bind_matrix}],
    bone_indices: [4 per vertex, flat ints], bone_weights: [4 per vertex, flat floats]}`.
    For GPU skinning, upload `bone_indices` and `bone_weights` as vertex attributes,
    pass per-bone matrices as a uniform array, and compute skinned positions in the
    vertex shader:
    `vec4 skinned = weight.x * bones[idx.x] * pos + weight.y * bones[idx.y] * pos + ...`
  - **`animations`** (optional): `[{name, duration, tracks: [{bone_index, property,
    times, values}]}]`. `property` is `"translation"`, `"rotation"`, or `"scale"`.
    `values` are interleaved (3 floats per keyframe for translation/scale,
    4 for rotation quaternions in glTF). Interpolate between keyframes using the
    `times` array, compose bone-local transforms, multiply along the hierarchy,
    then multiply by each bone's `inverse_bind_matrix` to get the final skinning matrix.
- `texture_N.png|jpg`: Extracted texture images (embedded textures from FBX/glTF).
  Load via `ctx.utils.loadImage(derivativeUrl + '/texture_0.png')`.
- **Warning — skeletal animation is extremely error-prone.** Common mistakes:
  1. **Missing bind-pose translation**: Bones with only rotation keyframes still need
     bind-pose translation, NOT (0,0,0) — otherwise limbs collapse to origin.
  2. **Euler rotation order**: FBX uses ZYX intrinsic order (Rz·Ry·Rx). Wrong order → spiky mesh.
  3. **Matrix order**: Skinning = `worldMatrix * inverseBindMatrix`, world = `parentWorld * localMatrix` (root-to-leaf).
  4. **Unanimated bones**: Use rest/bind-pose transform, not identity.
  5. **Zero-weight vertices → spikes**: Propagate weights from adjacent skinned vertices.
  Always render static bind pose first before adding animation.

Derivatives are served at `/api/uploads/processed/<stem_ext>/<filename>`.
Example: for `myFont.ttf`, the atlas is at `/api/uploads/processed/myFont_ttf/atlas.png`.
