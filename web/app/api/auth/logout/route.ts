import { NextResponse } from "next/server";
import { clearSession } from "@/lib/api/auth-server";

export async function POST() {
  await clearSession();
  return NextResponse.json({ ok: true });
}
