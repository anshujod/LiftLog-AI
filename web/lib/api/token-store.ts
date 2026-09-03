// In-memory access-token store. Deliberately not persisted (localStorage/sessionStorage) —
// the refresh token in the httpOnly cookie is what survives a full app restart; see
// lib/auth/AuthProvider.tsx, which re-mints an access token from it on mount.
type Listener = (token: string | null) => void;

let accessToken: string | null = null;
const listeners = new Set<Listener>();

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
  for (const listener of listeners) listener(token);
}

export function subscribeAccessToken(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
