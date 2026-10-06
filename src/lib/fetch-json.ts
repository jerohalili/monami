export async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(body?.error ?? `Request failed (HTTP ${res.status})`);
  }
  return body as T;
}
