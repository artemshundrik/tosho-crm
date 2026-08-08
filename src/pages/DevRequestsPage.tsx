import { useCallback, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { PlusCircle, X } from "lucide-react";

import { useAuth } from "@/auth/AuthProvider";
import { usePageHeaderActions } from "@/components/app/page-header-actions";
import { UnifiedPageToolbar } from "@/components/app/headers/UnifiedPageToolbar";
import { ToolbarMeta, ToolbarSearch } from "@/components/app/headers/toolbarPrimitives";
import { Button } from "@/components/ui/button";
import { TOOLBAR_ACTION_BUTTON } from "@/components/ui/controlStyles";
import { cn } from "@/lib/utils";
import { DevRequestBoard } from "@/features/devRequests/DevRequestBoard";
import { NewDevRequestDialog } from "@/features/devRequests/NewDevRequestDialog";
import { TaskThreadRail } from "@/features/taskChat/TaskThreadRail";
import {
  useCreateDevRequest,
  useDevRequestBoard,
  useMoveDevRequest,
} from "@/features/devRequests/queries";
import type { DevRequest, RequestKind, RequestStatus } from "@/features/devRequests/types";

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
  const [createError, setCreateError] = useState<string | null>(null);
  // Вибрана картка — під панель обговорення, яку додає наступна задача.
  const [selected, setSelected] = useState<DevRequest | null>(null);

  const canSee =
    (accessRole ?? "").trim().toLowerCase() === "owner" ||
    (jobRole ?? "").trim().toLowerCase() === "seo";

  const board = useDevRequestBoard(teamId);
  const createRequest = useCreateDevRequest();
  const moveRequest = useMoveDevRequest(teamId);

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

  const handleCreate = useCallback(
    (input: { title: string; body: string; kind: RequestKind; isPrivate: boolean }) => {
      if (!teamId || !userId) {
        setCreateError("Не вдалося визначити команду.");
        return;
      }
      setCreateError(null);
      createRequest.mutate(
        { teamId, authorUserId: userId, ...input },
        {
          onSuccess: () => setDialogOpen(false),
          onError: (error) =>
            setCreateError(error instanceof Error ? error.message : "Не вдалося створити"),
        }
      );
    },
    [createRequest, teamId, userId]
  );

  const headerActions = useMemo(
    () => (
      <UnifiedPageToolbar
        topRight={
          <Button
            onClick={() => setDialogOpen(true)}
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
    [board.isFetching, requests.length, search]
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
            canMove={canSee}
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
        saving={createRequest.isPending}
        error={createError}
        openTitles={openTitles}
        onSubmit={handleCreate}
      />
    </div>
  );
}
