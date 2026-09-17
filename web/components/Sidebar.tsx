"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useActiveWorkoutId } from "@/hooks/useActiveWorkoutId";

const NAV = [
  { href: "/", label: "Home", match: (p: string) => p === "/" },
  { href: "/exercises", label: "Exercises", match: (p: string) => p.startsWith("/exercises") },
  { href: "/progress", label: "Progress", match: (p: string) => p.startsWith("/progress") || p.startsWith("/history") || p.startsWith("/analysis") },
  { href: "/ask", label: "Coach", match: (p: string) => p.startsWith("/ask") || p.startsWith("/coach") },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const activeWorkoutId = useActiveWorkoutId();
  const trainActive = pathname.startsWith("/workout");

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r hairline md:flex lg:w-64">
      <div className="flex items-center justify-between px-5 pb-6 pt-6">
        <Link href="/" className="font-display text-2xl tracking-wide" aria-label="LiftLog home">
          LIFT<span className="text-acid">LOG</span>
        </Link>
        <span className="h-2 w-2 bg-acid" aria-hidden="true" />
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3" aria-label="Primary">
        <Link
          href={activeWorkoutId ? `/workout?resume=${activeWorkoutId}` : "/workout"}
          aria-current={trainActive ? "page" : undefined}
          className={`slab-press mb-4 flex min-h-[64px] items-center justify-between px-4 font-display text-xl tracking-wide ${
            trainActive ? "bg-acid text-background" : "bg-acid text-background"
          }`}
        >
          <span>{activeWorkoutId ? "RESUME" : "TRAIN"}</span>
          <span aria-hidden="true" className="text-2xl leading-none">→</span>
        </Link>

        {NAV.map((item) => {
          const active = item.match(pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`group flex items-baseline justify-between px-3 py-3 ${
                active ? "text-foreground" : "text-muted"
              }`}
            >
              <span className="flex items-baseline gap-3">
                <span
                  aria-hidden="true"
                  className={`h-4 w-1 ${active ? "bg-acid" : "bg-transparent group-hover:bg-faint"}`}
                />
                <span
                  className={`text-[13px] font-bold uppercase tracking-[0.16em] ${
                    active ? "text-foreground" : ""
                  }`}
                >
                  {item.label}
                </span>
              </span>
              {active && (
                <span className="tabular-nums text-[11px] text-acid" aria-hidden="true">
                  ●
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="flex flex-col gap-2 px-5 py-5">
        {activeWorkoutId && (
          <Link
            href={`/workout?resume=${activeWorkoutId}`}
            className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-acid"
          >
            <span aria-hidden="true" className="h-1.5 w-1.5 animate-pulse bg-acid" />
            Live session
          </Link>
        )}
        <Link
          href="/profile"
          className={`text-xs font-bold uppercase tracking-[0.14em] ${
            pathname.startsWith("/profile") ? "text-foreground" : "text-muted"
          }`}
        >
          Profile →
        </Link>
        <p className="text-[11px] uppercase tracking-[0.14em] text-faint">Serious training only</p>
      </div>
    </aside>
  );
}
