import { useToastStore, dismissToast } from "../hooks/useToast.js";

const LEVEL_STYLES = {
  info: {
    bg: "var(--chrome-bg-elevated, #27272a)",
    border: "var(--accent, #6366f1)",
    icon: "ℹ",
  },
  warn: {
    bg: "var(--chrome-bg-elevated, #27272a)",
    border: "#f59e0b",
    icon: "⚠",
  },
  error: {
    bg: "var(--chrome-bg-elevated, #27272a)",
    border: "#ef4444",
    icon: "✕",
  },
};

function ToastItem({ toast }) {
  const { bg, border, icon } = LEVEL_STYLES[toast.level] || LEVEL_STYLES.info;

  return (
    <div
      role="alert"
      onClick={() => dismissToast(toast.id)}
      style={{
        background: bg,
        borderLeft: `3px solid ${border}`,
        color: "var(--chrome-text, #d4d4d8)",
        padding: "10px 16px",
        borderRadius: 8,
        fontSize: 13,
        lineHeight: 1.4,
        maxWidth: 360,
        boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 8,
        pointerEvents: "auto",
        animation: toast.removing
          ? "toast-out 0.3s ease forwards"
          : "toast-in 0.3s ease forwards",
      }}
    >
      <span style={{ fontSize: 15, flexShrink: 0 }}>{icon}</span>
      <span>{toast.message}</span>
    </div>
  );
}

/**
 * Mount this once at the app root. It renders all active toasts
 * at the bottom-center of the viewport.
 */
export default function ToastContainer() {
  const toasts = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <>
      {/* Keyframe animations injected once */}
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes toast-out {
          from { opacity: 1; transform: translateY(0); }
          to   { opacity: 0; transform: translateY(16px); }
        }
      `}</style>

      <div
        style={{
          position: "fixed",
          bottom: 24,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 99999,
          display: "flex",
          flexDirection: "column-reverse",
          alignItems: "center",
          gap: 8,
          pointerEvents: "none",
        }}
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} />
        ))}
      </div>
    </>
  );
}
