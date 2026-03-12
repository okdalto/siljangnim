import { useState, useEffect, useCallback } from "react";
import {
  listUserRepos,
  listBranches,
  createRepo,
  commitProjectToRepo,
  readWorkspaceManifest,
  updateWorkspaceManifest,
} from "../../engine/github.js";
import {
  MANIFEST_FILENAME,
} from "../../engine/portableSchema.js";
import * as storageApi from "../../engine/storage.js";

/**
 * Encapsulates all state + side-effects for the GitHub save flow.
 */
export default function useSaveFlow({ token, user, projectName, captureThumbnail }) {
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
  const [step, setStep] = useState(1);
  const [thumbnailUrl, setThumbnailUrl] = useState(null);
  const [includeThumbnail, setIncludeThumbnail] = useState(true);
  const [includeChatHistory, setIncludeChatHistory] = useState(true);
  const [uploadAssets, setUploadAssets] = useState([]);
  const [excludedAssets, setExcludedAssets] = useState(new Set());
  const [assetsExpanded, setAssetsExpanded] = useState(false);

  // Load upload list on mount
  useEffect(() => {
    storageApi.listUploadAssets().then(setUploadAssets).catch(() => {});
  }, []);

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
  }, [token, selectedRepo]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreateAndPush = useCallback(async (onSaved) => {
    setSaving(true);
    setError(null);
    setStep(3);
    try {
      const files = await collectProjectFiles(projectName, { includeChatHistory, excludeAssets: excludedAssets });

      let thumbData = null;
      if (includeThumbnail) {
        let url = null;
        try { url = captureThumbnail?.(); } catch { /* ignore */ }
        if (!url) url = thumbnailUrl;
        if (url) {
          thumbData = url.includes(",") ? url.split(",")[1] : url;
          files.push({ path: "thumbnail.jpg", content: thumbData, encoding: "base64" });
        }
      }

      const displayName = newRepoName || projectName || "Untitled";
      const readme = buildReadme(displayName, newRepoDesc, !!thumbData);
      files.push({ path: "README.md", content: readme });

      if (mode === "new") {
        const repo = await createRepo(token, newRepoName, newRepoDesc, isPrivate);
        await new Promise((r) => setTimeout(r, 1500));
        await commitProjectToRepo(token, user.login, repo.name, projectPath, files, commitMessage, branch);
        onSaved?.({ owner: user.login, repo: repo.name, path: projectPath });
      } else {
        const [owner, repoName] = selectedRepo.full_name.split("/");
        const { manifest: wsManifest, sha: wsSha } = await readWorkspaceManifest(token, owner, repoName, branch);
        if (wsManifest) {
          const existingIdx = wsManifest.projects?.findIndex((p) => p.path === projectPath);
          if (existingIdx >= 0) {
            wsManifest.projects[existingIdx].display_name = projectName;
          } else {
            wsManifest.projects = wsManifest.projects || [];
            wsManifest.projects.push({ path: projectPath || projectName, display_name: projectName });
          }
          await updateWorkspaceManifest(token, owner, repoName, wsManifest, wsSha, branch);
        }
        await commitProjectToRepo(token, owner, repoName, projectPath, files, commitMessage, branch);
        onSaved?.({ owner, repo: repoName, path: projectPath });
      }
    } catch (e) {
      setError(e.message);
      setStep(2);
    } finally {
      setSaving(false);
    }
  }, [token, user, mode, newRepoName, newRepoDesc, isPrivate, selectedRepo, projectPath, commitMessage, projectName, branch, includeThumbnail, captureThumbnail, thumbnailUrl, includeChatHistory, excludedAssets]);

  return {
    // State
    mode, setMode,
    repos, loadingRepos,
    selectedRepo, setSelectedRepo,
    newRepoName, setNewRepoName,
    newRepoDesc, setNewRepoDesc,
    isPrivate, setIsPrivate,
    projectPath, setProjectPath,
    commitMessage, setCommitMessage,
    branch, setBranch,
    branches, loadingBranches,
    saving, error,
    step, setStep,
    thumbnailUrl,
    includeThumbnail, setIncludeThumbnail,
    includeChatHistory, setIncludeChatHistory,
    uploadAssets,
    excludedAssets, setExcludedAssets,
    assetsExpanded, setAssetsExpanded,
    // Actions
    handleCreateAndPush,
  };
}

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

async function collectProjectFiles(projectName, { includeChatHistory = true, excludeAssets = new Set() } = {}) {
  const activeName = storageApi.getActiveProjectName();
  const files = [];

  let manifest;
  try {
    manifest = await storageApi.getProjectManifest(activeName);
  } catch {
    manifest = null;
  }

  if (manifest && excludeAssets.size > 0) {
    const excludedMeta = [];
    for (const filename of excludeAssets) {
      try {
        const info = await storageApi.getUploadInfo(filename);
        excludedMeta.push(storageApi.buildExcludedAssetMeta(filename, info));
      } catch {
        excludedMeta.push(storageApi.buildExcludedAssetMeta(filename));
      }
    }
    manifest = { ...manifest, excluded_assets: excludedMeta };
  }

  if (manifest) {
    files.push({ path: MANIFEST_FILENAME, content: JSON.stringify(manifest, null, 2) });
  }

  const jsonFiles = ["scene.json", "ui_config.json", "panels.json", "workspace_state.json"];
  for (const fname of jsonFiles) {
    try {
      const data = await storageApi.readJson(fname);
      files.push({ path: fname, content: JSON.stringify(data, null, 2) });
    } catch { /* ignore */ }
  }

  if (includeChatHistory) {
    try {
      const chat = await storageApi.readJson("chat_history.json");
      files.push({ path: "chat_history.json", content: JSON.stringify(chat, null, 2) });
    } catch { /* ignore */ }
  }

  try {
    const uploadList = await storageApi.listUploads();
    for (const filename of uploadList) {
      if (excludeAssets.has(filename)) continue;
      const entry = await storageApi.readUpload(filename);
      const bytes = new Uint8Array(entry.data);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      files.push({ path: `uploads/${filename}`, content: btoa(binary), encoding: "base64" });
    }
  } catch { /* ignore */ }

  return files;
}
