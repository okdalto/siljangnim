import { useState, useCallback } from "react";

export default function ButtonControl({ ctrl, onUniformChange }) {
  const [firing, setFiring] = useState(false);

  const handleClick = useCallback(() => {
    onUniformChange?.(ctrl.uniform, 1.0);
    setFiring(true);
    setTimeout(() => {
      onUniformChange?.(ctrl.uniform, 0.0);
      setFiring(false);
    }, 100);
  }, [ctrl.uniform, onUniformChange]);

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={firing}
      className={`w-full text-xs font-medium px-3 py-1.5 rounded transition-colors ${
        firing
          ? "bg-indigo-400 text-white"
          : "bg-zinc-700 hover:bg-zinc-600 text-zinc-300"
      }`}
    >
      {ctrl.label}
    </button>
  );
}
