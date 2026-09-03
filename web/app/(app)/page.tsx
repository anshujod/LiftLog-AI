"use client";

import { useAuth } from "@/lib/auth/AuthProvider";

export default function HomePage() {
  const { logout } = useAuth();

  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Home</h1>
      <p className="text-muted">
        The dashboard lands here in a later task. For now, use the tabs below to explore the
        shell.
      </p>
      <button
        type="button"
        onClick={() => void logout()}
        className="h-12 w-fit rounded-lg border border-border px-6 text-sm font-medium text-foreground"
      >
        Log out
      </button>
    </div>
  );
}
