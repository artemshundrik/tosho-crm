import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardSkeleton, DetailSkeleton, ListSkeleton } from "@/components/app/page-skeleton-templates";

function resolveShellContent(pathname: string) {
  if (pathname.startsWith("/matches/")) return <DetailSkeleton />;
  if (pathname.startsWith("/admin/trainings/analytics")) return <DashboardSkeleton />;
  if (pathname.startsWith("/admin/trainings/")) return <DetailSkeleton />;
  if (pathname.startsWith("/admin/trainings")) return <ListSkeleton />;
  if (pathname.startsWith("/admin/tournaments/")) return <DetailSkeleton />;
  if (pathname.startsWith("/admin/tournaments")) return <DashboardSkeleton />;
  if (pathname.startsWith("/admin/players")) return <ListSkeleton />;
  if (pathname.startsWith("/analytics/")) return <DashboardSkeleton />;
  if (pathname.startsWith("/finance/pools/")) return <DetailSkeleton />;
  if (pathname.startsWith("/finance/")) return <DetailSkeleton />;
  if (pathname.startsWith("/finance")) return <DashboardSkeleton />;
  if (pathname.startsWith("/activity")) return <ListSkeleton />;
  if (pathname.startsWith("/notifications")) return <ListSkeleton />;
  if (pathname.startsWith("/settings/members")) return <ListSkeleton />;
  if (pathname.startsWith("/player/")) return <DetailSkeleton />;
  if (pathname.startsWith("/matches")) return <ListSkeleton />;
  if (pathname.startsWith("/overview")) return <DashboardSkeleton />;
  return <DashboardSkeleton />;
}

export function AppShell() {
  const location = useLocation();
  const content = useMemo(() => resolveShellContent(location.pathname), [location.pathname]);

  return (
    <div className="min-h-screen min-h-[100dvh] bg-background text-foreground">
      <aside className="hidden md:flex fixed inset-y-0 z-30 w-[270px] flex-col border-r border-border bg-card/60 backdrop-blur-xl">
        <div className="px-4 pt-5">
          <Skeleton className="h-12 w-full rounded-[var(--radius-lg)]" />
        </div>

        <div className="mt-6 px-4 space-y-6">
          <div className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, idx) => (
                <Skeleton key={`nav-team-${idx}`} className="h-9 w-full rounded-[var(--radius-lg)]" />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Skeleton className="h-3 w-28" />
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, idx) => (
                <Skeleton key={`nav-analytics-${idx}`} className="h-9 w-full rounded-[var(--radius-lg)]" />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, idx) => (
                <Skeleton key={`nav-management-${idx}`} className="h-9 w-full rounded-[var(--radius-lg)]" />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-auto border-t border-border p-4">
          <Skeleton className="h-14 w-full rounded-[var(--radius-lg)]" />
        </div>
      </aside>

      <div className="md:pl-[270px]">
        <header className="sticky top-0 z-20 border-b border-border bg-background/75 backdrop-blur-xl">
          <div className="flex h-16 items-center justify-between px-3 md:px-6">
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-40 rounded-[var(--radius-md)] hidden md:block" />
              <Skeleton className="h-8 w-24 rounded-[var(--radius-md)] md:hidden" />
            </div>
            <div className="flex items-center gap-2.5">
              <Skeleton className="h-9 w-9 rounded-[var(--radius-lg)]" />
              <Skeleton className="h-9 w-9 rounded-[var(--radius-lg)]" />
            </div>
          </div>
        </header>

        <main className="w-full px-4 py-6 md:px-6 lg:px-8 xl:px-8">
          <div className="mx-auto max-w-[1320px] space-y-8">
            <div className="hidden md:flex items-start justify-between gap-4">
              <div className="space-y-2">
                <Skeleton className="h-6 w-56" />
                <Skeleton className="h-4 w-72" />
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-9 w-28 rounded-[var(--radius-md)]" />
                <Skeleton className="h-9 w-24 rounded-[var(--radius-md)]" />
              </div>
            </div>

            <div>{content}</div>
          </div>
        </main>
      </div>
    </div>
  );
}
