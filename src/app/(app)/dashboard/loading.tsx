import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="space-y-10" aria-busy="true" aria-label="Loading today">
      <div className="space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-48" />
      </div>
      <Skeleton className="h-36 w-full rounded-xl" />
      {[0, 1].map((section) => (
        <div key={section} className="space-y-3">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-12 w-full rounded-md" />
          <Skeleton className="h-12 w-full rounded-md" />
          <Skeleton className="h-12 w-full rounded-md" />
        </div>
      ))}
    </div>
  );
}
