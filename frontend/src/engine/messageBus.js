/**
 * In-process message bus — replaces WebSocket communication.
 *
 * send(data) → routes to AgentEngine.handleMessage()
 * dispatch(msg) → delivers to registered React listeners
 */

export default class MessageBus {
  constructor() {
    this._listeners = new Set();
    this._engine = null; // set via setEngine()
  }

  /** Link the AgentEngine that will process incoming messages. */
  setEngine(engine) {
    this._engine = engine;
  }

  /** Subscribe to messages dispatched from the engine → React. */
  onMessage(callback) {
    this._listeners.add(callback);
    return () => this._listeners.delete(callback);
  }

  /** Send a message from React → AgentEngine (replaces ws.send). */
  send(data) {
    const msg = typeof data === "string" ? JSON.parse(data) : data;
    if (this._engine) {
      // Use microtask to avoid synchronous re-entry
      Promise.resolve().then(() => this._engine.handleMessage(msg));
    }
  }

  /** Dispatch a message from AgentEngine → React listeners (replaces ws broadcast). */
  dispatch(msg) {
    for (const listener of this._listeners) {
      try {
        listener(msg);
      } catch (err) {
        console.error("[MessageBus] listener error:", err);
      }
    }
  }
}
