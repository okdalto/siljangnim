export default function SaveConfigurator({ flow, onBack, onPush }) {
  const {
    mode,
    repos, loadingRepos, selectedRepo, setSelectedRepo,
    newRepoName, setNewRepoName, newRepoDesc, setNewRepoDesc,
    isPrivate, setIsPrivate,
    branch, setBranch, branches, loadingBranches,
    projectPath, setProjectPath,
    commitMessage, setCommitMessage,
    saving,
    thumbnailUrl, includeThumbnail, setIncludeThumbnail,
    includeChatHistory, setIncludeChatHistory,
    uploadAssets, excludedAssets, setExcludedAssets,
    assetsExpanded, setAssetsExpanded,
  } = flow;

  return (
    <>
      {mode === "new" && (
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

      {mode === "existing" && (
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

      {/* Chat history option */}
      <label className="flex items-center gap-2 text-[11px] font-medium" style={{ color: "var(--chrome-text-secondary)" }}>
        <input type="checkbox" checked={includeChatHistory} onChange={(e) => setIncludeChatHistory(e.target.checked)} />
        Include chat history
      </label>

      {/* Asset exclude section */}
      {uploadAssets.length > 0 && (
        <div>
          <button
            onClick={() => setAssetsExpanded((v) => !v)}
            className="flex items-center gap-1 text-[11px] font-medium w-full"
            style={{ color: "var(--chrome-text-secondary)" }}
          >
            <svg
              width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              style={{ transform: assetsExpanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s" }}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            Assets ({uploadAssets.length})
            {excludedAssets.size > 0 && (
              <span className="text-[10px] text-amber-400 ml-1">
                ({excludedAssets.size} excluded)
              </span>
            )}
          </button>
          {assetsExpanded && (
            <div className="mt-1 max-h-32 overflow-y-auto rounded px-1" style={{ border: "1px solid var(--chrome-border)" }}>
              {uploadAssets.map((asset) => (
                <label
                  key={asset.filename}
                  className="flex items-center gap-2 px-1 py-1 text-[11px] hover:bg-white/5 cursor-pointer"
                  style={{ color: "var(--chrome-text)" }}
                >
                  <input
                    type="checkbox"
                    checked={!excludedAssets.has(asset.filename)}
                    onChange={() => {
                      setExcludedAssets((prev) => {
                        const next = new Set(prev);
                        if (next.has(asset.filename)) next.delete(asset.filename);
                        else next.add(asset.filename);
                        return next;
                      });
                    }}
                  />
                  <span className="truncate flex-1">{asset.filename}</span>
                  <span className="text-[10px] flex-shrink-0" style={{ color: "var(--chrome-text-muted)" }}>
                    {asset.file_size > 1024 * 1024
                      ? `${(asset.file_size / (1024 * 1024)).toFixed(1)} MB`
                      : `${(asset.file_size / 1024).toFixed(1)} KB`}
                  </span>
                </label>
              ))}
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
          onClick={onBack}
          className="px-3 py-1.5 rounded text-xs transition-colors"
          style={{ color: "var(--chrome-text-muted)", background: "var(--input-bg)" }}
        >
          Back
        </button>
        <button
          onClick={onPush}
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
  );
}
