// Pure state machine for a friends room. The Durable Object applies these rules and handles
// storage and sockets. Secrets stay in the server state until a round is over.

import { LIVES, judge, normaliseGuess, pickLetter } from "./game";

export const MAX_PLAYERS = 8;
export const MIN_PLAYERS = 2;
export const MATCH_TO = 5;
export const MAX_NAME = 20;

export type Phase = "lobby" | "playing" | "round_over" | "match_over";

export interface Player {
  id: string;
  userId: string | null;
  name: string;
  wins: number;
  lives: number;
}

export interface RoomState {
  code: string;
  phase: Phase;
  round: number;
  host: string | null;
  players: Player[];
  secret: string;
  tried: string[];
  roundWinner: string | null;
  matchWinner: string | null;
}

export type RoomEvent =
  | { type: "join"; playerId: string; userId: string | null; name: string }
  | { type: "leave"; playerId: string }
  | { type: "start"; playerId: string }
  | { type: "next"; playerId: string }
  | { type: "guess"; playerId: string; letter: unknown; round: number };

export type Outcome =
  | { ok: true; state: RoomState }
  | { ok: false; state: RoomState; reason: string };

// What every client may see. The secret is included only once the round is over.
export interface PublicRoom {
  code: string;
  phase: Phase;
  round: number;
  host: string | null;
  players: Player[];
  tried: string[];
  roundWinner: string | null;
  matchWinner: string | null;
  revealed: string | null;
}

export function newRoom(code: string): RoomState {
  return {
    code,
    phase: "lobby",
    round: 0,
    host: null,
    players: [],
    secret: "",
    tried: [],
    roundWinner: null,
    matchWinner: null,
  };
}

export function publicView(state: RoomState): PublicRoom {
  const over = state.phase === "round_over" || state.phase === "match_over";
  return {
    code: state.code,
    phase: state.phase,
    round: state.round,
    host: state.host,
    players: state.players,
    tried: state.tried,
    roundWinner: state.roundWinner,
    matchWinner: state.matchWinner,
    revealed: over ? state.secret : null,
  };
}

export function reduce(
  state: RoomState,
  event: RoomEvent,
  randomInt: (n: number) => number,
): Outcome {
  switch (event.type) {
    case "join":
      return join(state, event);
    case "leave":
      return leave(state, event.playerId);
    case "start":
      return start(state, event.playerId, randomInt);
    case "next":
      return next(state, event.playerId, randomInt);
    case "guess":
      return guess(state, event);
  }
}

function fail(state: RoomState, reason: string): Outcome {
  return { ok: false, state, reason };
}

function join(state: RoomState, event: Extract<RoomEvent, { type: "join" }>): Outcome {
  const name = event.name.trim();
  if (name.length === 0 || name.length > MAX_NAME) {
    return fail(state, `names are 1–${MAX_NAME} characters`);
  }
  const existing = state.players.find((p) => p.id === event.playerId);
  if (existing) {
    // Reconnecting or renaming: the same player id keeps its score.
    const players = state.players.map((p) => (p.id === event.playerId ? { ...p, name } : p));
    return { ok: true, state: { ...state, players } };
  }
  if (state.phase !== "lobby" && state.phase !== "match_over") {
    return fail(state, "a match is in progress");
  }
  if (state.players.length >= MAX_PLAYERS) return fail(state, "the room is full");

  const player: Player = { id: event.playerId, userId: event.userId, name, wins: 0, lives: LIVES };
  return {
    ok: true,
    state: { ...state, players: [...state.players, player], host: state.host ?? player.id },
  };
}

function leave(state: RoomState, playerId: string): Outcome {
  const players = state.players.filter((p) => p.id !== playerId);
  if (players.length === state.players.length) return { ok: true, state };

  const host = state.host === playerId ? (players[0]?.id ?? null) : state.host;
  // A match needs two players. If one leaves mid-match, go back to the lobby.
  const short =
    players.length < MIN_PLAYERS && (state.phase === "playing" || state.phase === "round_over");
  if (short) {
    return {
      ok: true,
      state: {
        ...state,
        phase: "lobby",
        round: 0,
        host,
        players: players.map(resetPlayer),
        secret: "",
        tried: [],
        roundWinner: null,
        matchWinner: null,
      },
    };
  }
  return { ok: true, state: { ...state, host, players } };
}

function resetPlayer(p: Player): Player {
  return { ...p, wins: 0, lives: LIVES };
}

function startRound(state: RoomState, randomInt: (n: number) => number, round: number): RoomState {
  return {
    ...state,
    phase: "playing",
    round,
    secret: pickLetter(randomInt),
    tried: [],
    roundWinner: null,
    players: state.players.map((p) => ({ ...p, lives: LIVES })),
  };
}

function start(state: RoomState, playerId: string, randomInt: (n: number) => number): Outcome {
  if (playerId !== state.host) return fail(state, "only the host can start");
  if (state.phase !== "lobby" && state.phase !== "match_over") {
    return fail(state, "a match is already running");
  }
  if (state.players.length < MIN_PLAYERS)
    return fail(state, `you need at least ${MIN_PLAYERS} players`);

  const fresh = { ...state, matchWinner: null, players: state.players.map(resetPlayer) };
  return { ok: true, state: startRound(fresh, randomInt, 1) };
}

function next(state: RoomState, playerId: string, randomInt: (n: number) => number): Outcome {
  if (playerId !== state.host) return fail(state, "only the host can start the next round");
  if (state.phase !== "round_over") return fail(state, "the round is still running");
  return { ok: true, state: startRound(state, randomInt, state.round + 1) };
}

function guess(state: RoomState, event: Extract<RoomEvent, { type: "guess" }>): Outcome {
  if (state.phase !== "playing") return fail(state, "no round is running");
  if (event.round !== state.round) return fail(state, "that guess is for an earlier round");

  const player = state.players.find((p) => p.id === event.playerId);
  if (!player) return fail(state, "you are not in this room");
  if (player.lives === 0) return fail(state, "you are out of lives this round");

  const letter = normaliseGuess(event.letter);
  if (letter === null) return fail(state, "guess a single letter a–z");
  if (state.tried.includes(letter)) return fail(state, "someone already tried that letter");

  const tried = [...state.tried, letter];
  if (judge(state.secret, letter) === "correct") {
    const players = state.players.map((p) => (p.id === player.id ? { ...p, wins: p.wins + 1 } : p));
    const winner = players.find((p) => p.id === player.id)!;
    const matchOver = winner.wins >= MATCH_TO;
    return {
      ok: true,
      state: {
        ...state,
        tried,
        players,
        roundWinner: player.id,
        phase: matchOver ? "match_over" : "round_over",
        matchWinner: matchOver ? player.id : null,
      },
    };
  }

  const players = state.players.map((p) => (p.id === player.id ? { ...p, lives: p.lives - 1 } : p));
  const stillAlive = players.some((p) => p.lives > 0);
  return {
    ok: true,
    state: { ...state, tried, players, phase: stillAlive ? "playing" : "round_over" },
  };
}
