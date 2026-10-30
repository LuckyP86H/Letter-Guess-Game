import { getJSON, postJSON } from "./api";
import { readJSON, writeJSON } from "./storage";
import { user } from "./session";

export interface GameEntry {
  mode: "solo" | "daily" | "room";
  won: boolean;
  guessesUsed: number | null;
  roundsWon: number | null;
  letter: string | null;
  day: string | null;
  createdAt: number;
}

const LOCAL_KEY = "lgg.history";
const LOCAL_LIMIT = 500;

export function localHistory(): GameEntry[] {
  return readJSON<GameEntry[]>(LOCAL_KEY, []);
}

export function hasPlayedDaily(day: string): boolean {
  return localHistory().some((e) => e.mode === "daily" && e.day === day);
}

// Guests keep history in this browser. Signed-in players also save it to the server.
export async function recordSolo(entry: {
  won: boolean;
  guessesUsed: number;
  letter: string;
}): Promise<void> {
  storeLocally({ mode: "solo", day: null, roundsWon: null, createdAt: Date.now(), ...entry });
  if (user()) {
    await postJSON("/api/results", { mode: "solo", ...entry }).catch(() => undefined);
  }
}

export async function recordDaily(entry: {
  day: string;
  won: boolean;
  guessesUsed: number;
  letter: string;
}): Promise<void> {
  storeLocally({ mode: "daily", roundsWon: null, createdAt: Date.now(), ...entry });
  if (user()) {
    await postJSON("/api/results", { mode: "daily", ...entry }).catch(() => undefined);
  }
}

export async function loadHistory(): Promise<GameEntry[]> {
  if (!user()) return localHistory();
  const { results } = await getJSON<{ results: GameEntry[] }>("/api/results");
  return results.map((r) => ({ ...r, won: Boolean(r.won) }));
}

function storeLocally(entry: GameEntry): void {
  const next = [entry, ...localHistory()].slice(0, LOCAL_LIMIT);
  writeJSON(LOCAL_KEY, next);
}
