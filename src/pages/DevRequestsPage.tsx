import { useCallback, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { PlusCircle, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/auth/AuthProvider";
import { usePageHeaderActions } from "@/components/app/page-header-actions";
import { UnifiedPageToolbar } from "@/components/app/headers/UnifiedPageToolbar";
import { ToolbarMeta, ToolbarSearch } from "@/components/app/headers/toolbarPrimitives";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { TOOLBAR_ACTION_BUTTON } from "@/components/ui/controlStyles";
import { cn } from "@/lib/utils";
import { DevRequestBoard } from "@/features/devRequests/DevRequestBoard";
import {
  NewDevRequestDialog,
  type NewDevRequestInput,
} from "@/features/devRequests/NewDevRequestDialog";
import { TaskThreadRail } from "@/features/taskChat/TaskThreadRail";
import {
  useCreateDevRequest,
  useDeleteDevRequest,
  useDevRequestBoard,
  useMoveDevRequest,
  useUpdateDevRequest,
} from "@/features/devRequests/queries";
import type { DevRequest, RequestStatus } from "@/features/devRequests/types";

/** Скільки відкритих карток віддаємо моделі на звірку дублів. */
const OPEN_TITLES_LIMIT = 50;

/**
 * Подій activity_log у запитів поки немає — історію полів пише аудит-тригер, і
 * вона з'явиться в стрічці окремим кроком фази 2. Порожній список означає
 * «стрічка лише з повідомлень», і панель тоді в activity_log не ходить взагалі.
 *
 * Стала на рівні модуля, а не літерал у JSX: інакше кожен рендер сторінки
 * створював би новий масив.
 */
const NO_THREAD_EVENTS: string[] = [];

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

  const requests = useMemo(() => {
    const all = board.data ?? [];
    const needle = search.trim().toLowerCase();
    if (!needle) return all;
    return all.filter(
      (request) =>
        request.title.toLowerCase().includes(needle) ||
        request.label.toLowerCase().includes(needle)
    );
  }, [board.data, search]);

  /**
   * Звіряти дублі треба з усією дошкою, а не з тим, що лишилось після пошуку:
   * інакше набраний у полі фільтр ховав би від моделі саме ту картку, на яку
   * вона мала б показати.
   *
   * «Викочено» і «не робимо» до відкритих не належать: перше вже в проді,
   * друге — свідома відмова. Пропонувати дописати коментар туди безглуздо.
   */
  const openTitles = useMemo(
    () =>
      (board.data ?? [])
        .filter((request) => request.status !== "released" && request.status !== "wont_do")
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
    [board.isFetching, openCreate, requests.length, search]
  );

  // Хук стоїть ДО раннього return: інакше на редиректі порядок хуків
  // розійшовся б із рендером, де гейт пропустив.
  usePageHeaderActions(headerActions, [headerActions]);

  if (!canSee) return <Navigate to="/whats-new" replace />;

  return (
    <div className="pb-8">
      {/* Помилка окремим рядком, а не замість дошки: кеш міг лишитись із
          минулого відкриття, і показати його корисніше за порожній екран. */}
      {board.error ? (
        <p className="mb-4 text-sm text-destructive">Не вдалося завантажити запити.</p>
      ) : null}

      {/* items-start обов'язковий: без нього колонка обговорення розтягнулась би
          на висоту дошки, а дошка росте разом із кількістю карток. */}
      <div className="flex items-start gap-4">
        {/* min-w-0 тримає горизонтальну прокрутку дошки всередині неї самої:
            без цього flex-елемент роздувся б по вмісту й скрол поїхав би на
            всю сторінку. */}
        <div className="min-w-0 flex-1">
          <DevRequestBoard
            requests={requests}
            onMove={handleMove}
            onSelect={setSelected}
            onEdit={openEdit}
            onDelete={setPendingDelete}
            canManage={canSee}
          />
        </div>

        {/* Обговорення поруч із дошкою, а не поверх неї. Нижче xl місця на дві
            колонки немає — там панель ховаємо, дошка лишається на всю ширину.
            pt-* повторює верхній відступ дошки, щоб шапки збіглися по лінії. */}
        {selected ? (
          <aside className="hidden w-[380px] shrink-0 pt-4 md:pt-5 xl:block">
            {/* Заголовок із закриттям: без нього обрана картка лишалась обраною
                назавжди — панель можна було лише підмінити іншою карткою, але
                не прибрати. */}
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="truncate text-sm font-medium" title={selected.title}>
                <span className="text-muted-foreground">{selected.label}</span> {selected.title}
              </p>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => setSelected(null)}
                aria-label="Закрити обговорення"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            {/* Висота задається тут, бо сама панель тягнеться під батька
                (h-full flex-1). Той самий прийом, що в дизайн-задачі. */}
            <div className="flex max-h-[calc(100dvh-13rem)] min-h-[420px] flex-col">
              <TaskThreadRail
                threadKey={`dev-request:${selected.id}`}
                eventActions={NO_THREAD_EVENTS}
                quoteId={null}
                teamId={selected.teamId}
              />
            </div>
          </aside>
        ) : null}
      </div>

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
              «{pendingDelete.title}» зникне з дошки назавжди — разом з обговоренням у картці.
              Відновити не вийде.
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
