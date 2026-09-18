import { SkeletonStack } from "@/components/ui/Skeleton";

export default function ExerciseDetailLoading() {
  return (
    <div className="mx-auto w-full max-w-2xl p-4" role="status" aria-label="Loading exercise">
      <SkeletonStack rows={4} />
    </div>
  );
}
