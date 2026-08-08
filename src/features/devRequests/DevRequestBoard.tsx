import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { ChevronsUp, Lock, MoreVertical, PencilLine, Sparkles, Trash2, Users } from "lucide-react";

import { KanbanBoard } from "@/components/kanban/KanbanBoard";
import { KanbanCard } from "@/components/kanban/KanbanCard";
import { KanbanColumn } from "@/components/kanban/KanbanColumn";
import { KanbanColumnHeader } from "@/components/kanban/KanbanColumnHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuItemDestructive,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HoverCopyText } from "@/components/ui/hover-copy-text";
import { cn } from "@/lib/utils";
import {
  CARD_MENU_ATTR,
  buildRequestChips,
  isCardMenuTarget,
  resolveAuthor,
  type ChipWeight,
} from "./cardModel";
import { BOARD_COLUMNS, type DevRequest, type RequestStatus } from "./types";

type DevRequestBoardProps = {
  requests: DevRequest[];
  onMove: (id: string, status: RequestStatus) => void;
  /** Клік по картці — відкриває обговорення збоку. */
  onSelect: (request: DevRequest) => void;
  onEdit: (request: DevRequest) => void;
  onDelete: (request: DevRequest) => void;
  /**
   * Рухати, редагувати й видаляти. Один прапорець на всі три дії навмисно: у
   * базі це теж одне право — політики update і delete на tosho.dev_requests
   * стоять на тому самому предикаті tosho.is_owner_or_seo().
   */
  canManage: boolean;
};

/** Мітка: тон рівно за «гучністю», свого набору кольорів картка не заводить. */
function chipClassName(weight: ChipWeight): string {
  if (weight === "quiet") {
    return "rounded-full border-border/40 bg-transparent px-2.5 py-0.5 text-2xs font-medium normal-case tracking-normal text-muted-foreground/70";
  }
  return "rounded-full border-border/60 bg-muted/20 px-2.5 py-0.5 text-2xs font-medium normal-case tracking-normal text-muted-foreground";
}

export function DevRequestBoard({
  requests,
  onMove,
  onSelect,
  onEdit,
  onDelete,
  canManage,
}: DevRequestBoardProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoverStatus, setHoverStatus] = useState<RequestStatus | null>(null);
  // Після drop браузер стріляє click по картці-джерелу — без паузи кожне
  // перетягування відкривало б обговорення. Той самий прийом, що й на дошці
  // дизайну (DesignPage: suppressCardClick), але через ref: клік читає його в
  // обробнику, тож зайвий рендер не потрібен.
  const suppressClickRef = useRef(false);
  const releaseTimerRef = useRef<number | null>(null);
  /**
   * Натиснули на меню — перетягування не починаємо.
   *
   * Пишеться на pointerdown (він приходить першим у ланцюжку
   * pointerdown → mousedown → dragstart), бо в самому dragstart цього вже не
   * видно: подія стріляє на КАРТЦІ, а не на кнопці. Пояснення —
   * у cardModel.isCardMenuTarget.
   */
  const menuPressedRef = useRef(false);

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
    menuPressedRef.current = false;
    if (releaseTimerRef.current !== null) window.clearTimeout(releaseTimerRef.current);
    releaseTimerRef.current = window.setTimeout(() => {
      suppressClickRef.current = false;
      releaseTimerRef.current = null;
    }, 100);
  }, []);

  const startDragging = useCallback((event: DragEvent<HTMLDivElement>, id: string) => {
    // Жест почався на кнопці меню — це не перетягування картки.
    if (menuPressedRef.current) {
      event.preventDefault();
      return;
    }
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
              if (!canManage || !draggingId) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              if (hoverStatus !== column.status) setHoverStatus(column.status);
            }}
            onDragEnter={(event) => {
              if (!canManage || !draggingId) return;
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
              if (!canManage) return;
              event.preventDefault();
              handleDrop(column.status);
            }}
          >
            {items.map((request) => {
              const author = resolveAuthor(request);
              const chips = buildRequestChips(request);
              return (
                <KanbanCard
                  key={request.id}
                  draggable={canManage}
                  onClick={() => {
                    if (suppressClickRef.current) return;
                    onSelect(request);
                  }}
                  // pointerdown, а не mousedown: відкриваючись, Radix гасить
                  // типову дію pointerdown — а разом із нею й сам mousedown,
                  // тож на кнопці меню того обробника могло б і не бути.
                  // Capture-фаза (згори вниз) із тієї ж причини: перехопити
                  // треба ДО того, як подію обробить сама кнопка.
                  onPointerDownCapture={(event) => {
                    menuPressedRef.current = isCardMenuTarget(event.target);
                  }}
                  onDragStart={(event) => startDragging(event, request.id)}
                  onDragEnd={stopDragging}
                  className={cn(
                    // Розкладка й класи — ті самі, що на дошках дизайну та
                    // прорахунків (DesignPage/QuotesPage): картка запиту має
                    // читатись як їхня рідня, а не як гість із іншого проєкту.
                    "kanban-estimate-card rounded-2xl border border-border/60 bg-card p-3 transition-[border-color,opacity] duration-220 ease-out hover:border-foreground/24 dark:hover:border-foreground/22",
                    canManage && "cursor-grab active:cursor-grabbing",
                    draggingId === request.id && "opacity-50"
                  )}
                >
                  {/* ── Номер, «закрита» і меню ── */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <HoverCopyText
                        value={request.label}
                        textClassName="font-mono text-[13px] font-medium tracking-wide whitespace-nowrap text-muted-foreground"
                        successMessage="Номер запиту скопійовано"
                        copyLabel="Скопіювати номер запиту"
                      />
                      {request.isPrivate ? (
                        <Badge
                          variant="outline"
                          className="h-5 gap-1 rounded-full border-border/60 bg-secondary px-2 text-3xs font-semibold normal-case tracking-normal text-muted-foreground"
                          title="Видно лише власнику й СЕО"
                        >
                          <Lock className="h-3 w-3" />
                          Закрита
                        </Badge>
                      ) : null}
                    </div>

                    {canManage ? (
                      // Обгортка з позначкою: за нею pointerdown упізнає меню й
                      // не дає картці поїхати за кнопкою.
                      <div {...{ [CARD_MENU_ATTR]: "" }} className="shrink-0">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground"
                              aria-label="Дії із запитом"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          {/* Меню їде в портал, але в дереві React лишається
                              всередині картки — тож без stopPropagation клік по
                              пункту відкривав би ще й обговорення. */}
                          <DropdownMenuContent
                            align="end"
                            className="w-52"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <DropdownMenuItem onClick={() => onEdit(request)}>
                              <PencilLine />
                              Редагувати
                            </DropdownMenuItem>
                            <DropdownMenuSeparator className="-mx-1.5" />
                            <DropdownMenuItemDestructive onClick={() => onDelete(request)}>
                              <Trash2 />
                              Видалити
                            </DropdownMenuItemDestructive>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    ) : null}
                  </div>

                  {/* ── Тема ── */}
                  <p className="mt-2 text-sm font-medium leading-snug line-clamp-3" title={request.title}>
                    {request.title}
                  </p>

                  {/* ── Мітки: тип, напрямок, пріоритет ── */}
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    {chips.map((chip) =>
                      chip.weight === "loud" ? (
                        <Badge key={chip.key} tone="danger" className="h-5 gap-1 px-2 text-2xs">
                          <ChevronsUp className="h-3 w-3" />
                          {chip.label}
                        </Badge>
                      ) : (
                        <Badge key={chip.key} variant="outline" className={chipClassName(chip.weight)}>
                          {chip.label}
                        </Badge>
                      )
                    )}
                    {/* Підказка, а не помилка: класифікацію поставив розбір, і
                        її ще ніхто не звіряв. Без плашки й без кольору — це
                        привід глянути, а не привід хвилюватись. */}
                    {request.autoClassified ? (
                      <span
                        className="inline-flex items-center gap-1 text-2xs text-muted-foreground/70"
                        title="Тип, напрямок і пріоритет проставив розбір — людина ще не підтверджувала"
                      >
                        <Sparkles className="h-3 w-3" />
                        розбір
                      </span>
                    ) : null}
                  </div>

                  {/* ── Автор і скільки людей просили ── */}
                  {author || request.askedByCount > 1 ? (
                    <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/60 pt-2.5 text-[13px] text-muted-foreground">
                      <span className="min-w-0 truncate" title={author?.hint}>
                        {author?.label ?? ""}
                      </span>
                      {request.askedByCount > 1 ? (
                        <span
                          className="inline-flex shrink-0 items-center gap-1"
                          title="Стільки людей просили те саме"
                        >
                          <Users className="h-3.5 w-3.5" />
                          просили {request.askedByCount}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
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
