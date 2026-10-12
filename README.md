<p align="center">
  <img src="studio/public/logo.svg" alt="Siljangnim" width="112" height="112" />
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

- **Agent-built live scenes** — describe a visual; the agent writes a WebGL2 or WebGPU scene, reads back compile
  errors with line numbers, fixes them, and looks at a screenshot of the result before answering.
- **Isolated scene runtime** — scene code runs on a separate origin with its own security policy; it
  cannot reach your projects or API keys.
- **Live controls** — the parameters the agent exposes update the scene instantly: sliders, knobs, 2D pads,
  menus, one-frame buttons, colors, grouped panels, and monitors for values the scene publishes.
- **Live or Timeline** — scenes are interactive by default; switch one to Timeline to keyframe its controls
  over a fixed length. Undo/redo with Cmd+Z.
- **Version history** — every agent change and control tweak is a version with a thumbnail; restore any of them.
- **Assets** — drop images, video, audio, fonts, 3D models or data files; the agent sees and uses them.
- **Open-source tools on your machine** — the agent runs Python packages (trimesh, librosa, …) in isolated
  environments and installed CLIs (ffmpeg, …), after you approve; results come back as assets. What worked is
  saved as a recipe, so the next request runs it directly.
- **Bring your own agent** — Claude Code, Codex and other MCP clients can drive the studio
  ([docs/mcp.md](docs/mcp.md)); you chat with them, the viewer shows the result. With the desktop app
  running, the agent works in its window.
- **Recording** — MP4, WebM or PNG frames, rendered frame by frame or captured live.
- **Inputs** — microphone and audio files (spectrum, bands), camera, MIDI, OSC from controllers, and
  browser ML such as MediaPipe hand tracking.
- **Sharing** — export a project as `project.md` (scene, assets and how they were made) or a bundle; another
  agent can rebuild it from the document ([docs/project-md.md](docs/project-md.md)). Recipes are shared through
  a registry ([registry/](registry/)), and a catalog helps the agent pick open-source tools.
- **v1 projects** — *Projects menu → Import v1 project* brings old exports over.
- **Examples** — the *Examples* tab (top right) lists every example with search and categories; each opens as a
  project, and its *Link* opens it directly (e.g. `siljangnim.vercel.app/#example=oss-three`). Tools from the
  reference list that have no example yet can be handed to the agent to build ([examples/](examples/)).
- **Projects** — several projects with their scene and chat, saved locally.
- **Providers** — Anthropic (Claude Opus 5.5 by default) or any OpenAI-compatible server (OpenAI, vLLM, Ollama, …).
- **Desktop app** — macOS (Apple Silicon) and Windows. API keys are encrypted with the OS keychain and
  never reach the app window; the app manages its own Python runtime.

The web version at [siljangnim.vercel.app](https://siljangnim.vercel.app/) runs this studio ([docs/m3.md](docs/m3.md#4-웹-배포-전환과-v1-은퇴)).

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

`./run.sh` (macOS/Linux) and `run.bat` (Windows) do the same in one step. Then open
*Projects menu → Examples…* to try a scene right away.

### With Claude Code, Codex or another MCP client

```bash
claude mcp add siljangnim -- npx -y siljangnim-mcp
```

No clone needed: the package carries the studio and the hub. From a checkout instead:
`npm install && npm --prefix studio run build`, then `claude mcp add siljangnim -- node "$PWD/mcp/bin/siljangnim-mcp.js"`.

Ask your agent for a visual; its first tool call opens the viewer in your browser. Codex and others:
see [docs/mcp.md](docs/mcp.md).

| Command | What it does |
|---|---|
| `npm run dev` | Desktop app with hot reload |
| `npm run web` | The studio in your browser at http://localhost:5173 |
| `npm run check` | Typecheck and lint |
| `npm test` | Studio, MCP bridge and hub tests |
| `npm run smoke` | Build and launch the desktop app, run an agent session against a mock API and open every example; then drive the viewer through the MCP bridge |
| `npm run mcp` | The MCP server external agents launch |
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
hub/        Python sidecar run by the app (uv-managed): runtime jobs and recipes
mcp/        MCP server for external agents (serves the studio, relays tool calls)
examples/   Example projects shown in the app's gallery
registry/   Shared recipes (index.json + recipe files), contributed by pull request
docs/       Architecture and guides
```

## The web version

[siljangnim.vercel.app](https://siljangnim.vercel.app/) runs the studio in your browser, with your own
API key (kept in the tab's session storage and sent only to the model provider through the site's
forwarder). Scenes run on a separate domain. Tools that need a local runtime (Python packages, CLI
apps, GPU models, OSC) need the desktop app or an MCP client. The v1 web app has been retired; open
its project exports with *Import v1 project*.

## Costs and security

- **Cost** — cloud providers bill per token. A complex scene can take many tool-use rounds;
  a single conversation can cost a few dollars. Self-hosted models have no per-token cost.
- **Security** — the agent writes and runs code on your machine, and in later stages will
  install open-source tools; those steps will ask for confirmation first. The hub listens on
  127.0.0.1 only and requires a per-launch token. Do not expose any part of the app to the
  network.

## License

Third-party code, tools and material, with their licenses and source links: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
The open-source catalog starts from [index.opensource](https://indexopensource.com/index) by 현 (@hyun2xyz).

[GPL-3.0](LICENSE). Open-source projects the agent fetches keep their own licenses; each
project records what it used.
