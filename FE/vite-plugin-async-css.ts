// Turns the entry's <link rel="stylesheet"> tags into non-blocking preloads. The first paint (the
// inline-styled boot overlay in index.html) then doesn't wait for the CSS download; main.tsx
// applies the sheets (src/boot/stylesheets.ts) before React renders anything that needs them.
import type { Plugin } from 'vite';

export const ASYNC_CSS_ATTR = 'data-async-css';

export function asyncCssPlugin(): Plugin {
  return {
    name: 'kusshoes-async-css',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler: (html) =>
        html.replace(
          /<link rel="stylesheet"( crossorigin)? href="([^"]+\.css)">/g,
          `<link rel="preload" as="style"$1 href="$2" ${ASYNC_CSS_ATTR}>`,
        ),
    },
  };
}
