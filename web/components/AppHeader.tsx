"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getMe } from "@/lib/api/me";
import { useActiveWorkoutId } from "@/hooks/useActiveWorkoutId";

function initials(email: string | null): string {
  if (!email) return "•";
  const c = email.trim().charAt(0).toUpperCase();
  return c || "•";
}

export function AppHeader() {
  const pathname = usePathname();
  const activeWorkoutId = useActiveWorkoutId();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMe()
      .then((me) => {
        if (!cancelled) setEmail(me.email);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pathname]);

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
