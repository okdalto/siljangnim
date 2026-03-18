import { useRef } from "react";

/**
 * Keep a ref always in sync with the latest value.
 * Useful when callbacks need access to current state without re-creating.
 */
export function useSyncRef(value) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
