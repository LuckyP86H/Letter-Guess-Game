# Design

## What it is

A letter-guessing game in three modes, with accounts so results follow you between devices.

| Mode             | Who plays                | Rules                                                                                                                                                                                 |
| ---------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Solo**         | Anyone                   | The computer picks a letter. You have 5 guesses per round. Win or lose, a new round starts. Streaks and stats are kept.                                                               |
| **Daily**        | Anyone                   | One letter per UTC day, the same for everyone. One attempt, shareable result grid.                                                                                                    |
| **Friends room** | 2–8 players, invite code | The server picks each round's letter, hidden until the round ends. Every player has 5 lives per round. The first correct guess wins the round. First to 5 round wins takes the match. |

Signed-in players get history, stats and a friends leaderboard. Guests can play everything except saved history.

## Stack

| Layer      | Choice                                                              | Why                                                                              |
| ---------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| UI         | **SolidJS 1.9** + Vite 8                                            | Fine-grained reactivity without a virtual DOM. Small bundle, no React or jQuery. |
| Server     | **Cloudflare Worker** + **Hono**                                    | Same platform as the other projects. Hono gives typed routes.                    |
| Assets     | Workers Static Assets (via `@cloudflare/vite-plugin`)               | One deployable, no separate Pages project.                                       |
| Realtime   | **Durable Object** per room, WebSocket Hibernation API              | One room is one coordinated object. Idle rooms cost nothing.                     |
| Data       | **D1** (SQLite)                                                     | Relational, free tier is enough for this. Migrations in the repo.                |
| Auth       | **Arctic** with GitHub and Google OAuth (authorization code + PKCE) | Free, no passwords stored, no password hashing on the free plan's CPU budget.    |
| Validation | **Zod 4**                                                           | Shared schemas for the client messages and the API.                              |
| Tests      | `bun test` for pure logic, Playwright for the UI                    | Game rules live in pure functions, so they're fast to test.                      |
| Tooling    | Bun, oxlint, oxfmt                                                  | Same as the other modernized projects.                                           |

Node runs Vite and Playwright. Bun installs, runs scripts and tests. TypeScript stays on the 6.x line: 7.x drops the JS API that tooling depends on (see the Gif-Tastic Dependabot fix).

## Architecture

```
browser (Solid SPA)
  │  fetch /api/*          ws /api/rooms/:code
  ▼                        ▼
Worker (Hono)  ───────►  Room Durable Object (one per room)
  │   │                     └─ pure reducer from src/shared/room.ts
  │   └─► D1: users, sessions, results
  └─► GitHub / Google OAuth (Arctic)
```

- `src/shared/` has pure logic with no I/O: letter picking, the daily letter, the guess judge, the round and match reducer, and message schemas. The client and server import the same code, so the rules match.
- `src/worker/` has the HTTP routes, OAuth, sessions, D1 access and the Room Durable Object. The Durable Object only stores messages and calls the reducer.
- `src/client/` has the Solid UI, one component per mode, and a guest-stats store in `localStorage` guarded by try/catch.

## Key decisions

1. **Server-picked secrets.** In a room, the secret letter is chosen on the server and never sent to clients until the round ends. Guesses are validated on the server.
2. **Solo is local.** The solo secret never leaves the browser. Solo results are saved only if you're signed in, and that's a best-effort POST, not a source of truth.
3. **The daily letter is public.** Anyone can compute it from the date. It's a shared puzzle, not a secret. The result grid is the only thing that's personal.
4. **OAuth only.** No passwords, no reset flow, no email. Users sign in with GitHub or Google. Sign-in buttons appear only for providers whose secrets are configured.
5. **Sessions are opaque tokens.** The cookie holds a random token. D1 stores only its SHA-256 hash. The cookie is `HttpOnly`, `Secure`, `SameSite=Lax`. State-changing requests also check the `Origin` header.
6. **OAuth hardening.** `state` and PKCE verifier live in a short-lived, `HttpOnly` cookie and are checked on callback. Only the provider's verified user id is stored.
7. **Room codes** are 6 characters from an unambiguous alphabet, generated with `crypto.getRandomValues`. Codes expire when a room has been idle for 30 minutes.

## Data model (D1)

The schema is in `migrations/0001_init.sql`. Summary:

```sql
users    (id, provider 'github'|'google', provider_user_id, display_name, created_at)  UNIQUE(provider, provider_user_id)
sessions (token_hash PK, user_id, expires_at, created_at)                                -- only the SHA-256 is stored
results  (id, user_id, mode 'solo'|'daily'|'room', day, letter, won,
          guesses_used  -- solo and daily
          rounds_won    -- room
          created_at)
```

One daily result per user per day is enforced by a partial unique index on `(user_id, day)` where `mode = 'daily'`. Solo and daily results can be posted only by a signed-in user, and daily results must be for today's UTC day, so a streak can't be backdated. Room results are written by the Room Durable Object when a match ends.

## Room lifecycle

`lobby → playing(round n) → round_over → … → match_over`. A round ends on the first correct guess or when every player has run out of lives. Between rounds the host can start the next round, and the room closes after the match ends or 30 minutes of inactivity.

The reducer is `reduce(state, event) → { state, effects }`. The Durable Object applies the effects: broadcast a message, save results, or schedule the idle alarm.

## Risks and how they're handled

- **Free-plan CPU (10 ms per request):** the reducer and letter picking are a few microseconds. No password hashing.
- **Hibernation evicts a room:** state is saved with `storage.put` after each reducer step and reloaded in the constructor.
- **Late guesses after a round ends:** every guess carries the round number it was made for. The reducer ignores guesses for any other round.
- **Reconnects:** a client that reconnects gets a full snapshot of the room, not a replay of events. Rejoining with the same player id keeps the score.
- **Abuse:** rooms cap at 8 players and names are limited to 20 characters. There's no rate limiting in v1. Cloudflare's rate-limiting rules can add it later without code changes.

## Out of scope (for now)

Chat, public matchmaking, email login, and a word-list mode. Each is easy to add later on this structure.

TypeScript stays on 6.x: Dependabot major bumps for it are ignored in `.github/dependabot.yml` until the toolchain supports 7.
