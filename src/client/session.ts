import { createSignal } from "solid-js";
import { getJSON } from "./api";

export type Provider = "github" | "google";

export interface User {
  id: string;
  displayName: string;
  provider: Provider;
}

export const [user, setUser] = createSignal<User | null>(null);
export const [providers, setProviders] = createSignal<Provider[]>([]);
export const [sessionReady, setSessionReady] = createSignal(false);

export async function loadSession(): Promise<void> {
  try {
    const [me, config] = await Promise.all([
      getJSON<{ user: User | null }>("/api/me"),
      getJSON<{ providers: Provider[] }>("/api/config"),
    ]);
    setUser(me.user);
    setProviders(config.providers);
  } catch {
    // Offline or the API is down. The game still works as a guest.
    setUser(null);
  } finally {
    setSessionReady(true);
  }
}

export async function signOut(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
  setUser(null);
}
