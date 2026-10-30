import { createSignal } from "solid-js";
import { postJSON } from "../api";
import { navigate } from "../router";

export default function Friends() {
  const [code, setCode] = createSignal("");
  const [error, setError] = createSignal("");
  const [busy, setBusy] = createSignal(false);

  const create = async () => {
    setBusy(true);
    setError("");
    try {
      const room = await postJSON<{ code: string }>("/api/rooms", {});
      if (!room) throw new Error("no code");
      navigate(`/room/${room.code}`);
    } catch {
      setError("Couldn't create a room. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  const join = (event: SubmitEvent) => {
    event.preventDefault();
    const value = code().trim().toUpperCase();
    if (!/^[A-HJ-NP-Z2-9]{6}$/.test(value)) {
      setError("Room codes are 6 letters or numbers.");
      return;
    }
    navigate(`/room/${value}`);
  };

  return (
    <section class="game" aria-labelledby="friends-title">
      <h1 id="friends-title">Play with friends</h1>
      <p class="muted">
        Create a room and share the code. The server picks a secret letter each round, so nobody can
        peek. First correct guess wins the round. First to 5 round wins takes the match.
      </p>

      <div class="cards">
        <div class="card">
          <h2>Create a room</h2>
          <p>You'll be the host and can start when at least two players have joined.</p>
          <button
            type="button"
            class="button primary"
            disabled={busy()}
            onClick={() => void create()}
          >
            {busy() ? "Creating…" : "Create room"}
          </button>
        </div>

        <form class="card" onSubmit={join}>
          <h2>Join a room</h2>
          <label for="room-code">Room code</label>
          <input
            id="room-code"
            name="code"
            autocomplete="off"
            maxLength={6}
            value={code()}
            onInput={(e) => setCode(e.currentTarget.value)}
            class="code-input"
          />
          <button type="submit" class="button">
            Join
          </button>
        </form>
      </div>

      <p class="message" role="alert">
        {error()}
      </p>
    </section>
  );
}
