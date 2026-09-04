"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Home" },
  { href: "/workout", label: "Workout" },
  { href: "/exercises", label: "Exercises" },
  { href: "/history", label: "History" },
  { href: "/analysis", label: "Analysis" },
] as const;

const ICON_PATHS: Record<(typeof TABS)[number]["href"], string> = {
  "/": "M3 11.5 12 4l9 7.5M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9",
  "/workout": "M4 12h16M4 12v-3M4 12v3M20 12v-3M20 12v3M8 8v8M16 8v8",
  "/exercises": "M11 5a6 6 0 1 0 0 12 6 6 0 0 0 0-12ZM20 20l-4.5-4.5",
  "/history": "M12 3a9 9 0 1 0 9 9M12 7v5l3.5 2M3 3v5h5",
  "/analysis": "M4 20V10M10 20V4M16 20v-7M22 20H2",
};

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="flex border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]"
      aria-label="Primary"
    >
      {TABS.map((tab) => {
        const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className="flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 text-xs"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke={active ? "var(--color-accent)" : "var(--color-muted)"}
              strokeWidth={active ? 2.25 : 1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-6 w-6"
              aria-hidden="true"
            >
              <path d={ICON_PATHS[tab.href]} />
            </svg>
            <span className={active ? "text-foreground" : "text-muted"}>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
