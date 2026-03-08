import { useState, useEffect, useCallback } from "react";
import {
  listUserRepos,
  listBranches,
  createRepo,
  commitProjectToRepo,
  readWorkspaceManifest,
  updateWorkspaceManifest,
} from "../engine/github.js";
import {
  MANIFEST_FILENAME,
  createProjectManifest,
  buildProvenanceGitHub,
  createWorkspaceManifest,
} from "../engine/portableSchema.js";
import * as storageApi from "../engine/storage.js";

export default function GitHubSaveDialog({ token, user, projectName, captureThumbnail, onClose, onSaved }) {
  const [mode, setMode] = useState("choose"); // choose | new | existing
  const [repos, setRepos] = useState([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState(null);
  const [newRepoName, setNewRepoName] = useState(projectName || "");
  const [newRepoDesc, setNewRepoDesc] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [projectPath, setProjectPath] = useState("");
  const [commitMessage, setCommitMessage] = useState("Save project from Siljangnim");
  const [branch, setBranch] = useState("main");
  const [branches, setBranches] = useState([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [step, setStep] = useState(1); // 1: choose repo, 2: configure, 3: saving
  const [thumbnailUrl, setThumbnailUrl] = useState(null);
  const [includeThumbnail, setIncludeThumbnail] = useState(true);

  // Capture thumbnail on mount
  useEffect(() => {
    try {
      const url = captureThumbnail?.();
      if (url) setThumbnailUrl(url);
    } catch { /* ignore */ }
  }, [captureThumbnail]);

  // Load user repos
  useEffect(() => {
    if (!token) return;
    setLoadingRepos(true);
    listUserRepos(token, { sort: "updated", per_page: 50 })
      .then(setRepos)
      .catch((e) => setError(e.message))
      .finally(() => setLoadingRepos(false));
  }, [token]);

  // Load branches when a repo is selected
  useEffect(() => {
    if (!token || !selectedRepo) return;
    const [owner, repoName] = selectedRepo.full_name.split("/");
    setLoadingBranches(true);
    listBranches(token, owner, repoName)
      .then((bs) => {
        setBranches(bs.map((b) => b.name));
        if (!bs.some((b) => b.name === branch)) {
          setBranch(bs[0]?.name || "main");
        }
      })
      .catch(() => setBranches(["main"]))
      .finally(() => setLoadingBranches(false));
  }, [token, selectedRepo]);

  const handleCreateAndPush = useCallback(async () => {
    setSaving(true);
    setError(null);
    setStep(3);
    try {
      // Collect project files
      const files = await collectProjectFiles(projectName);

      // Always re-capture thumbnail and rebuild README so the image is fresh on every push
      let thumbData = null;
      if (includeThumbnail) {
        // Try live capture first, fall back to the one captured on dialog mount
        let url = null;
        try { url = captureThumbnail?.(); } catch { /* ignore */ }
        if (!url) url = thumbnailUrl;
        if (url) {
          thumbData = url.includes(",") ? url.split(",")[1] : url;
          files.push({ path: "thumbnail.jpg", content: thumbData, encoding: "base64" });
        }
      }

      // Always push README — include thumbnail reference only if we have one
      const displayName = newRepoName || projectName || "Untitled";
      const readme = buildReadme(displayName, newRepoDesc, !!thumbData);
      files.push({ path: "README.md", content: readme });

      if (mode === "new") {
        // Create new repo
        const repo = await createRepo(token, newRepoName, newRepoDesc, isPrivate);
        // Wait a moment for GitHub to initialise
        await new Promise((r) => setTimeout(r, 1500));
        // Push files
        await commitProjectToRepo(
          token, user.login, repo.name, projectPath, files, commitMessage, branch
        );
        onSaved?.({
          owner: user.login,
          repo: repo.name,
          path: projectPath,
        });
      } else {
        // Existing repo
        const [owner, repoName] = selectedRepo.full_name.split("/");

        // Check if workspace manifest exists
        const { manifest: wsManifest, sha: wsSha } = await readWorkspaceManifest(token, owner, repoName, branch);

        if (wsManifest) {
          // Multi-project repo — add/update project entry
          const existingIdx = wsManifest.projects?.findIndex((p) => p.path === projectPath);
          if (existingIdx >= 0) {
            wsManifest.projects[existingIdx].display_name = projectName;
          } else {
            wsManifest.projects = wsManifest.projects || [];
            wsManifest.projects.push({ path: projectPath || projectName, display_name: projectName });
          }
          await updateWorkspaceManifest(token, owner, repoName, wsManifest, wsSha, branch);
        }

        await commitProjectToRepo(
          token, owner, repoName, projectPath, files, commitMessage, branch
        );
        onSaved?.({ owner, repo: repoName, path: projectPath });
      }
    } catch (e) {
      setError(e.message);
      setStep(2);
    } finally {
      setSaving(false);
    }
  }, [token, user, mode, newRepoName, newRepoDesc, isPrivate, selectedRepo, projectPath, commitMessage, projectName, branch, onSaved, includeThumbnail, captureThumbnail, thumbnailUrl]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)" }}>
      <div
        className="rounded-lg shadow-2xl w-[480px] max-h-[80vh] overflow-y-auto"
        style={{ background: "var(--chrome-bg)", border: "1px solid var(--chrome-border)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--chrome-border)" }}>
          <div className="flex items-center gap-2">
            <GitHubIcon />
            <span className="text-sm font-semibold" style={{ color: "var(--chrome-text)" }}>
              Save to GitHub
            </span>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-4">
          {error && (
            <div className="text-xs text-red-400 bg-red-900/30 px-3 py-2 rounded">{error}</div>
          )}

          {step === 1 && (
            <>
              <div className="flex gap-2">
                <button
                  onClick={() => { setMode("new"); setStep(2); }}
                  className="flex-1 px-3 py-3 rounded-lg text-left transition-colors hover:bg-white/5"
                  style={{ border: "1px solid var(--chrome-border)", color: "var(--chrome-text)" }}
                >
                  <div className="text-xs font-semibold mb-1">Create new repository</div>
                  <div className="text-[10px]" style={{ color: "var(--chrome-text-muted)" }}>
                    Create a new GitHub repo and push this project
                  </div>
                </button>
                <button
                  onClick={() => { setMode("existing"); setStep(2); }}
                  className="flex-1 px-3 py-3 rounded-lg text-left transition-colors hover:bg-white/5"
                  style={{ border: "1px solid var(--chrome-border)", color: "var(--chrome-text)" }}
                >
                  <div className="text-xs font-semibold mb-1">Existing repository</div>
                  <div className="text-[10px]" style={{ color: "var(--chrome-text-muted)" }}>
                    Save into an existing repo you own
                  </div>
                </button>
              </div>
            </>
          )}

          {step === 2 && mode === "new" && (
            <>
              <div>
                <label className="text-[11px] font-medium block mb-1" style={{ color: "var(--chrome-text-secondary)" }}>
                  Repository name
                </label>
                <input
                  value={newRepoName}
                  onChange={(e) => setNewRepoName(e.target.value)}
                  className="w-full px-2 py-1.5 rounded text-xs outline-none"
                  style={{ background: "var(--input-bg)", color: "var(--chrome-text)", border: "1px solid var(--chrome-border)" }}
                  placeholder="my-shader-project"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium block mb-1" style={{ color: "var(--chrome-text-secondary)" }}>
                  Description (optional)
                </label>
                <input
                  value={newRepoDesc}
                  onChange={(e) => setNewRepoDesc(e.target.value)}
                  className="w-full px-2 py-1.5 rounded text-xs outline-none"
                  style={{ background: "var(--input-bg)", color: "var(--chrome-text)", border: "1px solid var(--chrome-border)" }}
                />
              </div>
              <label className="flex items-center gap-2 text-xs" style={{ color: "var(--chrome-text-secondary)" }}>
                <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
                Private repository
              </label>
            </>
          )}

          {step === 2 && mode === "existing" && (
            <div>
              <label className="text-[11px] font-medium block mb-1" style={{ color: "var(--chrome-text-secondary)" }}>
                Select repository
              </label>
              {loadingRepos ? (
                <div className="flex items-center gap-2 py-2">
                  <div className="w-3 h-3 border border-zinc-500 border-t-zinc-300 rounded-full animate-spin" />
                  <span className="text-xs" style={{ color: "var(--chrome-text-muted)" }}>Loading...</span>
                </div>
              ) : (
                <div className="max-h-40 overflow-y-auto rounded" style={{ border: "1px solid var(--chrome-border)" }}>
                  {repos.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => setSelectedRepo(r)}
                      className={`w-full text-left px-3 py-1.5 text-xs transition-colors hover:bg-white/5 ${
                        selectedRepo?.id === r.id ? "bg-white/10" : ""
                      }`}
                      style={{ color: "var(--chrome-text)", borderBottom: "1px solid var(--chrome-border)" }}
                    >
                      <div className="font-medium">{r.full_name}</div>
                      {r.description && (
                        <div className="text-[10px] truncate" style={{ color: "var(--chrome-text-muted)" }}>
                          {r.description}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <>
              {/* Branch selector */}
              <div>
                <label className="text-[11px] font-medium block mb-1" style={{ color: "var(--chrome-text-secondary)" }}>
                  Branch
                </label>
                {mode === "new" ? (
                  <input
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    className="w-full px-2 py-1.5 rounded text-xs outline-none"
                    style={{ background: "var(--input-bg)", color: "var(--chrome-text)", border: "1px solid var(--chrome-border)" }}
                    placeholder="main"
                  />
                ) : loadingBranches ? (
                  <div className="flex items-center gap-2 py-1">
                    <div className="w-3 h-3 border border-zinc-500 border-t-zinc-300 rounded-full animate-spin" />
                    <span className="text-xs" style={{ color: "var(--chrome-text-muted)" }}>Loading branches...</span>
                  </div>
                ) : (
                  <select
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    className="w-full px-2 py-1.5 rounded text-xs outline-none"
                    style={{ background: "var(--input-bg)", color: "var(--chrome-text)", border: "1px solid var(--chrome-border)" }}
                  >
                    {branches.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                    {branches.length === 0 && <option value="main">main</option>}
                  </select>
                )}
              </div>

              <div>
                <label className="text-[11px] font-medium block mb-1" style={{ color: "var(--chrome-text-secondary)" }}>
                  Project path in repo (optional, for multi-project repos)
                </label>
                <input
                  value={projectPath}
                  onChange={(e) => setProjectPath(e.target.value)}
                  className="w-full px-2 py-1.5 rounded text-xs outline-none"
                  style={{ background: "var(--input-bg)", color: "var(--chrome-text)", border: "1px solid var(--chrome-border)" }}
                  placeholder="e.g. projects/my-shader (leave empty for root)"
                />
              </div>
              {/* Thumbnail preview */}
              {thumbnailUrl && (
                <div>
                  <label className="flex items-center gap-2 text-[11px] font-medium mb-2" style={{ color: "var(--chrome-text-secondary)" }}>
                    <input type="checkbox" checked={includeThumbnail} onChange={(e) => setIncludeThumbnail(e.target.checked)} />
                    Include thumbnail in README
                  </label>
                  {includeThumbnail && (
                    <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--chrome-border)" }}>
                      <img src={thumbnailUrl} alt="Project thumbnail" className="w-full h-auto" style={{ maxHeight: 160, objectFit: "cover" }} />
                      <div className="px-2 py-1 text-[10px]" style={{ background: "var(--input-bg)", color: "var(--chrome-text-muted)" }}>
                        This screenshot will appear in the repository README
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="text-[11px] font-medium block mb-1" style={{ color: "var(--chrome-text-secondary)" }}>
                  Commit message
                </label>
                <input
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  className="w-full px-2 py-1.5 rounded text-xs outline-none"
                  style={{ background: "var(--input-bg)", color: "var(--chrome-text)", border: "1px solid var(--chrome-border)" }}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setStep(1)}
                  className="px-3 py-1.5 rounded text-xs transition-colors"
                  style={{ color: "var(--chrome-text-muted)", background: "var(--input-bg)" }}
                >
                  Back
                </button>
                <button
                  onClick={handleCreateAndPush}
                  disabled={saving || (mode === "existing" && !selectedRepo) || (mode === "new" && !newRepoName.trim())}
                  className="px-4 py-1.5 rounded text-xs font-semibold transition-colors"
                  style={{
                    background: "#238636",
                    color: "#fff",
                    opacity: (saving || (mode === "existing" && !selectedRepo) || (mode === "new" && !newRepoName.trim())) ? 0.5 : 1,
                  }}
                >
                  {saving ? "Pushing..." : "Push to GitHub"}
                </button>
              </div>
            </>
          )}

          {step === 3 && saving && (
            <div className="flex flex-col items-center py-6 gap-3">
              <div className="w-6 h-6 border-2 border-zinc-500 border-t-zinc-300 rounded-full animate-spin" />
              <span className="text-xs" style={{ color: "var(--chrome-text-muted)" }}>
                Pushing to GitHub...
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function GitHubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style={{ color: "var(--chrome-text)" }}>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

/**
 * Build a README.md with an embedded thumbnail image.
 */
function buildReadme(name, description, hasThumbnail = true) {
  const cacheBust = Date.now();
  const lines = [`# ${name}`, ""];
  if (hasThumbnail) {
    lines.push(`![thumbnail](thumbnail.jpg?v=${cacheBust})`, "");
  }
  if (description) {
    lines.push(description, "");
  }
  lines.push("---", "", "*Created with [Siljangnim](https://github.com/niceplugin/siljangnim) — AI Creative IDE for WebGL*", "");
  return lines.join("\n");
}

/**
 * Collect all project files from IndexedDB for GitHub push.
 */
async function collectProjectFiles(projectName) {
  const sanitized = projectName; // Already sanitized in storage layer
  const activeName = storageApi.getActiveProjectName();
  const files = [];

  // Get manifest
  let manifest;
  try {
    manifest = await storageApi.getProjectManifest(activeName);
  } catch {
    manifest = null;
  }

  if (manifest) {
    files.push({
      path: MANIFEST_FILENAME,
      content: JSON.stringify(manifest, null, 2),
    });
  }

  // Get scene.json
  try {
    const scene = await storageApi.readJson("scene.json");
    files.push({ path: "scene.json", content: JSON.stringify(scene, null, 2) });
  } catch { /* ignore */ }

  // Get ui_config.json
  try {
    const ui = await storageApi.readJson("ui_config.json");
    files.push({ path: "ui_config.json", content: JSON.stringify(ui, null, 2) });
  } catch { /* ignore */ }

  // Get panels.json
  try {
    const panels = await storageApi.readJson("panels.json");
    files.push({ path: "panels.json", content: JSON.stringify(panels, null, 2) });
  } catch { /* ignore */ }

  // Get workspace_state.json
  try {
    const ws = await storageApi.readJson("workspace_state.json");
    files.push({ path: "workspace_state.json", content: JSON.stringify(ws, null, 2) });
  } catch { /* ignore */ }

  // Get chat_history.json
  try {
    const chat = await storageApi.readJson("chat_history.json");
    files.push({ path: "chat_history.json", content: JSON.stringify(chat, null, 2) });
  } catch { /* ignore */ }

  // Get uploads (as base64)
  try {
    const uploadList = await storageApi.listUploads();
    for (const filename of uploadList) {
      const entry = await storageApi.readUpload(filename);
      const bytes = new Uint8Array(entry.data);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      files.push({
        path: `uploads/${filename}`,
        content: btoa(binary),
        encoding: "base64",
      });
    }
  } catch { /* ignore */ }

  return files;
}
