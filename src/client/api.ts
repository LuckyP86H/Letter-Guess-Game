export async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(await res.text().catch(() => `request failed: ${res.status}`));
  return (await res.json()) as T;
}

export async function postJSON<T>(path: string, body?: unknown): Promise<T | null> {
  const res = await fetch(path, {
    method: "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `request failed: ${res.status}`));
  if (res.status === 204) return null;
  return (await res.json().catch(() => null)) as T | null;
}
