import { describe, expect, test } from "bun:test";
import { summarise } from "./stats";

describe("summarise", () => {
  test("is all zeros for no games", () => {
    expect(summarise([])).toEqual({
      played: 0,
      wins: 0,
      winRate: 0,
      streak: 0,
      bestStreak: 0,
      distribution: [0, 0, 0, 0, 0],
    });
  });

  test("counts the streak from the newest game and the best streak overall", () => {
    // Newest first: win, win, loss, win, win, win
    const entries = [
      { won: true, guessesUsed: 1 },
      { won: true, guessesUsed: 3 },
      { won: false, guessesUsed: 5 },
      { won: true, guessesUsed: 2 },
      { won: true, guessesUsed: 2 },
      { won: true, guessesUsed: 5 },
    ];
    const stats = summarise(entries);
    expect(stats.streak).toBe(2);
    expect(stats.bestStreak).toBe(3);
    expect(stats.wins).toBe(5);
    expect(stats.winRate).toBeCloseTo(5 / 6);
    expect(stats.distribution).toEqual([1, 2, 1, 0, 1]);
  });

  test("ignores losses in the distribution", () => {
    expect(summarise([{ won: false, guessesUsed: 5 }]).distribution).toEqual([0, 0, 0, 0, 0]);
  });
});
