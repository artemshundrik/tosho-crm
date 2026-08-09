import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { ChevronsUp, Lightbulb, Lock, Sparkles, Users } from "lucide-react";
import type { ComponentType } from "react";

import { KanbanBoard } from "@/components/kanban/KanbanBoard";
import { KanbanCard } from "@/components/kanban/KanbanCard";
import { KanbanColumn } from "@/components/kanban/KanbanColumn";
import { KanbanColumnHeader } from "@/components/kanban/KanbanColumnHeader";
import { Badge } from "@/components/ui/badge";
import { HoverCopyText } from "@/components/ui/hover-copy-text";
import { toneTextClass } from "@/lib/statusTones";
import { cn } from "@/lib/utils";
import { CardActionsMenu } from "./CardActionsMenu";
import {
  CARD_MENU_ATTR,
  buildCardMeta,
  isCardMenuTarget,
  isUrgentCard,
  type CardMetaKey,
  type ChipWeight,
} from "./cardModel";
import {
  BOARD_COLUMNS,
  KIND_ICONS,
  KIND_LABELS,
  KIND_TONE,
  type DevRequest,
  type RequestStatus,
} from "./types";

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
    return "rounded-full border-border/40 bg-transparent px-2 py-0.5 text-2xs font-medium normal-case tracking-normal text-muted-foreground/70";
  }
  return "rounded-full border-border/60 bg-muted/20 px-2 py-0.5 text-2xs font-medium normal-case tracking-normal text-muted-foreground";
}

/**
 * Іконка при мітці — лише там, де вона додає сенсу, а не повторює слово.
 * «Просили 3» без людей читається як номер, «закрита» без замка — як стан
 * задачі, а не як обмеження доступу. Напрямку й автору іконка не потрібна.
 */
const META_ICONS: Partial<Record<CardMetaKey, ComponentType<{ className?: string }>>> = {
  asked: Users,
  private: Lock,
};

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
      // Колонок лише п'ять: «Не робимо» і «Ідеї» на дошку свідомо не
      // потрапляють, для них є списки за перемиканням (див. BOARD_COLUMNS).
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
              const meta = buildCardMeta(request);
              const KindIcon = KIND_ICONS[request.kind];
              const urgent = isUrgentCard(request);
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
                    "kanban-estimate-card rounded-2xl border border-border/60 bg-card p-2.5 transition-[border-color,opacity] duration-220 ease-out hover:border-foreground/24 dark:hover:border-foreground/22",
                    urgent && "dev-request-card-urgent",
                    canManage && "cursor-grab active:cursor-grabbing",
                    draggingId === request.id && "opacity-50"
                  )}
                >
                  {/* ── Тип словом, номер і меню ── */}
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center gap-1 text-2xs font-semibold",
                        toneTextClass[KIND_TONE[request.kind]]
                      )}
                    >
                      <KindIcon className="h-3.5 w-3.5" />
                      {KIND_LABELS[request.kind]}
                    </span>
                    <HoverCopyText
                      value={request.label}
                      textClassName="font-mono text-2xs font-semibold tracking-wide whitespace-nowrap text-muted-foreground"
                      successMessage="Номер запиту скопійовано"
                      copyLabel="Скопіювати номер запиту"
                    />

                    {canManage ? (
                      // Обгортка з позначкою: за нею pointerdown упізнає меню й
                      // не дає картці поїхати за кнопкою.
                      <div {...{ [CARD_MENU_ATTR]: "" }} className="ml-auto shrink-0">
                        <CardActionsMenu
                          // Єдина дорога в «Ідеї»: колонки в них немає, тож
                          // перетягнути картку туди неможливо в принципі.
                          move={{
                            label: "В ідеї",
                            icon: Lightbulb,
                            onSelect: () => onMove(request.id, "someday"),
                          }}
                          onEdit={() => onEdit(request)}
                          onDelete={() => onDelete(request)}
                        />
                      </div>
                    ) : null}
                  </div>

                  {/* ── Тема ── */}
                  <p
                    className="mt-1.5 text-[13px] font-medium leading-snug line-clamp-3"
                    title={request.title}
                  >
                    {request.title}
                  </p>

                  {/* ── Пріоритет, напрямок, автор, «просили N», «закрита» ── */}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {meta.map((item) => {
                      const MetaIcon = META_ICONS[item.key];
                      return item.weight === "loud" ? (
                        <Badge key={item.key} tone="danger" className="h-5 gap-1 px-2 text-2xs">
                          <ChevronsUp className="h-3 w-3" />
                          {item.label}
                        </Badge>
                      ) : (
                        <Badge
                          key={item.key}
                          variant="outline"
                          className={cn("gap-1", chipClassName(item.weight))}
                          title={item.hint}
                        >
                          {MetaIcon ? <MetaIcon className="h-3 w-3" /> : null}
                          {item.label}
                        </Badge>
                      );
                    })}
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
