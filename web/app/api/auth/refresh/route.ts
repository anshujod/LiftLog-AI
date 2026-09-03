import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { API_BASE_URL, REFRESH_COOKIE, clearSession, persistSession } from "@/lib/api/auth-server";

export async function POST() {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get(REFRESH_COOKIE)?.value;

  if (!refreshToken) {
    return NextResponse.json(
      { error: { code: "auth_error", message: "Not authenticated" } },
      { status: 401 }
    );
  }

  const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  const data = await response.json();
  if (!response.ok) {
    await clearSession();
    return NextResponse.json(data, { status: response.status });
  }

  return NextResponse.json(await persistSession(data));
}
