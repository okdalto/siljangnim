import { useState, useCallback } from "react";
import {
  parseGitHubUrl,
  listBranches,
  loadProjectFromRepo,
  readWorkspaceManifest,
} from "../engine/github.js";
import {
  migrateV1toV2,
  validateManifest,
  buildProvenanceGitHub,
} from "../engine/portableSchema.js";
import { importProjectZip } from "../engine/storage.js";
import { scanProject } from "../engine/safetyScan.js";
import GitHubProjectPicker from "./GitHubProjectPicker.jsx";

export default function GitHubLoadDialog({ token, isAuthenticated, onClose, onImported }) {
  const [url, setUrl] = useState("");
  const [parsed, setParsed] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(null); // { manifest, files, blobs }
  const [wsProjects, setWsProjects] = useState(null); // multi-project picker
  const [selectedProject, setSelectedProject] = useState(null);
  const [branch, setBranch] = useState("main");
  const [branches, setBranches] = useState([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [scanResult, setScanResult] = useState(null);

  const handleParse = useCallback(() => {
    setError(null);
    setParsed(null);
    setPreview(null);
    setWsProjects(null);
    setScanResult(null);

    const p = parseGitHubUrl(url.trim());
    if (!p) {
      setError("Invalid GitHub URL. Use format: github.com/owner/repo or owner/repo");
      return;
    }
    setParsed(p);
    setBranch(p.branch || "main");

    // Load branches
    setLoadingBranches(true);
    listBranches(token, p.owner, p.repo)
      .then((bs) => {
        setBranches(bs.map((b) => b.name));
      })
      .catch(() => setBranches([]))
      .finally(() => setLoadingBranches(false));

    // Check for workspace manifest
    setLoading(true);
    (async () => {
      try {
        const useBranch = p.branch || "main";
        // First check for workspace manifest
        const { manifest: wsManifest } = await readWorkspaceManifest(
          token, p.owner, p.repo, useBranch
        );

        if (wsManifest?.projects?.length && !p.path) {
          // Multi-project repo — show picker
          setWsProjects(wsManifest.projects);
          setLoading(false);
          return;
        }

        // Single project — load directly
        await loadAndPreview(p.owner, p.repo, p.path, useBranch);
      } catch (e) {
        setError(e.message);
        setLoading(false);
      }
    })();
  }, [url, token]);

  const loadAndPreview = useCallback(async (owner, repo, path, branchName) => {
    setLoading(true);
    setError(null);
    setScanResult(null);
    try {
      const result = await loadProjectFromRepo(token, owner, repo, path, branchName);
      let manifest = result.manifest;
      if (!manifest) {
        manifest = migrateV1toV2({ name: repo });
      }
      manifest = validateManifest(manifest);
      manifest.provenance = buildProvenanceGitHub(repo, owner, result.commitSha, path);

      // Run safety scan
      const scan = scanProject(manifest, result.files, result.blobs);
      setScanResult(scan);

      setPreview({
        manifest,
        files: result.files,
        blobs: result.blobs,
        owner,
        repo,
        path,
        branch: branchName,
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const handleProjectSelect = useCallback((project) => {
    setSelectedProject(project);
    setWsProjects(null);
    if (parsed) {
      loadAndPreview(parsed.owner, parsed.repo, project.path, branch);
    }
  }, [parsed, branch, loadAndPreview]);

  const handleBranchChange = useCallback((newBranch) => {
    setBranch(newBranch);
    if (parsed) {
      setPreview(null);
      setScanResult(null);
      loadAndPreview(parsed.owner, parsed.repo, parsed.path, newBranch);
    }
  }, [parsed, loadAndPreview]);

  const handleImport = useCallback(async () => {
    if (!preview) return;
    setLoading(true);
    setError(null);
    try {
      const { manifest, files, blobs } = preview;
      // Build import bundle
      const bundle = JSON.stringify({
        schema_version: 2,
        manifest,
        meta: manifest,
        files,
        blobs,
        nodes: [],
      });
      const meta = await importProjectZip(bundle, { isExternal: true });
      onImported?.(meta);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [preview, onImported]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)" }}>
      <div
        className="rounded-lg shadow-2xl w-[480px] max-h-[80vh] overflow-y-auto"
        style={{ background: "var(--chrome-bg)", border: "1px solid var(--chrome-border)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--chrome-border)" }}>
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style={{ color: "var(--chrome-text)" }}>
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
            <span className="text-sm font-semibold" style={{ color: "var(--chrome-text)" }}>
              Open from GitHub
            </span>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-4">
          {!isAuthenticated && (
            <div className="text-xs px-3 py-2 rounded" style={{ background: "rgba(251,191,36,0.1)", color: "#fbbf24" }}>
              You can load public repos without logging in, but private repos require authentication.
            </div>
          )}

          {error && (
            <div className="text-xs text-red-400 bg-red-900/30 px-3 py-2 rounded">{error}</div>
          )}

          {/* URL input */}
          {!preview && !wsProjects && (
            <div>
              <label className="text-[11px] font-medium block mb-1" style={{ color: "var(--chrome-text-secondary)" }}>
                GitHub URL or owner/repo
              </label>
              <div className="flex gap-2">
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleParse()}
                  className="flex-1 px-2 py-1.5 rounded text-xs outline-none"
                  style={{ background: "var(--input-bg)", color: "var(--chrome-text)", border: "1px solid var(--chrome-border)" }}
                  placeholder="github.com/user/repo or user/repo"
                />
                <button
                  onClick={handleParse}
                  disabled={loading || !url.trim()}
                  className="px-3 py-1.5 rounded text-xs font-medium transition-colors"
                  style={{
                    background: "#238636",
                    color: "#fff",
                    opacity: loading || !url.trim() ? 0.5 : 1,
                  }}
                >
                  {loading ? "..." : "Load"}
                </button>
              </div>
            </div>
          )}

          {/* Branch selector — shown after URL is parsed */}
          {parsed && !preview && !wsProjects && !loading && (
            <div>
              <label className="text-[11px] font-medium block mb-1" style={{ color: "var(--chrome-text-secondary)" }}>
                Branch
              </label>
              {loadingBranches ? (
                <div className="flex items-center gap-2 py-1">
                  <div className="w-3 h-3 border border-zinc-500 border-t-zinc-300 rounded-full animate-spin" />
                  <span className="text-xs" style={{ color: "var(--chrome-text-muted)" }}>Loading branches...</span>
                </div>
              ) : (
                <select
                  value={branch}
                  onChange={(e) => handleBranchChange(e.target.value)}
                  className="w-full px-2 py-1.5 rounded text-xs outline-none"
                  style={{ background: "var(--input-bg)", color: "var(--chrome-text)", border: "1px solid var(--chrome-border)" }}
                >
                  {branches.length > 0 ? branches.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  )) : (
                    <option value={branch}>{branch}</option>
                  )}
                </select>
              )}
            </div>
          )}

          {/* Multi-project picker */}
          {wsProjects && (
            <GitHubProjectPicker projects={wsProjects} onSelect={handleProjectSelect} />
          )}

          {/* Loading */}
          {loading && !wsProjects && (
            <div className="flex items-center gap-2 py-4 justify-center">
              <div className="w-4 h-4 border-2 border-zinc-500 border-t-zinc-300 rounded-full animate-spin" />
              <span className="text-xs" style={{ color: "var(--chrome-text-muted)" }}>Loading project...</span>
            </div>
          )}

          {/* Preview */}
          {preview && !loading && (
            <div className="space-y-3">
              <div
                className="rounded-lg px-3 py-3"
                style={{ border: "1px solid var(--chrome-border)", background: "var(--input-bg)" }}
              >
                <div className="text-xs font-semibold" style={{ color: "var(--chrome-text)" }}>
                  {preview.manifest.display_name || preview.manifest.name}
                </div>
                {preview.manifest.description && (
                  <div className="text-[10px] mt-1" style={{ color: "var(--chrome-text-muted)" }}>
                    {preview.manifest.description}
                  </div>
                )}
                <div className="text-[10px] mt-2 flex items-center gap-3" style={{ color: "var(--chrome-text-muted)" }}>
                  <span>{preview.owner}/{preview.repo}</span>
                  {preview.path && <span>/{preview.path}</span>}
                  <span>{Object.keys(preview.files).length} files</span>
                  {preview.manifest.assets?.length > 0 && (
                    <span>{preview.manifest.assets.length} assets</span>
                  )}
                </div>
              </div>

              {/* Branch selector in preview */}
              {branches.length > 0 && (
                <div>
                  <label className="text-[11px] font-medium block mb-1" style={{ color: "var(--chrome-text-secondary)" }}>
                    Branch
                  </label>
                  <select
                    value={branch}
                    onChange={(e) => handleBranchChange(e.target.value)}
                    className="w-full px-2 py-1.5 rounded text-xs outline-none"
                    style={{ background: "var(--input-bg)", color: "var(--chrome-text)", border: "1px solid var(--chrome-border)" }}
                  >
                    {branches.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Safety scan results */}
              {scanResult && (
                <div
                  className="rounded-lg px-3 py-2 text-xs"
                  style={{
                    border: `1px solid ${scanResult.safetyScore === "safe" ? "#16a34a" : scanResult.safetyScore === "caution" ? "#ca8a04" : "#dc2626"}`,
                    background: scanResult.safetyScore === "safe" ? "rgba(22,163,74,0.1)" : scanResult.safetyScore === "caution" ? "rgba(202,138,4,0.1)" : "rgba(220,38,38,0.1)",
                    color: scanResult.safetyScore === "safe" ? "#4ade80" : scanResult.safetyScore === "caution" ? "#fbbf24" : "#f87171",
                  }}
                >
                  <div className="font-semibold mb-1">
                    {scanResult.safetyScore === "safe" && "Safe"}
                    {scanResult.safetyScore === "caution" && "Caution"}
                    {scanResult.safetyScore === "unsafe" && "Unsafe"}
                    {" — Safety Scan"}
                  </div>
                  {scanResult.issues.length > 0 && (
                    <ul className="space-y-0.5">
                      {scanResult.issues.map((issue, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span style={{
                            color: issue.type === "error" ? "#f87171" : issue.type === "warning" ? "#fbbf24" : "#94a3b8",
                          }}>
                            {issue.type === "error" ? "\u2718" : issue.type === "warning" ? "\u26A0" : "\u2139"}
                          </span>
                          <span style={{ color: "var(--chrome-text-muted)" }}>{issue.message}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {scanResult.issues.length === 0 && (
                    <div style={{ color: "var(--chrome-text-muted)" }}>No issues found.</div>
                  )}
                </div>
              )}

              <div className="text-[10px] px-2 py-1.5 rounded" style={{ background: "rgba(251,191,36,0.1)", color: "#fbbf24" }}>
                This project will be imported in Safe Mode. Scripts will not run until you explicitly trust them.
              </div>

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => { setPreview(null); setParsed(null); setUrl(""); setScanResult(null); }}
                  className="px-3 py-1.5 rounded text-xs transition-colors"
                  style={{ color: "var(--chrome-text-muted)", background: "var(--input-bg)" }}
                >
                  Back
                </button>
                <button
                  onClick={handleImport}
                  disabled={loading || (scanResult?.safetyScore === "unsafe")}
                  className="px-4 py-1.5 rounded text-xs font-semibold transition-colors"
                  style={{ background: "#238636", color: "#fff", opacity: (loading || scanResult?.safetyScore === "unsafe") ? 0.5 : 1 }}
                  title={scanResult?.safetyScore === "unsafe" ? "Cannot import unsafe project — use Open Readonly instead" : undefined}
                >
                  Import into Workspace
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
