import type { Room } from "./room";

export interface Env {
  DB: D1Database;
  ROOM: DurableObjectNamespace<Room>;
  ASSETS: Fetcher;
  // Each provider is optional. Sign-in buttons appear only for providers that are configured.
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}
