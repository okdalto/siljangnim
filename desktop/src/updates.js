// Only public releases from our repository; never accept a download URL from the renderer.
const ROOT = 'https://github.com/okdalto/siljangnim';
export const RELEASES_URL = `${ROOT}/releases/latest`;
export function parseVersion(value) {
  const match = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value);
  return match ? match.slice(1).map(Number) : null;
}
export function newerVersion(candidate, current) {
  const a = parseVersion(candidate), b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}
export function releaseInfo(release, currentVersion, platform, arch) {
  if (!release || release.draft || release.prerelease || !parseVersion(release.tag_name)) throw new Error('The latest release has an unsupported version.');
  const latestVersion = release.tag_name.replace(/^v/, '');
  const suffix = platform === 'darwin' && arch === 'arm64' ? 'mac-arm64.dmg' : platform === 'win32' && arch === 'x64' ? 'win-x64.exe' : null;
  const name = suffix ? `Siljangnim-${latestVersion}-${suffix}` : null;
  const asset = release.assets?.find(a => a.name === name && a.state === 'uploaded' && a.size > 0);
  const expected = `${ROOT}/releases/download/${encodeURIComponent(release.tag_name)}/${name}`;
  const downloadUrl = asset?.browser_download_url === expected ? expected : null;
  return { currentVersion, latestVersion, available: newerVersion(latestVersion, currentVersion), downloadUrl, releaseUrl: `${ROOT}/releases/tag/${encodeURIComponent(release.tag_name)}` };
}
export function createUpdates({ currentVersion, platform, arch, fetchImpl = fetch, openExternal }) {
  let result = null;
  let pending = null;
  return {
    info: () => ({ currentVersion }),
    check() {
      if (pending) return pending;
      result = null;
      pending = (async () => {
        const response = await fetchImpl('https://api.github.com/repos/okdalto/siljangnim/releases/latest', {
          headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': `Siljangnim/${currentVersion}` },
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) throw new Error(response.status === 403 || response.status === 429 ? 'GitHub is limiting update checks. Please try again later.' : `Could not check updates (HTTP ${response.status}).`);
        result = releaseInfo(await response.json(), currentVersion, platform, arch);
        return result;
      })().catch(error => { throw new Error(error.name === 'TimeoutError' ? 'Update check timed out. Please try again.' : error.message); }).finally(() => { pending = null; });
      return pending;
    },
    async download() {
      if (!result?.available || !result.downloadUrl) throw new Error('Check for a compatible update first.');
      await openExternal(result.downloadUrl);
    },
    async releases() { await openExternal(RELEASES_URL); },
  };
}
