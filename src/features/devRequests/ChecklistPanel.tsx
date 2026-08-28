import { useState } from "react";
import { CircleSlash, Plus, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { pluralUk } from "@/lib/lastSeen";
import { toneTextClass } from "@/lib/statusTones";
import { cn } from "@/lib/utils";
import {
  CHECK_STATE_ICONS,
  CHECK_STATE_LABELS,
  CHECK_STATE_TONE,
  QUESTION_ICON,
  checklistProgress,
  groupChecklist,
  nextState,
  today,
  waitingDays,
  type ChecklistItem,
} from "./checklist";

/**
 * Пункти великої задачі — редагування в дровері.
 *
 * КЛІК ПО ІКОНЦІ ВЕДЕ ПО КОЛУ: не почато → в роботі → чекає → готово → знову.
 * Випадайка на кожен пункт була б чеснішою, але пункти відмічають пачкою, на
 * бігу, і два кліки на кожен перетворюють цю роботу на окрему справу. Коло
 * ставить дату очікування саме — інакше «чекаємо з якого числа» ніхто б не
 * заповнював, а без дати вся конструкція з «зависло N днів» мертва.
 *
 * ІМʼЯ ПИТАЄМО ОДРАЗУ. Щойно пункт стає «чекає», під ним відкривається поле
 * «на кого». Без імені очікування нічиє: через тиждень видно, що стоїть, і не
 * видно, у кого питати.
 */
export function ChecklistPanel({
  items,
  canManage,
  saving,
  onChange,
}: {
  items: ChecklistItem[];
  canManage: boolean;
  saving: boolean;
  onChange: (next: ChecklistItem[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const progress = checklistProgress(items);
  const groups = groupChecklist(items);

  const patch = (id: string, changes: Partial<ChecklistItem>) => {
    onChange(items.map((item) => (item.id === id ? { ...item, ...changes } : item)));
  };

  const cycle = (item: ChecklistItem) => {
    const state = nextState(item.state);
    patch(item.id, {
      state,
      // Дата ставиться на вході в «чекає» й знімається на виході: інакше
      // «зависло 12 днів» лишалось би на пункті, який давно зробили.
      since: state === "waiting" ? item.since ?? today() : null,
      who: state === "waiting" ? item.who : null,
      // Слід коміта живе рівно доти, доки пункт закритий. Відкрили назад —
      // дата й sha йдуть разом із ним: «зроблено 27.08» на пункті, який знову
      // в роботі, — це та сама брехня, лише в профіль.
      closed: state === "done" ? item.closed : null,
      sha: state === "done" ? item.sha : null,
    });
  };

  const add = () => {
    const text = draft.trim();
    if (!text) return;
    onChange([
      ...items,
      {
        id: `p${Date.now().toString(36)}`,
        kind: "task",
        text,
        state: "todo",
        // Новий пункт іде в групу останнього — так дописують у кінець списку,
        // а не заводять безіменну групу під сподом.
        group: items.at(-1)?.group ?? null,
        who: null,
        since: null,
        note: null,
        closed: null,
        sha: null,
        answer: null,
      },
    ]);
    setDraft("");
  };

  return (
    <div className="space-y-2.5">
      {items.length > 0 ? (
        <div className="flex items-center gap-2 text-2xs text-muted-foreground">
          <span className="inline-flex h-1.5 w-20 overflow-hidden rounded-full bg-border">
            <i
              className="block h-full bg-success-solid"
              style={{ width: `${(progress.done / progress.total) * 100}%` }}
            />
            <i
              className="block h-full bg-info-foreground"
              style={{ width: `${(progress.doing / progress.total) * 100}%` }}
            />
            <i
              className="block h-full bg-warning-solid"
              style={{ width: `${(progress.waiting / progress.total) * 100}%` }}
            />
          </span>
          <span className="tabular-nums">
            {progress.done} з {progress.total}
          </span>
          {progress.stuckDays > 0 ? (
            <span className="text-warning-foreground">
              · чекає {progress.stuckWho ?? "когось"} {progress.stuckDays} дн
            </span>
          ) : null}
          {saving ? <span className="ml-auto opacity-70">зберігаю…</span> : null}
        </div>
      ) : null}

      {groups.map((group) => (
        <div key={group.group ?? "—"} className="space-y-0.5">
          {group.group ? (
            <div className="flex items-center gap-2 pb-1 pt-1.5">
              <span className="text-3xs font-semibold uppercase tracking-caps text-muted-foreground">
                {group.group}
              </span>
              <span className="text-3xs tabular-nums text-muted-foreground/70">
                {group.items.filter((item) => item.state === "done").length}/{group.items.length}
              </span>
              <span className="h-px flex-1 bg-border/60" />
            </div>
          ) : null}

          {group.items.map((item) => {
            const StateIcon = CHECK_STATE_ICONS[item.state];
            const days = waitingDays(item);
            return (
              <div key={item.id} className="rounded-[var(--radius)] px-1 py-1 hover:bg-muted/20">
                <div className="flex items-start gap-2.5">
                  <button
                    type="button"
                    disabled={!canManage}
                    onClick={() => cycle(item)}
                    title={`${CHECK_STATE_LABELS[item.state]} — натисни, щоб змінити`}
                    aria-label={`Стан: ${CHECK_STATE_LABELS[item.state]}`}
                    className={cn(
                      "mt-px shrink-0 rounded-md p-0.5 transition-colors",
                      toneTextClass[CHECK_STATE_TONE[item.state]],
                      canManage ? "cursor-pointer hover:bg-muted/50" : "cursor-default"
                    )}
                  >
                    <StateIcon className="h-4 w-4" />
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-1.5">
                      {/* Знак питання лише поза групами. Усередині «Чекаємо на
                          CEO» він дублює заголовок, і дві іконки поспіль
                          зливаються в одну кляксу, з якої не читається жодна. */}
                      {item.kind === "question" && !item.group ? (
                        <QUESTION_ICON className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning-foreground" />
                      ) : null}
                      <span
                        className={cn(
                          "text-[13px] leading-snug",
                          item.state === "done" && "text-muted-foreground line-through"
                        )}
                      >
                        {item.text}
                      </span>
                    </div>
                    {item.note ? (
                      <p className="mt-0.5 whitespace-pre-wrap text-2xs leading-relaxed text-muted-foreground">
                        {item.note}
                      </p>
                    ) : null}

                    {/* Очікування — ОДИН рядок замість поля вводу з рамкою й
                        сирої дати. Рамка обіцяла форму, хоч це одне слово, яке
                        міняють раз на місяць; дату «з 2026-07-30» доводилось
                        віднімати в голові, хоч питання завжди про те, скільки
                        вже висить. */}
                    {item.state === "waiting" ? (
                      // Один акцент на рядок — жовта лише іконка стану зліва.
                      // Доти жовтими були ще й імʼя та пунктир під ним, і три
                      // акценти в рядку кричали наввипередки, хоч головне тут —
                      // сам текст пункту.
                      <div className="mt-1 inline-flex items-baseline gap-1.5 text-2xs text-muted-foreground">
                        <input
                          value={item.who ?? ""}
                          disabled={!canManage}
                          onChange={(event) => patch(item.id, { who: event.target.value || null })}
                          placeholder="на кого"
                          // Ширина рівно по слову. Був мінімум у 7 символів, і
                          // під «CEO» тягнувся пунктир удвічі довший за саме
                          // слово — саме він і виглядав недоладно.
                          size={Math.max(3, (item.who ?? "на кого").length)}
                          className={cn(
                            "border-b border-dashed border-muted-foreground/35 bg-transparent p-0 text-2xs text-foreground",
                            "placeholder:text-muted-foreground/60",
                            "transition-colors hover:border-muted-foreground/70",
                            "focus:border-solid focus:border-primary/60 focus:outline-none",
                            "disabled:cursor-default disabled:border-none"
                          )}
                        />
                        {days !== null ? (
                          <span>
                            · {days === 0 ? "сьогодні" : pluralUk(days, "день", "дні", "днів")}
                          </span>
                        ) : null}
                      </div>
                    ) : null}

                    {item.kind === "question" && item.answer ? (
                      <p className="mt-1 rounded-[var(--radius)] bg-success-soft px-2 py-1 text-2xs leading-relaxed text-success-foreground">
                        {item.answer}
                      </p>
                    ) : null}
                  </div>

                  {canManage ? (
                    <>
                      {/*
                        «Не робимо» — не те саме, що «Прибрати». Прибраний пункт
                        зникає без сліду, і за місяць ніхто не згадає, чому його
                        не зробили; скасований лишається в списку закресленим і
                        більше не тримає картку в роботі.
                      */}
                      <Button
                        type="button"
                        variant="ghost"
                        size="iconXs"
                        title={item.state === "dropped" ? "Повернути в роботу" : "Не робимо"}
                        className="shrink-0 text-muted-foreground/60 hover:text-foreground"
                        onClick={() =>
                          patch(item.id, {
                            state: item.state === "dropped" ? "todo" : "dropped",
                            since: null,
                            who: null,
                            closed: null,
                            sha: null,
                          })
                        }
                      >
                        <CircleSlash className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="iconXs"
                        title="Прибрати пункт"
                        className="shrink-0 text-muted-foreground/60 hover:text-destructive"
                        onClick={() => onChange(items.filter((entry) => entry.id !== item.id))}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {canManage ? (
        <div className="flex items-center gap-1.5 pt-1">
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              // Enter додає й лишає поле відкритим: пункти пишуть чергою, і
              // тягтись до кнопки після кожного рядка — зайвий жест.
              if (event.key === "Enter") {
                event.preventDefault();
                add();
              }
              if (event.key === "Escape") setDraft("");
            }}
            placeholder="Новий пункт…"
            className="h-8 text-[13px]"
          />
          {draft ? (
            <Button type="button" variant="ghost" size="iconSm" onClick={() => setDraft("")}>
              <X className="h-3.5 w-3.5" />
            </Button>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="shrink-0 gap-1.5"
            disabled={!draft.trim()}
            onClick={add}
          >
            <Plus className="h-3.5 w-3.5" />
            Додати
          </Button>
        </div>
      ) : null}

      {items.length === 0 && !canManage ? (
        <p className="text-[13px] text-muted-foreground">пунктів немає</p>
      ) : null}
    </div>
  );
}
