<p align="center">
  <img src="frontend/public/logo.svg" alt="Siljangnim" width="112" height="112" />
</p>

<h1 align="center">Siljangnim</h1>

<p align="center">
  A creative studio run by an agent.<br/>
  Describe what you want to make. The agent picks the open-source tools for the job,<br/>
  wires them together on your machine and renders the result live.
</p>

<p align="center">
  <a href="https://github.com/okdalto/siljangnim/releases">Download</a> ·
  <a href="https://siljangnim.vercel.app/">Try on the web</a> ·
  <a href="docs/architecture.md">Architecture</a> ·
  <a href="README.ko.md">한국어</a>
</p>

---

> **Siljangnim v2 is in progress.** The desktop app, the local runtime and the
> MCP connection are being built in stages ([plan](docs/architecture.md#11-단계별-계획)).
> Everything under **What works today** runs now; the rest is where it is going.

## What it is

*Siljangnim* (실장님) is what Korean design studios call the person who runs the
floor: you tell them what you want, and they know which people and tools to bring
in. This app plays that part for creative coding.

- **You describe the result** — "a hatching drawing of this photo, depth-aware, ready for an A3 plotter".
- **The agent decides how** — which open-source projects fit (shaders, geometry libraries,
  ML models, CLI tools), fetches them on your machine, and connects them.
- **What worked becomes a recipe** — a short Markdown file describing how a tool was
  installed and called. Next time it is instant, and other agents can reuse it.
- **You share structure, not code** — a project exports as a Markdown document of its
  pipeline and recipes. Another person's agent rebuilds it from that.
- **Bring your own agent** — Claude Code, Codex, Cursor or your own can drive the app
  over MCP, alongside the built-in agent.

Open-source code is never bundled with the app; it is fetched on your machine when a
project needs it, and every project records exactly what it used.

## What works today

- **Live shader scenes** — WebGL2/WebGPU, multi-pass buffers, 3D, post-processing, written and debugged by the agent.
- **Generated controls** — sliders, color pickers, pads, camera orbit, bound to uniforms with undo/redo.
- **Inputs** — audio analysis, microphone, MIDI, OSC, webcam hand/pose/face tracking (MediaPipe).
- **Assets** — images, video, fonts, SVG, audio and 3D models (OBJ, FBX, glTF with skeletal animation).
- **Timeline** — keyframes with easing on any uniform; record to MP4, WebM or PNG sequences.
- **Projects** — version tree with branches and comparison, multi-tab chat, GitHub save/load.
- **Desktop app** — macOS (Apple Silicon) and Windows, with its own managed Python runtime.
- **Providers** — Anthropic, OpenAI, Gemini, GLM, or any OpenAI-compatible server (vLLM, Ollama, …).

## Download

| Platform | File |
|---|---|
| macOS (Apple Silicon) | `Siljangnim-<version>-mac-arm64.dmg` |
| Windows (x64) | `Siljangnim-<version>-win-x64.exe` |

Get them from [Releases](https://github.com/okdalto/siljangnim/releases). The builds are not
code-signed yet:

- **macOS** — the first time, open the app, then go to *System Settings → Privacy & Security*
  and choose **Open Anyway**.
- **Windows** — on the SmartScreen prompt, choose **More info → Run anyway**.

On first launch the app downloads a private Python runtime (about 120 MB on disk) into its
own data folder. Nothing is installed system-wide.

## Run from source

You need **Node.js 22+**. That is all — Python is downloaded and managed by the app.

```bash
git clone https://github.com/okdalto/siljangnim.git
cd siljangnim
npm install
npm run dev
```

`./run.sh` (macOS/Linux) and `run.bat` (Windows) do the same in one step.

| Command | What it does |
|---|---|
| `npm run dev` | Desktop app with hot reload |
| `npm run web` | Browser-only version at http://localhost:5173 |
| `npm test` | Frontend and hub tests |
| `npm run smoke` | Build, launch, screenshot and check the desktop app |
| `npm run dist` | Build the installer for the current platform into `desktop/release/` |

Installers for both platforms are built by GitHub Actions when a `v*` tag is pushed.

## How it fits together

```
Your agent (MCP)      Built-in agent
        \                 /
         ▼               ▼
 ┌────────── Siljangnim desktop (Electron) ──────────┐
 │ Renderer   node canvas · viewport · panels         │
 │ Hub        local Python sidecar: MCP, runtime,     │
 │            recipes, provenance, permissions        │
 └────────────────────────────────────────────────────┘
         │ fetched on demand, isolated per tool
         ▼
 Open-source projects: GLSL · JS/WASM · Python · CLI apps · ML models
```

Details, recipe and project formats, and the staged plan: [docs/architecture.md](docs/architecture.md).

## Repository layout

```
desktop/    Electron shell: window, app:// protocol, hub process, installers
hub/        Python sidecar run by the app (uv-managed)
frontend/   Renderer: React, node canvas, GL engine, built-in agent (also the web build)
backend/    Legacy FastAPI server from v1; replaced by hub/ in stage 2
docs/       Architecture and guides
```

## The web version

[siljangnim.vercel.app](https://siljangnim.vercel.app/) runs the renderer and the built-in
agent in the browser. It covers shaders, panels, recording and in-browser ML. Tools that need
a local runtime (Python packages, CLI apps, GPU models) need the desktop app.

## Costs and security

- **Cost** — cloud providers bill per token. A complex scene can take many tool-use rounds;
  a single conversation can cost a few dollars. Self-hosted models have no per-token cost.
- **Security** — the agent writes and runs code on your machine, and in later stages will
  install open-source tools; those steps will ask for confirmation first. The hub listens on
  127.0.0.1 only and requires a per-launch token. Do not expose any part of the app to the
  network.

## License

[GPL-3.0](LICENSE). Open-source projects the agent fetches keep their own licenses; each
project records what it used.
