import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// RTL auto-cleanup requires global afterEach; with vitest globals off we
// register it explicitly so DOM doesn't leak between tests.
afterEach(() => cleanup());

// Chakra v3 resolves responsive props via matchMedia, which jsdom lacks.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

// Node 26 ships an experimental global `localStorage` accessor that is
// undefined unless `--localstorage-file` is passed. Vitest's populateGlobal
// then skips copying jsdom's working localStorage (the key "already exists"
// on the Node global), and since it aliases window = global, both are broken.
// Restore jsdom's real localStorage from the JSDOM instance vitest exposes.
const jsdomWindow = (globalThis as { jsdom?: { window: Window } }).jsdom?.window;
if (jsdomWindow?.localStorage) {
  Object.defineProperty(globalThis, "localStorage", {
    value: jsdomWindow.localStorage,
    configurable: true,
    writable: true,
  });
}
