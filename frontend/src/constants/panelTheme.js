/**
 * App theme CSS injected into every panel iframe.
 * Matches the main app's dark theme so custom HTML blends seamlessly.
 */

const PANEL_THEME_CSS = `<style data-panel-theme>
:root {
  --bg-primary: #18181b;
  --bg-secondary: #27272a;
  --bg-tertiary: #3f3f46;
  --border: #3f3f46;
  --text-primary: #e4e4e7;
  --text-secondary: #a1a1aa;
  --text-muted: #71717a;
  --accent: #6366f1;
  --accent-hover: #818cf8;
  --accent-muted: rgba(99,102,241,0.2);
  --danger: #ef4444;
  --success: #22c55e;
}

*, *::before, *::after { box-sizing: border-box; }

body {
  margin: 0;
  padding: 8px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: Inter, system-ui, -apple-system, sans-serif;
  font-size: 12px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

/* ── Form elements ────────────────────────────────────── */

input[type="text"],
input[type="number"],
input[type="search"],
textarea,
select {
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 12px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s;
}
input:focus, textarea:focus, select:focus {
  border-color: var(--accent);
}

input[type="range"] {
  accent-color: var(--accent);
  width: 100%;
}

button {
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 4px 12px;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
button:hover {
  background: var(--bg-tertiary);
  border-color: var(--accent);
}
button:active {
  background: var(--accent-muted);
}

label {
  color: var(--text-secondary);
  font-size: 11px;
}

/* ── Utility classes ──────────────────────────────────── */

.panel-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.panel-stack {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.panel-section {
  padding: 8px 0;
}
.panel-section + .panel-section {
  border-top: 1px solid var(--border);
}

.panel-separator {
  height: 1px;
  background: var(--border);
  margin: 8px 0;
}

/* ── Scrollbar ────────────────────────────────────────── */

::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--bg-tertiary); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }

/* ── Canvas reset ─────────────────────────────────────── */

canvas { display: block; }
</style>`;

export default PANEL_THEME_CSS;
