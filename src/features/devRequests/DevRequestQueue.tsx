import { Clock, Inbox, Plus, Rocket, X } from "lucide-react";
import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import { HoverCopyText } from "@/components/ui/hover-copy-text";
import { toneTextClass } from "@/lib/statusTones";
import { cn } from "@/lib/utils";
import { checklistProgress } from "./checklist";
import { groupRequests } from "./grouping";
import { PriorityBars } from "./PriorityBars";
import { canTakeToday, splitQueue, TODAY_LIMIT } from "./queueShelves";
import { themeLook } from "./themeRegistry";
import { KIND_LABELS, KIND_TONE, type DevRequest } from "./types";

/**
 * «Черга» — головний вигляд беклогу.
 *
 * НАВІЩО ВІН ГОЛОВНИЙ, А НЕ ДОШКА. Дошка відповідає на «де що лежить»; це
 * питання виникає, коли роботу рухають через процес. Питання, яке виникає
 * щоранку, інше — «за що хвататись», і колонки на нього не відповідають:
 * 27 карток із 50 стояли в першій із них, а три чверті ширини екрана займали
 * майже порожні стовпчики. Дошка нікуди не поділась — вона друга вкладка.
 *
 * ПОЛИЦІ, А НЕ ЕТАПИ. Розкладка живе в queueShelves.ts і покрита тестами: тут
 * лише верстка. Правило, заради якого все й затівалось: те, що стоїть не через
 * тебе, не лежить у списку доступного.
 *
 * «НЕ РОЗІБРАНО» ЗГОРНУТЕ НАВМИСНО. Це найбільша полиця, і водночас та, куди
 * заглядають раз на тиждень. Розгорнута, вона повернула б рівно ту дошку, від
 * якої тікали: третину екрана під картки, про які ще нічого не вирішено.
 */

type QueueProps = {
  requests: DevRequest[];
  todayIds: string[];
  onToday: (ids: string[]) => void;
  onSelect: (request: DevRequest) => void;
  /** Перемкнути сторінку на дошку у «Вхідних» — розбирати зручніше там. */
  onOpenTriage: () => void;
};

export function DevRequestQueue({
  requests,
  todayIds,
  onToday,
  onSelect,
  onOpenTriage,
}: QueueProps) {
  const shelves = useMemo(() => splitQueue(requests, todayIds), [requests, todayIds]);

  // Порядок усередині полиці «Сьогодні» — той, у якому картки туди клали.
  const todayOrdered = useMemo(
    () => todayIds.map((id) => shelves.today.find((r) => r.id === id)).filter(Boolean) as DevRequest[],
    [todayIds, shelves.today]
  );

  const freeGroups = useMemo(() => groupRequests(shelves.free, "theme"), [shelves.free]);

  const addToday = (request: DevRequest) => {
    if (todayIds.length >= TODAY_LIMIT || todayIds.includes(request.id)) return;
    onToday([...todayIds, request.id]);
  };

  const dropToday = (request: DevRequest) => {
    onToday(todayIds.filter((id) => id !== request.id));
  };

  const canAddMore = todayIds.length < TODAY_LIMIT;

  return (
    <div className="flex flex-col gap-7">
      {/* ── Сьогодні ── */}
      <Shelf title="Сьогодні" hint={`${todayOrdered.length} з ${TODAY_LIMIT}`}>
        <div className="flex flex-col gap-2">
          {todayOrdered.map((request) => (
            <TodayRow key={request.id} request={request} onSelect={onSelect} onDrop={dropToday} />
          ))}
          {todayOrdered.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border/60 px-4 py-6 text-center text-sm text-muted-foreground">
              Порожньо. Вибери зі списку нижче не більше трьох справ — решта чекатиме, не вимагаючи уваги.
            </p>
          ) : null}
        </div>
      </Shelf>

      {/* ── Можна брати ── */}
      <Shelf title="Можна брати" hint={String(shelves.free.length)}>
        {shelves.free.length === 0 ? (
          <Empty text="Нічого доступного: усе або взято, або стоїть за людьми." />
        ) : (
          <div className="flex flex-col gap-4">
            {freeGroups.map((group) => {
              const look = themeLook(group.label);
              const ThemeIcon = look?.icon;
              return (
                <div key={group.id}>
                  <h4 className="mb-1.5 flex items-center gap-2 px-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {ThemeIcon ? (
                      <ThemeIcon
                        className={cn("h-3.5 w-3.5", look ? toneTextClass[look.tone] : null)}
                        aria-hidden
                      />
                    ) : null}
                    {group.label || "без напряму"}
                    <span className="font-mono tabular-nums text-muted-foreground/70">
                      {group.items.length}
                    </span>
                  </h4>
                  <Rows
                    requests={group.items}
                    onSelect={onSelect}
                    onAddToday={canAddMore ? addToday : undefined}
                  />
                </div>
              );
            })}
          </div>
        )}
      </Shelf>

      {/* ── Стоїть за людьми ── */}
      {shelves.blocked.length > 0 ? (
        <Shelf title="Стоїть за людьми" hint="не через тебе">
          <Rows
            requests={shelves.blocked}
            onSelect={onSelect}
            onAddToday={canAddMore ? addToday : undefined}
          />
        </Shelf>
      ) : null}

      {/* ── Готово, чекає деплою ── */}
      {shelves.shipped.length > 0 ? (
        <Shelf title="Готово, чекає деплою" hint={String(shelves.shipped.length)}>
          <Rows requests={shelves.shipped} onSelect={onSelect} />
        </Shelf>
      ) : null}

      {/* ── Не розібрано ── */}
      {shelves.triage.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-border/60 px-4 py-3">
          <Inbox className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{shelves.triage.length}</span> не
            розібрано — це робота на раз на тиждень, не щодня
          </span>
          <Button variant="outline" size="xs" onClick={onOpenTriage} className="ml-auto">
            Розібрати
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/* ────────────────────────────── частини ───────────────────────────── */

function Shelf({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title}>
      <div className="mb-2.5 flex items-center gap-2.5">
        <h3 className="text-sm font-semibold">{title}</h3>
        {hint ? <span className="text-2xs text-muted-foreground">{hint}</span> : null}
        <span className="h-px flex-1 bg-border/60" aria-hidden />
      </div>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-xl border border-dashed border-border/60 px-4 py-6 text-center text-sm text-muted-foreground">
      {text}
    </p>
  );
}

/** Велика картка полиці «Сьогодні»: її видно з іншого кінця кімнати. */
function TodayRow({
  request,
  onSelect,
  onDrop,
}: {
  request: DevRequest;
  onSelect: (request: DevRequest) => void;
  onDrop: (request: DevRequest) => void;
}) {
  const look = themeLook(request.theme);
  const ThemeIcon = look?.icon;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-card px-4 py-3 transition-colors hover:border-border">
      <button
        type="button"
        onClick={() => onSelect(request)}
        className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
      >
        {ThemeIcon ? (
          <ThemeIcon
            className={cn("h-5 w-5 shrink-0", look ? toneTextClass[look.tone] : null)}
            aria-hidden
          />
        ) : null}
        <span className="truncate text-[15px] font-medium">{request.title}</span>
      </button>
      <WaitChip request={request} />
      <HoverCopyText
        value={request.label}
        textClassName="hidden font-mono text-2xs font-semibold text-muted-foreground sm:inline"
        successMessage="Номер запиту скопійовано"
        copyLabel="Скопіювати номер запиту"
      />
      <Button
        variant="ghost"
        size="iconXs"
        onClick={() => onDrop(request)}
        aria-label={`Прибрати з «Сьогодні»: ${request.title}`}
        className="shrink-0 text-muted-foreground"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

function Rows({
  requests,
  onSelect,
  onAddToday,
}: {
  requests: DevRequest[];
  onSelect: (request: DevRequest) => void;
  /** Немає — місць на сьогодні вже не лишилось, кнопки теж немає. */
  onAddToday?: (request: DevRequest) => void;
}) {
  return (
    <ul className="divide-y divide-border/50 overflow-hidden rounded-xl border border-border/60 bg-card">
      {requests.map((request) => (
        <li key={request.id}>
          <div className="group flex items-center gap-3 px-3 py-2 transition-colors hover:bg-muted/40">
            <PriorityBars priority={request.priority} />
            <button
              type="button"
              onClick={() => onSelect(request)}
              className="flex min-w-0 flex-1 items-center gap-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
            >
              <span
                className={cn("shrink-0 text-2xs font-semibold", toneTextClass[KIND_TONE[request.kind]])}
              >
                {KIND_LABELS[request.kind]}
              </span>
              <span className="truncate text-sm">{request.title}</span>
            </button>

            <WaitChip request={request} />
            <ShippedChip request={request} />

            <HoverCopyText
              value={request.label}
              textClassName="hidden font-mono text-2xs font-semibold text-muted-foreground sm:inline"
              successMessage="Номер запиту скопійовано"
              copyLabel="Скопіювати номер запиту"
            />

            {onAddToday && canTakeToday(request) ? (
              /*
               * Кнопка завжди в розмітці, лише тихіша до наведення: на телефоні
               * наведення не існує, а з клавіатури до прихованої не дійти.
               */
              <Button
                variant="outline"
                size="xs"
                onClick={() => onAddToday(request)}
                aria-label={`Взяти на сьогодні: ${request.title}`}
                className="shrink-0 gap-1 opacity-70 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
              >
                <Plus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Сьогодні</span>
              </Button>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** «Чекає СЕО · 27 дн» — той самий підпис, що й на картці дошки. */
function WaitChip({ request }: { request: DevRequest }) {
  const progress = checklistProgress(request.checklist);
  if (progress.waiting === 0) return null;
  const label = progress.stuckWho
    ? `чекає ${progress.stuckWho}${progress.stuckDays > 0 ? ` · ${progress.stuckDays} дн` : ""}`
    : "чекає на людину";
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-2xs font-medium text-warning-foreground">
      <Clock className="h-3 w-3" aria-hidden />
      {label}
    </span>
  );
}

/** «Частина в проді» — картка, шматок якої вже поїхав, а хвіст живий. */
function ShippedChip({ request }: { request: DevRequest }) {
  if (request.status !== "done_local" || request.commitShas.length === 0) return null;
  const progress = checklistProgress(request.checklist);
  if (progress.total === 0 || progress.done === 0 || progress.done === progress.total) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent-tone-soft px-2 py-0.5 text-2xs font-medium text-accent-tone-foreground">
      <Rocket className="h-3 w-3" aria-hidden />
      частина в проді
    </span>
  );
}
