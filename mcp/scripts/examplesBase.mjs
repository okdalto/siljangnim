// Where the packaged studio fetches example files from. The npm package leaves the ~400 examples out
// and points at the same commit on GitHub, whose files match the build-time hashes. That only holds
// when the examples in the checkout are committed and the commit is pushed, so both are checked.
export const LOCAL = "local";

/** Decides the base URL: an explicit env value wins ("local" bundles the files); otherwise HEAD on GitHub. */
export function examplesBase({ env, sha, repo = "okdalto/siljangnim", dirty }) {
  if (env === LOCAL) return null;
  if (env) return env;
  if (dirty) {
    throw new Error(
      `examples/ has uncommitted changes:\n${dirty}\nCommit and push them, or set SILJANGNIM_EXAMPLES_BASE_URL=${LOCAL} to bundle the files.`,
    );
  }
  return `https://raw.githubusercontent.com/${repo}/${sha}/examples`;
}
