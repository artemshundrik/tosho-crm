import * as React from "react";
import { Check, ChevronDown, Plus, X } from "lucide-react";

import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { QuoteImportDraftImprint } from "@/features/quotes/quote-import/types";
import { cn } from "@/lib/utils";

/**
 * Нанесення парами «метод + місце» — ОДИН редактор на всі місця (REQ-157#p4).
 *
 * Народився у вікні створення прорахунку (REQ-182#p24), а потім те саме
 * знадобилось у картці товару на вкладці «Товари»: там пари й ставлять, коли
 * прорахунок уже створено. Другий такий самий редактор поруч означав би, що
 * наступна поправка доїде лише в одне з двох місць.
 */

/**
 * Місце нанесення для списку: рядок довідника виду (`id`) або вже вписане
 * руками (`id: null`).
 */
export type PlaceOption = { id: string | null; label: string };

/**
 * Скільки методів пропонуємо чипами, поки нанесення ще не назвали (REQ-182#p22).
 *
 * Було три запропоновані ПЛЮС усі обрані, тобто до п'яти чипів, і смуга
 * розповзалась на другий рядок. Заміри проду: один метод обирають у 85 %
 * позицій, два в 15 %, три — тричі за весь час. Тож двох чипів вистачає на
 * дев'ять випадків із десяти, а решта живе за «ще N».
 *
 * Двох, а не трьох: разом із чипом виду й підписом «Нанесення» третій чип не
 * влазив у смугу й обрізався разом із «ще N» — тобто ховав саму дорогу до
 * решти методів (заміряно: 508 px вмісту в 410 px смуги).
 */
const VISIBLE_METHODS = 2;

/**
 * ESC ЗАКРИВАЄ СПИСОК, А НЕ ВІКНО. Перевірено живим натиском: без цього
 * Escape при відкритому списку лишав список на екрані й вів діалог до
 * питання «Закрити без збереження?» — тобто клавіша робила рівно протилежне
 * очікуваному. Слухаємо на фазі ЗАХОПЛЕННЯ й глушимо подію повністю:
 * обробники Radix (і поповера, і діалога) висять на document на фазі
 * спливання, тож до них вона вже не доходить.
 */
function usePopoverEscape(open: boolean, close: () => void) {
  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      close();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, close]);
}

/**
 * Нанесення парами «метод + місце» (REQ-182#p24).
 *
 * ДВА СТАНИ СМУГИ, І ЦЕ НАВМИСНО. Поки не відповіли — смуга ПИТАЄ: «Без
 * нанесення» увімкнене, поруч два найчастіші методи виду й «ще N». Щойно
 * відповіли — смуга ПОКАЗУЄ відповідь: кожна пара окремим чипом «ДТФ ·
 * Груди», плюс «+» на ще одну. Тримати обидва разом означало б до семи чипів
 * у рядку на 410 px, а обране й запропоноване виглядали б однаково.
 *
 * МІСЦЕ ВИДНО НЕЗАПОВНЕНИМ. Чип без місця каже «ДТФ · місце?» приглушеним
 * хвостиком: питання, на яке ще не відповіли, має бути видно в рядку, а не
 * ховатись за клік. Саме через невидиме питання 203 нанесення з 332 поїхали
 * з «Індивідуальний» — єдиним місцем, яке взагалі пропонувалось.
 */
export function ImprintChips({
  imprints,
  methods,
  places,
  disabled,
  onChange,
}: {
  imprints: QuoteImportDraftImprint[];
  methods: Array<{ id: string; name: string }>;
  places: PlaceOption[];
  disabled?: boolean;
  onChange: (next: QuoteImportDraftImprint[]) => void;
}) {
  const [listOpen, setListOpen] = React.useState(false);
  const closeList = React.useCallback(() => setListOpen(false), []);
  usePopoverEscape(listOpen, closeList);

  const add = (methodId: string) =>
    onChange([...imprints, { key: crypto.randomUUID(), methodId, positionId: null, positionLabel: null }]);
  const patch = (key: string, next: Partial<QuoteImportDraftImprint>) =>
    onChange(imprints.map((imprint) => (imprint.key === key ? { ...imprint, ...next } : imprint)));
  const remove = (key: string) => onChange(imprints.filter((imprint) => imprint.key !== key));
  const methodName = (methodId: string) => methods.find((method) => method.id === methodId)?.name ?? "Метод";

  if (imprints.length > 0) {
    return (
      <div className="flex min-w-0 flex-wrap items-center gap-1.5" role="group" aria-label="Нанесення">
        {imprints.map((imprint) => (
          <ImprintChip
            key={imprint.key}
            imprint={imprint}
            methodLabel={methodName(imprint.methodId)}
            methods={methods}
            places={places}
            disabled={disabled}
            onPatch={(next) => patch(imprint.key, next)}
            onRemove={() => remove(imprint.key)}
          />
        ))}
        {/* «Ще одне нанесення» — не «ще методи»: пара додається цілком. */}
        <Popover open={listOpen} onOpenChange={setListOpen}>
          <PopoverTrigger asChild>
            <Chip
              size="sm"
              disabled={disabled}
              icon={<Plus />}
              aria-label="Додати нанесення"
              className="shrink-0 border-dashed px-2.5 text-muted-foreground"
            >
              нанесення
            </Chip>
          </PopoverTrigger>
          <PopoverContent align="start" className="max-h-72 w-56 overflow-y-auto p-1.5">
            <PopoverHeading>Метод</PopoverHeading>
            {methods.map((method) => (
              <ListRow
                key={method.id}
                label={method.name}
                checked={false}
                onSelect={() => {
                  add(method.id);
                  setListOpen(false);
                }}
              />
            ))}
          </PopoverContent>
        </Popover>
      </div>
    );
  }

  const visible = methods.slice(0, VISIBLE_METHODS);
  const hidden = methods.length - visible.length;

  return (
    <div className="flex min-w-0 items-center gap-1.5" role="group" aria-label="Нанесення">
      {/*
        Підпису «Нанесення» тут немає: перший чип каже «Без нанесення», тобто
        слово вже на екрані. Зайняті ним 76 px коштували дорожче — через них
        обрізався третій чип разом із «ще N». Групу називає aria-label.
      */}
      {/* Чипи можуть обрізатись, «ще N» — ніколи: це єдиний шлях до решти методів. */}
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
        <Chip size="sm" disabled={disabled} active aria-pressed="true" onClick={() => onChange([])}>
          Без нанесення
        </Chip>
        {visible.map((method) => (
          <Chip
            key={method.id}
            size="sm"
            disabled={disabled}
            aria-pressed="false"
            onClick={() => add(method.id)}
          >
            {method.name}
          </Chip>
        ))}
      </div>
      {hidden > 0 ? (
        <Popover open={listOpen} onOpenChange={setListOpen}>
          <PopoverTrigger asChild>
            <Chip
              size="sm"
              disabled={disabled}
              icon={<ChevronDown />}
              aria-label={`Усі методи нанесення, ще ${hidden}`}
              className="shrink-0 border-transparent bg-muted text-muted-foreground"
            >
              ще {hidden}
            </Chip>
          </PopoverTrigger>
          <PopoverContent align="end" className="max-h-72 w-60 overflow-y-auto p-1.5">
            {methods.map((method) => (
              <ListRow
                key={method.id}
                label={method.name}
                checked={false}
                onSelect={() => {
                  add(method.id);
                  setListOpen(false);
                }}
              />
            ))}
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
}

/**
 * Одна пара в смузі: чип «метод · місце», під ним панель із двома питаннями.
 *
 * ОДИН ЧИП — ОДНА ПАНЕЛЬ, А НЕ ДВА ОКРЕМІ ДРОПДАУНИ. Метод і місце
 * запитуються разом, бо разом і живуть: у базі це один запис масиву
 * `methods`. Два дропдауни поруч з'їли б удвічі більше смуги й дозволили б
 * місце без методу — стан, якого в базі немає.
 *
 * МІСЦЕ ВПИСУЄТЬСЯ РУКАМИ, І ЦЕ ГОЛОВНИЙ ШЛЯХ, а не запасний: довідник місць
 * заповнений у трьох видів із 92. Вписане не гине в тексті — на «Створити»
 * воно стає рядком довідника цього виду, тож наступного разу вже стоїть у
 * списку (як товар за посиланням стає рядком каталогу, REQ-182#p18).
 */
function ImprintChip({
  imprint,
  methodLabel,
  methods,
  places,
  disabled,
  onPatch,
  onRemove,
}: {
  imprint: QuoteImportDraftImprint;
  methodLabel: string;
  methods: Array<{ id: string; name: string }>;
  places: PlaceOption[];
  disabled?: boolean;
  onPatch: (next: Partial<QuoteImportDraftImprint>) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [typed, setTyped] = React.useState("");
  const close = React.useCallback(() => setOpen(false), []);
  usePopoverEscape(open, close);

  const place = imprint.positionLabel?.trim() || "";
  const applyTyped = (value: string) => {
    const label = value.trim();
    if (!label) return;
    // Вписали те, що вже є в списку виду, — беремо рядок довідника, а не текст:
    // однакове місце має лишатись одним місцем, хай навіть його набрали руками.
    const known = places.find((option) => option.id && option.label.toLowerCase() === label.toLowerCase());
    onPatch({ positionId: known?.id ?? null, positionLabel: known?.label ?? label.slice(0, 60) });
    setTyped("");
  };

  return (
    <div className="group/imprint relative shrink-0">
      <Popover
        open={open}
        onOpenChange={(next) => {
          // Набране й не підтверджене Enter'ом не пропадає: закриття панелі —
          // теж відповідь, і людина вважає, що вписала місце, бо вона його вписала.
          if (!next) applyTyped(typed);
          setOpen(next);
        }}
      >
        <PopoverTrigger asChild>
          <Chip
            size="sm"
            disabled={disabled}
            active
            title={place ? `${methodLabel} · ${place}` : `${methodLabel} — місце не вказане`}
            aria-label={place ? `Нанесення: ${methodLabel}, місце ${place}` : `Нанесення: ${methodLabel}, місце не вказане`}
            className="max-w-[190px]"
          >
            <span className="flex min-w-0 items-center gap-1">
              <span className="shrink-0">{methodLabel}</span>
              <span className="text-muted-foreground">·</span>
              <span className={cn("min-w-0 truncate", !place && "font-normal text-muted-foreground")}>
                {place || "місце?"}
              </span>
            </span>
          </Chip>
        </PopoverTrigger>
        <PopoverContent align="start" className="max-h-80 w-64 overflow-y-auto p-1.5">
          {/*
            МІСЦЕ СТОЇТЬ ПЕРШИМ, хоч у назві пари воно друге. Пари без методу
            не буває — його вже назвали, коли пару створювали, — а місце саме
            те, чого бракує. Перевірено живцем: із методами вгорі список місць
            ішов під край панелі, і питання, заради якого її відкрили, було не
            видно без прокрутки. Поле фокусується саме, бо в 89 видів із 92
            місця вписують, а не вибирають.
          */}
          <PopoverHeading>Місце</PopoverHeading>
          <Input
            value={typed}
            controlSize="md"
            aria-label="Своє місце нанесення"
            placeholder={places.length > 0 ? "Або своє місце…" : "Напишіть місце…"}
            className="mb-1"
            onChange={(event) => setTyped(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              applyTyped(typed);
              setOpen(false);
            }}
          />
          {places.map((option) => (
            <ListRow
              key={option.id ?? option.label}
              label={option.label}
              checked={
                option.id
                  ? imprint.positionId === option.id
                  : !imprint.positionId && imprint.positionLabel === option.label
              }
              onSelect={() => {
                onPatch({ positionId: option.id, positionLabel: option.label });
                setOpen(false);
              }}
            />
          ))}
          {place ? (
            <ListRow
              label="Без місця"
              checked={false}
              onSelect={() => {
                onPatch({ positionId: null, positionLabel: null });
                setOpen(false);
              }}
            />
          ) : null}
          <div className="my-1.5 h-px bg-border/60" />
          <PopoverHeading>Метод</PopoverHeading>
          {methods.map((method) => (
            <ListRow
              key={method.id}
              label={method.name}
              checked={method.id === imprint.methodId}
              onSelect={() => onPatch({ methodId: method.id })}
            />
          ))}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onRemove();
            }}
            className="mt-1 flex w-full items-center rounded-[var(--radius-md)] border-t border-border/60 px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted/60"
          >
            Прибрати нанесення
          </button>
        </PopoverContent>
      </Popover>
      {/*
        Хрестик лежить НА чипі, а не поруч: пара й так найширший елемент смуги,
        і окрема кнопка забрала б місце в назви методу. Той самий прийом, що на
        комірці тиражу.
      */}
      <button
        type="button"
        disabled={disabled}
        aria-label={`Прибрати нанесення ${methodLabel}`}
        onClick={onRemove}
        className="absolute -right-0.5 -top-0.5 grid h-3.5 w-3.5 place-items-center rounded-full bg-muted text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/imprint:opacity-100"
      >
        <X className="h-2.5 w-2.5" strokeWidth={2.5} />
      </button>
    </div>
  );
}

/** Підпис секції в панелі нанесення — той самий, що над групою видів. */
function PopoverHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 pb-1 pt-1 text-3xs font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </div>
  );
}

/** Рядок списку в панелі: клік застосовує одразу, панель лишається відкритою. */
function ListRow({
  label,
  checked,
  onSelect,
}: {
  label: string;
  checked: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={checked}
      onClick={onSelect}
      className="flex w-full items-center gap-2 rounded-[var(--radius-md)] px-2 py-1.5 text-left text-sm hover:bg-muted/60"
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {checked ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
    </button>
  );
}
