/** Browsers cache failed module loads by URL; use a fresh URL for bounded network retries. */
export async function importWithRetry(
  url: string,
  load: (url: string) => Promise<unknown>,
  wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    const target = new URL(url);
    if (attempt) target.searchParams.set("__siljangnim_retry", String(attempt));
    try {
      return await load(target.href);
    } catch (error) {
      // Don't retry syntax errors or exceptions thrown by module initialization.
      if (attempt >= 2 || !(error instanceof TypeError) ||
          !/Failed to fetch dynamically imported module|error loading dynamically imported module/i.test(error.message)) throw error;
      await wait(500 * (attempt + 1));
    }
  }
}
