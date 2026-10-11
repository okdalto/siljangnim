# Siljangnim — guide for agents working on this repo

An agent-run creative studio: people describe a visual, the built-in agent writes a live scene,
checks it runs and looks right, and refines it. Being rebuilt as a desktop app (v2).
Read `docs/architecture.md` (overall plan) and `docs/studio.md` (the app's design) before
changing structure. Current work: `docs/m2.md`.

## Layout

- `studio/` — the app (React 19 + TypeScript strict + Vite + Tailwind 4 + zustand). **All new UI work goes here.**
  - `src/scene/` — scene format (`schema.ts`), RPC protocol (`protocol.ts`), app-side host (`host.ts`),
    runtime that runs inside the iframe (`runtime/`), WebGL helpers (`gl/`; `.js` files are ported v1 code).
  - `src/agent/` — LLM providers (`llm/`), tool registry (`tools.ts`), scene tools, loop, system prompt.
  - `src/project/` — IndexedDB store. `src/app/` — UI, state (`state.ts`), controller (`session.ts`).
  - `server/llmForward.js` — LLM forwarder shared by the Vite dev server and the desktop main process.
- `desktop/` — Electron shell: `app://` protocol, key storage, hub process, packaging, smoke test.
- `hub/` — Python sidecar (FastAPI, uv-managed). Stage 2 turns it into the MCP server.
- `frontend/`, `backend/` — **v1, legacy.** Still deployed to siljangnim.vercel.app. Read them to port
  features; don't build on them. Retired when the studio reaches parity (M3).

## Commands (repo root)

| | |
|---|---|
| `npm install` | installs studio + desktop (Electron, bundled uv) |
| `npm run dev` | desktop app with hot reload |
| `npm run web` | studio in a browser, http://localhost:5173 |
| `npm run check` | typecheck + lint (studio) |
| `npm test` | studio unit tests (vitest) + hub tests (pytest via bundled uv) |
| `npm run smoke` | stage, launch Electron in a throwaway profile, run one agent session against a mock Anthropic server; report in `desktop/release/smoke/` |
| `npm run dist` | installer for the current platform |

Run `check`, `test` and `smoke` before every push; CI runs the same (Linux needs `xvfb-run -a`).

## Invariants — don't break these

- **Scene code is untrusted.** It runs only in the scene iframe on a separate origin (`app://scene`;
  `127.0.0.1` vs `localhost` in dev) under the CSP in `studio/vite.config.ts`. Never run scene/agent
  code in the app window, never pass secrets (API keys, hub token, forwarder token) into the iframe,
  and never add `allow-same-origin` to anything served from the app's origin.
- **API keys stay in the desktop main process** (`desktop/src/keys.js`, safeStorage). The renderer
  only learns whether a key exists. The `app://siljangnim/api/llm/*` forwarder accepts only requests
  with the per-launch `x-siljangnim-token` (Electron strips `Origin` for custom protocols, so origin
  checks don't work there).
- **Conversations are append-only.** Assistant turns go back to the API unchanged (thinking blocks
  included). Never edit or trim earlier turns; drop a whole turn instead (see `agent/loop.ts`).
- **Tools are defined once** in `studio/src/agent/` with a zod input schema, validated in `runTool`
  before running (tool input streams eagerly and is not validated by the API). Stage 2 exposes the
  same definitions over MCP — keep tools free of UI code; they act through `SceneController`/`ToolEnv`.
- **Agent tool results must be actionable**: structured errors with line numbers/excerpts, never
  "something went wrong".
- **The system prompt is a cached prefix.** Keep `agent/prompt.ts` byte-stable across turns (no
  timestamps, no per-request data); put per-request context in messages. Keep its ctx reference in
  sync with `scene/runtime/ctx.ts`.
- Use the Anthropic TypeScript SDK for Claude (not raw fetch). Default model `claude-opus-5-5`;
  model IDs exactly as in `agent/llm/anthropic.ts`. Forced `tool_choice` is rejected by current
  models — use `auto`.

## Gotchas already hit

- **npm 10 (bundled with Node 22) crashes resolving vitest's peers** (`Cannot read properties of null
  (reading 'edgesOut')`) when *creating* a lockfile. Create/update lockfiles with
  `npx -y npm@11 install`; `npm ci` with npm 10 works fine afterwards.
- Pin new dependencies to exact versions at least two weeks old.
- WebGL: the runtime rebinds the default framebuffer and resets the viewport before every render;
  canvases are resized after context creation, so code that assumes the initial viewport breaks.
- Captures must be taken right after a render in the same task (`preserveDrawingBuffer` is off);
  `SceneRunner.capture` handles this — reuse it.
- React StrictMode double-runs effects in dev; anything created in an effect (SceneHost) must clean up.
- Vite HTML placeholders: use `__NAME__`, not `%NAME%` (Vite's env syntax swallows it).
- The scene iframe can't fetch `app://siljangnim` (CSP) — that's intended.

## Conventions

- TypeScript strict, no `any` escapes without a comment. Match surrounding style; comments explain
  *why*, sparingly.
- Every feature: unit tests for logic; extend the smoke scenario (`desktop/scripts/mockAnthropic.mjs`,
  `desktop/src/smoke.js`) when it adds an agent-visible capability.
- Update `docs/` when a design decision changes. Docs are written in Korean; code and comments in English.
- UI strings are English for now.
