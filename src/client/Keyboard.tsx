import { For, onCleanup, onMount } from "solid-js";
import { ALPHABET } from "../shared/game";

export interface KeyboardProps {
  // Letters already tried by anyone in this round, mapped to a CSS state.
  marks: Record<string, "miss" | "mine">;
  disabled: boolean;
  onGuess: (letter: string) => void;
}

// On-screen keys for touch, and the physical keyboard everywhere else.
export function Keyboard(props: KeyboardProps) {
  const onKey = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (target && (target.isContentEditable || target.matches("input, textarea, select"))) return;
    const key = event.key.toLowerCase();
    if (key.length === 1 && ALPHABET.includes(key)) {
      event.preventDefault();
      props.onGuess(key);
    }
  };

  onMount(() => window.addEventListener("keydown", onKey));
  onCleanup(() => window.removeEventListener("keydown", onKey));

  return (
    <div class="keyboard" role="group" aria-label="Letters">
      <For each={[...ALPHABET]}>
        {(letter) => (
          <button
            type="button"
            class="key"
            classList={{
              miss: props.marks[letter] === "miss",
              mine: props.marks[letter] === "mine",
            }}
            disabled={props.disabled || letter in props.marks}
            aria-label={`Guess ${letter}`}
            onClick={() => props.onGuess(letter)}
          >
            {letter}
          </button>
        )}
      </For>
    </div>
  );
}

export function Lives(props: { left: number; total: number }) {
  return (
    <p class="lives" aria-label={`${props.left} of ${props.total} lives left`}>
      {Array.from({ length: props.total }, (_, i) => (
        <span class="heart" classList={{ spent: i >= props.left }} aria-hidden="true">
          ♥
        </span>
      ))}
    </p>
  );
}
