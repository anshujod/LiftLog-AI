"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { BottomNav } from "@/components/BottomNav";
import { ResumeWorkoutBanner } from "@/components/ResumeWorkoutBanner";
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
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pt-[env(safe-area-inset-top)]">
      <ResumeWorkoutBanner />
      <main className="flex min-h-0 flex-1 flex-col">{children}</main>
      <BottomNav />
    </div>
  );
}
