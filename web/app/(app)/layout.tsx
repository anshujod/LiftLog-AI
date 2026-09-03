"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { BottomNav } from "@/components/BottomNav";
import { ResumeWorkoutBanner } from "@/components/ResumeWorkoutBanner";
import { useAuth } from "@/lib/auth/AuthProvider";

export default function AppLayout({ children }: LayoutProps<"/">) {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  if (status !== "authenticated") {
    return <div className="min-h-dvh bg-background" aria-hidden="true" />;
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <ResumeWorkoutBanner />
      <main className="flex-1 overflow-y-auto">{children}</main>
      <BottomNav />
    </div>
  );
}
