# Connecting an agent (Claude Code, Codex and others)

[한국어](../mcp.md)

Attach Siljangnim to an agent such as Claude Code or Codex, and you can chat with the agent while seeing the results
right away in the Siljangnim viewer. The agent makes and changes scenes, and captures the screen to check them itself.

## Install

You need [Node.js 22 or newer](https://nodejs.org).

**Claude Code** — in a terminal:

```bash
claude mcp add siljangnim -- npx -y siljangnim-mcp@latest
```

Or paste this into Claude Code: "Install the Siljangnim MCP server: `claude mcp add siljangnim -- npx -y siljangnim-mcp@latest`".
After installing, restart Claude Code.

**Codex** — run one command in your normal terminal, outside the agent:

```bash
npx -y siljangnim-mcp@latest setup codex
```

Setup checks Node.js 22+ and the Codex CLI, registers and reads back the server configuration, then verifies
an MCP handshake and opens a test viewer. No manual config edit is needed: long calls return a tracking ID
within 45 seconds, so `tool_timeout_sec = 120` is optional.
The temporary test session closes after verification. Close its tab, fully quit and restart Codex;
a new viewer opens automatically when Codex starts the server. Setup does not verify the current Codex conversation.

Rerun the same command to update the registration. If Codex is missing, install the CLI and confirm
`codex --version` works first. If the viewer check fails after registration, registration remains saved;
open the logged URL or fix the reported problem and rerun setup. If the agent sandbox blocks config writes,
run setup in your normal terminal.

**Cursor, Claude Desktop, Windsurf and others** — in the client's MCP settings file:

```json
{
  "mcpServers": {
    "siljangnim": { "command": "npx", "args": ["-y", "siljangnim-mcp@latest"] }
  }
}
```

To remove it: `claude mcp remove siljangnim` (for Codex and others, delete the entry from the settings).

## How to use it

- Ask your agent to "use siljangnim to make …". The first time it uses a tool, the viewer (`http://localhost:47823`)
  opens in your browser.
- You chat on the agent's side, and the viewer's **Activity** tab shows what the agent did. Controls, History, Assets
  and recording work as usual.
- **If the Siljangnim desktop app is open**, its window becomes the viewer instead of the browser, and the app's
  projects and recipes are used as they are.
- Long-running tool calls return a tracking ID. Instead of running the original tool again, the agent keeps checking
  for that same call's result with `viewer_call_status`. This ID is different from the `job_status` ID of a Python job.
  Finished results are kept for 10 minutes, and results that were already fetched may be cleared first when the
  storage limit is reached.
- When a Python package or program needs to run, an approval card appears in the viewer. If several requests arrive
  at once, they're shown one after another. If the approval wait times out, nothing runs and the call ends; calling the
  tool again shows a new approval card. See [Running tools on your machine](local-tools.md) for details.
- Projects are saved in browser storage. Open the viewer on the same port to see your earlier projects.

## Options

You can change these with environment variables (put them in `env` in the MCP settings).

| Variable | Meaning |
|---|---|
| `SILJANGNIM_PORT` | Viewer port. Default 47823. If it's already in use, the viewer opens on another port, and your earlier projects won't show. |
| `SILJANGNIM_OPEN_ON_CONNECT=1` | Open the viewer when the server starts. Set by `setup codex`. |
| `SILJANGNIM_OPEN=0` | Don't open the browser automatically (the address is written to the log). |
| `SILJANGNIM_OPEN_COMMAND` | Program that opens the viewer (gets the address as an argument). For opening it in a specific browser. |
| `SILJANGNIM_VIEWER=browser` | Use the browser even when the desktop app is open. |

## Troubleshooting

- **The viewer doesn't open** — ask the agent to "open the siljangnim viewer." If that doesn't work, open the address
  printed in the log yourself.
- **My earlier projects don't show** — the viewer may have opened on a different port. Quit whatever else is using
  47823 and restart.
- **The first Python tool takes a long time** — the first time, uv and Python are downloaded into `~/.siljangnim/runtime/`.
- **A new version isn't picked up** — check that your settings say `siljangnim-mcp@latest`.

## Security

The viewer server listens only on this computer (127.0.0.1), and connecting requires a token that changes on every
launch. Scene code runs on a separate origin and can't reach your projects or keys. Don't expose it to the network.
