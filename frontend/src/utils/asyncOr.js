/**
 * Execute an async function, returning a fallback value on error.
 * Removes repetitive try-catch boilerplate for optional data loading.
 */
export async function asyncOr(fn, fallback) {
  try { return await fn(); } catch { return fallback; }
}
