import React from "react";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { QUOTES_COLUMNS, quotesColumnWidth, type QuotesColumnId } from "@/features/quotes/quotes-page/quotesTableColumns";
import type {
  QuotesColumnBounds,
  QuotesTableColumnsController,
} from "@/features/quotes/quotes-page/useQuotesTableColumns";

const KEYBOARD_STEP = 8;
const KEYBOARD_STEP_LARGE = 16;

/**
 * Ручка на правій межі заголовка колонки. Та сама мова, що й у
 * `RecordRailResizer`: `role="separator"`, лінія проступає при наведенні на
 * заголовок, подвійний клік — типова ширина. Заголовок-батько має бути
 * `relative group/head`; ширину ручка пише в CSS-змінну повз React.
 */
export function ColumnResizeHandle({
  columnId,
  controller,
}: {
  columnId: QuotesColumnId;
  controller: QuotesTableColumnsController;
}) {
  const [bounds, setBounds] = React.useState<QuotesColumnBounds | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const label = QUOTES_COLUMNS[columnId].label;

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const start = controller.measure(columnId);
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    let next = start.now;
    setDragging(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMove = (move: PointerEvent) => {
      next = Math.min(start.max, Math.max(start.min, start.now + move.clientX - startX));
      controller.preview(columnId, next);
    };
    const onUp = () => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setDragging(false);
      if (Math.abs(next - start.now) >= 1) {
        controller.commit(columnId, next);
        setBounds({ ...start, now: Math.round(next) });
      }
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const sign = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!sign) return;
    event.preventDefault();
    const current = controller.measure(columnId);
    const step = event.shiftKey ? KEYBOARD_STEP_LARGE : KEYBOARD_STEP;
    const next = Math.min(current.max, Math.max(current.min, current.now + sign * step));
    controller.commit(columnId, next);
    setBounds({ ...current, now: Math.round(next) });
  };

  const handleReset = () => {
    controller.reset(columnId);
    setBounds(controller.measure(columnId));
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={`Ширина колонки «${label}»`}
      aria-valuenow={bounds ? Math.round(bounds.now) : undefined}
      aria-valuemin={bounds ? Math.round(bounds.min) : undefined}
      aria-valuemax={bounds ? Math.round(bounds.max) : undefined}
      title="Потягніть, щоб змінити ширину · двічі клацніть — стандартна"
      tabIndex={0}
      data-dragging={dragging ? "" : undefined}
      onFocus={() => setBounds(controller.measure(columnId))}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
      onDoubleClick={handleReset}
      onClick={(event) => event.stopPropagation()}
      className="group/handle absolute inset-y-0 right-0 z-20 w-3 translate-x-1/2 cursor-col-resize touch-none outline-none"
    >
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-1.5 left-1/2 w-px -translate-x-1/2 rounded-full bg-foreground/30 opacity-0 transition-opacity duration-150 motion-reduce:transition-none",
          "group-hover/head:opacity-100 group-focus-visible/handle:opacity-100 group-focus-visible/handle:bg-foreground/60",
          "group-hover/handle:bg-foreground/60 group-data-dragging/handle:bg-foreground group-data-dragging/handle:opacity-100"
        )}
      />
    </div>
  );
}

/** Заголовок колонки зі зміною ширини: ширина з CSS-змінної, ручка на правій межі. */
export function ResizableHead({
  columnId,
  controller,
  className,
  children,
}: {
  columnId: QuotesColumnId;
  controller: QuotesTableColumnsController;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <TableHead className={cn("group/head relative", className)} style={{ width: quotesColumnWidth(columnId) }}>
      {children ?? QUOTES_COLUMNS[columnId].label}
      <ColumnResizeHandle columnId={columnId} controller={controller} />
    </TableHead>
  );
}
