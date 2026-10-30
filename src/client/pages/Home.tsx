import { navigate } from "../router";

export default function Home() {
  const card = (to: string, title: string, text: string) => (
    <a
      class="card link-card"
      href={to}
      onClick={(event) => {
        event.preventDefault();
        navigate(to);
      }}
    >
      <h2>{title}</h2>
      <p>{text}</p>
    </a>
  );

  return (
    <section class="home" aria-labelledby="home-title">
      <h1 id="home-title">Guess the letter.</h1>
      <p class="lead">
        The computer picks a letter. You have five guesses. Play alone, take the daily letter with
        everyone, or race friends in a room.
      </p>
      <div class="cards">
        {card("/solo", "Solo", "Endless rounds. Build a streak.")}
        {card("/daily", "Daily", "One letter a day, the same for everyone. Share your grid.")}
        {card(
          "/friends",
          "Friends",
          "Create a room, share the code, and race for five round wins.",
        )}
      </div>
    </section>
  );
}
