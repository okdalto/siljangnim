<p align="center">
  <img src="studio/public/logo.svg" alt="Siljangnim" width="112" height="112" />
</p>

<h1 align="center">Siljangnim</h1>

<p align="center">
  A creative coding studio run by an agent.<br/>
  Make live visuals by describing them, reshape them in conversation, mix pieces together,<br/>
  play them live with MIDI, OSC and sound, and export them as video.
</p>

<p align="center">
  <a href="#get-started">Get started</a> ·
  <a href="https://siljangnim.vercel.app/">Try on the web</a> ·
  <a href="docs/creative.md">Guides</a> ·
  <a href="README.ko.md">한국어</a>
</p>

<p align="center">
  <a href="https://cdn.jsdelivr.net/gh/okdalto/siljangnim@main/media/siljangnim-short.mp4"><img src="media/siljangnim-short-preview.gif" alt="Siljangnim intro" width="270" /></a><br/>
  <a href="https://cdn.jsdelivr.net/gh/okdalto/siljangnim@main/media/siljangnim-short.mp4">▶ Watch with sound (30 s, English narration, Korean and English subtitles)</a>
</p>

---

## Get started

> **We strongly recommend running it locally with an agent attached (A).** The web version is fine for
> looking at the examples, but Siljangnim is built for an agent that can install and run open-source tools
> on your machine — Python packages, ffmpeg, ML models, OSC — and the web can't do any of that. Locally,
> your agent also keeps its own memory and files, and with Claude Code it runs on your Claude plan instead
> of a separate API key.

Pick one. Each takes about a minute.

### A. With Claude Code or Codex — recommended

Paste this into **Claude Code**:

```text
Install the Siljangnim MCP server by running:
claude mcp add siljangnim -- npx -y siljangnim-mcp@latest
Then tell me to restart Claude Code.
```

Or into **Codex**:

```text
Install the Siljangnim MCP server by running:
codex mcp add siljangnim -- npx -y siljangnim-mcp@latest
Then, in ~/.codex/config.toml under [mcp_servers.siljangnim], add the line tool_timeout_sec = 120
(long calls return a tracking ID within 45 seconds; the agent polls viewer_call_status). Then tell me to restart Codex.
```

Restart it, then ask for something:

```text
Use siljangnim to make glowing jellyfish drifting in a dark sea, with a slider for how many there are.
```

A viewer opens in your browser and the scene appears there. Keep chatting with your agent to change it.

You need [Node.js 22 or newer](https://nodejs.org). Nothing else: the first time a tool needs Python, it is
downloaded into `~/.siljangnim/runtime/`.

<details>
<summary>Cursor, Claude Desktop and other MCP clients; Codex by hand</summary>

**Codex** (instead of `codex mcp add`) — add to `~/.codex/config.toml`:

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

## What you can do

Siljangnim isn't a gallery of demos to download and run. It's a studio: you set the direction, the agent
writes the code, and the work keeps changing for as long as you keep talking to it.

- **Make it by describing it** — "glowing jellyfish drifting in a dark sea", "a hatching drawing of this photo,
  denser where it's closer". The agent picks the tools (shaders, physics engines, geometry libraries, Python
  packages, ML models), writes a WebGL2 or WebGPU scene, fixes its own errors and looks at the result before answering.
- **Bring open Shadertoy code** — paste a shader that carries an open license (MIT, CC0, …) and it runs as
  written, buffers and channels included; the agent keeps the credit and won't port non-open ones.
- **Shape it in conversation** — "slower, sunset colours", "twice the particles", "give me a slider for that".
  Anything you want to play with becomes a control: sliders, knobs, 2D pads, menus, buttons, colours. Every
  change is a version you can go back to and branch from, and you can read the code it wrote.
- **Mix pieces together** — open an example's details and press **Mix in**: its scene and assets come into your
  project and the agent blends the two into one image. Or paste a piece someone shared and ask for a mashup.
- **Play it live** — mouse, keyboard, microphone and audio files, camera, MIDI controllers and OSC (TouchOSC,
  Ableton, TouchDesigner). Ask the agent to wire knob 1 to colour; press **Perform** to send the scene full
  screen to a projector. Or switch to **Timeline** and keyframe the controls.
- **Frame it** — landscape, portrait (9:16), square, or an exact size like 1080×1920 or 4K from the frame menu; scenes
  re-fit when the size changes mid-run.
- **Export it** — MP4, WebM or PNG frames: frame-exact offline renders at any size (vertical 1080×1920, 4K), or
  a realtime capture of what you played. The intro video above was recorded from the examples this way.
- **Pass it on** — a project exports as `project.md`: what was asked, which tools were used and how. Another
  person's agent rebuilds it from that, and keeps remixing.

Start from one of **70+ examples**, each built on an open-source project (REBOUND, Rapier, Three.js, Hydra,
p5.js, librosa, OpenCV, UMAP …) with its credits and license, and take it somewhere else.

[A longer walk-through of the creative workflow (Korean)](docs/creative.md).

## Under the hood

- *Siljangnim* (실장님) is what Korean design studios call the person who runs the floor: you say what you want,
  and they know which people and tools to bring in.
- **Open-source tools on your machine** — Python packages run in isolated environments and installed programs
  (ffmpeg, Blender, …) run after you approve. What worked is saved as a recipe, so next time it's instant, and
  recipes are shared through [registry/](registry/).
- **Bring your own agent** — Claude Code, Codex, Cursor or any MCP client drives the same studio as the built-in
  agent, which runs on Anthropic (Claude Opus 5.5 by default) or any OpenAI-compatible server (OpenAI, vLLM, Ollama, …).
- **Isolated scenes** — scene code runs on a separate origin and can't reach your projects or keys.

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
docs/       User guides (Korean)
```

Guides (Korean): [the creative workflow](docs/creative.md), [connecting an agent](docs/mcp.md), [tools on your machine](docs/local-tools.md), [sharing](docs/sharing.md), [models](docs/models.md).

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
