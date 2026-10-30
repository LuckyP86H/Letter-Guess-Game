import { describe, expect, test } from "bun:test";
import {
  ALPHABET,
  LIVES,
  applySoloGuess,
  dailyLetter,
  judge,
  newSoloRound,
  normaliseGuess,
  pickLetter,
  utcDay,
} from "./game";

describe("pickLetter", () => {
  test("maps the integer range onto the alphabet", () => {
    expect(pickLetter(() => 0)).toBe("a");
    expect(pickLetter(() => 25)).toBe("z");
  });
});

describe("dailyLetter", () => {
  test("is the same for everyone on a given day", () => {
    expect(dailyLetter("2026-10-29")).toBe(dailyLetter("2026-10-29"));
  });

  test("always returns a letter", () => {
    for (let d = 1; d <= 366; d++) {
      const day = `2026-${String(Math.ceil(d / 31)).padStart(2, "0")}-${String((d % 28) + 1).padStart(2, "0")}`;
      expect(ALPHABET).toContain(dailyLetter(day));
    }
  });

  test("changes from one day to the next most of the time", () => {
    const letters = new Set<string>();
    for (let d = 1; d <= 26; d++) letters.add(dailyLetter(`2026-10-${String(d).padStart(2, "0")}`));
    expect(letters.size).toBeGreaterThan(10);
  });
});

describe("utcDay", () => {
  test("uses the UTC date, not the local one", () => {
    expect(utcDay(new Date("2026-10-29T23:30:00Z"))).toBe("2026-10-29");
  });
});

describe("normaliseGuess", () => {
  test("accepts one letter, any case, surrounding spaces", () => {
    expect(normaliseGuess(" Q ")).toBe("q");
  });

  test("rejects anything else", () => {
    for (const bad of ["", "ab", "1", "é", "ß", null, 7, undefined]) {
      expect(normaliseGuess(bad)).toBeNull();
    }
  });
});

describe("judge", () => {
  test("is correct, wrong or invalid", () => {
    expect(judge("e", "e")).toBe("correct");
    expect(judge("e", "t")).toBe("wrong");
    expect(judge("e", null)).toBe("invalid");
  });
});

describe("solo round", () => {
  test("wins on the right letter, keeping the lives left", () => {
    const result = applySoloGuess(newSoloRound("m"), "M");
    expect(result).toMatchObject({ ok: true, round: { status: "won", lives: LIVES } });
  });

  test("loses after the last life is spent", () => {
    let round = newSoloRound("z");
    const wrong = ["a", "b", "c", "d", "e"];
    for (const letter of wrong) {
      const result = applySoloGuess(round, letter);
      if (!result.ok) throw new Error(result.reason);
      round = result.round;
    }
    expect(round).toMatchObject({ status: "lost", lives: 0 });
  });

  test("a repeated letter costs nothing", () => {
    const first = applySoloGuess(newSoloRound("z"), "a");
    if (!first.ok) throw new Error(first.reason);
    const again = applySoloGuess(first.round, "a");
    expect(again).toEqual({ ok: false, reason: "already tried that letter" });
    expect(first.round.lives).toBe(LIVES - 1);
  });

  test("rejects guesses after the round ends", () => {
    const won = applySoloGuess(newSoloRound("a"), "a");
    if (!won.ok) throw new Error(won.reason);
    expect(applySoloGuess(won.round, "b")).toEqual({ ok: false, reason: "round is over" });
  });
});
