/**
 * GitHubAuthButton — Login / Device Flow UI / User display.
 */
export default function GitHubAuthButton({
  isAuthenticated,
  user,
  loading,
  deviceFlow,
  onLogin,
  onLogout,
  onCancelLogin,
  clientIdConfigured,
}) {
  if (!clientIdConfigured) return null;

  // Device Flow in progress — show user_code
  if (deviceFlow) {
    return (
      <div
        className="flex items-center gap-2 px-2 py-1.5 rounded text-xs"
        style={{ background: "var(--input-bg)", color: "var(--chrome-text)" }}
      >
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-sm tracking-wider" style={{ color: "#58a6ff" }}>
              {deviceFlow.user_code}
            </span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(deviceFlow.user_code).catch(() => {});
              }}
              className="text-[10px] px-1.5 py-0.5 rounded hover:bg-white/10 transition-colors"
              style={{ color: "var(--chrome-text-muted)" }}
              title="Copy code"
            >
              Copy
            </button>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={deviceFlow.verification_uri}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] underline hover:no-underline"
              style={{ color: "#58a6ff" }}
            >
              Open GitHub
            </a>
            <div className="w-3 h-3 border border-zinc-500 border-t-zinc-300 rounded-full animate-spin" />
            <button
              onClick={onCancelLogin}
              className="text-[10px] hover:underline"
              style={{ color: "var(--chrome-text-muted)" }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Authenticated — show user info
  if (isAuthenticated && user) {
    return (
      <div className="flex items-center gap-2">
        <img
          src={user.avatar_url}
          alt={user.login}
          className="w-5 h-5 rounded-full"
        />
        <span className="text-[11px] font-medium" style={{ color: "var(--chrome-text-secondary)" }}>
          {user.login}
        </span>
        <button
          onClick={onLogout}
          className="text-[10px] px-1.5 py-0.5 rounded hover:bg-white/10 transition-colors"
          style={{ color: "var(--chrome-text-muted)" }}
        >
          Logout
        </button>
      </div>
    );
  }

  // Not authenticated — show login button
  return (
    <button
      onClick={onLogin}
      disabled={loading}
      className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded transition-colors"
      style={{
        color: "var(--chrome-text-secondary)",
        background: "var(--input-bg)",
        opacity: loading ? 0.6 : 1,
      }}
    >
      {/* GitHub icon */}
      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
      </svg>
      {loading ? "..." : "Login with GitHub"}
    </button>
  );
}
