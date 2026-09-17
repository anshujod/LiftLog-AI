"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useActiveWorkoutId } from "@/hooks/useActiveWorkoutId";

const SIDE_TABS = [
  { href: "/", label: "Home", match: (p: string) => p === "/" },
  { href: "/exercises", label: "Exercises", match: (p: string) => p.startsWith("/exercises") },
] as const;

const RIGHT_TABS = [
  {
    href: "/progress",
    label: "Progress",
    match: (p: string) =>
      p.startsWith("/progress") || p.startsWith("/history") || p.startsWith("/analysis"),
  },
  {
    href: "/ask",
    label: "Coach",
    match: (p: string) => p.startsWith("/ask") || p.startsWith("/coach"),
  },
] as const;

function SideTab({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-[64px] min-w-0 flex-1 flex-col items-center justify-center gap-1.5 px-1 ${
        active ? "text-foreground" : "text-muted"
      }`}
    >
      <span aria-hidden="true" className={`h-[3px] w-8 ${active ? "bg-acid" : "bg-transparent"}`} />
      <span className="text-[10px] font-bold uppercase tracking-[0.16em]">{label}</span>
    </Link>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const activeWorkoutId = useActiveWorkoutId();
  const trainActive = pathname.startsWith("/workout");
  const trainHref = activeWorkoutId ? `/workout?resume=${activeWorkoutId}` : "/workout";

  return (
    <nav
      className="border-t hairline bg-background pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] md:hidden"
      aria-label="Primary"
    >
      <div className="mx-auto flex w-full max-w-3xl items-stretch">
        {SIDE_TABS.map((tab) => (
          <SideTab key={tab.href} href={tab.href} label={tab.label} active={tab.match(pathname)} />
        ))}

        <div className="flex flex-1 items-center justify-center px-1 py-2">
          <Link
            href={trainHref}
            aria-current={trainActive ? "page" : undefined}
            aria-label={activeWorkoutId ? "Resume workout" : "Start workout"}
            className={`slab-press flex h-[56px] w-full items-center justify-center gap-2 rounded-[2px] font-display text-lg tracking-wide ${
              trainActive ? "bg-acid text-background" : "bg-acid text-background"
            }`}
          >
            {activeWorkoutId && (
              <span aria-hidden="true" className="h-1.5 w-1.5 animate-pulse bg-background" />
            )}
            TRAIN
          </Link>
        </div>

        {RIGHT_TABS.map((tab) => (
          <SideTab key={tab.href} href={tab.href} label={tab.label} active={tab.match(pathname)} />
        ))}
      </div>
    </nav>
  );
}
