import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { toast } from "sonner";
import { ChevronDown, CircleDashed, ImageDown, Layers, ListChecks, PencilLine, Trash2 } from "lucide-react";

import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { moduleKeyLabel } from "@/lib/projectMap";
import { toneSubtleClass, toneTextClass } from "@/lib/statusTones";
import { cn } from "@/lib/utils";
import { resolveAuthor } from "./cardModel";
import { auditActionLabel, auditChangeLines } from "./history";
import { useDevRequestHistory, useUpdateChecklist } from "./queries";
import { ChecklistPanel } from "./ChecklistPanel";
import {
  KIND_ICONS,
  KIND_LABELS,
  KIND_TONE,
  PRIORITY_LABELS,
  STATUS_ICONS,
  STATUS_LABELS,
  STATUS_TONE,
  ZONE_ICONS,
  ZONE_LABELS,
  ZONE_TONE,
  type DevRequest,
} from "./types";

function formatWhen(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("uk-UA", { dateStyle: "short", timeStyle: "short" });
}

/** Дата без часу — для підпису під назвою, де хвилини створення нікого не цікавлять. */
function formatDay(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("uk-UA", { day: "numeric", month: "long" });
}

/**
 * Мітка картки — той самий вигляд, що й на дошці.
 *
 * ДВІ ТАБЛИЦІ «ПОЛЕ: ЗНАЧЕННЯ» ТУТ БУЛИ І ПРИБРАНІ. Вісім рядків переказували
 * словами те, що намальовано на картці, з якої щойно клікнули: тип, зону, тему,
 * напрямок, пріоритет. Мітка поруч із назвою впізнається без читання, бо її вже
 * бачили на дошці; рядок таблиці доводилось саме читати — і читали його раз,
 * після чого прогортали повз назавжди.
 */
function Chip({
  className,
  icon: Icon,
  title,
  children,
}: {
  className?: string;
  icon?: ComponentType<{ className?: string }>;
  title?: string;
  children: ReactNode;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-2xs",
        className ?? "border border-border/70 text-muted-foreground"
      )}
    >
      {Icon ? <Icon className="h-3 w-3" /> : null}
      {children}
    </span>
  );
}

type DevRequestDetailsSheetProps = {
  /** Відкрита картка. null — дровер закритий. */
  request: DevRequest | null;
  onClose: () => void;
  onEdit: (request: DevRequest) => void;
  onDelete: (request: DevRequest) => void;
  /** Відкрити збирач картинки «виправлено». Вікно живе на сторінці. */
  onCopyCard?: (request: DevRequest) => void;
  canManage: boolean;
};

/**
 * Деталі запиту — дровер справа НАКЛАДКОЮ.
 *
 * Чому накладка, а не колонка: дошка прокручується горизонтально, і постійна
 * колонка з'їдала б їй ширину саме тоді, коли картку читають.
 *
 * ПОРЯДОК: назва зі статусом і мітками → суть → пункти → історія (згорнута).
 * Дії внизу, у липкому підвалі.
 *
 * ЩО ЗМІНИЛОСЬ 2026-08-09 і чому. Дровер був довідкою ПРО картку, а не місцем
 * роботи з нею:
 *
 * — «Видалити» стояла ДРУГОЮ ЗА ПОМІТНІСТЮ річчю у вікні: червона заливка,
 *   одразу під назвою, того ж розміру, що «Редагувати». Тепер обидві внизу, і
 *   видалення тихе — рамка замість заливки. Підтвердження стоїть на сторінці
 *   (ConfirmDialog), тож випадковий клік нічого не втрачає.
 * — Статусу не було видно взагалі. Дровер відкривають із дошки, але всередині
 *   ніде не написано, у якій колонці картка, — а це перше, з чого починається
 *   розуміння, про що мова.
 * — Шість заголовків секцій великими літерами; лишилось два. Суть іде першим
 *   абзацом без підпису: те, що стоїть найпершим і найбільшим, підписувати не
 *   треба.
 */
export function DevRequestDetailsSheet({
  request,
  onClose,
  onEdit,
  onDelete,
  onCopyCard,
  canManage,
}: DevRequestDetailsSheetProps) {
  const { userId } = useAuth();

  /**
   * Остання показана картка. Дровер їде назовні з анімацією, а `request` на
   * той момент уже null — без цієї копії вміст блимав би порожнечею, а Radix
   * лишався б без заголовка, якого вимагає для доступності.
   */
  const [shown, setShown] = useState<DevRequest | null>(request);
  useEffect(() => {
    if (request) setShown(request);
  }, [request]);

  /**
   * Історія згорнута. Потрібна вона зрідка й прицільно — «хто поміняв статус»,
   * — а місце займала завжди. Кожне відкриття картки починається згорнутим:
   * стан «розгорнув учора» ніколи не стосується сьогоднішньої картки.
   */
  const [historyOpen, setHistoryOpen] = useState(false);
  useEffect(() => {
    if (request) setHistoryOpen(false);
  }, [request]);

  const updateChecklist = useUpdateChecklist(shown?.teamId ?? null);
  const historyQuery = useDevRequestHistory(request, userId);
  // Немає прав або RPC відмовила — секції просто немає. Історія тут довідка,
  // а не суть: валити через неї дровер немає за що.
  const historyEntries = historyQuery.data ?? [];

  const author = shown ? resolveAuthor(shown) : null;
  const KindIcon = shown ? KIND_ICONS[shown.kind] : null;
  const StatusIcon = shown ? STATUS_ICONS[shown.status] : null;
  const ZoneIcon = shown?.zone ? ZONE_ICONS[shown.zone] : null;
  const moduleLabel = shown ? moduleKeyLabel(shown.moduleKey) : null;

  return (
    <Sheet
      open={request !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {/* isDirty={false} навмисно: дровер лише показує картку, форми в ньому
          немає. Без цього автозахист «незбережених змін» рахував би зміною
          будь-яке натискання (він ловить усі кнопки) — і питав би «закрити без
          збереження?» після кожного перегляду. */}
      <SheetContent className="w-full gap-0 p-0 sm:max-w-[560px]" isDirty={false} dismissible={true}>
        {shown ? (
          <>
            <div className="shrink-0 border-b px-5 py-4 pr-14">
              <SheetHeader className="space-y-0">
                {/* Номер і статус в один рядок: «де воно лежить» — перше
                    питання, з яким сюди приходять, і відповідь має стояти
                    поруч із назвою, а не ховатись у таблиці нижче. Значок і
                    тон ті самі, що в заголовка колонки на дошці. */}
                <div className="flex items-center gap-2.5">
                  <span className="font-mono text-2xs font-semibold tracking-wide text-muted-foreground">
                    {shown.label}
                  </span>
                  <span
                    className={cn(
                      "inline-flex h-5 items-center gap-1.5 rounded-full px-2 text-2xs font-semibold",
                      toneSubtleClass[STATUS_TONE[shown.status]],
                      toneTextClass[STATUS_TONE[shown.status]]
                    )}
                  >
                    {StatusIcon ? <StatusIcon className="h-3 w-3" /> : null}
                    {STATUS_LABELS[shown.status]}
                  </span>
                </div>

                <SheetTitle className="pt-1.5 text-base font-medium leading-snug">
                  {shown.title}
                </SheetTitle>
                {/* Автор, дата й «просили» — ОДИН рядок замість трирядкової
                    таблиці «Звідки прийшло». Це підпис під назвою, а не розділ
                    вікна. «Просили» показуємо лише коли просив не один: одиниця
                    стоїть на майже кожній картці й нічого не розрізняє. */}
                <SheetDescription className="pt-1 text-2xs text-muted-foreground">
                  {[
                    author?.label ?? "з дошки",
                    formatDay(shown.createdAt),
                    shown.askedByCount > 1 ? `просили ${shown.askedByCount}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </SheetDescription>
              </SheetHeader>

              {/* Мітки — те саме, що на картці, тим самим виглядом. */}
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <Chip
                  className={cn(
                    "font-medium",
                    toneSubtleClass[KIND_TONE[shown.kind]],
                    toneTextClass[KIND_TONE[shown.kind]]
                  )}
                  icon={KindIcon ?? undefined}
                >
                  {KIND_LABELS[shown.kind]}
                </Chip>
                {shown.zone ? (
                  <Chip
                    className={cn(
                      "font-medium",
                      toneSubtleClass[ZONE_TONE[shown.zone]],
                      toneTextClass[ZONE_TONE[shown.zone]]
                    )}
                    icon={ZoneIcon ?? undefined}
                    title="Зона роботи"
                  >
                    {ZONE_LABELS[shown.zone]}
                  </Chip>
                ) : null}
                {shown.theme ? (
                  <Chip icon={Layers} title="Тема">
                    {shown.theme}
                  </Chip>
                ) : null}
                {/* Порожній напрямок підписуємо «без напрямку» — тією самою
                    мовою, що й групи «без теми» / «без зони» на дошці. Повне
                    «напрямок не визначено» в чіпі було вдвічі довше за будь-яку
                    справжню назву й читалось як назва модуля. */}
                <Chip
                  title="Напрямок"
                  className={
                    moduleLabel ? undefined : "border border-dashed border-border text-muted-foreground/70"
                  }
                >
                  {moduleLabel ?? "без напрямку"}
                </Chip>
                {/* Пріоритет — лише коли він щось означає. «Звичайний» стоїть на
                    більшості карток і мітки не вартий; на дошці його так само
                    показують стовпчиками, а не словом. */}
                {shown.priority && shown.priority !== "normal" ? (
                  <Chip
                    className={
                      shown.priority === "high"
                        ? cn("font-medium", toneSubtleClass.danger, toneTextClass.danger)
                        : undefined
                    }
                    title="Пріоритет"
                  >
                    {PRIORITY_LABELS[shown.priority]}
                  </Chip>
                ) : null}
                {/* Не мітка, а застереження про якість решти міток. Тому без
                    рамки: інакше читалася б як ще одне поле картки.

                    Підпис був «розбір» — і не працював: слово називало АВТОРА
                    міток, а не те, що з ними робити. Читач думав, що це слід
                    якоїсь дії над карткою, і перепитував. Тепер підпис каже
                    стан: мітки поставила модель і їх ще ніхто не звіряв.
                    Іконка теж змінилась: іскри означали «магія AI», а тут
                    ідеться не про походження, а про непевність — пунктирне
                    коло повторює той самий пунктир, яким на дошці підкреслено
                    тип незвірених карток. */}
                {shown.autoClassified ? (
                  <span
                    className="inline-flex items-center gap-1 text-2xs text-muted-foreground/70"
                    title="Тип, напрямок, зону й пріоритет поставила модель під час запису. Людина їх ще не звіряла — щойно картку збережуть через «Редагувати», позначка зникне"
                  >
                    <CircleDashed className="h-3 w-3" />
                    не звірено
                  </span>
                ) : null}
              </div>
            </div>

            <SheetBody className="space-y-5 px-5 py-5">
              {/* Суть без заголовка: те, що стоїть найпершим і найбільшим,
                  підписувати не треба. whitespace-pre-wrap — надиктований текст
                  приходить абзацами, без цього вони склеїлись би в стіну. */}
              {shown.body.trim() ? (
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{shown.body}</p>
              ) : (
                <p className="text-[13px] text-muted-foreground">опису немає</p>
              )}

              {shown.checklist.length > 0 || canManage ? (
                <section className="space-y-2">
                  <h3 className="flex items-center gap-2 text-2xs font-semibold uppercase tracking-caps text-muted-foreground">
                    <ListChecks className="h-3.5 w-3.5" />
                    Пункти
                    {/* Числа «5 з 20» тут НЕМАЄ навмисно: їх показує смужка
                        прогресу першим рядком самої панелі, та ще й разом із
                        «чекає CEO 10 дн». Продубльоване в заголовку, воно
                        читалось як два різні лічильники. */}
                  </h3>
                  <ChecklistPanel
                    items={shown.checklist}
                    canManage={canManage}
                    saving={updateChecklist.isPending}
                    onChange={(next) => {
                      // Малюємо одразу, не чекаючи мережі: галочки ставлять
                      // пачкою, і пауза на кожній перетворила б це на муку.
                      setShown((current) => (current ? { ...current, checklist: next } : current));
                      updateChecklist.mutate(
                        // Статус і назву передаємо, щоб мутація знала, чи можна
                        // закрити картку: закритий останній пункт означає
                        // «Готово локально», а накопичувач дрібниць — ні.
                        { id: shown.id, checklist: next, status: shown.status, title: shown.title },
                        {
                          onError: (error) =>
                            toast.error(
                              error instanceof Error ? error.message : "Не вдалося зберегти пункти"
                            ),
                        }
                      );
                    }}
                  />
                </section>
              ) : null}

              {historyEntries.length > 0 ? (
                <section className="border-t border-border/60 pt-3">
                  <button
                    type="button"
                    onClick={() => setHistoryOpen((open) => !open)}
                    aria-expanded={historyOpen}
                    className="flex w-full items-center gap-2 text-2xs font-semibold uppercase tracking-caps text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <ChevronDown
                      className={cn(
                        "h-3.5 w-3.5 transition-transform",
                        !historyOpen && "-rotate-90"
                      )}
                    />
                    Історія змін
                    <span className="font-mono font-normal tabular-nums opacity-70">
                      {historyEntries.length}
                    </span>
                  </button>

                  {historyOpen ? (
                    <ul className="mt-2.5 space-y-2.5">
                      {historyEntries.map((entry) => {
                        const lines = auditChangeLines(entry);
                        return (
                          <li
                            key={entry.id}
                            className="border-b border-border/40 pb-2.5 last:border-0 last:pb-0"
                          >
                            <div className="flex items-baseline justify-between gap-2">
                              {/* Без actor_user_id запис зробила не людина, а
                                  сервер: картки з Telegram і Cowork створює
                                  функція під сервісним ключем. */}
                              <span className="text-xs font-medium">
                                {entry.actorName ?? (entry.actorUserId ? "Учасник" : "Автоматично")}
                              </span>
                              <span className="shrink-0 text-2xs text-muted-foreground">
                                {formatWhen(entry.createdAt)}
                              </span>
                            </div>
                            <div className="mt-1 space-y-0.5">
                              {lines.length === 0 ? (
                                <p className="text-2xs text-muted-foreground">
                                  {auditActionLabel(entry.action)}
                                </p>
                              ) : (
                                lines.map((line) => (
                                  <p key={line.field} className="text-2xs text-muted-foreground">
                                    <span className="text-foreground">{line.label}:</span>{" "}
                                    <span className="line-through opacity-70">{line.from}</span>
                                    {" → "}
                                    <span className="text-foreground">{line.to}</span>
                                  </p>
                                ))
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </section>
              ) : null}

              {/* Обговорення тут БУЛО і прибрано 2026-08-09.
                  Панель займала 420px висоти дровера — більше за решту вмісту
                  разом, — а розмова про доробку однаково йде там, де про неї
                  згадали. Нитки `dev-request:*` у базі не чіпалися: якщо
                  панель знадобиться назад, це один <TaskThreadRail/> і все
                  написане повернеться. Для дизайн-задач і прорахунків чат
                  лишається без змін. */}
            </SheetBody>

            {canManage ? (
              // Дії ВНИЗУ й на місці: гортаєш пункти — кнопки лишаються під
              // рукою. Угорі їм не місце ще й тому, що там читають назву, а не
              // діють. Обробники ті самі, що й у меню картки, — сторінка передає
              // свої; другої логіки правки й видалення тут немає навмисно.
              <SheetFooter className="justify-end gap-2 border-t bg-muted/20 px-5 py-3 sm:justify-end sm:space-x-0">
                {shown.status === "released" && onCopyCard ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mr-auto"
                    onClick={() => onCopyCard(shown)}
                  >
                    <ImageDown className="h-4 w-4" />
                    Картка для чату
                  </Button>
                ) : null}
                {/* Видалення тихе — рамка замість заливки. Дія незворотна, але
                    підтвердження стоїть на сторінці, тож кричати кольором на
                    кожному перегляді картки немає потреби.

                    Порядок перевернуто разом із вирівнюванням: у правому куті
                    око зупиняється на ОСТАННІЙ кнопці, і там має стояти
                    «Редагувати», а не незворотне видалення. */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onDelete(shown)}
                  className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                  Видалити
                </Button>
                <Button variant="secondary" size="sm" onClick={() => onEdit(shown)}>
                  <PencilLine className="h-4 w-4" />
                  Редагувати
                </Button>
              </SheetFooter>
            ) : null}
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
