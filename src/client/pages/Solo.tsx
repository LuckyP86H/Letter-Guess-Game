import { Show, createSignal } from "solid-js";
import { LIVES, applySoloGuess, newSoloRound, pickLetter, type SoloRound } from "../../shared/game";
import { Keyboard, Lives } from "../Keyboard";
import { randomInt } from "../random";
import { recordSolo } from "../history";

export default function Solo() {
  const [round, setRound] = createSignal<SoloRound>(newSoloRound(pickLetter(randomInt)));
  const [message, setMessage] = createSignal("");
  const [score, setScore] = createSignal({ wins: 0, rounds: 0 });
  const [saved, setSaved] = createSignal(false);

  const guess = (letter: string) => {
    const result = applySoloGuess(round(), letter);
    if (!result.ok) {
      setMessage(result.reason);
      return;
    }
    setMessage("");
    setRound(result.round);
    if (result.round.status !== "playing") finish(result.round);
  };

  const finish = (done: SoloRound) => {
    const won = done.status === "won";
    setScore((s) => ({ wins: s.wins + (won ? 1 : 0), rounds: s.rounds + 1 }));
    setSaved(false);
    void recordSolo({
      won,
      guessesUsed: Math.max(1, done.guessed.length),
      letter: done.secret,
    }).then(() => setSaved(true));
  };

  const nextRound = () => {
    setRound(newSoloRound(pickLetter(randomInt)));
    setMessage("");
  };

  const marks = () => {
    const current = round();
    const out: Record<string, "miss" | "mine"> = {};
    for (const letter of current.guessed) {
      out[letter] = letter === current.secret && current.status === "won" ? "mine" : "miss";
    }
    return out;
  };

  return (
    <section class="game" aria-labelledby="solo-title">
      <h1 id="solo-title">Solo</h1>
      <p class="score">
        Wins {score().wins} of {score().rounds}
      </p>

      <Show
        when={round().status === "playing"}
        fallback={
          <div class="result" role="status">
            <p class="big">{round().status === "won" ? "You got it!" : "Out of lives."}</p>
            <p>
              The letter was <strong class="letter">{round().secret}</strong>.
            </p>
            <p class="muted">
              {round().status === "won"
                ? `Solved in ${round().guessed.length} guess${round().guessed.length === 1 ? "" : "es"}.`
                : `You used all ${LIVES} guesses.`}
              <Show when={saved()}> Saved to your history.</Show>
            </p>
            <button type="button" class="button primary" onClick={nextRound}>
              Next round
            </button>
          </div>
        }
      >
        <p class="prompt">Press a letter to guess the computer's letter.</p>
        <Lives left={round().lives} total={LIVES} />
        <p class="guessed" aria-live="polite">
          Tried: {round().guessed.length ? round().guessed.join(" ") : "nothing yet"}
        </p>
      </Show>

      <p class="message" role="alert">
        {message()}
      </p>
      <Keyboard marks={marks()} disabled={round().status !== "playing"} onGuess={guess} />
    </section>
  );
}
