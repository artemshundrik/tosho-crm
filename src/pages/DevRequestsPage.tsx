import { useCallback, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { KanbanSquare, Lightbulb, PlusCircle, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/auth/AuthProvider";
import { usePageHeaderActions } from "@/components/app/page-header-actions";
import { UnifiedPageToolbar } from "@/components/app/headers/UnifiedPageToolbar";
import { CountBadge, ToolbarMeta, ToolbarSearch } from "@/components/app/headers/toolbarPrimitives";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { Button } from "@/components/ui/button";
import {
  SEGMENTED_GROUP,
  SEGMENTED_TRIGGER,
  TOOLBAR_ACTION_BUTTON,
} from "@/components/ui/controlStyles";
import { SegmentedGroup } from "@/components/ui/segmented-group";
import { cn } from "@/lib/utils";
import { DevRequestBoard } from "@/features/devRequests/DevRequestBoard";
import { DevRequestDetailsSheet } from "@/features/devRequests/DevRequestDetailsSheet";
import { DevRequestList } from "@/features/devRequests/DevRequestList";
import {
  NewDevRequestDialog,
  type NewDevRequestInput,
} from "@/features/devRequests/NewDevRequestDialog";
import {
  useCreateDevRequest,
  useDeleteDevRequest,
  useDevRequestBoard,
  useMoveDevRequest,
  useUpdateDevRequest,
} from "@/features/devRequests/queries";
import {
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
type BoardView = "board" | "someday" | "wont_do";

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
  const [view, setView] = useState<BoardView>("board");
  const [dialogOpen, setDialogOpen] = useState(false);
  /**
   * Картка, яку правимо. null при відкритому вікні = «новий запит».
   * Вікно одне на обидва режими — див. NewDevRequestDialog.
   */
  const [editing, setEditing] = useState<DevRequest | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  /** Картка, яку просять видалити. Без підтвердження не видаляємо. */
  const [pendingDelete, setPendingDelete] = useState<DevRequest | null>(null);
  // Вибрана картка — під панель обговорення, яку додає наступна задача.
  const [selected, setSelected] = useState<DevRequest | null>(null);

  const canSee =
    (accessRole ?? "").trim().toLowerCase() === "owner" ||
    (jobRole ?? "").trim().toLowerCase() === "seo";

  const board = useDevRequestBoard(teamId);
  const createRequest = useCreateDevRequest();
  const moveRequest = useMoveDevRequest(teamId);
  const updateRequest = useUpdateDevRequest(teamId);
  const deleteRequest = useDeleteDevRequest(teamId);

  /**
   * Пошук діє всередині відкритого вигляду, а не поверх усього одразу: набране
   * в полі слово має звужувати те, що зараз на екрані, а не підмішувати в дошку
   * картки з «Ідей».
   */
  const requests = useMemo(() => {
    const all = board.data ?? [];
    const inView = all.filter((request) =>
      view === "board" ? request.status !== "someday" && request.status !== "wont_do" : request.status === view
    );
    const needle = search.trim().toLowerCase();
    if (!needle) return inView;
    return inView.filter(
      (request) =>
        request.title.toLowerCase().includes(needle) ||
        request.label.toLowerCase().includes(needle)
    );
  }, [board.data, search, view]);

  /** Лічильники на перемикачі — по всій дошці, а не по знайденому. */
  const counts = useMemo(() => {
    const all = board.data ?? [];
    return {
      board: all.filter((r) => r.status !== "someday" && r.status !== "wont_do").length,
      someday: all.filter((r) => r.status === "someday").length,
      wont_do: all.filter((r) => r.status === "wont_do").length,
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
        topLeft={
          <SegmentedGroup className={cn(SEGMENTED_GROUP, "w-full lg:w-auto")}>
            <Button
              variant="segmented"
              size="xs"
              aria-pressed={view === "board"}
              onClick={() => setView("board")}
              className={cn(SEGMENTED_TRIGGER, "gap-2")}
            >
              <KanbanSquare className="h-4 w-4" />
              Дошка
              <CountBadge value={counts.board} />
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
              <CountBadge value={counts.someday} />
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
              <CountBadge value={counts.wont_do} />
            </Button>
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
        search={
          <ToolbarSearch
            value={search}
            onChange={setSearch}
            placeholder="Пошук за назвою або REQ-номером..."
          />
        }
        meta={
          <ToolbarMeta
            count={requests.length}
            onReset={() => setSearch("")}
            showReset={search.trim().length > 0}
            loading={board.isFetching}
          />
        }
      />
    ),
    [board.isFetching, counts, openCreate, requests.length, search, view]
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
        <DevRequestBoard
          requests={requests}
          onMove={handleMove}
          onSelect={setSelected}
          onEdit={openEdit}
          onDelete={setPendingDelete}
          canManage={canSee}
        />
      ) : (
        /* Списку полотно ні до чого — це читомий стовпчик рядків, а не дошка,
           яку прокручують убік. Відступи, що їх у режимі полотна не дає
           каркас, повертаємо тут — тими самими кроками (px-4/5/6). */
        <div className="px-4 py-4 md:px-5 md:py-5 lg:px-6">
        <DevRequestList
          requests={requests}
          showAge={view === "someday"}
          emptyText={
            view === "someday"
              ? "Ідей поки немає. Картка потрапляє сюди дією «В ідеї» в меню на дошці."
              : "Відхилених карток немає."
          }
          onSelect={setSelected}
          onMove={handleMove}
          onEdit={openEdit}
          onDelete={setPendingDelete}
          canManage={canSee}
        />
        </div>
      )}

      <DevRequestDetailsSheet
        request={selected}
        onClose={() => setSelected(null)}
        onEdit={openEdit}
        onDelete={setPendingDelete}
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
