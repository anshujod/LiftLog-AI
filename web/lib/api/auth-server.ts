import "server-only";
import { cookies } from "next/headers";
import { REFRESH_COOKIE } from "./constants";

export { API_BASE_URL, REFRESH_COOKIE } from "./constants";

const REFRESH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

interface BackendTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

/** Stores the backend's refresh token in an httpOnly cookie, returns the access token to hand to the client. */
export async function persistSession(
  tokens: BackendTokenResponse
): Promise<{ access_token: string; token_type: string }> {
  const cookieStore = await cookies();
  cookieStore.set(REFRESH_COOKIE, tokens.refresh_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: REFRESH_COOKIE_MAX_AGE_SECONDS,
  });
  return { access_token: tokens.access_token, token_type: tokens.token_type };
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(REFRESH_COOKIE);
}
