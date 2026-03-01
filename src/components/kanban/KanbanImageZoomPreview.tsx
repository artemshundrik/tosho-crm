import { cn } from "@/lib/utils";

type KanbanImageZoomPreviewProps = {
  imageUrl: string;
  alt: string;
  className?: string;
  imageClassName?: string;
};

export function KanbanImageZoomPreview({
  imageUrl,
  alt,
  className,
  imageClassName,
}: KanbanImageZoomPreviewProps) {
  return (
    <div
      className={cn(
        "group/kanban-image relative h-14 w-14 shrink-0 overflow-visible rounded-[10px] border border-border/60 bg-muted/25",
        className
      )}
    >
      <div className="h-full w-full overflow-hidden rounded-[10px]">
        <img src={imageUrl} alt={alt} className={cn("h-full w-full object-cover", imageClassName)} loading="lazy" />
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-full top-1/2 z-40 -ml-4.5 hidden h-56 w-56 -translate-y-1/2 overflow-hidden rounded-[14px] border border-border/70 bg-card shadow-[0_18px_40px_-14px_rgba(15,23,42,0.45)] opacity-0 scale-95 transition-all duration-180 ease-out md:block group-hover/kanban-image:opacity-100 group-hover/kanban-image:scale-100"
      >
        <img src={imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
      </div>
    </div>
  );
}
