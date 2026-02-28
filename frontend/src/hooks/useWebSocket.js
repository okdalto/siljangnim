import { useCallback, useEffect, useRef, useState } from "react";

export default function useWebSocket(url, onMessage) {
  const wsRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    let cancelled = false;
    let reconnectTimer = null;
    let ws = null;

    function cleanup() {
      if (ws) {
        // Remove handlers before closing to prevent onclose from triggering reconnect
        ws.onopen = null;
        ws.onclose = null;
        ws.onmessage = null;
        ws.onerror = null;
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
        ws = null;
      }
    }

    function connect() {
      cleanup();
      if (cancelled) return;

      ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!cancelled) setConnected(true);
      };
      ws.onclose = () => {
        if (!cancelled) {
          setConnected(false);
          reconnectTimer = setTimeout(connect, 2000);
        }
      };
      ws.onerror = () => {
        // onclose will fire after onerror, so reconnect happens there
      };
      ws.onmessage = (event) => {
        try {
          onMessageRef.current?.(JSON.parse(event.data));
        } catch {
          onMessageRef.current?.(event.data);
        }
      };
    }

    connect();

    return () => {
      cancelled = true;
      clearTimeout(reconnectTimer);
      cleanup();
      wsRef.current = null;
      setConnected(false);
    };
  }, [url]);

  const send = useCallback((data) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(typeof data === "string" ? data : JSON.stringify(data));
    }
  }, []);

  return { connected, send };
}
