import { GitHub, Google, generateCodeVerifier, generateState } from "arctic";
import type { Env } from "./env";

export const SESSION_COOKIE = "lgg_session";
export const OAUTH_COOKIE = "lgg_oauth";
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;

export type Provider = "github" | "google";

export interface CurrentUser {
  id: string;
  displayName: string;
  provider: Provider;
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function randomToken(bytes = 32): string {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function configuredProviders(env: Env): Provider[] {
  const providers: Provider[] = [];
  if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) providers.push("github");
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) providers.push("google");
  return providers;
}

export function redirectUri(origin: string, provider: Provider): string {
  return `${origin}/api/auth/${provider}/callback`;
}

// Builds the provider client for this request's origin. Returns null if the provider isn't configured.
export function oauthClient(env: Env, origin: string, provider: Provider) {
  if (provider === "github" && env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
    return new GitHub(
      env.GITHUB_CLIENT_ID,
      env.GITHUB_CLIENT_SECRET,
      redirectUri(origin, provider),
    );
  }
  if (provider === "google" && env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    return new Google(
      env.GOOGLE_CLIENT_ID,
      env.GOOGLE_CLIENT_SECRET,
      redirectUri(origin, provider),
    );
  }
  return null;
}

// Both the state and the PKCE verifier go into one short-lived HttpOnly cookie.
export function newOAuthAttempt(): { state: string; verifier: string } {
  return { state: generateState(), verifier: generateCodeVerifier() };
}

export function encodeOAuthCookie(attempt: { state: string; verifier: string }): string {
  return `${attempt.state}.${attempt.verifier}`;
}

export function decodeOAuthCookie(
  value: string | undefined,
): { state: string; verifier: string } | null {
  if (!value) return null;
  const [state, verifier] = value.split(".");
  return state && verifier ? { state, verifier } : null;
}

// Returns the provider's stable user id and a display name.
export async function fetchProfile(
  provider: Provider,
  accessToken: string,
): Promise<{ providerUserId: string; displayName: string }> {
  if (provider === "github") {
    const res = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${accessToken}`, "User-Agent": "letter-guess-game" },
    });
    if (!res.ok) throw new Error(`GitHub profile request failed: ${res.status}`);
    const user = (await res.json()) as { id: number; login: string; name?: string | null };
    return { providerUserId: String(user.id), displayName: user.name || user.login };
  }

  const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Google profile request failed: ${res.status}`);
  const user = (await res.json()) as { sub: string; name?: string };
  return { providerUserId: user.sub, displayName: user.name || "Player" };
}

export async function upsertUser(
  db: D1Database,
  provider: Provider,
  providerUserId: string,
  displayName: string,
): Promise<string> {
  const id = crypto.randomUUID();
  const row = await db
    .prepare(
      `INSERT INTO users (id, provider, provider_user_id, display_name, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT (provider, provider_user_id) DO UPDATE SET display_name = excluded.display_name
       RETURNING id`,
    )
    .bind(id, provider, providerUserId, displayName.slice(0, 40), Date.now())
    .first<{ id: string }>();
  if (!row) throw new Error("could not save the user");
  return row.id;
}

export async function createSession(db: D1Database, userId: string): Promise<string> {
  const token = randomToken();
  const now = Date.now();
  await db
    .prepare(
      "INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?1, ?2, ?3, ?4)",
    )
    .bind(await sha256Hex(token), userId, now + SESSION_MS, now)
    .run();
  return token;
}

export async function currentUser(
  db: D1Database,
  token: string | undefined,
): Promise<CurrentUser | null> {
  if (!token) return null;
  const row = await db
    .prepare(
      `SELECT users.id, users.display_name AS displayName, users.provider
       FROM sessions JOIN users ON users.id = sessions.user_id
       WHERE sessions.token_hash = ?1 AND sessions.expires_at > ?2`,
    )
    .bind(await sha256Hex(token), Date.now())
    .first<CurrentUser>();
  return row ?? null;
}

export async function endSession(db: D1Database, token: string | undefined): Promise<void> {
  if (!token) return;
  await db
    .prepare("DELETE FROM sessions WHERE token_hash = ?1")
    .bind(await sha256Hex(token))
    .run();
}

export const SESSION_MAX_AGE_S = SESSION_MS / 1000;

// Browsers always send Origin on a POST. Reject anything that doesn't match this site.
// SameSite=Lax on the session cookie is the first line of defence; this is the second.
export function sameOrigin(request: Request): boolean {
  return request.headers.get("Origin") === new URL(request.url).origin;
}
