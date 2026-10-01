import { useState } from "react";
import { BellRing, Calendar, Check, Loader2, Pencil } from "@/components/icons/appIcons";

import { Button } from "@/components/ui/button";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { DateQuickActions } from "@/components/ui/date-quick-actions";
import { Input } from "@/components/ui/input";
import { TimeInput } from "@/components/ui/picker-input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toneBadgeClass, toneSubtleClass, toneTextClass, type Tone } from "@/lib/statusTones";
import { cn } from "@/lib/utils";

import {
  combineWallClockValue,
  deadlineDiffDays,
  getDeadlineBadge,
  isDesignDeadlineAfterAnswer,
  parseDeadlineDate,
  toLocalDate,
} from "./deadlineLabels";
import { QuoteDeadlineOrderWarning } from "./QuoteDeadlineOrderWarning";

/**
 * Вкладка «Дедлайни» картки прорахунку (REQ-226#p2).
 *
 * БУЛО: ліворуч три перемикачі-картки, праворуч форма обраного — щоб побачити
 * дату, треба було її обрати, а порядок трьох дат читався лише з тексту
 * підказок. Мова була своя, не «Товарів».
 *
 * СТАЛО: три картки в тому порядку, у якому дати мусять іти (макет →
 * відповідь → відвантаження), з великою датою ліворуч — як мініатюра товару на
 * «Товарах». Правка розгортається в самій картці. Дату, якої ще немає, ставлять
 * одним кліком швидкими варіантами — точну можна обрати в календарі.
 *
 * Збереження лишається на сторінці: обидва обробники пишуть журнал і
 * перечитують прорахунок, і друга копія тієї логіки тут розійшлась би з ними.
 */

export type QuoteDeadlineKey = "design" | "answer" | "customer";

export type QuoteDeadlineDraft = {
  /** Збережене в базі значення — від нього рахується «скасувати». */
  saved: string | null;
  date: string;
  time: string;
  setDate: (value: string) => void;
  setTime: (value: string) => void;
};

type QuickDate = { label: string; hint: string; date: string; time: string };

const STEPS: Array<{ key: QuoteDeadlineKey; title: string; purpose: string }> = [
  { key: "design", title: "Дедлайн дизайну", purpose: "Погодити макет із клієнтом" },
  { key: "answer", title: "Відповідь замовнику", purpose: "Внутрішній дедлайн · надіслати пропозицію" },
  { key: "customer", title: "Дедлайн замовника", purpose: "Готовність до відвантаження" },
];

const DEADLINE_TONE: Record<string, Tone> = {
  overdue: "danger",
  today: "warning",
  soon: "warning",
  future: "neutral",
};

const pad = (value: number) => String(value).padStart(2, "0");
const toDateInput = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const toTimeInput = (value: string | null, fallback: string) => {
  const date = parseDeadlineDate(value);
  return date && /T\d{2}:\d{2}/.test(value ?? "") ? `${pad(date.getHours())}:${pad(date.getMinutes())}` : fallback;
};
const shortMonth = (date: Date) => date.toLocaleDateString("uk-UA", { month: "short" }).replace(/\.$/, "");
const dayHint = (date: Date) =>
  `${date.toLocaleDateString("uk-UA", { weekday: "short" })} ${date.getDate()} ${shortMonth(date)}`;

const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
const addWorkingDays = (date: Date, days: number) => {
  let next = date;
  let left = days;
  while (left > 0) {
    next = addDays(next, 1);
    if (next.getDay() !== 0 && next.getDay() !== 6) left -= 1;
  }
  return next;
};

/**
 * Швидкі дати — ті, що ставлять найчастіше. Сьогоднішній варіант зникає, коли
 * до нього лишилось менше години: дедлайн «на вчора» одним кліком — пастка.
 */
const buildQuickDates = (key: QuoteDeadlineKey, defaultTime: string): QuickDate[] => {
  const now = new Date();
  const today = addDays(now, 0);
  const at = (date: Date, time: string, label: string): QuickDate => ({
    label,
    hint: dayHint(date),
    date: toDateInput(date),
    time,
  });
  if (key === "customer") {
    return [
      at(addDays(today, 7), defaultTime, "+7 днів"),
      at(addWorkingDays(today, 10), defaultTime, "+10 робочих днів"),
      at(addWorkingDays(today, 15), defaultTime, "+15 робочих днів"),
    ];
  }
  const todayTime = key === "design" ? "18:00" : "17:00";
  const options: QuickDate[] = [];
  if (now.getHours() < Number(todayTime.slice(0, 2)) - 1) options.push(at(today, todayTime, `Сьогодні, ${todayTime}`));
  options.push(at(addDays(today, 1), "12:00", "Завтра, 12:00"));
  options.push(at(addDays(today, 1), "17:00", "Завтра, 17:00"));
  options.push(at(addWorkingDays(today, 2), "12:00", "+2 робочі дні"));
  return options;
};

function DateTile({ value, tone, empty }: { value: string | null; tone: Tone; empty: boolean }) {
  const date = parseDeadlineDate(value);
  if (empty || !date) {
    return (
      <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border border-dashed border-border text-muted-foreground">
        <Calendar className="h-6 w-6" />
      </div>
    );
  }
  return (
    <div
      className={cn(
        "flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-xl border leading-none",
        tone === "neutral" ? "border-border/50 bg-muted/40" : toneSubtleClass[tone]
      )}
    >
      <span
        className={cn(
          "text-3xs font-semibold uppercase tracking-caps",
          tone === "neutral" ? "text-muted-foreground" : toneTextClass[tone]
        )}
      >
        {date.toLocaleDateString("uk-UA", { weekday: "short" })}
      </span>
      <span className="my-1 text-3xl font-semibold tabular-nums tracking-tight text-foreground">
        {pad(date.getDate())}
      </span>
      <span className="text-xs text-muted-foreground">{shortMonth(date)}</span>
    </div>
  );
}

export function QuoteDeadlinesTab({
  drafts,
  reminder,
  defaultTime,
  saving,
  error,
  onSave,
}: {
  drafts: Record<QuoteDeadlineKey, QuoteDeadlineDraft>;
  /** Нагадування й примітка є лише в дедлайну відповіді — так лежить у базі. */
  reminder: {
    offset: string;
    setOffset: (value: string) => void;
    comment: string;
    setComment: (value: string) => void;
    note: string;
    setNote: (value: string) => void;
    options: ReadonlyArray<{ value: string; label: string }>;
  };
  defaultTime: string;
  saving: boolean;
  error: string | null;
  /** `override` — дата з швидкої кнопки: її пишуть одразу, не чекаючи полів. */
  onSave: (key: QuoteDeadlineKey, override?: { date: string; time: string }) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState<QuoteDeadlineKey | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const valueOf = (key: QuoteDeadlineKey) =>
    drafts[key].date ? combineWallClockValue(drafts[key].date, drafts[key].time, defaultTime) : drafts[key].saved;
  const orderBroken = isDesignDeadlineAfterAnswer(valueOf("design"), valueOf("answer"));
  const shortLabel = (key: QuoteDeadlineKey) => {
    const date = parseDeadlineDate(valueOf(key));
    return date ? `${dayHint(date)}, ${pad(date.getHours())}:${pad(date.getMinutes())}` : "—";
  };

  const resetDraft = (key: QuoteDeadlineKey) => {
    const { saved, setDate, setTime } = drafts[key];
    const savedDate = toLocalDate(saved);
    setDate(savedDate ? toDateInput(savedDate) : "");
    setTime(toTimeInput(saved, defaultTime));
  };

  const startEditing = (key: QuoteDeadlineKey) => {
    if (editing && editing !== key) resetDraft(editing);
    setPickerOpen(false);
    setEditing(key);
  };

  const save = async (key: QuoteDeadlineKey, override?: QuickDate) => {
    const ok = await onSave(key, override ? { date: override.date, time: override.time } : undefined);
    if (ok) setEditing(null);
  };

  const today = new Date();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-base font-semibold tracking-tight text-foreground">Дедлайни</div>
          <div className="text-xs text-muted-foreground">
            Три дати по черзі: погодити макет, відповісти замовнику, відвантажити
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          Сьогодні — {today.toLocaleDateString("uk-UA", { weekday: "short", day: "numeric", month: "long" })}
        </div>
      </div>

      <QuoteDeadlineOrderWarning
        designDeadline={valueOf("design")}
        answerDeadline={valueOf("answer")}
        designLabel={shortLabel("design")}
        answerLabel={shortLabel("answer")}
        onFix={() => startEditing("design")}
      />

      <div>
        {STEPS.map((step, index) => {
          const draft = drafts[step.key];
          const value = valueOf(step.key);
          const isEditing = editing === step.key;
          const empty = !draft.saved && !isEditing;
          const badge = getDeadlineBadge(value);
          // Далека дата словом «через N дн.», а не числом: число вже стоїть у плитці ліворуч.
          const relative =
            badge.tone === "future" ? `Через ${deadlineDiffDays(value) ?? 0} дн.` : badge.label;
          const tone: Tone =
            step.key === "design" && orderBroken ? "danger" : (DEADLINE_TONE[badge.tone] ?? "neutral");
          const time = parseDeadlineDate(value);
          const timeLabel =
            time && /T\d{2}:\d{2}/.test(value ?? "") ? `${pad(time.getHours())}:${pad(time.getMinutes())}` : null;
          const quick = buildQuickDates(step.key, defaultTime);
          const reminderLabel = reminder.options.find((option) => option.value === reminder.offset)?.label;

          return (
            <div key={step.key}>
              {/* Риска між картками з'єднує дати в ланцюжок: порядок — частина
                  змісту, а не верстки. */}
              {index > 0 ? <div className="ml-[51px] h-4 w-0.5 rounded-full bg-border sm:ml-[55px]" aria-hidden /> : null}
              <article
                className={cn(
                  "overflow-hidden rounded-xl border bg-card",
                  isEditing ? "border-border" : "border-border/50"
                )}
              >
                <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:gap-4 sm:p-4">
                  <DateTile value={value} tone={tone} empty={empty} />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <span className="text-sm font-semibold text-foreground">{step.title}</span>
                      {!empty && value ? (
                        <span
                          className={cn(
                            "inline-flex h-6 items-center gap-1.5 rounded-full border px-2 text-xs font-medium tabular-nums",
                            toneBadgeClass[tone]
                          )}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
                          {step.key === "design" && orderBroken
                            ? "пізніше за відповідь"
                            : timeLabel
                              ? `${relative} · ${timeLabel}`
                              : relative}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">{step.purpose}</div>
                    {step.key === "answer" && !empty && !isEditing && (reminderLabel || reminder.note) ? (
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {reminderLabel && reminder.offset !== "none" ? (
                          <span className="inline-flex items-center gap-1.5">
                            <BellRing className="h-3.5 w-3.5" />
                            {reminderLabel}
                            {reminder.comment ? ` — «${reminder.comment}»` : ""}
                          </span>
                        ) : null}
                        {reminder.note ? <span>{reminder.note}</span> : null}
                      </div>
                    ) : null}

                    {empty ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {quick.map((option) => (
                          <Button
                            key={option.label}
                            variant="outline"
                            size="sm"
                            disabled={saving}
                            className="h-auto flex-col items-start gap-0 px-3 py-1.5 leading-tight"
                            onClick={() => void save(step.key, option)}
                          >
                            <span className="text-xs font-semibold">{option.label}</span>
                            <span className="text-2xs font-normal text-muted-foreground">{option.hint}</span>
                          </Button>
                        ))}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-auto gap-1.5 border border-dashed border-border px-3 py-2 text-xs"
                          onClick={() => startEditing(step.key)}
                        >
                          <Calendar className="h-3.5 w-3.5" />
                          Інша дата
                        </Button>
                      </div>
                    ) : null}
                  </div>

                  {!empty && !isEditing ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0 gap-1.5 self-start sm:self-center"
                      onClick={() => startEditing(step.key)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Змінити
                    </Button>
                  ) : null}
                </div>

                {isEditing ? (
                  <div className="space-y-4 border-t border-border/40 bg-muted/[0.03] p-3 sm:p-4 sm:pl-[112px]">
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px]">
                      <div className="space-y-1.5">
                        <div className="text-xs text-muted-foreground">Дата</div>
                        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className="w-full justify-start gap-2 font-normal">
                              <Calendar className="h-4 w-4 text-muted-foreground" />
                              {draft.date
                                ? toLocalDate(draft.date)?.toLocaleDateString("uk-UA", {
                                    weekday: "short",
                                    day: "numeric",
                                    month: "long",
                                    year: "numeric",
                                  })
                                : "Оберіть день"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent align="start" className="w-fit max-w-[calc(100vw-2rem)] p-0">
                            <CalendarPicker
                              mode="single"
                              selected={toLocalDate(draft.date)}
                              onSelect={(date) => {
                                draft.setDate(date ? toDateInput(date) : "");
                                setPickerOpen(false);
                              }}
                            />
                            <DateQuickActions
                              onSelect={(date) => {
                                draft.setDate(date ? toDateInput(date) : "");
                                setPickerOpen(false);
                              }}
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div className="space-y-1.5">
                        <div className="text-xs text-muted-foreground">Час</div>
                        <TimeInput
                          controlSize="md"
                          className="w-full"
                          value={draft.time}
                          onChange={(event) => draft.setTime(event.target.value)}
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="mr-1 text-xs text-muted-foreground">Швидко:</span>
                      {quick.map((option) => {
                        const on = draft.date === option.date && draft.time === option.time;
                        return (
                          <Button
                            key={option.label}
                            variant="outline"
                            size="xs"
                            aria-pressed={on}
                            className={cn(on && "border-foreground/60 text-foreground")}
                            onClick={() => {
                              draft.setDate(option.date);
                              draft.setTime(option.time);
                            }}
                          >
                            {option.label}
                          </Button>
                        );
                      })}
                    </div>

                    {step.key === "answer" ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <div className="text-xs text-muted-foreground">Нагадування</div>
                          <Select value={reminder.offset} onValueChange={reminder.setOffset}>
                            <SelectTrigger controlSize="md" className="w-full">
                              <SelectValue placeholder="Коли нагадати" />
                            </SelectTrigger>
                            <SelectContent>
                              {reminder.options.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <div className="text-xs text-muted-foreground">Текст нагадування</div>
                          <Input
                            controlSize="md"
                            className="w-full"
                            placeholder="Напр. передзвонити клієнту"
                            value={reminder.comment}
                            onChange={(event) => reminder.setComment(event.target.value)}
                            maxLength={200}
                          />
                        </div>
                        <div className="space-y-1.5 sm:col-span-2">
                          <div className="text-xs text-muted-foreground">Коментар</div>
                          <Input
                            controlSize="md"
                            className="w-full"
                            placeholder="Внутрішня примітка до дедлайну"
                            value={reminder.note}
                            onChange={(event) => reminder.setNote(event.target.value)}
                            maxLength={200}
                          />
                        </div>
                      </div>
                    ) : null}

                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          resetDraft(step.key);
                          setEditing(null);
                        }}
                      >
                        Скасувати
                      </Button>
                      <Button
                        size="sm"
                        className="gap-1.5"
                        disabled={saving || !draft.date}
                        onClick={() => void save(step.key)}
                      >
                        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                        Зберегти
                      </Button>
                    </div>
                  </div>
                ) : null}
              </article>
            </div>
          );
        })}
      </div>

      {error ? <div className="text-xs text-destructive">{error}</div> : null}
    </div>
  );
}
