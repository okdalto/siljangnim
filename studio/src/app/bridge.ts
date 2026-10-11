// Viewer side of the MCP bridge (mcp/src/bridge.js): runs the tools an
// external agent calls and reports the connection in the UI.
import { runExternalTool, setExternal } from "./session";

const RETRY_MAX_MS = 5_000;
/** Reconnect attempts (about 20 s) before deciding the agent session is gone. */
const MAX_ATTEMPTS = 8;

type BridgeMessage =
  | { type: "client"; name: string }
  | { type: "call"; id: number; name: string; input: unknown }
  | { type: "replaced" };

export function connectBridge(token: string): void {
  let attempt = 0;
  let finished = false;
  let client: string | null = null;
  setExternal({ status: "connecting", client });

  const connect = () => {
    const ws = new WebSocket(`ws://${window.location.host}/bridge`);
    ws.onopen = () => ws.send(JSON.stringify({ type: "hello", token }));
    ws.onmessage = (e: MessageEvent<string>) => {
      let message: BridgeMessage;
      try {
        message = JSON.parse(e.data) as BridgeMessage;
      } catch {
        return;
      }
      if (message.type === "client") {
        attempt = 0;
        client = prettyClient(message.name);
        setExternal({ status: "connected", client });
      } else if (message.type === "call") {
        void runExternalTool(message.name, message.input).then((output) => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "result", id: message.id, output }));
        });
      } else if (message.type === "replaced") {
        finished = true;
        setExternal({ status: "replaced", client });
      }
    };
    ws.onclose = (e) => {
      if (finished) return;
      // 4003: the token is from a bridge that has since restarted (the agent session ended).
      if (e.code === 4003) {
        finished = true;
        setExternal({ status: "ended", client });
        return;
      }
      // The bridge exits with the agent session; a new session opens a new tab.
      if (attempt >= MAX_ATTEMPTS) {
        finished = true;
        setExternal({ status: "ended", client });
        return;
      }
      setExternal({ status: "reconnecting", client });
      setTimeout(connect, Math.min(RETRY_MAX_MS, 500 * 2 ** attempt++));
    };
  };
  connect();
}

/** MCP client ids → names people know. */
function prettyClient(name: string): string {
  const known: Record<string, string> = { "claude-code": "Claude Code", codex: "Codex", "codex-mcp-client": "Codex", cursor: "Cursor" };
  return known[name] ?? name;
}
