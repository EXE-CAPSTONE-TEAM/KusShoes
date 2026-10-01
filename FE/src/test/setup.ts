import '@testing-library/jest-dom/vitest';
// Components render through react-i18next; without the real resources they would show keys.
import i18n, { i18nReady, LAZY_NAMESPACES } from '../i18n';

// Load the lazily fetched namespaces up front so components render synchronously in tests.
await i18nReady;
await i18n.loadNamespaces([...LAZY_NAMESPACES]);

// JSDOM does not provide window.matchMedia by default
if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

// JSDOM does not provide ResizeObserver
if (typeof window !== 'undefined' && !window.ResizeObserver) {
  window.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
