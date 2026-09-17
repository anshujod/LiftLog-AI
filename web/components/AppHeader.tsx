"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getMe } from "@/lib/api/me";
import { useActiveWorkoutId } from "@/hooks/useActiveWorkoutId";
import { useAuth } from "@/lib/auth/AuthProvider";

function initials(email: string | null): string {
  if (!email) return "•";
  const c = email.trim().charAt(0).toUpperCase();
  return c || "•";
}

// Email is immutable for the session (profile edits cover units/bodyweight
// only), so resolve it once per sign-in instead of on every navigation.
let cachedEmail: string | null = null;
let emailInflight: Promise<string | null> | null = null;

function fetchEmailOnce(): Promise<string | null> {
  if (cachedEmail !== null) return Promise.resolve(cachedEmail);
  if (!emailInflight) {
    emailInflight = getMe()
      .then((me) => {
        cachedEmail = me.email;
        return cachedEmail;
      })
      .catch(() => null)
      .finally(() => {
        emailInflight = null;
      });
  }
  return emailInflight;
}

export function AppHeader() {
  const pathname = usePathname();
  const { status } = useAuth();
  const activeWorkoutId = useActiveWorkoutId();
  const [email, setEmail] = useState<string | null>(() => cachedEmail);

  useEffect(() => {
    if (status !== "authenticated") {
      // Layout unmounts on sign-out; clearing here keeps a later sign-in as a
      // different account from reusing the previous address. No setState: the
      // initializer already seeded from cache, and resolutions commit below.
      cachedEmail = null;
      return;
    }
    let cancelled = false;
    fetchEmailOnce().then((value) => {
      if (!cancelled) setEmail(value);
    });
    return () => {
      cancelled = true;
    };
  }, [status]);

  return (
    <header className="flex items-center justify-between gap-3 px-4 pb-2 pt-4 md:hidden">
      <Link href="/" className="font-display text-xl tracking-wide" aria-label="LiftLog home">
        LIFT<span className="text-acid">LOG</span>
      </Link>
      <div className="flex items-center gap-3">
        {activeWorkoutId && (
          <Link
            href={`/workout?resume=${activeWorkoutId}`}
            className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-acid"
            aria-label="Resume active workout"
          >
            <span aria-hidden="true" className="h-1.5 w-1.5 animate-pulse bg-acid" />
            Live
          </Link>
        )}
        <Link
          href="/profile"
          aria-label="Profile"
          className={`flex h-10 w-10 items-center justify-center rounded-[2px] border hairline font-display text-base ${
            pathname.startsWith("/profile") ? "border-acid text-acid" : "text-foreground"
          }`}
        >
          {initials(email)}
        </Link>
      </div>
    </header>
  );
}
