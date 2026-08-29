import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { Archive, CheckCheck, Inbox, KanbanSquare, Lightbulb, ListChecks, PlusCircle, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/auth/AuthProvider";
import { LiveCursorsLayer } from "@/components/app/LiveCursorsLayer";
import { usePageHeaderActions } from "@/components/app/usePageHeaderActions";
import { UnifiedPageToolbar } from "@/components/app/headers/UnifiedPageToolbar";
import { CountBadge, ToolbarMeta, ToolbarSearch } from "@/components/app/headers/toolbarPrimitives";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { Button } from "@/components/ui/button";
import {
  SEGMENTED_GROUP,
  SEGMENTED_TRIGGER,
  TOOLBAR_ACTION_BUTTON,
  TOOLBAR_FILTER,
} from "@/components/ui/controlStyles";
import { SegmentedGroup } from "@/components/ui/segmented-group";
import { cn } from "@/lib/utils";
import { KanbanSkeleton } from "@/components/kanban/KanbanSkeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsNarrowViewport } from "@/hooks/useIsNarrowViewport";
import { MOBILE_CARD_LIST, MOBILE_PAGE_BODY } from "@/layout/mobileRhythm";
import { DevRequestBoard } from "@/features/devRequests/DevRequestBoard";
import {
  BoardFilters,
  EMPTY_BOARD_FILTERS,
  hasActiveFilters,
  matchesBoardFilters,
  type BoardFilterState,
} from "@/features/devRequests/BoardFilters";
import { DevRequestDetailsSheet } from "@/features/devRequests/DevRequestDetailsSheet";
import { DevRequestList } from "@/features/devRequests/DevRequestList";
import { DevRequestWall } from "@/features/devRequests/DevRequestWall";
import { GroupControl } from "@/features/devRequests/GroupControl";
import { readGroupKey, writeGroupKey, type GroupKey } from "@/features/devRequests/grouping";
import type { ChecklistItem } from "@/features/devRequests/checklist";
import { DevRequestLog } from "@/features/devRequests/DevRequestLog";
import { DevRequestQueue } from "@/features/devRequests/DevRequestQueue";
import { canTakeToday } from "@/features/devRequests/queueShelves";
import { ReleaseCardDialog } from "@/features/devRequests/ReleaseCardDialog";
import {
  NewDevRequestDialog,
  type NewDevRequestInput,
} from "@/features/devRequests/NewDevRequestDialog";
import {
  useCreateDevRequest,
  useDeleteDevRequest,
  useDevRequestBoard,
  useMoveDevRequest,
  useSetToday,
  useUpdateChecklist,
  useUpdateDevRequest,
} from "@/features/devRequests/queries";
import {
  ARCHIVE_AFTER_DAYS,
  BOARD_COLUMNS,
  isArchivedRequest,
  isOpenRequestStatus,
  type DevRequest,
  type RequestStatus,
} from "@/features/devRequests/types";

/** Скільки відкритих карток віддаємо моделі на звірку дублів. */
const OPEN_TITLES_LIMIT = 50;

/**
 * Що показано зараз. «Ідеї» та «Не робимо» — саме окремі ВИГЛЯДИ, а не
 * фільтри дошки й не шоста колонка: чому так, розгорнуто над BOARD_COLUMNS у
 * src/features/devRequests/types.ts.
 */
type BoardView = "queue" | "board" | "log" | "someday" | "wont_do" | "archive";

/**
 * «Запити на доробку» — окремий розділ без ключа модуля, за прецедентом
 * /releases.
 *
 * Ключ модуля тут небезпечний: hasModuleAccess вважає НЕЗАПИСАНИЙ ключ
 * дозволеним, тож у людей зі старим JSON у module_access приватний розділ
 * відкрився б сам собою. Гейт тут дублює політику RLS — сторінка лише не
 * показує того, чого база й так не віддасть.
 */
export default function DevRequestsPage() {
  // workspaceId в контексті НЕМАЄ — AuthState віддає teamId, а це різні поняття.
  // workspace_id потрібен лише при створенні картки й резолвиться в мутації.
  const { accessRole, jobRole, teamId, userId } = useAuth();
  const [search, setSearch] = useState("");
  // «Черга» відкривається першою: питання, з яким сюди заходять щодня, — «за що
  // хвататись», і колонки на нього не відповідають. Дошка лишається сусідньою
  // вкладкою для того, що справді треба перетягнути.
  const [view, setView] = useState<BoardView>("queue");

  /**
   * Галочка в дрібниці зберігається одразу, без відкривання картки.
   *
   * Пише рівно колонку checklist (useUpdateChecklist) — тією ж мутацією, що й
   * панель у дровері, тож два входи не можуть розійтись у правилах.
   */
  const updateChecklist = useUpdateChecklist(teamId);
  const [savingChecklistId, setSavingChecklistId] = useState<string | null>(null);

  const handleChecklist = useCallback(
    (request: DevRequest, items: ChecklistItem[]) => {
      setSavingChecklistId(request.id);
      updateChecklist.mutate(
        { id: request.id, checklist: items, status: request.status, title: request.title },
        {
          onError: (error) =>
            toast.error(error instanceof Error ? error.message : "Не зміг зберегти пункт"),
          onSettled: () => setSavingChecklistId(null),
        }
      );
    },
    [updateChecklist]
  );


  const isNarrowViewport = useIsNarrowViewport();
  const [dialogOpen, setDialogOpen] = useState(false);
  /**
   * Картка, яку правимо. null при відкритому вікні = «новий запит».
   * Вікно одне на обидва режими — див. NewDevRequestDialog.
   */
  const [editing, setEditing] = useState<DevRequest | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  /** Картка, яку просять видалити. Без підтвердження не видаляємо. */
  const [pendingDelete, setPendingDelete] = useState<DevRequest | null>(null);
  /**
   * Картинка «виправлено» живе на рівні сторінки, а не в дровері: відкривати її
   * можна і з меню картки на дошці, і з самої картки — вікно має бути одне.
   */
  const [releaseCardFor, setReleaseCardFor] = useState<DevRequest | null>(null);
  // Вибрана картка — під панель обговорення, яку додає наступна задача.
  const [selected, setSelected] = useState<DevRequest | null>(null);
  const kanbanViewportRef = useRef<HTMLDivElement | null>(null);
  const [kanbanViewportHeight, setKanbanViewportHeight] = useState<number | null>(null);
  const [filters, setFilters] = useState<BoardFilterState>(EMPTY_BOARD_FILTERS);
  // Групування памʼятається між заходами, фільтри — ні. Це різні за строком
  // життя речі: зріз «за типом» людина обирає раз і надовго, а фільтр — щоб
  // один раз подивитись. Знайти вранці дошку з учорашнім фільтром означало б
  // побачити не всі картки й не зрозуміти чому.
  const [groupBy, setGroupBy] = useState<GroupKey>(readGroupKey);
  const changeGroupBy = useCallback((next: GroupKey) => {
    setGroupBy(next);
    writeGroupKey(next);
  }, []);

  const canSee =
    (accessRole ?? "").trim().toLowerCase() === "owner" ||
    (jobRole ?? "").trim().toLowerCase() === "seo";

  // Курсори колег (REQ-163): живі, а за ?cursors=demo — привиди для вигляду.
  const [searchParams] = useSearchParams();
  const cursorsDemo = searchParams.get("cursors") === "demo";

  const board = useDevRequestBoard(teamId);
  /**
   * Перше завантаження дошки — коли даних ще нема ЗОВСІМ.
   *
   * Доти сторінка малювала справжню дошку з порожніми колонками («Немає
   * задач»), а через секунду картки просто з'являлись — тобто спершу брехня,
   * потім вміст. Тепер тут каркас, як на «Дизайні» й «Прорахунках» (REQ-19).
   * Повторний вхід каркаса не показує: React Query віддає дані з кешу одразу.
   */
  const showBoardSkeleton = Boolean(teamId) && board.isPending;
  const createRequest = useCreateDevRequest();
  const moveRequest = useMoveDevRequest(teamId);
  const updateRequest = useUpdateDevRequest(teamId);
  const deleteRequest = useDeleteDevRequest(teamId);

  /**
   * Вхід на дошку скидає скрол сторінки в нуль — ДО заміру висоти нижче.
   *
   * Без цього перемикання зі скроленої «Черги» міряло канбан відносно
   * проскроленого вікна: rect.top виходив глибоко від'ємним, дошка отримувала
   * висоту в тисячі пікселів, документ не коротшав — і людина лишалась
   * дивитись у білу порожнечу під колонками. Той самий лік і той самий набір
   * викликів, що на вході в канбан прорахунків (QuotesPage).
   */
  useLayoutEffect(() => {
    if (view !== "board") return;
    if (typeof window === "undefined") return;

    document.scrollingElement?.scrollTo({ top: 0, left: 0, behavior: "auto" });
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [view]);

  /**
   * Висота дошки — рівно до низу вікна, як на дизайні та прорахунках.
   *
   * Без неї дошка росла вниз за найдовшою колонкою: сторінка прокручувалась
   * цілком, шапка з пошуком їхала геть, а решта колонок лишалась короткою.
   * З фіксованою висотою прокручується вміст КОЛОНКИ (у KanbanColumn на тілі
   * стоїть overflow-y-auto), а сама дошка стоїть на місці.
   *
   * useLayoutEffect і синхронний перший вимір — щоб дошка одразу малювалась
   * потрібної висоти, а не схлопувалась під картки й стрибала за кадр.
   * ResizeObserver ловить те, що resize не ловить: розгортання сайдбару, появу
   * смуги «Дивитись як», зміну висоти тулбара.
   */
  useLayoutEffect(() => {
    if (view !== "board") return;
    if (typeof window === "undefined") return;

    const viewport = kanbanViewportRef.current;
    if (!viewport) return;

    let frameId = 0;
    const measure = () => {
      frameId = 0;
      const rect = viewport.getBoundingClientRect();
      // 12px — той самий повітряний зазор під дошкою, що й на прорахунках.
      const nextHeight = Math.max(320, Math.floor(window.innerHeight - rect.top - 12));
      setKanbanViewportHeight((current) => (current === nextHeight ? current : nextHeight));
    };
    const scheduleMeasure = () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("resize", scheduleMeasure);

    const resizeObserver =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(scheduleMeasure) : null;
    resizeObserver?.observe(viewport);
    if (viewport.parentElement) resizeObserver?.observe(viewport.parentElement);

    return () => {
      window.removeEventListener("resize", scheduleMeasure);
      if (frameId) window.cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
    };
  }, [view]);

  /**
   * Картки поточного вигляду ДО фільтрів. Саме з них рахуються лічильники на
   * чіпах: інакше «вигляд · 3» перетворювався б на «вигляд · 3» щойно фільтр
   * увімкнули, і зрозуміти, скільки чого є насправді, стало б неможливо.
   */
  const inView = useMemo(() => {
    const all = board.data ?? [];
    // Час беремо один раз на перерахунок: межа архіву — місяць, і посекундна
    // точність тут нічого не міняє, а Date у кожній ітерації міняла б.
    const now = new Date();
    if (view === "archive") return all.filter((request) => isArchivedRequest(request, now));
    // «Щоденник» — рівно викочене. Архів не виключаємо: журнал і є історія, і
    // місячна межа архіву тут означала б, що позаминулий тиждень зник.
    if (view === "log") return all.filter((request) => request.status === "released");
    // «Черга» й «Дошка» показують ОДНЕ І ТЕ САМЕ, по-різному розкладене: два
    // різні склади карток означали б, що вкладки сперечаються, і довіряти
    // не можна було б жодній.
    return all.filter((request) =>
      view === "board"
        ? request.status !== "someday" &&
          request.status !== "wont_do" &&
          !isArchivedRequest(request, now)
        : view === "queue"
        ? // «Черга» відповідає на «за що хвататись», і викочене на це питання
          // не відповідає ніяк: воно вже зроблене. На дошці воно лишається
          // останньою колонкою — там питання інше, «чим закінчився шлях».
          request.status !== "released" &&
          request.status !== "someday" &&
          request.status !== "wont_do" &&
          !isArchivedRequest(request, now)
        : request.status === view
    );
  }, [board.data, view]);

  /**
   * Пошук і фільтри діють усередині відкритого вигляду, а не поверх усього
   * одразу: набране слово має звужувати те, що зараз на екрані, а не
   * підмішувати в дошку картки з «Ідей».
   */
  const requests = useMemo(() => {
    const filtered = inView.filter((request) => matchesBoardFilters(request, filters));
    const needle = search.trim().toLowerCase();
    if (!needle) return filtered;
    return filtered.filter(
      (request) =>
        request.title.toLowerCase().includes(needle) ||
        request.label.toLowerCase().includes(needle)
    );
  }, [filters, inView, search]);

  /** Лічильники на перемикачі — по всій дошці, а не по знайденому. */
  /**
   * Полиця «Сьогодні» читається з КАРТОК, а не з браузера.
   *
   * Спершу перелік лежав у localStorage — «особиста замітка на один день, а не
   * факт про картку». Міркування не витримало першого ж робочого дня: справи
   * позначались за компʼютером, а на телефоні полиця була порожня, і це
   * читалось як зникнення задач, хоч у базі не бракувало жодної картки.
   *
   * Замітка справді особиста — тому й фільтр по `todayBy`: кожен бачить свої.
   * Але «особиста» не означає «прив'язана до браузера».
   *
   * Чистка тепер безкоштовна: картка, яку викотили чи відхилили, не проходить
   * `canTakeToday` і зникає з полиці сама — без окремого сховища, без ефекту й
   * без другого джерела правди.
   */
  const todayIds = useMemo(() => {
    const mine = (board.data ?? []).filter(
      (request) => request.todayBy !== null && request.todayBy === userId && canTakeToday(request)
    );
    // Порядок — той, у якому картки туди клали.
    mine.sort((a, b) => (a.todayAt ?? "").localeCompare(b.todayAt ?? ""));
    return mine.map((request) => request.id);
  }, [board.data, userId]);

  const setToday = useSetToday(teamId);

  /**
   * Пишемо лише РІЗНИЦЮ між тим, що було, і тим, що просять.
   *
   * Полиця міняється по одній картці, а повний перезапис зачепив би й ті,
   * яких людина не торкалась — і затер би позначку, поставлену з іншого
   * пристрою хвилину тому.
   */
  const handleToday = useCallback(
    (next: string[]) => {
      const before = new Set(todayIds);
      const after = new Set(next);
      const changes = [
        ...next.filter((id) => !before.has(id)).map((id) => ({ id, taken: true, userId })),
        ...todayIds.filter((id) => !after.has(id)).map((id) => ({ id, taken: false, userId })),
      ];
      changes.forEach((change) =>
        setToday.mutate(change, {
          onError: (error) =>
            toast.error(error instanceof Error ? error.message : "Не зміг оновити «Сьогодні»"),
        })
      );
    },
    [setToday, todayIds, userId]
  );

  const counts = useMemo(() => {
    const all = board.data ?? [];
    const now = new Date();
    return {
      board: all.filter(
        (r) => r.status !== "someday" && r.status !== "wont_do" && !isArchivedRequest(r, now)
      ).length,
      // «Вхідні» — для кнопки «Розібрати» в тулбарі «Черги». Архів не
      // віднімаємо: архівуються лише викочені, тож нерозібране туди не потрапляє.
      triage: all.filter((r) => r.status === "triage").length,
      // Лічильник «Черги» свій: викоченого там немає, тож число дошки їй бреше.
      queue: all.filter(
        (r) =>
          r.status !== "released" &&
          r.status !== "someday" &&
          r.status !== "wont_do" &&
          !isArchivedRequest(r, now)
      ).length,
      log: all.filter((r) => r.status === "released").length,
      someday: all.filter((r) => r.status === "someday").length,
      wont_do: all.filter((r) => r.status === "wont_do").length,
      archive: all.filter((r) => isArchivedRequest(r, now)).length,
    };
  }, [board.data]);

  /**
   * Звіряти дублі треба з усією дошкою, а не з тим, що лишилось після пошуку:
   * інакше набраний у полі фільтр ховав би від моделі саме ту картку, на яку
   * вона мала б показати.
   *
   * Що таке «відкрита» — вирішує isOpenRequestStatus (types.ts), а не список
   * винятків тут. Раніше стояло віднімання («усе, крім released і wont_do»), і
   * кожен новий стан мовчки потрапляв у звірку: «Ідеї» — це відкладене, і
   * пропонувати дописати коментар туди так само безглуздо, як у викочене.
   */
  const openTitles = useMemo(
    () =>
      (board.data ?? [])
        .filter((request) => isOpenRequestStatus(request.status))
        .slice(0, OPEN_TITLES_LIMIT)
        .map((request) => ({ id: request.id, label: request.label, title: request.title })),
    [board.data]
  );

  const handleMove = useCallback(
    (id: string, status: RequestStatus) => {
      moveRequest.mutate({ id, status });
    },
    [moveRequest]
  );

  const handleSubmit = useCallback(
    // Тип бере вікно: воно віддає ще й напрямок, пріоритет і прапорець
    // автопроставлення, а перелічувати ці поля вдруге означало б розійтися з
    // ним на наступній зміні.
    (input: NewDevRequestInput) => {
      if (editing) {
        // autoClassified у мутацію не їде свідомо: правка руками ЗАВЖДИ гасить
        // прапорець, і вирішує це шар даних, а не форма.
        updateRequest.mutate(
          { id: editing.id, ...input },
          {
            onSuccess: () => {
              setDialogOpen(false);
              setEditing(null);
              // Шапка панелі обговорення показує тему — після правки вона має
              // збігатися з карткою, а не лишатись старою до перевибору.
              // autoClassified тут гасимо руками: у базу мутація пише false, і
              // локальна копія не має розходитись із тим, що там лежить.
              setSelected((current) =>
                current && current.id === editing.id
                  ? { ...current, ...input, autoClassified: false }
                  : current
              );
            },
            onError: (error) =>
              setFormError(error instanceof Error ? error.message : "Не вдалося зберегти"),
          }
        );
        return;
      }

      if (!teamId || !userId) {
        setFormError("Не вдалося визначити команду.");
        return;
      }
      createRequest.mutate(
        { teamId, authorUserId: userId, ...input },
        {
          onSuccess: () => setDialogOpen(false),
          onError: (error) =>
            setFormError(error instanceof Error ? error.message : "Не вдалося створити"),
        }
      );
    },
    [createRequest, editing, teamId, updateRequest, userId]
  );

  const openCreate = useCallback(() => {
    setEditing(null);
    setFormError(null);
    setDialogOpen(true);
  }, []);

  const openEdit = useCallback((request: DevRequest) => {
    setEditing(request);
    setFormError(null);
    setDialogOpen(true);
  }, []);

  const handleConfirmDelete = useCallback(() => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    deleteRequest.mutate(target.id, {
      onSuccess: () => {
        setPendingDelete(null);
        // Видалену картку не можна лишати відкритою збоку: панель показувала б
        // обговорення справи, якої вже немає.
        setSelected((current) => (current?.id === target.id ? null : current));
      },
      onError: (error) =>
        toast.error(error instanceof Error ? error.message : "Не вдалося видалити"),
    });
  }, [deleteRequest, pendingDelete]);

  const headerActions = useMemo(
    () => (
      <UnifiedPageToolbar
        // Телефон: пошук і «Фільтри», решта — в аркуші (картка 146).
        mobileCompact
        mobileFilterCount={filters.zones.size + filters.themes.size}
        mobilePrimary={
          <Button onClick={openCreate} size="icon" aria-label="Новий запит" className="h-11 w-11 shrink-0">
            <PlusCircle className="h-5 w-5" />
          </Button>
        }
        topLeft={
          <SegmentedGroup className={cn(SEGMENTED_GROUP, "w-full lg:w-auto")}>
            <Button
              variant="segmented"
              size="xs"
              aria-pressed={view === "queue"}
              onClick={() => setView("queue")}
              className={cn(SEGMENTED_TRIGGER, "gap-2")}
            >
              <ListChecks className="h-4 w-4" />
              Черга
              <CountBadge value={counts.queue} loading={showBoardSkeleton} />
            </Button>
            <Button
              variant="segmented"
              size="xs"
              aria-pressed={view === "board"}
              onClick={() => setView("board")}
              className={cn(SEGMENTED_TRIGGER, "gap-2")}
            >
              <KanbanSquare className="h-4 w-4" />
              Дошка
              <CountBadge value={counts.board} loading={showBoardSkeleton} />
            </Button>
            <Button
              variant="segmented"
              size="xs"
              aria-pressed={view === "log"}
              onClick={() => setView("log")}
              className={cn(SEGMENTED_TRIGGER, "gap-2")}
            >
              <CheckCheck className="h-4 w-4" />
              Щоденник
              <CountBadge value={counts.log} loading={showBoardSkeleton} />
            </Button>
            <Button
              variant="segmented"
              size="xs"
              aria-pressed={view === "someday"}
              onClick={() => setView("someday")}
              className={cn(SEGMENTED_TRIGGER, "gap-2")}
            >
              <Lightbulb className="h-4 w-4" />
              Ідеї
              <CountBadge value={counts.someday} loading={showBoardSkeleton} />
            </Button>
            <Button
              variant="segmented"
              size="xs"
              aria-pressed={view === "wont_do"}
              onClick={() => setView("wont_do")}
              className={cn(SEGMENTED_TRIGGER, "gap-2")}
            >
              <XCircle className="h-4 w-4" />
              Не робимо
              <CountBadge value={counts.wont_do} loading={showBoardSkeleton} />
            </Button>
            {/*
             * Архів показуємо кнопкою лише коли в ньому щось є: порожній
             * перемикач на молодій дошці — це обіцянка розділу, у який нема
             * чого відкривати.
             */}
            {counts.archive > 0 ? (
              <Button
                variant="segmented"
                size="xs"
                aria-pressed={view === "archive"}
                onClick={() => setView("archive")}
                className={cn(SEGMENTED_TRIGGER, "gap-2")}
              >
                <Archive className="h-4 w-4" />
                Архів
                <CountBadge value={counts.archive} />
              </Button>
            ) : null}
          </SegmentedGroup>
        }
        topRight={
          <Button
            onClick={openCreate}
            className={cn(TOOLBAR_ACTION_BUTTON, "w-full gap-2 sm:w-auto")}
          >
            <PlusCircle className="h-4 w-4" />
            Новий запит
          </Button>
        }
        // Ряд збирається вже від 640 px, а не від 1280, як у типовому тулбарі.
        // Там ця межа розрахована на розсип фільтрів; тут їх троє — пошук,
        // «Фільтр» і групування, — і вони спокійно стоять поруч на ноутбуку.
        // За типової межі на 1100 px тулбар розпадався на ТРИ ряди, останнім із
        // яких був самотній лічильник карток.
        bottomRowClassName="sm:flex-row sm:items-center"
        searchClassName="sm:max-w-[340px] sm:flex-none"
        metaClassName="sm:ml-auto sm:flex-none"
        search={
          <ToolbarSearch
            value={search}
            onChange={setSearch}
            placeholder="Пошук за назвою або REQ-номером..."
          />
        }
        // Фільтри в нижньому ряду, поруч із пошуком: обидва звужують те саме —
        // що зараз на екрані. Верхній ряд лишається за вибором вигляду.
        filters={
          <>
            <BoardFilters requests={inView} state={filters} onChange={setFilters} />
            {/* Групування лише на дошці: «Ідеї» — стіна нотаток без колонок,
                а «Не робимо» — плаский список. Різати там нема чого. */}
            {view === "board" ? <GroupControl value={groupBy} onChange={changeGroupBy} /> : null}
            {/*
             * «Розібрати» — двері до «Вхідних» на дошці, видимі лише з «Черги»
             * і лише коли є що розбирати. Раніше кнопка стояла смугою в самому
             * низу черги: щоб розібрати кошик, треба було долистати повз усе.
             * Ряд із «Фільтром» уже тримає контроли конкретного вигляду —
             * групування живе тут само. Лічильник — по всій дошці, як на
             * перемикачах вигляду, а не по знайденому пошуком.
             */}
            {view === "queue" && counts.triage > 0 ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setView("board")}
                className={cn(TOOLBAR_FILTER, "shrink-0 px-3.5")}
                title={`${counts.triage} не розібрано — це робота на раз на тиждень, не щодня`}
              >
                <Inbox className="h-4 w-4" />
                Розібрати
                <span className="rounded-full bg-foreground/10 px-1.5 font-mono text-2xs tabular-nums">
                  {counts.triage}
                </span>
              </Button>
            ) : null}
          </>
        }
        meta={
          <ToolbarMeta
            count={requests.length}
            // Скидання чистить і пошук, і фільтри: у людини це одне бажання —
            // «покажи все», а не два різні.
            onReset={() => {
              setSearch("");
              setFilters(EMPTY_BOARD_FILTERS);
            }}
            showReset={search.trim().length > 0 || hasActiveFilters(filters)}
            loading={board.isFetching}
          />
        }
      />
    ),
    [
      board.isFetching,
      showBoardSkeleton,
      changeGroupBy,
      counts,
      filters,
      groupBy,
      inView,
      openCreate,
      requests.length,
      search,
      view,
    ]
  );

  // Хук стоїть ДО раннього return: інакше на редиректі порядок хуків
  // розійшовся б із рендером, де гейт пропустив.
  usePageHeaderActions(headerActions, [headerActions]);

  if (!canSee) return <Navigate to="/whats-new" replace />;

  return (
    // Без власних бічних відступів: маршрут працює в режимі полотна (див.
    // isCanvasMode в AppLayout), і дошка сама дає собі px-4/md:px-5 — рівно
    // як на дизайні та прорахунках. Свій padding тут перекрив би це й
    // відрізав би колонки від правого краю.
    <div>
      <LiveCursorsLayer pageKey="dev-backlog" demo={cursorsDemo} />
      {/* Помилка окремим рядком, а не замість дошки: кеш міг лишитись із
          минулого відкриття, і показати його корисніше за порожній екран. */}
      {board.error ? (
        <p className="px-4 pt-4 text-sm text-destructive md:px-5">
          Не вдалося завантажити запити.
        </p>
      ) : null}

      {/* Дошка на всю ширину: деталі картки відкриваються дровером-накладкою, а
          не колонкою збоку — інакше вона з'їдала б ширину саме тоді, коли
          дошку прокручують горизонтально.

          «Ідеї» та «Не робимо» показані СПИСКОМ, а не шостою колонкою: етапом
          роботи вони не є, і стовпчик у ряду з рештою читався б саме так.
          Розгорнуто над BOARD_COLUMNS у features/devRequests/types.ts. */}
      {view === "board" ? (
        isNarrowViewport ? (
          /*
           * Телефон: БЕЗ обгортки фіксованої висоти.
           *
           * Вона тримає горизонтальну дошку, колонки якої прокручуються
           * всередині себе. Мобільний вигляд — звичайний вертикальний список,
           * і той самий `overflow-hidden` просто відрізав його по висоті
           * вікна: картки обривались, а прокрутки не було (картка 146).
           */
          showBoardSkeleton ? (
            <div className={cn(MOBILE_PAGE_BODY, MOBILE_CARD_LIST, "pb-3")}>
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-24 w-full rounded-2xl" />
              ))}
            </div>
          ) : (
            <DevRequestBoard
              requests={requests}
              onMove={handleMove}
              onSelect={setSelected}
              onEdit={openEdit}
              onDelete={setPendingDelete}
              onCopyCard={setReleaseCardFor}
              viewerId={userId}
              groupBy={groupBy}
              canManage={canSee}
            />
          )
        ) : (
        <div
          ref={kanbanViewportRef}
          className="min-h-0 overflow-hidden"
          style={kanbanViewportHeight ? { height: `${kanbanViewportHeight}px` } : undefined}
        >
          {showBoardSkeleton ? (
            /* Ті самі п'ять колонок і та сама ширина 300 px, що й у справжньої
               дошки: інакше поява карток читалась би як перебудова екрана. */
            <KanbanSkeleton
              columns={BOARD_COLUMNS.map((column) => ({
                id: column.status,
                className: "w-[300px] basis-[300px]",
              }))}
              boardClassName="h-full pb-2 md:pb-3"
              rowClassName="h-full items-stretch"
              cardsPerColumn={3}
            />
          ) : (
            <DevRequestBoard
              requests={requests}
              onMove={handleMove}
              onSelect={setSelected}
              onEdit={openEdit}
              onDelete={setPendingDelete}
              onCopyCard={setReleaseCardFor}
              viewerId={userId}
              groupBy={groupBy}
              canManage={canSee}
            />
          )}
        </div>
        )
      ) : (
        /* Списку полотно ні до чого — це читомий стовпчик рядків, а не дошка,
           яку прокручують убік. Відступи, що їх у режимі полотна не дає
           каркас, повертаємо тут — тими самими кроками (px-4/5/6). */
        <div className="px-4 py-4 md:px-5 md:py-5 lg:px-6">
        {showBoardSkeleton ? (
          /* Списки чекають так само, як дошка: порожній екран із написом
             «нічого немає» під час завантаження — це неправда, а не порожнеча. */
          <div role="status" aria-busy="true" className="space-y-2">
            <span className="sr-only">Завантаження</span>
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="flex items-center gap-3 rounded-2xl border border-border/50 bg-card/70 px-4 py-3.5"
              >
                <Skeleton className="h-9 w-9 shrink-0 rounded-xl" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className={cn("h-3.5 rounded-full", index % 2 === 0 ? "w-[46%]" : "w-[34%]")} />
                  <Skeleton className="h-3 w-[62%] rounded-full opacity-70" />
                </div>
                <Skeleton className="h-6 w-20 shrink-0 rounded-full opacity-80" />
              </div>
            ))}
          </div>
        ) : view === "queue" ? (
          <DevRequestQueue
            requests={requests}
            todayIds={todayIds}
            onToday={handleToday}
            onSelect={setSelected}
            onChecklist={canSee ? handleChecklist : undefined}
            savingChecklistId={savingChecklistId}
          />
        ) : view === "log" ? (
          <DevRequestLog
            requests={requests}
            onSelect={setSelected}
            onCopyCard={canSee ? setReleaseCardFor : undefined}
          />
        ) : view === "someday" ? (
          /* «Ідеї» — стіною нотаток, а не списком: рядок на всю ширину показує
             чотири поля й лишає порожнечу посередині, бо сканувати тут нема
             чого — ідеї не впорядковані ні за чим. «Не робимо» лишається
             списком: туди заглядають рідко й по конкретну картку. */
          <DevRequestWall
            requests={requests}
            emptyText="Ідей поки немає. Картка потрапляє сюди дією «В ідеї» в меню на дошці."
            viewerId={userId}
            onSelect={setSelected}
            onMove={handleMove}
            onEdit={openEdit}
            onDelete={setPendingDelete}
            onCopyCard={setReleaseCardFor}
            canManage={canSee}
          />
        ) : (
          <DevRequestList
            requests={requests}
            emptyText={
              view === "archive"
                ? `В архіві порожньо. Сюди картки йдуть самі — через ${ARCHIVE_AFTER_DAYS} днів після викочення.`
                : "Відхилених карток немає."
            }
            onSelect={setSelected}
            onMove={handleMove}
            onEdit={openEdit}
            onDelete={setPendingDelete}
            canManage={canSee}
          />
        )}
        </div>
      )}

      {releaseCardFor ? (
        <ReleaseCardDialog
          request={releaseCardFor}
          open={releaseCardFor !== null}
          onOpenChange={(open) => {
            if (!open) setReleaseCardFor(null);
          }}
        />
      ) : null}

      <DevRequestDetailsSheet
        request={selected}
        onClose={() => setSelected(null)}
        onEdit={openEdit}
        onDelete={setPendingDelete}
        onCopyCard={setReleaseCardFor}
        canManage={canSee}
      />

      <NewDevRequestDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        saving={editing ? updateRequest.isPending : createRequest.isPending}
        error={formError}
        openTitles={openTitles}
        request={editing}
        onSubmit={handleSubmit}
      />

      {/* Підтвердження обов'язкове: видалення незворотне, а картка на дошці
          стоїть за кнопкою в один клік. */}
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        icon={<Trash2 className="h-5 w-5 text-destructive" />}
        title={`Видалити ${pendingDelete?.label ?? "запит"}?`}
        description={
          pendingDelete ? (
            <>
              «{pendingDelete.title}» зникне з дошки назавжди. Відновити не вийде.
            </>
          ) : null
        }
        confirmLabel="Видалити"
        cancelLabel="Скасувати"
        confirmClassName="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        loading={deleteRequest.isPending}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
