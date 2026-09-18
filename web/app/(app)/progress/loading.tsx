import { Skeleton } from "@/components/ui/Skeleton";

export default function ProgressLoading() {
  return (
    <div
      className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 pb-12 pt-4"
      role="status"
      aria-label="Loading progress"
      aria-busy="true"
    >
      <Skeleton className="h-14 w-1/2" />
      <Skeleton className="h-[300px]" />
      <Skeleton className="h-[180px]" />
      <Skeleton className="h-[180px]" />
    </div>
  );
}
