import { useCallback, useRef, type PropsWithChildren, type WheelEvent } from "react";
import { cn } from "@/lib/utils";

type KanbanBoardProps = PropsWithChildren<{
  className?: string;
  rowClassName?: string;
}>;

export function KanbanBoard({ className, rowClassName, children }: KanbanBoardProps) {
  const boardRef = useRef<HTMLDivElement>(null);

  const handleWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    const board = boardRef.current;
    if (!board || event.ctrlKey || event.metaKey || event.altKey) return;

    const target = event.target instanceof HTMLElement ? event.target : null;
    const columnBody = target?.closest<HTMLElement>("[data-kanban-column-body='true']");
    const hasMostlyVerticalIntent = Math.abs(event.deltaY) > Math.abs(event.deltaX);

    if (columnBody && hasMostlyVerticalIntent) {
      const { scrollTop, scrollHeight, clientHeight } = columnBody;
      const canScrollUp = scrollTop > 0;
      const canScrollDown = scrollTop + clientHeight < scrollHeight - 1;

      if ((event.deltaY < 0 && canScrollUp) || (event.deltaY > 0 && canScrollDown)) {
        return;
      }
    }

    const horizontalDelta = event.deltaX !== 0 ? event.deltaX : event.deltaY;
    if (horizontalDelta === 0 || board.scrollWidth <= board.clientWidth) return;

    const nextScrollLeft = Math.max(0, Math.min(board.scrollLeft + horizontalDelta, board.scrollWidth - board.clientWidth));
    if (nextScrollLeft === board.scrollLeft) return;

    board.scrollLeft = nextScrollLeft;
    event.preventDefault();
  }, []);

  return (
    <div
      ref={boardRef}
      className={cn("overflow-x-auto overflow-y-hidden overscroll-x-contain p-4 md:p-5", className)}
      onWheel={handleWheel}
    >
      <div className={cn("w-max flex gap-4 pb-0", rowClassName)}>{children}</div>
    </div>
  );
}
