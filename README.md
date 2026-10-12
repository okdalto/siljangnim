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
  <a href="#get-started">Get started</a> ·
  <a href="https://siljangnim.vercel.app/">Try on the web</a> ·
  <a href="docs/architecture.md">Architecture</a> ·
  <a href="README.ko.md">한국어</a>
</p>

---

## Get started

> **We strongly recommend running it locally with an agent attached (A).** The web version is fine for
> looking at the examples, but Siljangnim is built for an agent that can install and run open-source tools
> on your machine — Python packages, ffmpeg, ML models, OSC — and the web can't do any of that. Locally,
> your agent also keeps its own memory and files, and with Claude Code it runs on your Claude plan instead
> of a separate API key.

Pick one. Each takes about a minute.

### A. With Claude Code — recommended

Paste this into Claude Code:

```text
Install the Siljangnim MCP server by running:
claude mcp add siljangnim -- npx -y siljangnim-mcp@latest
Then tell me to restart Claude Code.
```

Restart Claude Code, then ask for something:

```text
Use siljangnim to make glowing jellyfish drifting in a dark sea, with a slider for how many there are.
```

A viewer opens in your browser and the scene appears there. Keep chatting in Claude Code to change it.

You need [Node.js 22 or newer](https://nodejs.org). Nothing else: the first time a tool needs Python, it is
downloaded into `~/.siljangnim/runtime/`.

<details>
<summary>Codex, Cursor, Claude Desktop and other MCP clients</summary>

**Codex** — add to `~/.codex/config.toml`:

```toml
[mcp_servers.siljangnim]
command = "npx"
args = ["-y", "siljangnim-mcp@latest"]
tool_timeout_sec = 120
```

**Cursor, Claude Desktop, Windsurf and others** — add to the client's MCP settings
(`.cursor/mcp.json`, `claude_desktop_config.json`, …):

```json
{
  "mcpServers": {
    "siljangnim": { "command": "npx", "args": ["-y", "siljangnim-mcp@latest"] }
  }
}
```

Options (port, which browser opens) are in [docs/mcp.md](docs/mcp.md). To remove it:
`claude mcp remove siljangnim`.

</details>

### B. In your browser — nothing to install

Open **[siljangnim.vercel.app](https://siljangnim.vercel.app/)**, then:

1. Click **Examples** (top right) and open any example — it runs right away.
2. To make your own, open **Settings** (gear icon) and paste an Anthropic or OpenAI API key.
   It stays in that browser tab and goes only to the model provider.
3. Type what you want in the chat.

The web version can't run tools on your computer (Python packages, ffmpeg, ML models, OSC), so most of what
the agent can do needs A or C. Use the web to look around; use A to make things.

### C. Desktop app

Installers aren't published yet. Until they are, run it from the source — paste this into a terminal:

```bash
git clone https://github.com/okdalto/siljangnim.git && cd siljangnim && npm install && npm run dev
```

Next time, `npm run dev` in that folder (or `./run.sh`, `run.bat`) is enough. Add your API key under
**Settings**; it is encrypted with the OS keychain and never reaches the app window. While the app is
open, Claude Code (option A) uses its window as the viewer.

To build an installer for your own machine: `npm run dist` (output in `desktop/release/`). The builds are
not code-signed, so macOS asks once: *System Settings → Privacy & Security → Open Anyway*.

## What it is

*Siljangnim* (실장님) is what Korean design studios call the person who runs the floor: you tell them what
you want, and they know which people and tools to bring in. This app plays that part for creative coding.

- **You describe the result** — "a hatching drawing of this photo, depth-aware, ready for an A3 plotter".
- **The agent decides how** — which open-source projects fit (shaders, geometry libraries, ML models,
  CLI tools), fetches them on your machine, and connects them.
- **What worked becomes a recipe** — a short Markdown file describing how a tool was installed and
  called. Next time it is instant, and other agents can reuse it.
- **You share structure, not code** — a project exports as a Markdown document of its pipeline and
  recipes. Another person's agent rebuilds it from that.
- **Bring your own agent** — Claude Code, Codex, Cursor or your own drive the studio over MCP, alongside
  the built-in agent.

Open-source code is fetched on your machine when a project needs it, and every project records exactly
what it used.

## What it does

- **Live scenes written by an agent** — WebGL2 or WebGPU. The agent reads compile errors with line
  numbers, fixes them, and looks at a screenshot before answering.
- **Controls** — sliders, knobs, 2D pads, menus, buttons and colors that update the scene instantly; one
  orbit camera for every 3D scene (drag, right-drag, scroll, double-click to reset).
- **Live or Timeline** — interactive by default, or keyframe the controls over a fixed length.
- **Version history** — every change is a version with a thumbnail; restore any of them.
- **Assets** — drop images, video, audio, fonts, 3D models or data. The Assets tab also shows the
  scene's code and shaders, and *Show in Finder* writes the project out as plain files.
- **Open-source tools on your machine** — Python packages (trimesh, librosa, …) in isolated environments
  and installed CLIs (ffmpeg, …), each after you approve.
- **Inputs** — microphone and audio files, camera, MIDI, OSC, and browser ML such as hand tracking.
- **Recording** — MP4, WebM or PNG frames.
- **Sharing** — export a project as `project.md` or a bundle ([docs/project-md.md](docs/project-md.md));
  recipes are shared through [registry/](registry/).
- **Examples** — 70+ projects, most built on an open-source library, each with credits and a link
  (e.g. `siljangnim.vercel.app/#example=oss-three`).
- **Providers** — Anthropic (Claude Opus 5.5 by default) or any OpenAI-compatible server (OpenAI, vLLM,
  Ollama, …).

## For developers

```bash
npm install
npm run web      # the studio at http://localhost:5173
npm run dev      # the desktop app with hot reload
```

| Command | What it does |
|---|---|
| `npm run check` | Typecheck and lint |
| `npm test` | Studio, MCP bridge and hub tests |
| `npm run smoke` | Launch the desktop app, run an agent session against a mock API and open every example; then drive the viewer through the MCP bridge |
| `npm run mcp` | The MCP server from this checkout (`claude mcp add siljangnim -- node "$PWD/mcp/bin/siljangnim-mcp.js"` after `npm --prefix studio run build`) |
| `npm run dist` | Installer for the current platform into `desktop/release/` (CI builds both platforms on a `v*` tag) |
| `npm run notices` | Regenerate `THIRD_PARTY_NOTICES.md` |

```
studio/     The app: React + TypeScript UI, built-in agent, isolated scene runtime
desktop/    Electron shell: window, app:// protocol, key storage, hub process, installers
hub/        Python sidecar (uv-managed): runtime jobs and recipes
mcp/        MCP server for external agents (published as siljangnim-mcp)
examples/   Example projects shown in the app
registry/   Shared recipes, contributed by pull request
docs/       Architecture and guides (Korean)
```

How the pieces fit, and the plan: [docs/architecture.md](docs/architecture.md).

## Costs and security

- **Cost** — cloud models bill per token. A complex scene can take many rounds; one conversation can cost
  a few dollars. With Claude Code you use your Claude plan; self-hosted models have no per-token cost.
- **Security** — scene code runs on a separate origin and can't reach your projects or keys. Running code
  or installing packages on your machine asks first; it isolates files and dependencies, but it is not an
  OS sandbox. Everything local listens on 127.0.0.1 only — don't expose it to the network.

## License

[GPL-3.0](LICENSE). Third-party code, tools and material, with licenses and source links:
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). The open-source catalog starts from
[index.opensource](https://indexopensource.com/index) by 현 (@hyun2xyz). Projects the agent fetches keep
their own licenses.
