/**
 * GitHub API client — OAuth Device Flow, repo management, contents API.
 *
 * All API calls are made directly from the browser (GitHub CORS-enabled endpoints).
 * No server proxy required for most operations.
 */

const GITHUB_API = "https://api.github.com";
const TOKEN_KEY = "siljangnim:github_token";

// ---------------------------------------------------------------------------
// Token management
// ---------------------------------------------------------------------------

export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY) || null;
}

export function setToken(token) {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}

export function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY);
}

// ---------------------------------------------------------------------------
// OAuth Device Flow
// ---------------------------------------------------------------------------

/**
 * Start the Device Flow — returns { user_code, verification_uri, device_code, interval }.
 * The user must visit verification_uri and enter user_code.
 */
export async function startDeviceFlow(clientId) {
  const res = await fetch("/github-login/device/code", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      scope: "repo",
    }),
  });
  if (!res.ok) throw new Error(`Device flow start failed: ${res.status}`);
  return res.json();
}

/**
 * Poll for the access token after the user has authorised.
 * Returns { access_token, token_type, scope } on success.
 * Throws on error or expiry.
 *
 * @param {string} clientId
 * @param {string} deviceCode
 * @param {number} interval - polling interval in seconds
 * @param {AbortSignal} [signal]
 */
export async function pollDeviceFlow(clientId, deviceCode, interval = 5, signal, maxAttempts = 120) {
  const pollInterval = Math.max(interval, 5) * 1000;
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts++;
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    await new Promise((r) => setTimeout(r, pollInterval));

    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const res = await fetch("/github-login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        device_code: deviceCode,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      }),
    });

    if (!res.ok) throw new Error(`Poll failed: ${res.status}`);
    const data = await res.json();

    if (data.access_token) {
      setToken(data.access_token);
      return data;
    }

    if (data.error === "authorization_pending") continue;
    if (data.error === "slow_down") {
      // GitHub wants us to slow down
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }
    if (data.error === "expired_token") throw new Error("Device code expired. Please try again.");
    if (data.error === "access_denied") throw new Error("Access denied by user.");
    if (data.error) throw new Error(data.error_description || data.error);
  }
  throw new Error("Device flow polling timed out. Please try again.");
}

// ---------------------------------------------------------------------------
// Authenticated API helpers
// ---------------------------------------------------------------------------

async function ghFetch(path, token, opts = {}) {
  const url = path.startsWith("http") ? path : `${GITHUB_API}${path}`;
  const headers = {
    Accept: "application/vnd.github+json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...opts.headers,
  };
  const res = await fetch(url, { ...opts, headers });

  // Handle rate limiting with retry
  if (res.status === 403 || res.status === 429) {
    const retryAfter = res.headers.get("retry-after");
    if (retryAfter) {
      const waitMs = Math.min(parseInt(retryAfter, 10) * 1000, 60000);
      await new Promise((r) => setTimeout(r, waitMs));
      return ghFetch(path, token, opts);
    }
    const remaining = res.headers.get("x-ratelimit-remaining");
    if (remaining === "0") {
      const resetAt = parseInt(res.headers.get("x-ratelimit-reset") || "0", 10);
      const waitMs = Math.min(Math.max(resetAt * 1000 - Date.now(), 1000), 60000);
      await new Promise((r) => setTimeout(r, waitMs));
      return ghFetch(path, token, opts);
    }
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub API ${res.status}: ${body.slice(0, 200)}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export async function getAuthenticatedUser(token) {
  return ghFetch("/user", token);
}

// ---------------------------------------------------------------------------
// Repo management (Phase 4)
// ---------------------------------------------------------------------------

export async function listBranches(token, owner, repo) {
  return ghFetch(`/repos/${owner}/${repo}/branches?per_page=100`, token);
}

export async function listUserRepos(token, { sort = "updated", per_page = 30 } = {}) {
  return ghFetch(`/user/repos?sort=${sort}&per_page=${per_page}&affiliation=owner`, token);
}

export async function createRepo(token, name, description = "", isPrivate = false) {
  return ghFetch("/user/repos", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      description,
      private: isPrivate,
      auto_init: true,
    }),
  });
}

/**
 * Commit project files to a GitHub repo using the Git Data API.
 * Creates: blobs → tree → commit → update ref.
 *
 * @param {string} token
 * @param {string} owner
 * @param {string} repo
 * @param {string} projectPath - subdirectory in repo (e.g. "projects/my-shader")
 * @param {Array<{path: string, content: string, encoding?: string}>} files
 * @param {string} message - commit message
 * @param {string} [branch="main"]
 */
export async function commitProjectToRepo(token, owner, repo, projectPath, files, message, branch = "main") {
  // 1. Get current ref
  const ref = await ghFetch(`/repos/${owner}/${repo}/git/refs/heads/${branch}`, token);
  const parentSha = ref.object.sha;

  // 2. Get current commit's tree
  const parentCommit = await ghFetch(`/repos/${owner}/${repo}/git/commits/${parentSha}`, token);
  const baseTreeSha = parentCommit.tree.sha;

  // 3. Create blobs for each file (with size validation)
  const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB GitHub limit
  const treeEntries = [];
  for (const file of files) {
    const contentSize = file.content?.length || 0;
    if (contentSize > MAX_FILE_SIZE) {
      throw new Error(`File "${file.path}" exceeds GitHub's 50MB limit (${(contentSize / 1024 / 1024).toFixed(1)}MB)`);
    }
    const blob = await ghFetch(`/repos/${owner}/${repo}/git/blobs`, token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: file.content,
        encoding: file.encoding || "utf-8",
      }),
    });
    const filePath = projectPath ? `${projectPath}/${file.path}` : file.path;
    treeEntries.push({
      path: filePath,
      mode: "100644",
      type: "blob",
      sha: blob.sha,
    });
  }

  // 4. Create tree
  const tree = await ghFetch(`/repos/${owner}/${repo}/git/trees`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree: treeEntries,
    }),
  });

  // 5. Create commit
  const commit = await ghFetch(`/repos/${owner}/${repo}/git/commits`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      tree: tree.sha,
      parents: [parentSha],
    }),
  });

  // 6. Update ref
  await ghFetch(`/repos/${owner}/${repo}/git/refs/heads/${branch}`, token, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sha: commit.sha }),
  });

  return commit;
}

// ---------------------------------------------------------------------------
// Workspace manifest (multi-project repo)
// ---------------------------------------------------------------------------

export async function readWorkspaceManifest(token, owner, repo, branch = "main") {
  try {
    const content = await ghFetch(
      `/repos/${owner}/${repo}/contents/siljangnim-workspace.json?ref=${branch}`,
      token
    );
    let decoded;
    try {
      decoded = atob(content.content.replace(/\n/g, ""));
    } catch {
      return { manifest: null, sha: null };
    }
    return { manifest: JSON.parse(decoded), sha: content.sha };
  } catch {
    return { manifest: null, sha: null };
  }
}

export async function updateWorkspaceManifest(token, owner, repo, manifest, sha, branch = "main") {
  const content = btoa(JSON.stringify(manifest, null, 2));
  return ghFetch(`/repos/${owner}/${repo}/contents/siljangnim-workspace.json`, token, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "Update workspace manifest",
      content,
      sha: sha || undefined,
      branch,
    }),
  });
}

// ---------------------------------------------------------------------------
// Load project from repo (Phase 5)
// ---------------------------------------------------------------------------

/**
 * Parse various GitHub URL formats into { owner, repo, path, branch }.
 */
export function parseGitHubUrl(url) {
  // Handle github.com URLs
  const ghMatch = url.match(
    /github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/(?:tree|blob)\/([^/]+)(?:\/(.+))?)?$/
  );
  if (ghMatch) {
    return {
      owner: ghMatch[1],
      repo: ghMatch[2],
      branch: ghMatch[3] || "main",
      path: ghMatch[4] || "",
    };
  }

  // Handle "owner/repo" shorthand
  const shortMatch = url.match(/^([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (shortMatch) {
    return {
      owner: shortMatch[1],
      repo: shortMatch[2],
      branch: "main",
      path: "",
    };
  }

  return null;
}

/**
 * Load all project files from a GitHub repo.
 * Returns { manifest, files, blobs } ready for import.
 */
export async function loadProjectFromRepo(token, owner, repo, path = "", branch = "main") {
  // Get directory tree
  const treePath = path ? `${path}` : "";
  const apiPath = treePath
    ? `/repos/${owner}/${repo}/contents/${treePath}?ref=${branch}`
    : `/repos/${owner}/${repo}/contents?ref=${branch}`;

  const contents = await ghFetch(apiPath, token);
  if (!Array.isArray(contents)) {
    throw new Error("Expected directory listing");
  }

  const files = {};
  const blobs = {};
  let manifest = null;

  for (const item of contents) {
    if (item.type !== "file") continue;
    const name = item.name;

    if (name === "siljangnim-project.json" || name === "meta.json") {
      const fileContent = await ghFetch(item.url, token);
      try {
        const decoded = atob(fileContent.content.replace(/\n/g, ""));
        manifest = JSON.parse(decoded);
      } catch {
        console.warn(`Failed to decode manifest: ${name}`);
      }
      continue;
    }

    // Binary files (uploads/, thumbnail)
    if (isBinaryFile(name)) {
      const fileContent = await ghFetch(item.url, token);
      blobs[name] = {
        data_b64: fileContent.content.replace(/\n/g, ""),
        mimeType: guessMimeType(name),
        size: item.size,
      };
      continue;
    }

    // Text/JSON files
    const fileContent = await ghFetch(item.url, token);
    try {
      const decoded = atob(fileContent.content.replace(/\n/g, ""));
      try {
        files[name] = JSON.parse(decoded);
      } catch {
        files[name] = decoded;
      }
    } catch {
      console.warn(`Failed to decode file: ${name}`);
    }
  }

  // Handle nested directories (uploads/)
  for (const item of contents) {
    if (item.type !== "dir") continue;
    const subContents = await ghFetch(item.url, token);
    if (!Array.isArray(subContents)) continue;

    for (const subItem of subContents) {
      if (subItem.type !== "file") continue;
      const relPath = `${item.name}/${subItem.name}`;

      if (isBinaryFile(subItem.name)) {
        const fileContent = await ghFetch(subItem.url, token);
        blobs[relPath] = {
          data_b64: fileContent.content.replace(/\n/g, ""),
          mimeType: guessMimeType(subItem.name),
          size: subItem.size,
        };
      } else {
        const fileContent = await ghFetch(subItem.url, token);
        try {
          const decoded = atob(fileContent.content.replace(/\n/g, ""));
          try {
            files[relPath] = JSON.parse(decoded);
          } catch {
            files[relPath] = decoded;
          }
        } catch {
          console.warn(`Failed to decode file: ${relPath}`);
        }
      }
    }
  }

  // Get latest commit SHA
  let commitSha = null;
  try {
    const commits = await ghFetch(
      `/repos/${owner}/${repo}/commits?sha=${branch}&per_page=1${path ? `&path=${path}` : ""}`,
      token
    );
    if (commits.length) commitSha = commits[0].sha;
  } catch { /* ignore */ }

  return { manifest, files, blobs, commitSha };
}

// ---------------------------------------------------------------------------
// Fork (Phase 6)
// ---------------------------------------------------------------------------

export async function forkRepo(token, owner, repo) {
  return ghFetch(`/repos/${owner}/${repo}/forks`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
}

export async function checkForkStatus(token, owner, repo, maxAttempts = 10) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const r = await ghFetch(`/repos/${owner}/${repo}`, token);
      if (r) return r;
    } catch {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error("Fork creation timed out");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BINARY_EXTENSIONS = new Set([
  "jpg", "jpeg", "png", "gif", "webp", "bmp", "ico",
  "mp3", "wav", "ogg", "flac",
  "mp4", "webm", "mov",
  "obj", "fbx", "gltf", "glb",
  "ttf", "otf", "woff", "woff2",
  "zip", "gz", "tar",
]);

function isBinaryFile(filename) {
  const ext = (filename.split(".").pop() || "").toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

function guessMimeType(filename) {
  const ext = (filename.split(".").pop() || "").toLowerCase();
  const mimes = {
    json: "application/json", js: "text/javascript", glsl: "text/plain",
    txt: "text/plain", html: "text/html", css: "text/css",
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
    gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
    mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg",
    mp4: "video/mp4", webm: "video/webm",
    ttf: "font/ttf", otf: "font/otf", woff: "font/woff", woff2: "font/woff2",
  };
  return mimes[ext] || "application/octet-stream";
}
