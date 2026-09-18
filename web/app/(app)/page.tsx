import { Suspense } from "react";
import { Dashboard } from "@/components/Dashboard";
import { Skeleton } from "@/components/ui/Skeleton";
import { serverApiFetch } from "@/lib/api/server";
import type { Dashboard as DashboardData } from "@/lib/api/analytics";

export const dynamic = "force-dynamic";

async function DashboardLoader() {
  // Server-render the dashboard from the httpOnly refresh cookie so first paint
  // already has data — the client skips its duplicate getDashboard() when
  // initialData is present. Null streams the skeleton path in Dashboard.
  const initialData = await serverApiFetch<DashboardData>("/analytics/dashboard");
  return <Dashboard initialData={initialData} />;
}

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 pb-10 pt-2" aria-busy="true">
          <Skeleton className="h-16 w-2/3" />
          <Skeleton className="h-10 w-1/2" />
          <Skeleton className="h-[76px] w-full" />
        </div>
      }
    >
      <DashboardLoader />
    </Suspense>
  );
}
