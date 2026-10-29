import { describe, expect, test } from "bun:test";
import { LIVES } from "./game";
import {
  MATCH_TO,
  MAX_PLAYERS,
  newRoom,
  publicView,
  reduce,
  type RoomEvent,
  type RoomState,
} from "./room";

// Always pick "c" so the tests know the secret.
const fixed = () => 2;

function play(state: RoomState, event: RoomEvent): RoomState {
  const outcome = reduce(state, event, fixed);
  if (!outcome.ok) throw new Error(outcome.reason);
  return outcome.state;
}

function failure(state: RoomState, event: RoomEvent): string {
  const outcome = reduce(state, event, fixed);
  if (outcome.ok) throw new Error("expected a rejection");
  return outcome.reason;
}

function roomWith(...ids: string[]): RoomState {
  let state = newRoom("ABCDEF");
  for (const id of ids) {
    state = play(state, { type: "join", playerId: id, userId: null, name: id });
  }
  return state;
}

const guess = (playerId: string, letter: string, round = 1): RoomEvent => ({
  type: "guess",
  playerId,
  letter,
  round,
});

describe("joining", () => {
  test("the first player becomes host", () => {
    const state = roomWith("p1", "p2");
    expect(state.host).toBe("p1");
    expect(state.players.map((p) => p.id)).toEqual(["p1", "p2"]);
  });

  test("rejoining keeps the score and updates the name", () => {
    let state = roomWith("p1", "p2");
    state = play(state, { type: "join", playerId: "p1", userId: null, name: "Ann" });
    expect(state.players[0]).toMatchObject({ name: "Ann", wins: 0 });
    expect(state.players).toHaveLength(2);
  });

  test("enforces the player cap and name length", () => {
    const ids = Array.from({ length: MAX_PLAYERS }, (_, i) => `player${i}xxxxxxxx`);
    const full = roomWith(...ids);
    expect(
      failure(full, { type: "join", playerId: "late-player-xxxxxx", userId: null, name: "x" }),
    ).toBe("the room is full");
    expect(
      failure(newRoom("ABCDEF"), { type: "join", playerId: "p1", userId: null, name: "   " }),
    ).toMatch(/characters/);
  });
});

describe("starting", () => {
  test("needs the host and at least two players", () => {
    const state = roomWith("p1");
    expect(failure(state, { type: "start", playerId: "p1" })).toBe("you need at least 2 players");
    const two = roomWith("p1", "p2");
    expect(failure(two, { type: "start", playerId: "p2" })).toBe("only the host can start");
  });

  test("picks the secret on the server and hides it while playing", () => {
    const state = play(roomWith("p1", "p2"), { type: "start", playerId: "p1" });
    expect(state).toMatchObject({ phase: "playing", round: 1, secret: "c" });
    expect(publicView(state).revealed).toBeNull();
  });
});

describe("guessing", () => {
  const started = () => play(roomWith("p1", "p2"), { type: "start", playerId: "p1" });

  test("the first correct guess wins the round and reveals the letter", () => {
    const state = play(started(), guess("p2", "C"));
    expect(state).toMatchObject({ phase: "round_over", roundWinner: "p2" });
    expect(state.players.find((p) => p.id === "p2")?.wins).toBe(1);
    expect(publicView(state).revealed).toBe("c");
  });

  test("a wrong guess costs a life and is shared with everyone", () => {
    const state = play(started(), guess("p1", "a"));
    expect(state.players.find((p) => p.id === "p1")?.lives).toBe(LIVES - 1);
    expect(state.tried).toEqual(["a"]);
    expect(failure(state, guess("p2", "a"))).toBe("someone already tried that letter");
  });

  test("the round ends with no winner when everyone is out of lives", () => {
    let state = started();
    const wrong = ["a", "b", "d", "e", "f", "g", "h", "i", "j", "k"];
    let i = 0;
    while (state.phase === "playing") {
      state = play(state, guess(i % 2 === 0 ? "p1" : "p2", wrong[i] ?? "z"));
      i++;
    }
    expect(state).toMatchObject({ phase: "round_over", roundWinner: null });
    expect(publicView(state).revealed).toBe("c");
  });

  test("a player who is out of lives can't keep guessing", () => {
    let state = started();
    for (const letter of ["a", "b", "d", "e", "f"]) {
      state = play(state, guess("p1", letter));
    }
    expect(failure(state, guess("p1", "g"))).toBe("you are out of lives this round");
  });

  test("guesses for an earlier round are ignored", () => {
    const state = play(started(), guess("p2", "c"));
    const next = play(state, { type: "next", playerId: "p1" });
    expect(failure(next, guess("p1", "x", 1))).toBe("that guess is for an earlier round");
  });

  test("a match ends when someone reaches MATCH_TO round wins", () => {
    let state = started();
    for (let round = 1; round <= MATCH_TO; round++) {
      if (round > 1) state = play(state, { type: "next", playerId: "p1" });
      state = play(state, guess("p1", "c", round));
    }
    expect(state).toMatchObject({ phase: "match_over", matchWinner: "p1" });
    expect(state.players[0]?.wins).toBe(MATCH_TO);
  });
});

describe("leaving", () => {
  test("if the host leaves, the next player takes over", () => {
    const state = play(roomWith("p1", "p2", "p3"), { type: "leave", playerId: "p1" });
    expect(state.host).toBe("p2");
  });

  test("leaving mid-match with one player left goes back to the lobby", () => {
    let state = play(roomWith("p1", "p2"), { type: "start", playerId: "p1" });
    state = play(state, { type: "leave", playerId: "p2" });
    expect(state).toMatchObject({
      phase: "lobby",
      round: 0,
      secret: "",
      players: [{ wins: 0, lives: LIVES }],
    });
  });
});
