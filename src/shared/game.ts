// Pure game rules. No I/O, so the client and the Worker run the same code.

export const ALPHABET = "abcdefghijklmnopqrstuvwxyz";
export const LIVES = 5;

export type Judgement = "correct" | "wrong" | "invalid";

// `random` returns an integer in [0, n). Callers pass crypto-backed values on the server
// and Math.random in the browser, so tests can inject a fixed sequence.
export function pickLetter(randomInt: (n: number) => number): string {
  return ALPHABET.charAt(randomInt(ALPHABET.length));
}

// The same letter for everyone on a given UTC day. FNV-1a over the date string keeps it
// deterministic without storing anything. It's a shared puzzle, not a secret.
export function dailyLetter(day: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < day.length; i++) {
    hash ^= day.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return ALPHABET.charAt(hash % ALPHABET.length);
}

export function utcDay(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function normaliseGuess(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const letter = raw.trim().toLowerCase();
  return letter.length === 1 && ALPHABET.includes(letter) ? letter : null;
}

export function judge(secret: string, guess: string | null): Judgement {
  if (guess === null) return "invalid";
  return guess === secret ? "correct" : "wrong";
}

export type SoloStatus = "playing" | "won" | "lost";

export interface SoloRound {
  secret: string;
  lives: number;
  guessed: string[];
  status: SoloStatus;
}

export function newSoloRound(secret: string): SoloRound {
  return { secret, lives: LIVES, guessed: [], status: "playing" };
}

export type SoloResult = { ok: true; round: SoloRound } | { ok: false; reason: string };

// A repeated letter costs nothing, so the player isn't punished for a typo.
export function applySoloGuess(round: SoloRound, raw: unknown): SoloResult {
  if (round.status !== "playing") return { ok: false, reason: "round is over" };
  const guess = normaliseGuess(raw);
  if (guess === null) return { ok: false, reason: "guess a single letter a–z" };
  if (round.guessed.includes(guess)) return { ok: false, reason: "already tried that letter" };

  const guessed = [...round.guessed, guess];
  const verdict = judge(round.secret, guess);
  if (verdict === "correct") {
    return { ok: true, round: { ...round, guessed, status: "won" } };
  }
  const lives = round.lives - 1;
  return {
    ok: true,
    round: { ...round, guessed, lives, status: lives === 0 ? "lost" : "playing" },
  };
}
