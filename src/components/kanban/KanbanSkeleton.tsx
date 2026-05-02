import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { KanbanBoard } from "./KanbanBoard";
import { KanbanColumn } from "./KanbanColumn";

type KanbanSkeletonColumn = {
  id: string;
  label: string;
  className?: string;
};

type KanbanSkeletonProps = {
  columns: KanbanSkeletonColumn[];
  className?: string;
  boardClassName?: string;
  rowClassName?: string;
  cardsPerColumn?: number;
};

export function KanbanSkeleton({
  columns,
  className,
  boardClassName,
  rowClassName,
  cardsPerColumn = 3,
}: KanbanSkeletonProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={className}
    >
      <KanbanBoard
        className={cn("h-full pb-2 md:pb-3", boardClassName)}
        rowClassName={cn("h-full items-stretch", rowClassName)}
      >
        {columns.map((column, columnIndex) => (
          <KanbanColumn
            key={column.id}
            className={cn("kanban-column-surface h-full basis-[300px] shrink-0 lg:basis-[320px]", column.className)}
            bodyClassName="space-y-2 px-2.5 pb-1.5 pt-2.5"
            header={
              <div className="kanban-column-header flex shrink-0 items-center justify-between gap-2 px-3.5 py-3">
                <div className="flex min-w-0 items-center gap-2">
                  <Skeleton className="h-2.5 w-2.5 shrink-0 rounded-full" />
                  <span className="truncate text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    {column.label}
                  </span>
                </div>
                <Skeleton className="h-3 w-5 rounded-full" />
              </div>
            }
          >
            {Array.from({ length: cardsPerColumn }).map((_, cardIndex) => (
              <div
                key={`${column.id}:skeleton:${cardIndex}`}
                className="rounded-[18px] border border-border/50 bg-card/82 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-center gap-2.5">
                    <Skeleton className="h-9 w-9 shrink-0 rounded-xl" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <Skeleton className={cn("h-3.5 rounded-full", cardIndex % 2 === 0 ? "w-[68%]" : "w-[52%]")} />
                      <Skeleton className={cn("h-3 rounded-full opacity-75", cardIndex % 3 === 0 ? "w-[42%]" : "w-[58%]")} />
                    </div>
                  </div>
                  <Skeleton className="h-6 w-14 shrink-0 rounded-full" />
                </div>
                <div className="mt-3 space-y-2">
                  <Skeleton className={cn("h-3 rounded-full opacity-80", columnIndex % 2 === 0 ? "w-[86%]" : "w-[76%]")} />
                  <Skeleton className={cn("h-3 rounded-full opacity-70", cardIndex % 2 === 0 ? "w-[62%]" : "w-[72%]")} />
                </div>
                <div className="mt-3 flex items-center gap-2 border-t border-border/40 pt-3">
                  <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
                  <Skeleton className="h-3 w-[46%] rounded-full" />
                </div>
              </div>
            ))}
          </KanbanColumn>
        ))}
      </KanbanBoard>
    </div>
  );
}
