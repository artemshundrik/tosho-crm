import { Check, ChevronRight, Clock, Plus, Rocket, Scissors, X } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { HoverCopyText } from "@/components/ui/hover-copy-text";
import { toneTextClass } from "@/lib/statusTones";
import { cn } from "@/lib/utils";
import { checklistProgress, withDoneLast, type ChecklistItem } from "./checklist";
import { groupRequests } from "./grouping";
import { PriorityBars } from "./PriorityBars";
import { canTakeToday, isPapercutCard, papercutLabel, splitQueue } from "./queueShelves";
import { THEME_FALLBACK, themeLook } from "./themeRegistry";
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
 * «НЕ РОЗІБРАНО» ТУТ НЕМАЄ ВЗАГАЛІ — НАВМИСНО. Це найбільша купа, і водночас
 * та, куди заглядають раз на тиждень. Полицею вона повернула б рівно ту
 * дошку, від якої тікали: третину екрана під картки, про які ще нічого не
 * вирішено. Двері до розбору — кнопка «Розібрати» в тулбарі сторінки (лише на
 * «Черзі»), а сам розбір живе на дошці у «Вхідних». Смуга внизу черги, що
 * була тут раніше, вимагала долистати повз усе — і з самого низу перемикалась
 * на дошку з поламаним заміром висоти.
 */

type QueueProps = {
  requests: DevRequest[];
  todayIds: string[];
  onToday: (ids: string[]) => void;
  onSelect: (request: DevRequest) => void;
  /** Зберегти пункти дрібниці. Немає — галочки лише показуються. */
  onChecklist?: (request: DevRequest, items: ChecklistItem[]) => void;
  savingChecklistId?: string | null;
};

export function DevRequestQueue({
  requests,
  todayIds,
  onToday,
  onSelect,
  onChecklist,
  savingChecklistId,
}: QueueProps) {
  const shelves = useMemo(() => splitQueue(requests, todayIds), [requests, todayIds]);

  // Порядок усередині полиці «Сьогодні» — той, у якому картки туди клали.
  const todayOrdered = useMemo(
    () => todayIds.map((id) => shelves.today.find((r) => r.id === id)).filter(Boolean) as DevRequest[],
    [todayIds, shelves.today]
  );

  const freeGroups = useMemo(() => groupRequests(shelves.free, "theme"), [shelves.free]);

  const addToday = (request: DevRequest) => {
    if (todayIds.includes(request.id)) return;
    onToday([...todayIds, request.id]);
  };

  const dropToday = (request: DevRequest) => {
    onToday(todayIds.filter((id) => id !== request.id));
  };

  /*
   * Згорнуті напрями живуть у стані вигляду, а не в localStorage: це рішення
   * «зараз мені це не цікаво», а не налаштування. Наступного разу сторінка
   * відкривається розгорнутою — інакше згорнутий колись напрям тихо зникав би
   * з очей тижнями.
   */
  const [closedGroups, setClosedGroups] = useState<Set<string>>(() => new Set());
  const toggleGroup = (id: string) => {
    setClosedGroups((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /*
   * ДВІ КОЛОНКИ НА ШИРОКОМУ ЕКРАНІ.
   *
   * Спершу полиці стояли одна під одною, і «Дрібниці» опинялись найнижче — до
   * них треба було долистати повз усе інше, тобто заходили туди рівно ніколи.
   * Ліворуч лишається те, що читають зверху вниз і по чому ухвалюють рішення
   * («Сьогодні» → «Можна брати»); праворуч — довідкове: що стоїть не через
   * тебе, що чекає деплою і дрібниці, які беруть, коли є хвилина.
   *
   * Заразом це прибирає другу ваду: рядок на всю ширину екрана має назву на
   * третину й дві третини порожнечі.
   */
  return (
    <div className="flex flex-col gap-7 xl:grid xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] xl:items-start xl:gap-x-8">
      {/* ── Сьогодні: на всю ширину, над обома колонками ──
          Це заголовок дня, а не одна з полиць: три справи, заради яких сюди й
          заходять. У колонці вони ділили б увагу з довідковим. */}
      <Shelf
        title="Сьогодні"
        hint={todayOrdered.length > 0 ? String(todayOrdered.length) : undefined}
        className="xl:col-span-2"
      >
        {/* Дві в рядок, а не три: назва справи має влазити цілком. На трьох
            колонках вона зрізалась уже на середньому заголовку. */}
        <div className="flex flex-col gap-2 md:grid md:grid-cols-2 md:gap-3">
          {todayOrdered.map((request) => (
            <TodayRow key={request.id} request={request} onSelect={onSelect} onDrop={dropToday} />
          ))}
          {todayOrdered.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border/60 px-4 py-6 text-center text-sm text-muted-foreground md:col-span-2">
              Порожньо. Познач тут те, що збираєшся зробити сьогодні — решта чекатиме, не вимагаючи уваги.
            </p>
          ) : null}
        </div>
      </Shelf>

      {/* ── ліва колонка: те, за що беруться ── */}
      <div className="flex flex-col gap-7">
      {/* ── Можна брати ── */}
      <Shelf title="Можна брати" hint={String(shelves.free.length)}>
        {shelves.free.length === 0 ? (
          <Empty text="Нічого доступного: усе або взято, або стоїть за людьми." />
        ) : (
          <div className="flex flex-col gap-4">
            {freeGroups.map((group) => {
              const look = themeLook(group.label);
              // Група «Без теми» іконки не мала, і в стовпчику заголовків із
              // іконками її рядок читався як зламаний. Фолбек із реєстру —
              // навмисно найзагальніша іконка: «тема без свого обличчя».
              const ThemeIcon = look?.icon ?? THEME_FALLBACK.icon;
              const collapsed = closedGroups.has(group.id);
              return (
                <div key={group.id}>
                  {/* Заголовок групи — кнопка: клік згортає напрям цілком.
                      Коли з дванадцяти напрямів сьогодні цікавлять два, решта
                      має вміти зникнути з очей, а не тільки прокрутитись. */}
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.id)}
                    aria-expanded={!collapsed}
                    className="mb-1.5 flex w-full items-center gap-2 rounded px-1 py-0.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <ChevronRight
                      className={cn(
                        "h-3.5 w-3.5 shrink-0 transition-transform motion-reduce:transition-none",
                        !collapsed && "rotate-90"
                      )}
                      aria-hidden
                    />
                    <ThemeIcon
                      className={cn("h-3.5 w-3.5", toneTextClass[look?.tone ?? "neutral"])}
                      aria-hidden
                    />
                    {group.label || "без напряму"}
                    <span className="font-mono tabular-nums text-muted-foreground/70">
                      {group.items.length}
                    </span>
                  </button>
                  {collapsed ? null : (
                    <Rows
                      requests={group.items}
                      onSelect={onSelect}
                      onAddToday={addToday}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Shelf>

      </div>

      {/* ── права колонка: довідкове ── */}
      <div className="flex flex-col gap-7">
      {/* ── Дрібниці ── */}
      {shelves.papercuts.length > 0 ? (
        <Shelf title="Дрібниці" hint="рядками, не картками">
          <div className="flex flex-col gap-2">
            {shelves.papercuts.map((request) => (
              <PapercutCard
                key={request.id}
                request={request}
                onSelect={onSelect}
                onChecklist={onChecklist}
                onAddToday={addToday}
                saving={savingChecklistId === request.id}
              />
            ))}
          </div>
        </Shelf>
      ) : null}

      {/* ── Стоїть за людьми ── */}
      {shelves.blocked.length > 0 ? (
        <Shelf title="Стоїть за людьми" hint="не через тебе">
          <div className="flex flex-col gap-2">
            {shelves.blocked.map((request) => (
              <BlockedRow key={request.id} request={request} onSelect={onSelect} />
            ))}
          </div>
        </Shelf>
      ) : null}

      {/* ── Готово, чекає деплою ── */}
      {shelves.shipped.length > 0 ? (
        <Shelf title="Готово, чекає деплою" hint={String(shelves.shipped.length)}>
          <Rows requests={shelves.shipped} onSelect={onSelect} />
        </Shelf>
      ) : null}

      </div>
    </div>
  );
}

/* ────────────────────────────── частини ───────────────────────────── */

function Shelf({
  title,
  hint,
  children,
  className,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section aria-label={title} className={className}>
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

/**
 * Заблокована картка — двома рядками, і це задум, а не наслідок тісноти.
 *
 * Спершу вона малювалась тим самим рядком, що й доступна робота, і в вужчій
 * правій колонці назва зрізалась до однієї літери: чип «чекає СЕО · 27 дн»
 * забирав місце. Але тут і питання інше. У доступній картці головне — НАЗВА
 * (її обирають); у заблокованій головне — КОГО ЧЕКАЄМО І СКІЛЬКИ, бо саме це
 * підказує, кому нагадати. Тож назва зверху цілком, а очікування — окремим
 * рядком під нею, де його видно без прищурювання.
 */
function BlockedRow({
  request,
  onSelect,
}: {
  request: DevRequest;
  onSelect: (request: DevRequest) => void;
}) {
  const progress = checklistProgress(request.checklist);
  const look = themeLook(request.theme);
  const ThemeIcon = look?.icon;

  return (
    <button
      type="button"
      onClick={() => onSelect(request)}
      className="flex w-full flex-col gap-1.5 rounded-xl border border-border/60 bg-card px-3 py-2.5 text-left transition-colors hover:border-border hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <span className="flex items-start gap-2">
        {ThemeIcon ? (
          <ThemeIcon
            className={cn("mt-0.5 h-4 w-4 shrink-0", look ? toneTextClass[look.tone] : null)}
            aria-hidden
          />
        ) : null}
        <span className="text-sm font-medium leading-snug">{request.title}</span>
      </span>

      <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 pl-6">
        <WaitChip request={request} />
        {progress.total > 0 ? (
          <span className="text-2xs text-muted-foreground">
            {progress.done} з {progress.total} пунктів
          </span>
        ) : null}
        <span className="ml-auto font-mono text-2xs font-semibold text-muted-foreground">
          {request.label}
        </span>
      </span>
    </button>
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
  /*
   * Іконка є ЗАВЖДИ — навіть у картки без теми. Полиця «Сьогодні» це кілька
   * рядків поруч, і рядок без іконки серед рядків з іконками читається як
   * зламаний, а не як «тема не вказана» (рішення Артема 28.08.2026).
   */
  const ThemeIcon = look?.icon ?? THEME_FALLBACK.icon;
  /*
   * ЛІЧИЛЬНИК ЛИШЕ ДЛЯ НАКОПИЧУВАЧА. У звичайної картки «Сьогодні» означає одну
   * справу, і число поруч читалось би як її поділ на частини. У накопичувача
   * навпаки: намір звучить як «сьогодні розгрібаю цей напрям», і скільки там
   * лишилось — головне, що про нього треба знати. Доти рядок не показував
   * НІЧОГО, і вичерпаний накопичувач не відрізнявся від повного.
   */
  const papercut = isPapercutCard(request);
  const progress = papercut ? checklistProgress(request.checklist) : null;
  const left = progress ? progress.total - progress.done : 0;
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border/70 bg-card px-4 py-3 transition-colors hover:border-border hover:bg-muted/30">
      <button
        type="button"
        onClick={() => onSelect(request)}
        className="flex min-w-0 flex-1 flex-col gap-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
      >
        <span className="flex min-w-0 items-center gap-3">
          <ThemeIcon
            className={cn("h-5 w-5 shrink-0", toneTextClass[look?.tone ?? "neutral"])}
            aria-hidden
          />
          <span className="truncate text-[15px] font-medium">{request.title}</span>
        </span>
        {/*
         * Опис під назвою — рішення Артема 28.08.2026. «Сьогодні» це не список
         * номерів, а те, за що людина сідає: без пари рядків про суть картку
         * доводиться відкривати, щоб згадати, про що вона. Два рядки, не
         * чотири, як в «Ідеях»: полиця має лишатись коротшою за беклог.
         */}
        {request.body.trim() ? (
          <span className="line-clamp-2 pl-8 text-2xs leading-relaxed text-muted-foreground">
            {request.body.replace(/\n{2,}/g, "\n")}
          </span>
        ) : null}
      </button>
      <WaitChip request={request} />
      {progress ? (
        <>
          <span
            className="w-6 shrink-0 text-right font-mono text-2xs tabular-nums text-muted-foreground"
            title={progress.total === 0 ? "Дрібниць поки немає" : `Лишилось ${left} з ${progress.total}`}
          >
            {left}
          </span>
          <ChecklistMeter progress={progress} />
        </>
      ) : null}
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
          {/*
           * ПЕРЕНОС, А НЕ ОБРІЗАННЯ. У двоколонковому вигляді права колонка
           * вужча за ліву, і в один рядок назва разом із чипом «чекає СЕО · 27
           * дн» не влазила: назва зрізалась до однієї літери. Назва — головне
           * в рядку, тож вона тримає власний мінімум, а мітки й кнопка
           * переносяться під неї, коли місця бракує.
           */}
          <div className="group flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 transition-colors hover:bg-muted/40">
            <PriorityBars priority={request.priority} />
            <button
              type="button"
              onClick={() => onSelect(request)}
              className="flex min-w-[min(100%,15rem)] flex-1 items-center gap-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
            >
              <span
                className={cn(
                  "hidden shrink-0 text-2xs font-semibold sm:inline",
                  toneTextClass[KIND_TONE[request.kind]]
                )}
              >
                {KIND_LABELS[request.kind]}
              </span>
              <span className="truncate text-sm">{request.title}</span>
            </button>

            <div className="ml-auto flex shrink-0 items-center gap-2">
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
               * Кнопка розкривається з наведенням, а номер їде вліво — рішення
               * Артема 28.08.2026: «Сьогодні» на кожному з двадцяти рядків
               * перетворює список на шеренгу кнопок, і головне в рядку (назва)
               * тоне серед них.
               *
               * Розмітку НЕ демонтуємо: на телефоні наведення не існує, а з
               * клавіатури до неї не дійти. Тому анімуємо ширину й прозорість,
               * а focus-visible розкриває так само, як ховер.
               */
                <div
                  className={cn(
                    "flex shrink-0 justify-end overflow-hidden",
                    // -ml-2 знімає проміжок ряду, поки кнопка схлопнута: інакше
                    // рядки з кнопкою і без неї мають різний правий край.
                    "-ml-2 max-w-0 opacity-0",
                    "transition-[max-width,opacity,margin] duration-200 ease-out",
                    "group-hover:ml-0 group-hover:max-w-32 group-hover:opacity-100",
                    // has-[:focus-visible] НА САМІЙ ОБГОРТЦІ, а не focus-within
                    // на рядку. Тут стояло group-focus-within, і воно ловило
                    // будь-який фокус, зокрема мишачий: клік по назві рядка
                    // (відкрити картку) лишав фокус на кнопці, і «Сьогодні»
                    // стирчала вже без наведення — доки не клікнеш деінде.
                    // Повернешся з дровера — фокус відновлюється на тому ж
                    // рядку, і кнопка знову стирчить. :focus-visible — це саме
                    // «фокус, який треба показати», тобто клавіатура, а не миша.
                    "has-[:focus-visible]:ml-0 has-[:focus-visible]:max-w-32 has-[:focus-visible]:opacity-100",
                    "motion-reduce:transition-none",
                    // На вузькому екрані ховера немає — там кнопка стоїть завжди.
                    "max-sm:ml-0 max-sm:max-w-32 max-sm:opacity-100"
                  )}
                >
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => onAddToday(request)}
                    aria-label={`Взяти на сьогодні: ${request.title}`}
                    className="shrink-0 gap-1"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Сьогодні</span>
                  </Button>
                </div>
              ) : null}
            </div>
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

/**
 * Накопичувач дрібниць: назва напряму, смуга готовності й пункти під нею.
 *
 * ЧОМУ ГАЛОЧКИ ПРЯМО ТУТ. Сенс дрібниць у тому, що їх розгрібають пачкою: сів,
 * позакривав п'ять рядків, пішов далі. Якби кожна вимагала відкрити картку,
 * знайти пункт і закрити картку, накопичувач був би не швидшим за окремі
 * задачі — тобто не розв'язував би нічого.
 *
 * Згорнутий за замовчуванням: на дванадцять напрямів це дванадцять списків, і
 * розгорнуті вони повернули б ту саму стіну, від якої тікали.
 */
/**
 * `2026-08-27` → `27.08`.
 *
 * Свій розбір рядка, а не `new Date(...)`: дата закриття — НАСТІННИЙ київський
 * день, який записав сервер. Проганяти його через `Date` означало б прочитати
 * як UTC-північ і показати вчорашнє число тому, хто дивиться з іншого боку
 * глобуса. Рік не показуємо: у списку, який читають щотижня, він шум.
 */
function shortDay(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}.${match[2]}` : value;
}

function PapercutCard({
  request,
  onSelect,
  onChecklist,
  onAddToday,
  saving,
}: {
  request: DevRequest;
  onSelect: (request: DevRequest) => void;
  onChecklist?: (request: DevRequest, items: ChecklistItem[]) => void;
  /** Взяти накопичувач на сьогодні: «сьогодні розгрібаю дрібниці». */
  onAddToday?: (request: DevRequest) => void;
  saving: boolean;
}) {
  const [open, setOpen] = useState(false);
  // Вигляд береться з ТЕМИ картки, а не з її назви. Спершу тут стояв
  // `papercutLabel`, і полиця «Дрібниці» тихо перетворилась на другу, застарілу
  // таксономію: 29.08.2026 теми звели у крупні, а полиця далі показувала
  // «гроші замовлення», «мова інтерфейсу» й «картка прорахунку» — назви, яких
  // уже немає, — усі із запасною іконкою шарів, бо в реєстрі їх не лишилось.
  const look = themeLook(request.theme);
  const ThemeIcon = look?.icon ?? Scissors;
  const progress = checklistProgress(request.checklist);
  const left = progress.total - progress.done;

  const toggle = (item: ChecklistItem) => {
    if (!onChecklist) return;
    const state = item.state === "done" ? "todo" : "done";
    onChecklist(
      request,
      request.checklist.map((entry) =>
        entry.id === item.id
          ? {
              ...entry,
              state,
              // Відкрили пункт назад — слід коміта йде разом із ним. Дата
              // «зроблено 27.08» на пункті, який знову в роботі, бреше не
              // менше, ніж закрита картка без коду.
              closed: state === "done" ? entry.closed : null,
              sha: state === "done" ? entry.sha : null,
            }
          : entry
      )
    );
  };

  /*
   * Нова дрібниця дописується в КІНЕЦЬ: список читають зверху вниз, і свіже,
   * що стрибає нагору, щоразу зсувало б те, на що дивишся. Ідентифікатор —
   * від найбільшого наявного, а не від довжини списку: інакше після видалення
   * пункту новий отримав би вже зайнятий id.
   */
  const add = (text: string) => {
    if (!onChecklist) return;
    const used = request.checklist
      .map((item) => Number(item.id.replace(/\D/g, "")))
      .filter((n) => Number.isFinite(n));
    const next = (used.length > 0 ? Math.max(...used) : 0) + 1;
    onChecklist(request, [
      ...request.checklist,
      {
        id: `p${next}`,
        kind: "task",
        text,
        state: "todo",
        group: null,
        who: null,
        since: null,
        note: null,
        answer: null,
        closed: null,
        sha: null,
      },
    ]);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
      <div className="group/papercut flex items-center gap-3 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
        >
          <ChevronRight
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none",
              open && "rotate-90"
            )}
            aria-hidden
          />
          <ThemeIcon
            className={cn("h-4 w-4 shrink-0", look ? toneTextClass[look.tone] : "text-muted-foreground")}
            aria-hidden
          />
          <span className="truncate text-sm font-medium">{papercutLabel(request)}</span>
        </button>

        {/*
          ПОРЯДОК І ШИРИНА ТУТ НЕ ВИПАДКОВІ. Кнопка «Сьогодні» стоїть ОСТАННЬОЮ
          в ряду, а підпис і смуга мають сталу ширину — інакше кнопка їздила б
          уздовж рядка залежно від того, чи є в накопичувача пункти, і чотири
          однакові рядки виглядали б як чотири різні.
        */}
        {/*
          ЧИСЛО, А НЕ ФРАЗА. Спершу тут стояло «лишилось 10» / «порожньо», і на
          78 px ці слова з'їдали стільки, що назва напряму обрізалась уже на
          «гроші замовлен…». Назва важливіша: по ній накопичувач і впізнають.
          Ціле пояснення лишилось у підказці на наведення й у мітці для
          зчитувача екрана.
        */}
        <span
          className="w-6 shrink-0 text-right font-mono text-2xs tabular-nums text-muted-foreground"
          title={
            progress.total === 0
              ? "Дрібниць поки немає"
              : left > 0
                ? `Лишилось ${left} з ${progress.total}`
                : "Усе закрито"
          }
        >
          {left}
        </span>
        <ChecklistMeter progress={progress} />
        {onAddToday && canTakeToday(request) ? (
          // Та сама поведінка, що в рядках «Можна брати»: кнопка розкривається
          // з наведенням, число й смуга від цього їдуть уліво.
          <div
            className={cn(
              "flex shrink-0 justify-end overflow-hidden",
              // -mr-3 з'їдає gap-3 контейнера, поки кнопка схлопнута. Без цього
              // рядок із кнопкою (а вона є лише там, де є що розгрібати) стояв
              // на 12 px вужче за сусідів — і смуга «мови інтерфейсу» не
              // збігалася з рештою навіть у спокої (помічено Артемом).
              "-mr-3 max-w-0 opacity-0",
              "transition-[max-width,opacity,margin] duration-200 ease-out",
              "group-hover/papercut:mr-0 group-hover/papercut:max-w-32 group-hover/papercut:opacity-100",
              // Той самий лік, що й у рядках «Можна брати», і тут він помітніший
              // за все: назва накопичувача — КНОПКА, яка розгортає список. Тобто
              // щоб побачити дрібниці, ти зобов'язаний клікнути, а клік лишав
              // фокус на назві — і «Сьогодні» стирчала над відкритим списком, не
              // зникаючи ні коли ведеш мишу вниз до пунктів, ні коли вертаєшся.
              "has-[:focus-visible]:mr-0 has-[:focus-visible]:max-w-32 has-[:focus-visible]:opacity-100",
              "motion-reduce:transition-none",
              "max-sm:mr-0 max-sm:max-w-32 max-sm:opacity-100"
            )}
          >
          <Button
            variant="outline"
            size="xs"
            onClick={() => onAddToday(request)}
            aria-label={`Взяти на сьогодні: дрібниці «${papercutLabel(request)}»`}
            className="shrink-0 gap-1"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Сьогодні</span>
          </Button>
          </div>
        ) : null}
        {/*
          НОМЕРА ТУТ НЕМАЄ НАВМИСНО. Накопичувач — звичайна картка, тож номер у
          нього є (REQ-175 і далі), але посилатись на нього нікому: у коміті
          згадують справу, а не список дрібниць, і в розмові кажуть «дрібниці
          мови інтерфейсу», а не «сто сімдесят п'ята». На чотирьох рядках поспіль
          він читався як ще один стовпчик чисел ні про що. Сам номер нікуди не
          подівся — він є в картці, якщо колись знадобиться.
        */}
      </div>

      {open ? (
        <ul className="border-t border-border/50">
          {/*
            СОРТУЄМО ЛИШЕ ПОКАЗ, не базу: у базі новий пункт дописується в
            кінець, і переставляти його після закриття означало б переписувати
            історію напряму заради вигляду. Пояснення — у withDoneLast.
          */}
          {withDoneLast(request.checklist).map((item) => (
            <li key={item.id} className="border-b border-border/40 last:border-b-0">
              <button
                type="button"
                onClick={() => toggle(item)}
                disabled={!onChecklist || saving}
                aria-pressed={item.state === "done"}
                className="flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-muted/40 disabled:cursor-default disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <span
                  className={cn(
                    "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border",
                    item.state === "done"
                      ? "border-success-solid bg-success-solid text-background"
                      : "border-border"
                  )}
                  aria-hidden
                >
                  {item.state === "done" ? <Check className="h-3 w-3" /> : null}
                </span>
                <span
                  className={cn(
                    "text-[13px] leading-snug",
                    item.state === "done" && "text-muted-foreground line-through"
                  )}
                >
                  {item.text}
                </span>
                {/*
                  СЛІД КОМІТА показуємо лише тоді, коли він є: порожньо тут
                  означає «закрила людина», а не «невідомо коли». Приписати
                  такому пункту сьогоднішнє число було б вигадкою про факт.
                  `ms-auto` тримає слід біля правого краю, тож рядки читаються
                  однією колонкою, а не сходами за довжиною тексту.
                */}
                {item.closed ? (
                  <span className="ms-auto shrink-0 pt-0.5 font-mono text-2xs tabular-nums text-muted-foreground">
                    {shortDay(item.closed)}
                    {item.sha ? ` · ${item.sha}` : ""}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
          <li>
            {onChecklist ? (
              <AddPapercut disabled={saving} onAdd={add} />
            ) : (
              <button
                type="button"
                onClick={() => onSelect(request)}
                className="w-full px-3 py-2 text-left text-2xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                + додати дрібницю — у картці
              </button>
            )}
          </li>
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Смужка готовності пунктів. Той самий поділ, що й у ChecklistBar на дошці.
 *
 * ПОРОЖНІЙ НАКОПИЧУВАЧ теж малює доріжку, лише тьмянішу. Прибрати її означало б
 * зсунути все, що стоїть правіше, — і кнопки в сусідніх рядках перестали б
 * збігатися по вертикалі.
 */
function ChecklistMeter({ progress }: { progress: ReturnType<typeof checklistProgress> }) {
  const share = (count: number) =>
    progress.total === 0 ? "0%" : `${(count / progress.total) * 100}%`;
  return (
    <span
      className={cn(
        "inline-flex h-1.5 w-[70px] shrink-0 overflow-hidden rounded-full bg-border",
        progress.total === 0 && "opacity-40"
      )}
      role="img"
      aria-label={
        progress.total === 0
          ? "Пунктів поки немає"
          : `Пунктів: ${progress.done} з ${progress.total} готово`
      }
    >
      <i className="block h-full bg-success-solid" style={{ width: share(progress.done) }} />
      <i className="block h-full bg-warning-solid" style={{ width: share(progress.waiting) }} />
    </span>
  );
}

/**
 * Поле «додати дрібницю» просто в списку.
 *
 * НАВІЩО ТУТ, А НЕ В КАРТЦІ. Дрібниця з'являється в голові тоді, коли ти на неї
 * натрапив, — і якщо в цю мить треба відкрити картку, знайти панель пунктів і
 * закрити картку, вона не запишеться взагалі. Саме через цю відстань дрібниці
 * й ставали окремими задачами: завести картку було швидше.
 *
 * Enter додає й лишає поле відкритим — дрібниці згадуються пачками. Escape
 * згортає, порожній рядок не додається.
 */
function AddPapercut({ disabled, onAdd }: { disabled: boolean; onAdd: (text: string) => void }) {
  const [text, setText] = useState("");

  const submit = () => {
    const value = text.trim();
    if (!value) return;
    onAdd(value);
    setText("");
  };

  return (
    <div className="flex items-center gap-2 px-3 py-1.5">
      <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <input
        value={text}
        disabled={disabled}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            submit();
          }
          if (event.key === "Escape") setText("");
        }}
        onBlur={submit}
        placeholder="додати дрібницю"
        aria-label="Додати дрібницю"
        className="min-w-0 flex-1 bg-transparent py-1 text-[13px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none disabled:opacity-50"
      />
    </div>
  );
}
