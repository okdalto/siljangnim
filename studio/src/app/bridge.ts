// Viewer side of the MCP bridge (mcp/src/bridge.js): runs the tools an
// external agent calls and reports the connection in the UI.
import { setHubProvider } from "./hubClient";
import { runExternalTool, setExternal } from "./session";
import { useApp } from "./state";

const RETRY_MAX_MS = 5_000;
/** Reconnect attempts (about 20 s) before deciding the agent session is gone. */
const MAX_ATTEMPTS = 8;

type BridgeMessage =
  | { type: "client"; name: string }
  | { type: "hub"; id: number; url?: string; token?: string; error?: string }
  | { type: "call"; id: number; name: string; input: unknown }
  | { type: "replaced" };

export interface BridgeOptions {
  /** The bridge's WebSocket; the browser viewer is served by the bridge itself. */
  url?: string;
  /**
   * The desktop app attached to a bridge: it keeps its own runtime hub, and
   * when the agent's session ends it goes back to its own chat.
   */
  desktop?: boolean;
}

/** The connection in use; a newer bridge replaces it. */
let current: { close(): void } | null = null;

export function connectBridge(token: string, options: BridgeOptions = {}): void {
  current?.close();
  let attempt = 0;
  let finished = false;
  let client: string | null = null;
  setExternal({ status: "connecting", client });
  let socket: WebSocket | null = null;
  let hubRequests = 0;
  const hubWaiters = new Map<number, (access: { url: string; token: string } | string) => void>();
  const self = {
    close() {
      finished = true;
      socket?.close();
    },
  };
  current = self;
  // The desktop app shows the ended session briefly, then its own chat again.
  const end = (status: "ended" | "replaced") => {
    finished = true;
    setExternal({ status, client });
    if (!options.desktop) return;
    if (current === self) current = null;
    setTimeout(() => {
      if (current) return;
      setExternal(null);
      useApp.setState({ notice: { kind: "info", text: `${client ?? "The agent"} disconnected. The chat here is yours again.` } });
    }, 3000);
  };

  // The runtime hub is started by the bridge on first use and handed to this
  // (authenticated) viewer only. The desktop app has its own.
  if (!options.desktop) setHubProvider(
    () =>
      new Promise((resolve) => {
        if (socket?.readyState !== WebSocket.OPEN) return resolve("The viewer is not connected to the agent's bridge right now.");
        const id = ++hubRequests;
        hubWaiters.set(id, resolve);
        socket.send(JSON.stringify({ type: "hub_request", id }));
      }),
  );

  const connect = () => {
    if (finished) return;
    const ws = new WebSocket(options.url ?? `ws://${window.location.host}/bridge`);
    socket = ws;
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
      } else if (message.type === "hub") {
        const waiter = hubWaiters.get(message.id);
        hubWaiters.delete(message.id);
        waiter?.(message.url && message.token ? { url: message.url, token: message.token } : (message.error ?? "The runtime hub is unavailable."));
      } else if (message.type === "replaced") {
        end("replaced");
      }
    };
    ws.onclose = (e) => {
      for (const resolve of hubWaiters.values()) resolve("The connection to the agent's bridge was lost.");
      hubWaiters.clear();
      if (finished) return;
      // 4003: the token is from a bridge that has since restarted (the agent session ended).
      // 4004: the bridge stopped with the agent session.
      if (e.code === 4003 || e.code === 4004) return end("ended");
      // The bridge exits with the agent session; a new session opens a new tab.
      if (attempt >= MAX_ATTEMPTS) return end("ended");
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
