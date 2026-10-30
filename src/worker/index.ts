import { GitHub } from "arctic";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import { dailyLetter, normaliseGuess, utcDay } from "../shared/game";
import { createRoomResponse } from "../shared/protocol";
import {
  OAUTH_COOKIE,
  SESSION_COOKIE,
  SESSION_MAX_AGE_S,
  configuredProviders,
  createSession,
  currentUser,
  decodeOAuthCookie,
  encodeOAuthCookie,
  endSession,
  fetchProfile,
  newOAuthAttempt,
  oauthClient,
  sameOrigin,
  upsertUser,
  type Provider,
} from "./auth";
import type { Env } from "./env";

export { Room } from "./room";

type App = { Bindings: Env };
const app = new Hono<App>();

const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_CODE = /^[A-HJ-NP-Z2-9]{6}$/;

function parseProvider(raw: string): Provider | null {
  return raw === "github" || raw === "google" ? raw : null;
}

const cookieOptions = { httpOnly: true, secure: true, sameSite: "Lax" as const };

app.get("/api/config", (c) => c.json({ providers: configuredProviders(c.env) }));

app.get("/api/me", async (c) => {
  const user = await currentUser(c.env.DB, getCookie(c, SESSION_COOKIE));
  return c.json({ user });
});

app.get("/api/auth/:provider/login", (c) => {
  const provider = parseProvider(c.req.param("provider"));
  const client = provider && oauthClient(c.env, new URL(c.req.url).origin, provider);
  if (!provider || !client) return c.notFound();

  const attempt = newOAuthAttempt();
  setCookie(c, OAUTH_COOKIE, encodeOAuthCookie(attempt), {
    ...cookieOptions,
    path: "/api/auth",
    maxAge: 600,
  });
  const url =
    client instanceof GitHub
      ? client.createAuthorizationURL(attempt.state, ["read:user"])
      : client.createAuthorizationURL(attempt.state, attempt.verifier, ["openid", "profile"]);
  return c.redirect(url.toString());
});

app.get("/api/auth/:provider/callback", async (c) => {
  const provider = parseProvider(c.req.param("provider"));
  const client = provider && oauthClient(c.env, new URL(c.req.url).origin, provider);
  if (!provider || !client) return c.notFound();

  const url = new URL(c.req.url);
  const attempt = decodeOAuthCookie(getCookie(c, OAUTH_COOKIE));
  deleteCookie(c, OAUTH_COOKIE, { path: "/api/auth" });
  if (!attempt || url.searchParams.get("state") !== attempt.state) {
    return c.text("That sign-in link has expired. Please try again.", 400);
  }
  const code = url.searchParams.get("code");
  if (!code) return c.text("Sign-in was cancelled.", 400);

  try {
    const tokens =
      client instanceof GitHub
        ? await client.validateAuthorizationCode(code)
        : await client.validateAuthorizationCode(code, attempt.verifier);
    const profile = await fetchProfile(provider, tokens.accessToken());
    const userId = await upsertUser(
      c.env.DB,
      provider,
      profile.providerUserId,
      profile.displayName,
    );
    const token = await createSession(c.env.DB, userId);
    setCookie(c, SESSION_COOKIE, token, { ...cookieOptions, path: "/", maxAge: SESSION_MAX_AGE_S });
    return c.redirect("/");
  } catch (error) {
    console.error("sign-in failed", provider, error);
    return c.text("Sign-in failed. Please try again.", 502);
  }
});

app.post("/api/auth/logout", async (c) => {
  if (!sameOrigin(c.req.raw)) return c.text("forbidden", 403);
  await endSession(c.env.DB, getCookie(c, SESSION_COOKIE));
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.body(null, 204);
});

const resultBody = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("solo"),
    letter: z.string().length(1),
    won: z.boolean(),
    guessesUsed: z.number().int().min(1).max(5),
  }),
  z.object({
    mode: z.literal("daily"),
    day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    letter: z.string().length(1),
    won: z.boolean(),
    guessesUsed: z.number().int().min(1).max(5),
  }),
]);

app.post("/api/results", async (c) => {
  if (!sameOrigin(c.req.raw)) return c.text("forbidden", 403);
  const user = await currentUser(c.env.DB, getCookie(c, SESSION_COOKIE));
  if (!user) return c.text("sign in to save results", 401);

  const parsed = resultBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.text("invalid result", 400);
  const body = parsed.data;
  const letter = normaliseGuess(body.letter);
  if (letter === null) return c.text("invalid letter", 400);
  // A loss always uses all five guesses.
  if (!body.won && body.guessesUsed !== 5) return c.text("invalid result", 400);

  if (body.mode === "daily") {
    // Only today's puzzle can be recorded, so nobody can backdate a streak.
    if (body.day !== utcDay() || letter !== dailyLetter(body.day)) {
      return c.text("that isn't today's daily puzzle", 400);
    }
    try {
      await c.env.DB.prepare(
        "INSERT INTO results (user_id, mode, day, letter, won, guesses_used, created_at) VALUES (?1, 'daily', ?2, ?3, ?4, ?5, ?6)",
      )
        .bind(user.id, body.day, letter, body.won ? 1 : 0, body.guessesUsed, Date.now())
        .run();
    } catch {
      return c.text("already recorded today", 409);
    }
    return c.body(null, 201);
  }

  await c.env.DB.prepare(
    "INSERT INTO results (user_id, mode, letter, won, guesses_used, created_at) VALUES (?1, 'solo', ?2, ?3, ?4, ?5)",
  )
    .bind(user.id, letter, body.won ? 1 : 0, body.guessesUsed, Date.now())
    .run();
  return c.body(null, 201);
});

app.get("/api/results", async (c) => {
  const user = await currentUser(c.env.DB, getCookie(c, SESSION_COOKIE));
  if (!user) return c.text("sign in to see your history", 401);
  const rows = await c.env.DB.prepare(
    `SELECT mode, day, letter, won, guesses_used AS guessesUsed, rounds_won AS roundsWon, created_at AS createdAt
     FROM results WHERE user_id = ?1 ORDER BY created_at DESC LIMIT 200`,
  )
    .bind(user.id)
    .all();
  return c.json({ results: rows.results });
});

app.post("/api/rooms", (c) => {
  if (!sameOrigin(c.req.raw)) return c.text("forbidden", 403);
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  const code = [...bytes].map((b) => ROOM_ALPHABET[b % ROOM_ALPHABET.length]).join("");
  return c.json(createRoomResponse.parse({ code }), 201);
});

app.get("/api/rooms/:code/ws", async (c) => {
  const code = c.req.param("code");
  if (!ROOM_CODE.test(code)) return c.text("no such room", 404);
  if (c.req.header("Upgrade") !== "websocket") return c.text("expected a websocket", 426);

  // Only the server decides who the user is. Headers the browser sends are not forwarded.
  const user = await currentUser(c.env.DB, getCookie(c, SESSION_COOKIE));
  const headers = new Headers({ Upgrade: "websocket", "X-Room-Code": code });
  if (user) headers.set("X-User-Id", user.id);
  const stub = c.env.ROOM.get(c.env.ROOM.idFromName(code));
  return stub.fetch(new Request(c.req.url, { headers }));
});

app.all("/api/*", (c) => c.json({ error: "not found" }, 404));

export default app;
