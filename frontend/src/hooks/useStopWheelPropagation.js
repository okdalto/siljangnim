import { useEffect } from "react";

export default function useStopWheelPropagation(ref) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = (e) => e.stopPropagation();
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [ref]);
}
