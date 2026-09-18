import { Skeleton } from "@/components/ui/Skeleton";

export default function AppLoading() {
  return (
    <div
      className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 pb-10 pt-2"
      role="status"
      aria-label="Loading"
      aria-busy="true"
    >
      <Skeleton className="h-16 w-2/3" />
      <Skeleton className="h-10 w-1/2" />
      <Skeleton className="h-[76px] w-full" />
    </div>
  );
}
