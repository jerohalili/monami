// Retry 429/5xx once after 2s. Seen 502s on big imports.

export const MIN_RATE_LIMIT = 500;

export async function fetchGithubWithBackoff<T>(fn: () => Promise<T>, retries = 1): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    const isRetryable = msg.includes("429") || msg.includes("500") || msg.includes("502") || msg.includes("503");
    if (retries > 0 && isRetryable) {
      await new Promise((r) => setTimeout(r, 2000));
      return fetchGithubWithBackoff(fn, retries - 1);
    }
    throw e;
  }
}
// Legacy alias.
export const fetchWithRetry = fetchGithubWithBackoff;
