# AUDIO PLAYBACK & ANALYSIS

Use `ctx.audio` to load audio files, play them in sync with the timeline,
and access real-time FFT data for audio-reactive visuals.

## Methods

| Method | Description |
|--------|-------------|
| `ctx.audio.load(url)` | Load audio file → `Promise`. Use `/api/uploads/<filename>` for uploaded files |
| `ctx.audio.play(offset?)` | Start playback (optionally from offset in seconds) |
| `ctx.audio.pause()` | Pause playback |
| `ctx.audio.stop()` | Stop and reset to beginning |
| `ctx.audio.setVolume(v)` | Set volume (0-1) |

## Properties (read-only, updated every frame)

| Property | Type | Description |
|----------|------|-------------|
| `ctx.audio.isLoaded` | boolean | True after `load()` completes |
| `ctx.audio.isPlaying` | boolean | True while audio is playing |
| `ctx.audio.duration` | float | Total duration in seconds |
| `ctx.audio.currentTime` | float | Current playback position in seconds |
| `ctx.audio.bass` | float | Low-frequency energy (0-1) |
| `ctx.audio.mid` | float | Mid-frequency energy (0-1) |
| `ctx.audio.treble` | float | High-frequency energy (0-1) |
| `ctx.audio.energy` | float | Overall energy (0-1) |
| `ctx.audio.frequencyData` | Uint8Array | Raw FFT bins (1024 values, 0-255) |
| `ctx.audio.waveformData` | Uint8Array | Time-domain waveform (1024 values, centered at 128) |
| `ctx.audio.fftTexture` | WebGLTexture | 1024x2 R8 texture (row 0=frequency, row 1=waveform) |
| `ctx.audio.volume` | float | Current volume level |

Audio playback is automatically synchronized with the timeline (pause, seek, loop).

## Example — Audio-reactive visual

```javascript
// setup — load audio and create a fullscreen quad shader
ctx.audio.load('/api/uploads/music.mp3').then(() => ctx.audio.play());
const fs = `#version 300 es
precision highp float;
uniform float uBass, uTime;
uniform vec2 uResolution;
uniform sampler2D uAudioData;
out vec4 fragColor;
void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  float freq = texture(uAudioData, vec2(uv.x, 0.25)).r;
  float bar = step(uv.y, freq);
  vec3 col = mix(vec3(0.1,0.2,0.5), vec3(1.0,0.3,0.1), uBass);
  fragColor = vec4(col * bar, 1.0);
}`;
ctx.state.prog = ctx.utils.createProgram(ctx.utils.DEFAULT_QUAD_VERTEX_SHADER, fs);
// ... create VAO + buffer with createQuadGeometry() ...

// render — pass audio uniforms and draw
gl.useProgram(ctx.state.prog);
gl.uniform1f(gl.getUniformLocation(ctx.state.prog, 'uBass'), ctx.audio.bass);
// bind ctx.audio.fftTexture to sample FFT data in the shader
gl.drawArrays(gl.TRIANGLES, 0, 6);

// cleanup
ctx.audio.stop();
```
