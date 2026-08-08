import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { KanbanBoard } from "@/components/kanban/KanbanBoard";
import { KanbanCard } from "@/components/kanban/KanbanCard";
import { KanbanColumn } from "@/components/kanban/KanbanColumn";
import { KanbanColumnHeader } from "@/components/kanban/KanbanColumnHeader";
import { BOARD_COLUMNS, KIND_LABELS, type DevRequest, type RequestStatus } from "./types";
import { cn } from "@/lib/utils";

type DevRequestBoardProps = {
  requests: DevRequest[];
  onMove: (id: string, status: RequestStatus) => void;
  /** Клік по картці — відкриває обговорення збоку. */
  onSelect: (request: DevRequest) => void;
  canMove: boolean;
};

/**
 * Автор картки: ім'я з Telegram, а якщо його немає — нікнейм.
 *
 * Обидва поля необов'язкові й незалежні: у Telegram username можна не мати
 * взагалі. Показувати лише «@username» означало б, що частина карток лишиться
 * без автора; показувати обидва — шум у мета-рядку, тож нікнейм ховаємо в
 * підказку, коли ім'я вже видно.
 */
function resolveAuthor(request: DevRequest): { label: string; hint?: string } | null {
  if (request.displayName) {
    return {
      label: request.displayName,
      hint: request.tgUsername ? `@${request.tgUsername}` : undefined,
    };
  }
  if (request.tgUsername) return { label: `@${request.tgUsername}` };
  return null;
}

export function DevRequestBoard({ requests, onMove, onSelect, canMove }: DevRequestBoardProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoverStatus, setHoverStatus] = useState<RequestStatus | null>(null);
  // Після drop браузер стріляє click по картці-джерелу — без паузи кожне
  // перетягування відкривало б обговорення. Той самий прийом, що й на дошці
  // дизайну (DesignPage: suppressCardClick), але через ref: клік читає його в
  // обробнику, тож зайвий рендер не потрібен.
  const suppressClickRef = useRef(false);
  const releaseTimerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (releaseTimerRef.current !== null) window.clearTimeout(releaseTimerRef.current);
    },
    []
  );

  const byStatus = useMemo(() => {
    const map = new Map<RequestStatus, DevRequest[]>();
    for (const column of BOARD_COLUMNS) map.set(column.status, []);
    for (const request of requests) {
      // «Не робимо» колонки не має — такі картки на дошку свідомо не потрапляють.
      const bucket = map.get(request.status);
      if (bucket) bucket.push(request);
    }
    return map;
  }, [requests]);

  const stopDragging = useCallback(() => {
    setDraggingId(null);
    setHoverStatus(null);
    if (releaseTimerRef.current !== null) window.clearTimeout(releaseTimerRef.current);
    releaseTimerRef.current = window.setTimeout(() => {
      suppressClickRef.current = false;
      releaseTimerRef.current = null;
    }, 100);
  }, []);

  const startDragging = useCallback((event: DragEvent<HTMLDivElement>, id: string) => {
    setDraggingId(id);
    suppressClickRef.current = true;
    // Без dataTransfer Firefox взагалі не починає перетягування.
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
  }, []);

  const handleDrop = useCallback(
    (status: RequestStatus) => {
      if (draggingId) {
        const dragged = requests.find((request) => request.id === draggingId);
        // Кидок у ту саму колонку — не переміщення: інакше промах по власній
        // колонці ганяв би запис у базу і рефетч усієї дошки.
        if (dragged && dragged.status !== status) onMove(draggingId, status);
      }
      stopDragging();
    },
    [draggingId, onMove, requests, stopDragging]
  );

  return (
    <KanbanBoard>
      {BOARD_COLUMNS.map((column) => {
        const items = byStatus.get(column.status) ?? [];
        return (
          <KanbanColumn
            key={column.status}
            className={cn(
              "kanban-column-surface h-full w-[300px] shrink-0 transition-colors",
              draggingId && "border-primary/35",
              hoverStatus === column.status && "kanban-column-drop-target"
            )}
            header={
              <KanbanColumnHeader
                icon={column.icon}
                toneClassName={column.toneClassName}
                label={column.label}
                count={items.length}
              />
            }
            bodyClassName="space-y-2 px-2.5 pb-2.5 pt-2.5"
            onDragOver={(event) => {
              if (!canMove || !draggingId) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              if (hoverStatus !== column.status) setHoverStatus(column.status);
            }}
            onDragEnter={(event) => {
              if (!canMove || !draggingId) return;
              event.preventDefault();
              if (hoverStatus !== column.status) setHoverStatus(column.status);
            }}
            onDragLeave={(event) => {
              // Перехід курсора на картку всередині колонки теж піднімає
              // dragleave — без перевірки на вкладеність підсвітка блимала б.
              if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
              setHoverStatus((current) => (current === column.status ? null : current));
            }}
            onDrop={(event) => {
              if (!canMove) return;
              event.preventDefault();
              handleDrop(column.status);
            }}
          >
            {items.map((request) => {
              const author = resolveAuthor(request);
              return (
                <KanbanCard
                  key={request.id}
                  draggable={canMove}
                  onClick={() => {
                    if (suppressClickRef.current) return;
                    onSelect(request);
                  }}
                  onDragStart={(event) => startDragging(event, request.id)}
                  onDragEnd={stopDragging}
                  className={cn(
                    "p-3 transition-[border-color,opacity] hover:border-foreground/24",
                    canMove && "cursor-grab active:cursor-grabbing",
                    draggingId === request.id && "opacity-50"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-muted-foreground">{request.label}</span>
                    {request.isPrivate ? (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                        закрита
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm font-medium leading-snug">{request.title}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span>{KIND_LABELS[request.kind]}</span>
                    {request.askedByCount > 1 ? <span>· просили {request.askedByCount}</span> : null}
                    {author ? (
                      <span title={author.hint} className="truncate">
                        · {author.label}
                      </span>
                    ) : null}
                  </div>
                </KanbanCard>
              );
            })}
            {items.length === 0 ? (
              <p className="px-1 py-6 text-center text-xs text-muted-foreground">Порожньо</p>
            ) : null}
          </KanbanColumn>
        );
      })}
    </KanbanBoard>
  );
}
