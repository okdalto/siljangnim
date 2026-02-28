# siljangnim

AI-powered real-time graphics creation tool. Describe the visuals you want in natural language, and Claude generates WebGL2 shaders that render directly in your browser.

![WebGL2](https://img.shields.io/badge/WebGL2-ES_3.0-blue)
![License](https://img.shields.io/badge/license-GPLv3-green)

## Features

- **Natural Language Shader Generation** — Describe what you want in chat; Claude generates GLSL shaders
- **Multi-Pass Rendering** — Buffer chaining (BufferA/B/C/D), ping-pong double buffering, feedback loops
- **2D & 3D** — Fullscreen shader art and 3D geometry (box, sphere, plane)
- **Interactive UI Controls** — Auto-generated sliders, 2D pads, 3D camera controls, color pickers
- **Image Textures** — Upload images and use them as shader textures
- **Timeline** — Play/pause, time scrubbing, loop/once toggle
- **Project Management** — Save and load entire projects with scenes, chat history, and uploads

## Quick Start

### Prerequisites

- Python 3.10+
- Node.js 18+
- [Anthropic API key](https://console.anthropic.com/)

### Run

```bash
git clone https://github.com/okdalto/siljangnim.git
cd siljangnim
./run.sh
```

`run.sh` automatically:
1. Creates a Python venv and installs backend dependencies
2. Installs frontend npm packages
3. Starts backend (`localhost:8000`) + frontend (`localhost:5173`)

Open `http://localhost:5173` in your browser. You'll be prompted to enter your API key on first launch.

### Manual Setup

```bash
# Backend
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Save API key to .env (optional — can also enter via UI)
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env

uvicorn main:app --host 0.0.0.0 --port 8000

# Frontend (new terminal)
cd frontend
npm install
npm run dev
```

## Usage

1. **Describe the visuals you want in the chat**
   > "Create a shader with blue waves slowly moving across the screen"

2. **See results in the viewport** — Shaders are compiled and rendered automatically

3. **Adjust parameters in the Inspector** — Sliders, color pickers, and other controls are auto-generated

4. **Control animation with the timeline** — Scrub, loop, and adjust duration

5. **Save your project and load it later**

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Toggle play / pause |
| Click viewport, then keyboard | Send key inputs to shader |

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

## License

[GPLv3](LICENSE)
