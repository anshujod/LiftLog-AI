import "server-only";
import { cookies } from "next/headers";
import { API_BASE_URL, REFRESH_COOKIE } from "./constants";

/** Server-side access token mint from the httpOnly refresh cookie.
 * Returns null when unauthenticated — callers render empty/skeleton states. */
async function getServerAccessToken(): Promise<string | null> {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get(REFRESH_COOKIE)?.value;
  if (!refreshToken) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) return null;
    const data = (await response.json()) as { access_token?: string };
    return data.access_token ?? null;
  } catch {
    return null;
  }
}

/** Server-side GET against the API with the user's access token.
 * Short timeout so a sleeping free-tier backend streams skeletons, not a hung page. */
export async function serverApiFetch<T>(path: string, timeoutMs = 8000): Promise<T | null> {
  const token = await getServerAccessToken();
  if (!token) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(`${API_BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      // Dashboard changes on every finish; keep it fresh but allow Next to
      // dedupe parallel server fetches within the same request.
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}
