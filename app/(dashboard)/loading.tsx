/**
 * Dashboard-wide loading shell. Next.js wraps `page.tsx` in a Suspense
 * boundary that uses this file as the fallback — so during navigation
 * between dashboard routes the user sees the page chrome (sidebar /
 * top bar / mobile bottom nav stay mounted) plus a content skeleton
 * INSTANTLY, instead of the old page persisting for ~1s until the new
 * server render lands.
 *
 * Perceived-perf trick: the content area itself doesn't care exactly
 * what the next page looks like (table vs cards vs detail). A
 * single-column h1 + a couple of card placeholders is a good-enough
 * generic shape that reads as "page is loading" no matter which
 * specific dashboard route the user navigated to.
 */
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      {/* Page header line + subtitle */}
      <div className="flex flex-col gap-2">
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
      </div>

      {/* A couple of content cards — covers the common cases (overview
          stats, inbox table, application detail, etc.) without being
          shape-specific enough to feel "wrong" for any of them. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton className="sm:col-span-2 lg:col-span-1" />
      </div>

      <CardSkeleton tall />
    </div>
  );
}

function CardSkeleton({ className, tall }: { className?: string; tall?: boolean }) {
  return (
    <div
      className={`flex flex-col gap-3 rounded-lg border border-border bg-surface-card p-4 ${className ?? ""}`}
    >
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className={tall ? "h-32 w-full" : "h-10 w-full"} />
    </div>
  );
}
