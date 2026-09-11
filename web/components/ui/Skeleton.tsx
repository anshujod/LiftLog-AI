interface SkeletonProps {
  className?: string;
}

/** Single shimmer block. Parents own labels/busy state (existing queries
 * like "Loading last session" keep working). */
export function Skeleton({ className = "h-24" }: SkeletonProps) {
  return <div className={`animate-pulse rounded-xl bg-surface-raised ${className}`} aria-hidden="true" />;
}

export function SkeletonStack({ rows = 3, rowClassName = "h-24" }: { rows?: number; rowClassName?: string }) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className={rowClassName} />
      ))}
    </div>
  );
}
