"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { BodyweightGate } from "@/components/BodyweightGate";
import { BottomNav } from "@/components/BottomNav";
import { Sidebar } from "@/components/Sidebar";
import { AppHeader } from "@/components/AppHeader";
import { SkeletonStack } from "@/components/ui/Skeleton";
import { useAuth } from "@/lib/auth/AuthProvider";

export default function AppLayout({ children }: LayoutProps<"/">) {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  if (status !== "authenticated") {
    return (
      <div className="mx-auto w-full max-w-xl p-4" role="status" aria-label="Loading">
        <SkeletonStack rows={3} />
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col pt-[env(safe-area-inset-top)] md:flex-row">
      <Sidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
        <AppHeader />
        <BodyweightGate />
        <main className="flex min-h-0 flex-1 flex-col">{children}</main>
        <div className="sticky bottom-0 z-40">
          <BottomNav />
        </div>
      </div>
    </div>
  );
}
