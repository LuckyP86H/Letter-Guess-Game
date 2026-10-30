import { Show, createSignal } from "solid-js";
import {
  LIVES,
  applySoloGuess,
  dailyLetter,
  newSoloRound,
  utcDay,
  type SoloRound,
} from "../../shared/game";
import { Keyboard, Lives } from "../Keyboard";
import { hasPlayedDaily, localHistory, recordDaily } from "../history";
import { readJSON, writeJSON } from "../storage";

export default function Daily() {
  const day = utcDay();
  const letter = dailyLetter(day);
  const progressKey = `lgg.daily.${day}`;

  const existing = localHistory().find((e) => e.mode === "daily" && e.day === day);
  const [round, setRound] = createSignal<SoloRound>(
    readJSON<SoloRound>(progressKey, newSoloRound(letter)),
  );
  const [message, setMessage] = createSignal("");
  const [shareText, setShareText] = createSignal("");
  const finished = () => round().status !== "playing";

  const guess = (key: string) => {
    if (hasPlayedDaily(day) || finished()) return;
    const result = applySoloGuess(round(), key);
    if (!result.ok) {
      setMessage(result.reason);
      return;
    }
    setMessage("");
    setRound(result.round);
    writeJSON(progressKey, result.round);
    if (result.round.status !== "playing") {
      void recordDaily({
        day,
        won: result.round.status === "won",
        guessesUsed: Math.max(1, result.round.guessed.length),
        letter,
      });
    }
  };

  const grid = () => {
    const current = round();
    const squares = current.guessed.map((l) => (l === letter ? "🟩" : "🟥"));
    const score = current.status === "won" ? `${current.guessed.length}/${LIVES}` : `X/${LIVES}`;
    return `Letter Guess ${day} · ${score}\n${squares.join("")}`;
  };

  const share = async () => {
    const text = grid();
    setShareText(text);
    try {
      await navigator.clipboard.writeText(text);
      setMessage("Copied your result.");
    } catch {
      setMessage("Copy the result below.");
    }
  };

  const marks = () => {
    const out: Record<string, "miss" | "mine"> = {};
    for (const l of round().guessed)
      out[l] = l === letter && round().status === "won" ? "mine" : "miss";
    return out;
  };

  return (
    <section class="game" aria-labelledby="daily-title">
      <h1 id="daily-title">Daily</h1>
      <p class="muted">Everyone gets the same letter today ({day}, UTC). You get one attempt.</p>

      <Show
        when={!existing && !finished()}
        fallback={
          <div class="result" role="status">
            <p class="big">
              {round().status === "won" || existing?.won
                ? "Solved today."
                : "Better luck tomorrow."}
            </p>
            <p>
              Today's letter was <strong class="letter">{letter}</strong>.
            </p>
            <button type="button" class="button primary" onClick={() => void share()}>
              Share result
            </button>
            <Show when={shareText()}>
              <pre class="share" aria-label="Your result">
                {shareText()}
              </pre>
            </Show>
          </div>
        }
      >
        <Lives left={round().lives} total={LIVES} />
        <p class="guessed" aria-live="polite">
          Tried: {round().guessed.length ? round().guessed.join(" ") : "nothing yet"}
        </p>
      </Show>

      <p class="message" role="alert">
        {message()}
      </p>
      <Keyboard marks={marks()} disabled={finished() || Boolean(existing)} onGuess={guess} />
    </section>
  );
}
