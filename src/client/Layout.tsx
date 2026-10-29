import type { JSX } from "solid-js";
import { For, Show } from "solid-js";
import { navigate } from "./router";
import { providers, signOut, user } from "./session";

const links = [
  { to: "/", label: "Home" },
  { to: "/solo", label: "Solo" },
  { to: "/daily", label: "Daily" },
  { to: "/friends", label: "Friends" },
  { to: "/history", label: "History" },
];

export function Layout(props: { path: string; children: JSX.Element }) {
  const link = (event: MouseEvent, to: string) => {
    event.preventDefault();
    navigate(to);
  };

  return (
    <>
      <a class="skip" href="#main">
        Skip to game
      </a>
      <header class="site-header">
        <a class="brand" href="/" onClick={(e) => link(e, "/")}>
          Letter Guess
        </a>
        <nav aria-label="Main">
          <For each={links}>
            {(item) => (
              <a
                href={item.to}
                aria-current={props.path === item.to ? "page" : undefined}
                onClick={(e) => link(e, item.to)}
              >
                {item.label}
              </a>
            )}
          </For>
        </nav>
        <div class="account">
          <Show
            when={user()}
            fallback={
              <For each={providers()}>
                {(provider) => (
                  <a class="button ghost" href={`/api/auth/${provider}/login`}>
                    Sign in with {provider === "github" ? "GitHub" : "Google"}
                  </a>
                )}
              </For>
            }
          >
            {(current) => (
              <>
                <span class="who">{current().displayName}</span>
                <button type="button" class="button ghost" onClick={() => void signOut()}>
                  Sign out
                </button>
              </>
            )}
          </Show>
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        {props.children}
      </main>
      <footer class="site-footer">
        <p>Guests can play everything. Sign in to keep your history on every device.</p>
      </footer>
    </>
  );
}
