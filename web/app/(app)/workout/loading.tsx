import { SkeletonStack } from "@/components/ui/Skeleton";

export default function WorkoutLoading() {
  return (
    <div className="mx-auto w-full max-w-2xl p-4" role="status" aria-label="Loading workout">
      <SkeletonStack rows={3} />
    </div>
  );
}
