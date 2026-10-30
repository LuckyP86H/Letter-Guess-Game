import { For, Show, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import type { PublicRoom } from "../../shared/room";
import { MATCH_TO, MIN_PLAYERS, MAX_NAME } from "../../shared/room";
import { Keyboard, Lives } from "../Keyboard";
import { LIVES } from "../../shared/game";
import { navigate } from "../router";
import { user } from "../session";
import { newPlayerId, readSession, writeSession } from "../storage";

type ServerMessage =
  | { type: "snapshot"; room: PublicRoom; you: string | null }
  | { type: "error"; message: string };

const NAME_KEY = "lgg.name";

export default function Room(props: { code: string }) {
  const [room, setRoom] = createSignal<PublicRoom | null>(null);
  const [you, setYou] = createSignal<string | null>(null);
  const [error, setError] = createSignal("");
  const [status, setStatus] = createSignal<"connecting" | "live" | "offline">("connecting");
  const [name, setName] = createSignal(readName());
  const [joined, setJoined] = createSignal(false);

  const playerId = readSession("lgg.player") ?? newPlayerId();
  writeSession("lgg.player", playerId);

  let socket: WebSocket | undefined;
  let attempts = 0;
  let closing = false;

  const send = (message: unknown) => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  };

  const join = () => {
    const trimmed = name().trim().slice(0, MAX_NAME);
    if (!trimmed) return;
    writeName(trimmed);
    setJoined(true);
    send({ type: "join", playerId, name: trimmed });
  };

  const connect = () => {
    const scheme = location.protocol === "https:" ? "wss" : "ws";
    socket = new WebSocket(`${scheme}://${location.host}/api/rooms/${props.code}/ws`);
    socket.onopen = () => {
      attempts = 0;
      setStatus("live");
      if (joined()) join();
    };
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data as string) as ServerMessage;
      if (message.type === "snapshot") {
        setRoom(message.room);
        setYou(message.you);
        setError("");
      } else {
        setError(message.message);
      }
    };
    socket.onclose = () => {
      if (closing) return;
      setStatus("offline");
      if (attempts < 5) {
        attempts++;
        setTimeout(connect, 1000 * 2 ** attempts);
      } else {
        setError("Lost the connection. Refresh the page to rejoin.");
      }
    };
  };

  // A signed-in account fills in the name once the session loads. Otherwise the stored name is used.
  createEffect(() => {
    const account = user();
    if (account && !name().trim()) setName(account.displayName);
  });

  onMount(() => {
    if (name().trim()) setJoined(true);
    connect();
  });

  onCleanup(() => {
    closing = true;
    socket?.close(1000, "left");
  });

  const me = () => room()?.players.find((p) => p.id === playerId) ?? null;
  const isHost = () => room()?.host === playerId;
  const playing = () => room()?.phase === "playing";
  const marks = () => {
    const current = room();
    const out: Record<string, "miss" | "mine"> = {};
    if (!current) return out;
    for (const letter of current.tried) {
      out[letter] = current.revealed === letter && current.roundWinner !== null ? "mine" : "miss";
    }
    return out;
  };

  const guess = (letter: string) => {
    const current = room();
    if (!current || current.phase !== "playing") return;
    send({ type: "guess", letter, round: current.round });
  };

  const leave = () => {
    send({ type: "leave" });
    navigate("/friends");
  };

  const shareUrl = () => `${location.origin}/room/${props.code}`;

  return (
    <section class="game room" aria-labelledby="room-title">
      <h1 id="room-title">Room {props.code}</h1>
      <p class="muted">
        Share the link: <a href={shareUrl()}>{shareUrl()}</a> ·{" "}
        <span class="status">{status()}</span>
      </p>

      <Show
        when={joined() || (room() && me())}
        fallback={
          <form
            class="card"
            onSubmit={(e) => {
              e.preventDefault();
              join();
            }}
          >
            <label for="player-name">Your name</label>
            <input
              id="player-name"
              maxLength={MAX_NAME}
              value={name()}
              onInput={(e) => setName(e.currentTarget.value)}
              autocomplete="nickname"
            />
            <button type="submit" class="button primary">
              Join room
            </button>
          </form>
        }
      >
        <Show when={room()} fallback={<p>Connecting…</p>}>
          {(current) => (
            <>
              <div class="room-status" role="status">
                <Show when={current().phase === "lobby"}>
                  <p>
                    Waiting for players ({current().players.length} of up to 8). The host starts
                    when there are at least {MIN_PLAYERS}.
                  </p>
                </Show>
                <Show when={playing()}>
                  <p>
                    Round {current().round}. First correct letter wins. Lives are per player (
                    {me()?.lives ?? 0} left).
                  </p>
                </Show>
                <Show when={current().phase === "round_over"}>
                  <p class="big">
                    {current().roundWinner
                      ? `${current().players.find((p) => p.id === current().roundWinner)?.name ?? "Someone"} got it!`
                      : "Nobody got it."}{" "}
                    The letter was <strong class="letter">{current().revealed}</strong>.
                  </p>
                </Show>
                <Show when={current().phase === "match_over"}>
                  <p class="big">
                    {current().players.find((p) => p.id === current().matchWinner)?.name ??
                      "Someone"}{" "}
                    wins the match (first to {MATCH_TO}).
                  </p>
                </Show>
              </div>

              <Show when={me()}>
                <Lives left={me()?.lives ?? LIVES} total={LIVES} />
              </Show>

              <p class="guessed" aria-live="polite">
                Tried: {current().tried.length ? current().tried.join(" ") : "nothing yet"}
              </p>

              <Keyboard
                marks={marks()}
                disabled={!playing() || !me() || (me()?.lives ?? 0) === 0}
                onGuess={guess}
              />

              <div class="actions">
                <Show
                  when={
                    isHost() && (current().phase === "lobby" || current().phase === "match_over")
                  }
                >
                  <button
                    type="button"
                    class="button primary"
                    disabled={current().players.length < MIN_PLAYERS}
                    onClick={() => send({ type: "start" })}
                  >
                    {current().phase === "match_over" ? "Play another match" : "Start match"}
                  </button>
                </Show>
                <Show when={isHost() && current().phase === "round_over"}>
                  <button
                    type="button"
                    class="button primary"
                    onClick={() => send({ type: "next" })}
                  >
                    Next round
                  </button>
                </Show>
                <button type="button" class="button ghost" onClick={leave}>
                  Leave room
                </button>
              </div>

              <h2>Players</h2>
              <ul class="players">
                <For each={current().players}>
                  {(player) => (
                    <li classList={{ you: player.id === you() }}>
                      <span class="player-name">{player.name}</span>
                      <Show when={player.id === current().host}>
                        <span class="badge">host</span>
                      </Show>
                      <span class="wins" aria-label={`${player.wins} round wins`}>
                        {player.wins} / {MATCH_TO}
                      </span>
                    </li>
                  )}
                </For>
              </ul>
            </>
          )}
        </Show>
      </Show>

      <p class="message" role="alert">
        {error()}
      </p>
    </section>
  );
}

function readName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeName(value: string): void {
  try {
    localStorage.setItem(NAME_KEY, value);
  } catch {
    // Not stored; the player just types it again next time.
  }
}
