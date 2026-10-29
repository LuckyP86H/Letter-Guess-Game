# Letter Guess

A letter-guessing game. The computer picks a letter, and you guess it in five tries. Play alone, take the daily letter with everyone, or race friends in a room.

## What's included

- **Solo:** endless rounds with streaks and guesses-to-win stats.
- **Daily:** one letter per UTC day, the same for everyone, with a shareable result grid.
- **Friends rooms:** create a room and share the code. The server picks each round's letter, so nobody can peek. First to five round wins takes the match.
- **Accounts:** sign in with GitHub or Google to keep your history on every device. No passwords are stored.
- **Works offline-first for guests:** history stays in your browser until you sign in.
- Keyboard and on-screen controls, phone-friendly layout, light and dark themes, and reduced-motion support.

## Getting started

Requirements: [Bun](https://bun.sh) 1.4+ and Node 24 or later.

```sh
bun install
bun run db:migrate:local   # create the local D1 database
bun run dev                # the app runs at http://localhost:5173
```

To try sign-in locally, copy `.dev.vars.example` to `.dev.vars` and add a GitHub or Google OAuth client. Each provider needs the callback `http://localhost:5173/api/auth/<provider>/callback`. Sign-in buttons appear only for providers that have credentials.

Other commands:

```sh
bun test src          # game rules and room logic
bun run typecheck
bun run lint
bun run build
```

## Deploying

The app runs as one Cloudflare Worker with a D1 database and a Durable Object for rooms. The free plan covers all of it.

1. Create a D1 database and put its ID in `wrangler.jsonc`.
2. Apply the migrations: `bunx wrangler d1 migrations apply letter-guess-game --remote`.
3. Add the OAuth secrets: `bunx wrangler secret put GITHUB_CLIENT_ID`, and the same for `GITHUB_CLIENT_SECRET`, `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
4. Deploy: `bun run deploy`.

Each provider's OAuth app needs the production callback, `https://<your-worker>/api/auth/<provider>/callback`.

See [docs/DESIGN.md](docs/DESIGN.md) for how the pieces fit together.
