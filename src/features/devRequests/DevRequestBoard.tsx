import { useCallback, useMemo, useState } from "react";
import { Lightbulb } from "lucide-react";

import { KanbanBoard } from "@/components/kanban/KanbanBoard";
import { KanbanCard } from "@/components/kanban/KanbanCard";
import { KanbanColumn } from "@/components/kanban/KanbanColumn";
import { KanbanCardList } from "@/components/kanban/KanbanCardList";
import { useKanbanDrag } from "@/components/kanban/kanbanDrag";
import { KanbanColumnHeader } from "@/components/kanban/KanbanColumnHeader";
import { MobileStatusBoard } from "@/components/kanban/MobileStatusBoard";
import { useIsNarrowViewport } from "@/hooks/useIsNarrowViewport";
import { MOBILE_PAGE_BODY } from "@/layout/mobileRhythm";
import { HoverCopyText } from "@/components/ui/hover-copy-text";
import { toneTextClass } from "@/lib/statusTones";
import { cn } from "@/lib/utils";
import { CardActionsMenu } from "./CardActionsMenu";
import { CARD_MENU_ATTR, buildCardMeta, isUrgentCard } from "./cardModel";
import { CardMetaChip } from "./CardMetaChip";
import { ChecklistBar } from "./ChecklistBar";
import { isPartlyShipped } from "./checklist";
import { GroupHeading } from "./GroupHeading";
import {
  collapsedKey,
  groupRequests,
  readCollapsedGroups,
  writeCollapsedGroups,
  type GroupKey,
} from "./grouping";
import { PriorityBars } from "./PriorityBars";
import { columnDateLabel, sortColumn } from "./columnDate";
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
  /** Показуємо пункт «Картка для чату» лише там, де картка вже викочена. */
  onCopyCard?: (request: DevRequest) => void;
  /** Хто дивиться — щоб не підписувати автором власні картки. */
  viewerId: string | null;
  /**
   * Рухати, редагувати й видаляти. Один прапорець на всі три дії навмисно: у
   * базі це теж одне право — політики update і delete на tosho.dev_requests
   * стоять на тому самому предикаті tosho.is_owner_or_seo().
   */
  canManage: boolean;
  /** Чим ріжемо колонки. «none» — суцільний список, як було завжди. */
  groupBy: GroupKey;
};

export function DevRequestBoard({
  requests,
  onMove,
  onSelect,
  onEdit,
  onDelete,
  onCopyCard,
  viewerId,
  canManage,
  groupBy,
}: DevRequestBoardProps) {
  const isNarrowViewport = useIsNarrowViewport();
  const [collapsed, setCollapsed] = useState<Set<string>>(readCollapsedGroups);
  const byStatus = useMemo(() => {
    const map = new Map<RequestStatus, DevRequest[]>();
    for (const column of BOARD_COLUMNS) map.set(column.status, []);
    for (const request of requests) {
      // Колонок лише п'ять: «Не робимо» і «Ідеї» на дошку свідомо не
      // потрапляють, для них є списки за перемиканням (див. BOARD_COLUMNS).
      const bucket = map.get(request.status);
      if (bucket) bucket.push(request);
    }
    // Запит тягне все одним списком за датою СТВОРЕННЯ, і для «Викочено» це
    // неправильна вісь: картка, заведена тиждень тому й викочена сьогодні,
    // падала в кінець списку. Тому кожна колонка перекладається на свою дату
    // вже тут (див. columnDate.ts).
    for (const column of BOARD_COLUMNS) {
      map.set(column.status, sortColumn(map.get(column.status) ?? [], column.status));
    }
    return map;
  }, [requests]);

  const toggleGroup = useCallback((id: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      writeCollapsedGroups(next);
      return next;
    });
  }, []);


  const drag = useKanbanDrag({
    onDrop: (id, columnId) => {
      const dragged = requests.find((request) => request.id === id);
      // Кидок у ту саму колонку — не переміщення: інакше промах по власній
      // колонці ганяв би запис у базу і рефетч усієї дошки.
      if (dragged && dragged.status !== columnId) onMove(id, columnId as RequestStatus);
    },
  });

  // Рендер картки винесений, бо колонка малює її двома шляхами — суцільним
  // списком і всередині груп. Дублювати сто рядків розмітки заради цього не
  // варто: розійдуться вони на першій же правці.
  const renderCard = (request: DevRequest) => {
    const meta = buildCardMeta(request, { viewerId });
    const dateLabel = columnDateLabel(request, request.status);
    const KindIcon = KIND_ICONS[request.kind];
    const urgent = isUrgentCard(request);
    return (
      <KanbanCard
        key={request.id}
        {...drag.itemProps(request.id, canManage)}
        // Ні гасіння кліку після перетягування, ні сторожа «натиснули на
        // меню» тут більше немає, і обидва зникли з однієї причини. У
        // нативному DnD подія `dragstart` стріляла на КАРТЦІ, тож із неї не
        // було видно, що миша натиснула кнопку меню, — доводилось ловити
        // pointerdown окремим рефом. У вказівникових подіях `event.target` —
        // це сама кнопка, і рушій перетягування пропускає її сам. Клік після
        // відпускання гасить теж рушій (kanbanDrag.tsx).
        onClick={() => onSelect(request)}
        density="compact"
        // `dragging` тут НЕ передаємо, і це виправляє миготіння при поверненні
        // картки на своє місце. Той проп малює на картці вигляд «мене тягнуть»
        // (пунктир, приглушення, менший масштаб) — з переходом на 220 мс. Поки
        // рядок схований, переходу не видно, але щойно рядку повертали
        // видимість, картка доганяла свій перехід і проявлялась на очах: другий
        // блимок поспіль.
        //
        // Головне ж — цей вигляд просто дублює роботу: місце, з якого картку
        // взяли, показує напівпрозора копія (slot у kanbanDrag), і вона стоїть
        // рівно там же. Двох позначок одного місця не треба.
        className={cn(
          urgent && "dev-request-card-urgent",
          canManage && "cursor-grab active:cursor-grabbing"
        )}
      >
        {/* ── Пріоритет, тип словом, номер і меню ── */}
        <div className="flex items-center gap-2">
          <PriorityBars priority={request.priority} />
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1 text-2xs font-semibold",
              toneTextClass[KIND_TONE[request.kind]],
              // Пунктир під тим, що припустив розбір, — замість окремого рядка
              // «✨ розбір» після автора. Той рядок читався як ще одне метаполе
              // картки, хоча насправді це примітка про якість решти полів; і він
              // не казав, ЩО саме припустили. Мова коректорської правки:
              // підкреслено рівно те, що варто звірити.
              request.autoClassified && "border-b border-dashed border-current pb-px"
            )}
            title={
              request.autoClassified ? "Тип поставив розбір — людина ще не звіряла" : undefined
            }
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
            // Обгортка з позначкою: за нею pointerdown упізнає меню й не дає
            // картці поїхати за кнопкою.
            <div {...{ [CARD_MENU_ATTR]: "" }} className="ml-auto shrink-0">
              <CardActionsMenu
                // Єдина дорога в «Ідеї»: колонки в них немає, тож перетягнути
                // картку туди неможливо в принципі.
                move={{
                  label: "В ідеї",
                  icon: Lightbulb,
                  onSelect: () => onMove(request.id, "someday"),
                }}
                onEdit={() => onEdit(request)}
                onDelete={() => onDelete(request)}
                onCopyCard={
                  onCopyCard && request.status === "released" ? () => onCopyCard(request) : undefined
                }
              />
            </div>
          ) : null}
        </div>

        {/* ── Тема ── */}
        <p className="mt-1.5 text-[13px] font-medium leading-snug line-clamp-3" title={request.title}>
          {request.title}
        </p>

        {/* ── Пункти великої задачі ──
            Одразу під назвою, а не в ряду міток: це не властивість картки, а її
            стан. Рендерить null, коли пунктів немає. */}
        <ChecklistBar
          items={request.checklist}
          partlyShipped={isPartlyShipped(request.status, request.checklist, request.commitShas)}
          className="mt-2"
        />

        {/* ── Пріоритет, напрямок, автор, «просили N», «закрита» ── */}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {meta.map((item) => (
            <CardMetaChip key={item.key} item={item} />
          ))}
          {/* Дата — не чип, а тихий підпис праворуч: це не властивість картки,
              а відповідь на питання колонки («скільки висить» / «коли поїхало»).
              Там, де чесної дати немає, не малюємо нічого. */}
          {dateLabel ? (
            <span className="ml-auto shrink-0 text-3xs text-muted-foreground/70">{dateLabel}</span>
          ) : null}
        </div>
      </KanbanCard>
    );
  };

  // Телефон: статуси й картки замість п'яти колонок по 300px, які на екрані
  // 375px давали 1596px горизонтальної прокрутки (картка 146). Тернарник, а
  // не `md:hidden`: інакше React будує й комітить обидві дошки.
  if (isNarrowViewport) {
    return (
      <div className={cn(MOBILE_PAGE_BODY, "pb-3")}>
        <MobileStatusBoard
          columns={BOARD_COLUMNS.map((column) => ({
            key: column.status,
            label: column.label,
            icon: column.icon,
            items: byStatus.get(column.status) ?? [],
          }))}
          getItemKey={(request) => String(request.id)}
          renderCard={(request) => renderCard(request)}
          emptyLabel="Порожньо"
        />
      </div>
    );
  }

  return (
    // h-full + items-stretch: колонки тягнуться на всю висоту дошки, а не на
    // висоту найдовшої з них. Без цього фіксована висота ззовні нічого не дає —
    // короткі колонки лишаються короткими, а довга однаково росте вниз.
    <KanbanBoard className="h-full pb-2 md:pb-3" rowClassName="h-full items-stretch">
      {BOARD_COLUMNS.map((column) => {
        const items = byStatus.get(column.status) ?? [];
        return (
          <KanbanColumn
            key={column.status}
            {...drag.columnProps(column.status)}
            className={cn(
              "kanban-column-surface h-full w-[300px] shrink-0 transition-colors",
              drag.draggingId && "kanban-column-armed",
              drag.overColumnId === column.status && "kanban-column-drop-target"
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
          >
            {groupBy === "none"
              ? (
                  <KanbanCardList
                    items={items}
                    getKey={(request) => String(request.id)}
                    renderItem={(request) => renderCard(request)}
                    emptyState={
                      <p className="px-1 py-6 text-center text-xs text-muted-foreground">Порожньо</p>
                    }
                  />
                )
              : groupRequests(items, groupBy, column.status).map((group) => {
                  const key = collapsedKey(groupBy, group.id);
                  const isCollapsed = collapsed.has(key);
                  return (
                    <div key={group.id} className="space-y-2">
                      <GroupHeading
                        group={group}
                        collapsed={isCollapsed}
                        onToggle={() => toggleGroup(key)}
                      />
                      {isCollapsed ? null : (
                        <KanbanCardList
                          items={group.items}
                          getKey={(request) => String(request.id)}
                          renderItem={(request) => renderCard(request)}
                        />
                      )}
                    </div>
                  );
                })}
            {/* Порожній стан для згрупованого режиму: у режимі без груп його
                показує сам KanbanCardList, щоб остання картка встигла попрощатись. */}
            {items.length === 0 && groupBy !== "none" ? (
              <p className="px-1 py-6 text-center text-xs text-muted-foreground">Порожньо</p>
            ) : null}
          </KanbanColumn>
        );
      })}
    </KanbanBoard>
  );
}
