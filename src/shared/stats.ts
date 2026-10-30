// Stats from a list of solo results. Shared so the history page and the tests agree.

export interface SoloEntry {
  won: boolean;
  guessesUsed: number | null;
}

export interface Stats {
  played: number;
  wins: number;
  winRate: number;
  streak: number;
  bestStreak: number;
  // Index 0 is one guess, index 4 is five guesses. Only wins are counted.
  distribution: [number, number, number, number, number];
}

// `entries` must be newest first. The streak counts wins from the most recent game backwards.
export function summarise(entries: SoloEntry[]): Stats {
  const played = entries.length;
  const wins = entries.filter((e) => e.won).length;

  let streak = 0;
  for (const entry of entries) {
    if (!entry.won) break;
    streak++;
  }

  let bestStreak = 0;
  let run = 0;
  for (const entry of [...entries].reverse()) {
    run = entry.won ? run + 1 : 0;
    bestStreak = Math.max(bestStreak, run);
  }

  const distribution: Stats["distribution"] = [0, 0, 0, 0, 0];
  for (const entry of entries) {
    if (
      entry.won &&
      entry.guessesUsed !== null &&
      entry.guessesUsed >= 1 &&
      entry.guessesUsed <= 5
    ) {
      const index = entry.guessesUsed - 1;
      distribution[index] = (distribution[index] ?? 0) + 1;
    }
  }

  return {
    played,
    wins,
    winRate: played === 0 ? 0 : wins / played,
    streak,
    bestStreak,
    distribution,
  };
}
