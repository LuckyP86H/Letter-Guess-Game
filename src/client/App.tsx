import { Match, Switch, createMemo, onMount } from "solid-js";
import { Layout } from "./Layout";
import { loadSession } from "./session";
import { path } from "./router";
import Daily from "./pages/Daily";
import Friends from "./pages/Friends";
import History from "./pages/History";
import Home from "./pages/Home";
import Room from "./pages/Room";
import Solo from "./pages/Solo";

export default function App() {
  onMount(() => void loadSession());

  const roomCode = createMemo(
    () => /^\/room\/([A-Za-z0-9]{6})\/?$/.exec(path())?.[1]?.toUpperCase() ?? null,
  );
  const page = () => (roomCode() ? "room" : path().replace(/\/+$/, "") || "/");

  return (
    <Layout path={roomCode() ? "/friends" : page()}>
      <Switch fallback={<Home />}>
        <Match when={page() === "/solo"}>
          <Solo />
        </Match>
        <Match when={page() === "/daily"}>
          <Daily />
        </Match>
        <Match when={page() === "/friends"}>
          <Friends />
        </Match>
        <Match when={page() === "/history"}>
          <History />
        </Match>
        <Match when={roomCode()}>{(code) => <Room code={code()} />}</Match>
      </Switch>
    </Layout>
  );
}
