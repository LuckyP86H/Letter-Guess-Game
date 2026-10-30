import { For, Show, createResource } from "solid-js";
import { summarise } from "../../shared/stats";
import { loadHistory, type GameEntry } from "../history";
import { sessionReady, user } from "../session";

const modeLabel: Record<GameEntry["mode"], string> = {
  solo: "Solo",
  daily: "Daily",
  room: "Friends",
};

export default function History() {
  // Waits for the session check, so a signed-in visitor isn't shown the guest history first.
  const [entries] = createResource(
    () => (sessionReady() ? (user()?.id ?? "guest") : false),
    () => loadHistory(),
  );

  const stats = () => {
    const list = entries() ?? [];
    return summarise(
      list
        .filter((e) => e.mode === "solo")
        .map((e) => ({ won: e.won, guessesUsed: e.guessesUsed })),
    );
  };

  const percent = (n: number) => `${Math.round(n * 100)}%`;

  return (
    <section class="game" aria-labelledby="history-title">
      <h1 id="history-title">History</h1>
      <Show
        when={user()}
        fallback={
          <p class="muted">
            Guests keep history in this browser only. Sign in to keep it on every device.
          </p>
        }
      >
        <p class="muted">Saved to your account.</p>
      </Show>

      <Show when={entries.loading}>
        <p>Loading…</p>
      </Show>

      <Show when={entries.error}>
        <p class="message" role="alert">
          Couldn't load your history.
        </p>
      </Show>

      <Show when={entries()}>
        {(list) => (
          <>
            <dl class="stats">
              <div>
                <dt>Solo played</dt>
                <dd>{stats().played}</dd>
              </div>
              <div>
                <dt>Win rate</dt>
                <dd>{percent(stats().winRate)}</dd>
              </div>
              <div>
                <dt>Streak</dt>
                <dd>{stats().streak}</dd>
              </div>
              <div>
                <dt>Best streak</dt>
                <dd>{stats().bestStreak}</dd>
              </div>
            </dl>

            <h2>Guesses to win</h2>
            <ol class="distribution">
              <For each={stats().distribution}>
                {(count, i) => (
                  <li>
                    <span class="label">{i() + 1}</span>
                    <span
                      class="bar"
                      style={{
                        width: `${Math.max(4, (count / Math.max(1, Math.max(...stats().distribution))) * 100)}%`,
                      }}
                    >
                      {count}
                    </span>
                  </li>
                )}
              </For>
            </ol>

            <h2>Recent games</h2>
            <Show when={list().length > 0} fallback={<p class="muted">No games yet.</p>}>
              <table class="history">
                <thead>
                  <tr>
                    <th scope="col">Mode</th>
                    <th scope="col">Result</th>
                    <th scope="col">When</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={list().slice(0, 50)}>
                    {(entry) => (
                      <tr>
                        <td>{modeLabel[entry.mode]}</td>
                        <td>
                          {entry.won ? "Won" : "Lost"}
                          {entry.mode !== "room" && entry.guessesUsed !== null
                            ? ` in ${entry.guessesUsed}`
                            : ""}
                          {entry.mode === "room" && entry.roundsWon !== null
                            ? ` · ${entry.roundsWon} rounds`
                            : ""}
                        </td>
                        <td>
                          <time datetime={new Date(entry.createdAt).toISOString()}>
                            {new Date(entry.createdAt).toLocaleDateString()}
                          </time>
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </Show>
          </>
        )}
      </Show>
    </section>
  );
}
