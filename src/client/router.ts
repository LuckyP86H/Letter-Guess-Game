import { createSignal } from "solid-js";

const [path, setPath] = createSignal(location.pathname);

window.addEventListener("popstate", () => setPath(location.pathname));

export { path };

export function navigate(to: string): void {
  if (to !== location.pathname) history.pushState({}, "", to);
  setPath(to);
  window.scrollTo({ top: 0 });
}
