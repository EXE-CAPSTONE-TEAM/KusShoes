/** Matches ASYNC_CSS_ATTR in vite-plugin-async-css.ts. */
const SELECTOR = 'link[data-async-css]';
const TIMEOUT_MS = 5000;

/**
 * Applies the entry stylesheets that the build emits as `<link rel="preload" as="style">` and
 * resolves once they are in effect (or failed, or timed out, so the app never stays unrendered).
 * No-op in dev, where Vite injects styles from JS.
 */
export function applyStylesheets(): Promise<void> {
  const links = Array.from(document.querySelectorAll<HTMLLinkElement>(SELECTOR));
  return Promise.all(
    links.map(
      (link) =>
        new Promise<void>((resolve) => {
          const timer = window.setTimeout(resolve, TIMEOUT_MS);
          const done = () => {
            window.clearTimeout(timer);
            resolve();
          };
          link.addEventListener('load', done, { once: true });
          link.addEventListener('error', done, { once: true });
          link.rel = 'stylesheet';
        }),
    ),
  ).then(() => undefined);
}
