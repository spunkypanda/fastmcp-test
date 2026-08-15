export type ColorMode = "light" | "dark";

const STORAGE_KEY = "fastmcp-color-mode";

type Listener = () => void;
const listeners = new Set<Listener>();

function emit(): void {
  listeners.forEach((l) => l());
}

export function subscribeColorMode(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getStoredMode(): ColorMode | null {
  const value = localStorage.getItem(STORAGE_KEY);
  return value === "light" || value === "dark" ? value : null;
}

export function getSystemMode(): ColorMode {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/** Current mode: explicit user choice if set, otherwise the OS preference. */
export function getColorMode(): ColorMode {
  return getStoredMode() ?? getSystemMode();
}

/**
 * Apply a mode by toggling the `dark` class on <html>. Chakra v3's semantic
 * tokens (bg/fg/etc.) are all defined against the `.dark` ancestor selector,
 * so this one class flips the whole app — including the page background,
 * which the theme's global CSS binds to `token(bg)` on the html element.
 */
export function applyColorMode(mode: ColorMode): void {
  document.documentElement.classList.toggle("dark", mode === "dark");
}

/**
 * Apply the initial mode before first render (avoids a light-mode flash) and
 * follow OS theme changes until the user makes an explicit choice.
 */
export function initColorMode(): void {
  applyColorMode(getColorMode());

  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => {
    if (getStoredMode() === null) {
      applyColorMode(getSystemMode());
      emit();
    }
  };
  mq.addEventListener?.("change", onChange);
}

export function setColorMode(mode: ColorMode): void {
  localStorage.setItem(STORAGE_KEY, mode);
  applyColorMode(mode);
  emit();
}

export function toggleColorMode(): void {
  setColorMode(getColorMode() === "dark" ? "light" : "dark");
}
