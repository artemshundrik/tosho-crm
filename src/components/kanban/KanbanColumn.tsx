import { useRef, type HTMLAttributes, type PropsWithChildren, type ReactNode, type WheelEvent } from "react";
import { useEdgeFade } from "@/hooks/useEdgeFade";
import { cn } from "@/lib/utils";

type KanbanColumnProps = PropsWithChildren<
  HTMLAttributes<HTMLDivElement> & {
  header: ReactNode;
  className?: string;
  bodyClassName?: string;
}
>;

export function KanbanColumn({
  header,
  className,
  bodyClassName,
  children,
  ...props
}: KanbanColumnProps) {
  // Край колонки згасає, поки за ним є картки (REQ-201). Розкладки це не
  // чіпає: маска малює вже наявний вміст, вузлів не додає — тож і висота
  // колонки, і потрапляння миші при перетягуванні лишаються ті самі.
  const bodyRef = useRef<HTMLDivElement>(null);
  useEdgeFade(bodyRef, "y");

  const handleWheelCapture = (event: WheelEvent<HTMLDivElement>) => {
    if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
      event.stopPropagation();
    }
  };

  return (
    <div className={cn("shrink-0 flex flex-col", className)} {...props}>
      {header}
      <div
        ref={bodyRef}
        data-kanban-column-body="true"
        className={cn(
          "edge-fade-y min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain",
          bodyClassName
        )}
        onWheelCapture={handleWheelCapture}
      >
        {children}
      </div>
    </div>
  );
}
