# Connecting a model

[한국어](../models.md)

Pick the app chat's agent under **Agent** in **Settings** (gear icon).

- **Claude Code / Codex (desktop app)** — the Claude Code or Codex installed on your computer runs the chat. No API key:
  it runs on your Claude (Pro, Max, Team) or ChatGPT plan. If it isn't installed or signed in yet, the **Install** and
  **Sign in** buttons in Settings do it (you finish signing in in your browser). It uses Siljangnim's tools and can read
  files and search the web, but doesn't run commands or edit files; running code on your computer still asks you first.
- **API key** — the models in the table below, with an API key. This is the only option on the web.

When you connect Claude Code from a terminal over MCP instead ([connecting an agent](mcp.md)), it uses that agent's model,
so there's nothing to set here.

| Provider | What you need |
|---|---|
| **Anthropic** | An Anthropic API key. The default model is Claude Opus 5.5, and you can choose the thinking depth (effort). |
| **OpenAI** | An OpenAI API key. Pick from the model list. |
| **Custom** | The address of an OpenAI-compatible server (vLLM, Ollama, LM Studio, OpenRouter, Together, Groq and others). A key only if the server requires one. |

- **Key storage:** the desktop app stores keys encrypted with the OS keychain, and keys never reach the app window. The
  web version keeps them only in that browser tab and sends them only to the model provider.
- **Cost:** cloud models bill per token. A complex scene takes many rounds, so one conversation can cost a few dollars.

## Self-hosted models (Custom)

The server must support the OpenAI Chat Completions API (`/v1/chat/completions`) and **tool calling (function
calling)**. Models without tool calling can't make scenes.

- **Ollama** — run `ollama serve`, then set Server URL to `http://localhost:11434/v1` and the model name (for example
  `qwen2.5-coder:32b`).
- **vLLM** — run `vllm serve <model> --enable-auto-tool-choice --tool-call-parser hermes`, then use
  `http://<address>:8000/v1`.
- **OpenRouter, Together, Groq and others** — each service's OpenAI-compatible address and key.

The web version can connect only to **public https servers**. Use the desktop app for servers on your own computer or
your internal network.

Large models that are strong at coding and reliable at tool calling give better results. Small models often get stuck
while fixing shader errors.
