# siljangnim

AI-powered real-time graphics creation tool. Describe visuals in natural language — Claude generates WebGL2 shaders that render live in your browser.

![WebGL2](https://img.shields.io/badge/WebGL2-ES_3.0-blue)
![License](https://img.shields.io/badge/license-GPLv3-green)

## Warnings

> **Security** — The AI agent can execute arbitrary Python code on the host machine. There is no container or OS-level sandbox. **Do not expose this application to the public internet.** See [Security Notice](#security-notice) for details.

> **Cost** — Every chat message calls the Anthropic API. Complex scenes may trigger multiple tool-use rounds per prompt, each consuming tokens. A single conversation can easily use **$1–5+ of API credits**. Monitor your usage at [console.anthropic.com](https://console.anthropic.com/).

## Quick Start

**Prerequisites:** Python 3.10+, Node.js 18+, [Anthropic API key](https://console.anthropic.com/)

```bash
git clone https://github.com/okdalto/siljangnim.git
cd siljangnim
chmod +x run.sh
./run.sh
```

Open **http://localhost:5173**. Enter your API key when prompted — it saves to `backend/.env` automatically.

<details>
<summary><strong>Manual setup</strong></summary>

```bash
# Backend
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env   # optional
uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# Frontend (new terminal)
cd frontend
npm install
npm run dev -- --host 0.0.0.0 --port 5173
```

</details>

## Features

- **Natural Language Shader Generation** — Describe what you want in chat; Claude generates GLSL shaders
- **Multi-Pass Rendering** — Buffer chaining (BufferA/B/C/D), ping-pong double buffering, feedback loops
- **2D & 3D** — Fullscreen shader art and 3D geometry (box, sphere, plane)
- **Interactive UI Controls** — Auto-generated sliders, 2D pads, 3D camera controls, color pickers
- **Image Textures** — Upload images and use them as shader textures
- **Timeline** — Play/pause, time scrubbing, loop/once toggle
- **Project Management** — Save and load entire projects with scenes, chat history, and uploads

## Usage

1. **Describe the visuals you want in the chat**
   > "Create a shader with blue waves slowly moving across the screen"

2. **See results in the viewport** — Shaders are compiled and rendered automatically

3. **Adjust parameters in the Inspector** — Sliders, color pickers, and other controls are auto-generated

4. **Control animation with the timeline** — Scrub, loop, and adjust duration

5. **Save your project and load it later**

| Key | Action |
|-----|--------|
| `Space` | Toggle play / pause |

## Project Structure

```
siljangnim/
├── backend/
│   ├── main.py           # FastAPI server + WebSocket
│   ├── agents.py         # Claude agent (shader generation + UI control)
│   ├── workspace.py      # Sandboxed file I/O
│   ├── projects.py       # Project save/load
│   └── config.py         # API key management
├── frontend/
│   ├── src/
│   │   ├── App.jsx       # Main app + state management
│   │   ├── engine/       # GLEngine (WebGL2 renderer)
│   │   ├── nodes/        # ReactFlow nodes (chat, viewport, inspector, etc.)
│   │   └── components/   # Toolbar, Timeline, SnapGuides
│   └── package.json
├── .workspace/           # Runtime data (scenes, uploads, projects)
└── run.sh                # One-click startup script
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, Vite, TailwindCSS v4, @xyflow/react |
| Rendering | WebGL2 (ES 3.0), custom GLEngine |
| Backend | FastAPI, WebSocket, Uvicorn |
| AI | Anthropic Claude API (tool calling) |

## Security Notice

The AI agent can execute arbitrary Python code and whitelisted shell commands (`pip`, `ffmpeg`, `ffprobe`, `convert`, `magick`) on the host machine via `run_python` and `run_command` tools. While execution is restricted to the `.workspace/` working directory and shell commands are limited to a whitelist, **the Python code runs with the same permissions as the backend process** — there is no container or OS-level sandbox.

This means a prompt injection attack (e.g., via a maliciously crafted uploaded file) could potentially:
- Read or write files accessible to the backend process
- Install arbitrary packages via `pip`
- Exfiltrate data through installed packages or network calls

**Do not expose this application to the public internet.** It is designed for local, single-user use only. If you must run it on a shared network, place it behind authentication and consider running the backend inside a container.

## License

[GPLv3](LICENSE)
