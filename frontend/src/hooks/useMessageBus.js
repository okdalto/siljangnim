/**
 * React hook — drop-in replacement for useWebSocket.
 *
 * Returns { connected: true, send } with the same interface.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export default function useMessageBus(messageBus, onMessage) {
  const [connected, setConnected] = useState(false);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    if (!messageBus) return;

    const unsub = messageBus.onMessage((msg) => {
      onMessageRef.current?.(msg);
    });

    setConnected(true);

    return () => {
      unsub();
      setConnected(false);
    };
  }, [messageBus]);

  const send = useCallback(
    (data) => {
      if (messageBus) messageBus.send(data);
    },
    [messageBus]
  );

  return { connected, send };
}
