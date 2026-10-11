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

> **Siljangnim v2 is in progress.** The app is being rebuilt from scratch as a
> desktop studio ([plan](docs/architecture.md#11-단계별-계획), [studio design](docs/studio.md)).
> **What works today** lists what the new studio does now; the v1 web app at
> [siljangnim.vercel.app](https://siljangnim.vercel.app/) still has the older, larger feature set
> until the rewrite catches up.

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

In the new studio (desktop app and `npm run web`):

- **Agent-built live scenes** — describe a visual; the agent writes a WebGL2 scene, reads back compile
  errors with line numbers, fixes them, and looks at a screenshot of the result before answering.
- **Isolated scene runtime** — scene code runs on a separate origin with its own security policy; it
  cannot reach your projects or API keys.
- **Live controls** — the parameters the agent exposes (sliders, colors, toggles, vectors) update the scene instantly.
- **Projects** — several projects with their scene and chat, saved locally.
- **Providers** — Anthropic (Claude Opus 5.5 by default) or any OpenAI-compatible server (OpenAI, vLLM, Ollama, …).
- **Desktop app** — macOS (Apple Silicon) and Windows. API keys are encrypted with the OS keychain and
  never reach the app window; the app manages its own Python runtime.

Coming back from v1 next ([milestones](docs/studio.md#마일스톤)): WebGPU, agent-made panels, asset
uploads, timeline and keyframes, version history (M2); recording, audio/camera/MIDI/MediaPipe inputs,
importing v1 projects (M3).

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
| `npm run web` | The studio in your browser at http://localhost:5173 |
| `npm run check` | Typecheck and lint |
| `npm test` | Studio and hub tests |
| `npm run smoke` | Build and launch the desktop app, run one agent session against a mock API, screenshot and check it |
| `npm run dist` | Build the installer for the current platform into `desktop/release/` |

Installers for both platforms are built by GitHub Actions when a `v*` tag is pushed.

## How it fits together

```
Your agent (MCP)      Built-in agent
        \                 /
         ▼               ▼
 ┌────────── Siljangnim desktop (Electron) ──────────┐
 │ Studio     chat · viewport · controls;             │
 │            scenes run on an isolated origin        │
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
studio/     The app: React + TypeScript UI, built-in agent, isolated scene runtime
desktop/    Electron shell: window, app:// protocol, key storage, hub process, installers
hub/        Python sidecar run by the app (uv-managed)
frontend/   v1 web app (still deployed to siljangnim.vercel.app until the studio replaces it)
backend/    v1 FastAPI server; replaced by hub/
docs/       Architecture and guides
```

## The web version

[siljangnim.vercel.app](https://siljangnim.vercel.app/) still serves the v1 web app. The new
studio also runs in a browser (`npm run web`); a hosted version follows once it reaches v1's
features. Tools that need a local runtime (Python packages, CLI apps, GPU models) will need the
desktop app.

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
