import { useSyncExternalStore } from "react";

/**
 * Lightweight toast notification system.
 *
 * Uses a module-level store so `showToast` can be imported and called from
 * anywhere (hooks, callbacks, non-component code) without needing a React
 * context provider.
 *
 * Usage:
 *   import { showToast } from "../hooks/useToast.js";
 *   showToast("Something happened");
 *   showToast("Oops", "error");
 *
 * To render the toasts, mount the <ToastContainer /> component once (see Toast.jsx).
 * It internally calls useToastStore() to subscribe to the store.
 */

let _nextId = 0;
let _toasts = [];          // Array of { id, message, level, removing }
const _listeners = new Set();

function emit() {
  _toasts = [..._toasts]; // new reference for useSyncExternalStore
  _listeners.forEach((fn) => fn());
}

/**
 * Show a toast notification.
 * @param {string} message
 * @param {"info"|"warn"|"error"} [level="info"]
 * @param {number} [duration=3000] auto-dismiss ms
 */
export function showToast(message, level = "info", duration = 3000) {
  const id = ++_nextId;
  _toasts = [..._toasts, { id, message, level, removing: false }];
  emit();

  // Start dismiss after `duration`
  setTimeout(() => dismissToast(id), duration);

  return id;
}

/**
 * Begin the exit animation, then remove after 300ms.
 */
export function dismissToast(id) {
  const idx = _toasts.findIndex((t) => t.id === id);
  if (idx === -1) return;
  // Mark as removing (triggers exit animation)
  _toasts = _toasts.map((t) => (t.id === id ? { ...t, removing: true } : t));
  emit();
  // Actually remove after animation
  setTimeout(() => {
    _toasts = _toasts.filter((t) => t.id !== id);
    emit();
  }, 300);
}

function getSnapshot() {
  return _toasts;
}

function subscribe(listener) {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}

/**
 * React hook to subscribe to the toast store.
 * Used internally by <ToastContainer />.
 */
export function useToastStore() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Convenience hook (returns showToast bound for component use).
 * Not strictly necessary since showToast is a plain export,
 * but matches the requested API.
 */
export default function useToast() {
  return { showToast, dismissToast };
}
