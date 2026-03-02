import { useEffect, useRef } from "react";

export default function useExternalUniformChange(uniform, onValueChange) {
  const callbackRef = useRef(onValueChange);
  callbackRef.current = onValueChange;

  useEffect(() => {
    const handler = (e) => {
      if (e.detail.uniform === uniform) {
        callbackRef.current(e.detail.value);
      }
    };
    window.addEventListener("uniform-external-change", handler);
    return () => window.removeEventListener("uniform-external-change", handler);
  }, [uniform]);
}
