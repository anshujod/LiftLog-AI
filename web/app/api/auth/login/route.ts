import { NextResponse } from "next/server";
import { API_BASE_URL, persistSession } from "@/lib/api/auth-server";

export async function POST(request: Request) {
  const payload = await request.json();

  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok) {
    return NextResponse.json(data, { status: response.status });
  }

  return NextResponse.json(await persistSession(data));
}
