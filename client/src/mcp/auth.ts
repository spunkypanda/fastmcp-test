const TOKEN_KEY = "fastmcp-token";

// Tiny reactive store so React components re-render when the auth state
// changes (login/logout), independent of TanStack Query's observer chain.
// (A disabled query observer is NOT notified on invalidateQueries, so we
// cannot rely on query invalidation to trigger the auth->tools UI switch.)
type Listener = () => void;
const listeners = new Set<Listener>();

function emitAuthChange(): void {
  listeners.forEach((l) => l());
}

export function subscribeAuth(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export interface UserInfo {
  username: string;
  scopes: string[];
  expiresAt: number | null; // ms epoch
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  emitAuthChange();
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  emitAuthChange();
}

export function isAuthenticated(): boolean {
  return getToken() !== null;
}

/** Decode the (unverified) JWT payload for display purposes. */
export function getUser(): UserInfo | null {
  const token = getToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return {
      username: typeof payload.sub === "string" ? payload.sub : "unknown",
      scopes: Array.isArray(payload.scopes) ? payload.scopes : [],
      expiresAt: typeof payload.exp === "number" ? payload.exp * 1000 : null,
    };
  } catch {
    return null;
  }
}

export async function login(
  username: string,
  password: string,
): Promise<string> {
  const res = await fetch("/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    let message = `Login failed (${res.status})`;
    try {
      const body = await res.json();
      if (body.error === "invalid_credentials") {
        message = "Invalid username or password";
      }
    } catch {
      // non-JSON error body; keep generic message
    }
    throw new Error(message);
  }
  const data = await res.json();
  return data.access_token as string;
}
