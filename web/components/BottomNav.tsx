"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Sheet } from "@/components/ui/Sheet";

const TABS = [
  { href: "/", label: "Home" },
  { href: "/workout", label: "Workout" },
  { href: "/exercises", label: "Exercises" },
  { href: "/history", label: "History" },
] as const;

type TabHref = (typeof TABS)[number]["href"] | "/analysis" | "/ask" | "more";

const ICON_PATHS: Record<TabHref, string> = {
  "/": "M3 11.5 12 4l9 7.5M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9",
  "/workout": "M4 12h16M4 12v-3M4 12v3M20 12v-3M20 12v3M8 8v8M16 8v8",
  "/exercises": "M11 5a6 6 0 1 0 0 12 6 6 0 0 0 0-12ZM20 20l-4.5-4.5",
  "/history": "M12 3a9 9 0 1 0 9 9M12 7v5l3.5 2M3 3v5h5",
  "/analysis": "M4 20V10M10 20V4M16 20v-7M22 20H2",
  "/ask": "M4 6h16v10H9l-5 4V6Z",
  more: "M5 12h.01M12 12h.01M19 12h.01",
};

const MORE_LINKS = [
  { href: "/analysis", label: "Analysis", blurb: "Muscle volume, frequency, plateaus" },
  { href: "/ask", label: "Ask", blurb: "Chat with your training data" },
] as const;

function TabIcon({ path, className }: { path: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-6 w-6 ${className ?? ""}`}
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const [showMore, setShowMore] = useState(false);
  const moreActive = pathname.startsWith("/analysis") || pathname.startsWith("/ask");

  return (
    <>
      <nav
        className="border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]"
        aria-label="Primary"
      >
        <div className="mx-auto flex w-full max-w-xl">
          {TABS.map((tab) => {
            const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[56px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1 text-xs transition-colors ${
                  active ? "font-semibold text-foreground" : "font-normal text-muted"
                }`}
              >
                <span
                  className={`flex h-8 items-center rounded-full px-4 ${
                    active ? "bg-accent/15 text-accent" : ""
                  }`}
                >
                  <TabIcon path={ICON_PATHS[tab.href]} />
                </span>
                <span className="truncate">{tab.label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setShowMore(true)}
            aria-expanded={showMore}
            aria-current={moreActive ? "page" : undefined}
            className={`flex min-h-[56px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1 text-xs transition-colors ${
              moreActive ? "font-semibold text-foreground" : "font-normal text-muted"
            }`}
          >
            <span
              className={`flex h-8 items-center rounded-full px-4 ${
                moreActive ? "bg-accent/15 text-accent" : ""
              }`}
            >
              <TabIcon path={ICON_PATHS.more} />
            </span>
            <span className="truncate">More</span>
          </button>
        </div>
      </nav>

      {showMore && (
        <Sheet title="More" onClose={() => setShowMore(false)}>
          {MORE_LINKS.map((link) => {
            const active = pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setShowMore(false)}
                aria-current={active ? "page" : undefined}
                className="flex min-h-12 items-center gap-3 rounded-lg border border-border px-4 py-3"
              >
                <span className={active ? "text-accent" : "text-muted"}>
                  <TabIcon path={ICON_PATHS[link.href]} />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className={`font-medium ${active ? "text-accent" : ""}`}>{link.label}</span>
                  <span className="truncate text-xs text-muted">{link.blurb}</span>
                </span>
              </Link>
            );
          })}
        </Sheet>
      )}
    </>
  );
}
