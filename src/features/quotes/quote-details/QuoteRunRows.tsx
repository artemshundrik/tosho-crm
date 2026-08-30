import { AlertTriangle, Check, Lock, Plus } from "lucide-react";

import { HoverTip } from "@/components/ui/hover-tip";
import { currencyLabel } from "@/features/quotes/currencyLabel";
import { cn } from "@/lib/utils";
import type { RunSalePricing } from "@/lib/quoteRuns";
import type { QuoteRun } from "@/lib/toshoApi";

/**
 * Перелік тиражів позиції — ТАБЛИЦЯ З ШАПКОЮ (REQ-175#p31).
 *
 * ЧОМУ НЕ ПІГУЛКИ, ЯК БУЛО ДО REQ-155. Пігулка «100 шт» показувала рівно одне
 * число з пʼяти, потрібних, щоб обрати тираж, — решту доводилось діставати
 * кліком на кожен тираж окремо, тобто порівняння було неможливе в принципі.
 *
 * ЧОМУ НЕ ПРОЗА, ЯК БУЛО ПІСЛЯ. Числа стояли рядком-формулою:
 * «1 136,28 + 70,30 /од · логістика 1 000 · накрутка 28 %». Це формула, записана
 * прозою: підписів у неї немає, і читач мав сам здогадуватись, що перше число —
 * модель, а друге — нанесення. Усе однакового кольору й кегля, тож око не мало
 * за що зачепитись, а на вузькому екрані рядок обрізався просто посеред
 * формули.
 *
 * Тепер підписи стоять У ШАПЦІ ОДИН РАЗ, а кожен тираж — рядок вирівняних
 * чисел. Це дає те, заради чого перелік і робили: тиражі порівнюються ПО
 * ВЕРТИКАЛІ — видно, що собівартість однакова, а різниця в нанесенні й
 * накрутці.
 *
 * ШИРИНИ КОЛОНОК ФІКСОВАНІ, і тепер це не діра, а таблиця: ширину задає
 * найдовше з двох — підпис у шапці чи типове значення (заміряно: «Собівартість
 * /од.» — 96 px, «47 612,67 UAH» — 109). Шапка й рядки — окремі гріди, тож
 * `auto` в них розʼїхався б; спільний шаблон тримає колонки на спільній
 * вертикалі.
 *
 * Найтісніше не на найширшому екрані, а рівно на xl (1280 px): там зʼявляється
 * права колонка справи, картці лишається 773 px, і вільного місця в рядку
 * тиражу — 31 px. Тому проміжок між колонками на lg — 10 px, а не 16: колонки
 * вирівняні по правому краю, і десяти пікселів між числами вистачає.
 *
 * Колонка рішення клієнта — 10rem: її ширину диктує не дані, а стан (бейдж
 * «Погоджено клієнтом» — 157 px проти 94 у кнопки «Погодити»), тож на `auto`
 * погодження тиражу зсувало б стовпчик сум убік.
 *
 * ДО lg — ТРИ ЯРУСИ. Вісім колонок потребують ~740 px і на планшеті не влазять.
 * Там рядок розкладається на кількість і суму зверху, склад собівартості
 * підписами під ними й рішення внизу — порівнювати на телефоні все одно нема з
 * чим, бо тираж на екрані один.
 */

/** Шаблон колонок — спільний для шапки й рядків, інакше вони розʼїдуться. */
const GRID_COLS =
  "lg:grid-cols-[5.5rem_6rem_5.25rem_4.75rem_3.75rem_minmax(0,1fr)_10rem_6.75rem]";

const num = (value: number, digits = 0) =>
  (Math.round(value * 100) / 100).toLocaleString("uk-UA", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

/**
 * Сума рядка — те саме число, що й у блоці ціни нижче, з точністю до копійки.
 * Округлення до гривні тут виглядало б як ІНШЕ число: рядок казав би «47 613»,
 * а блок під ним — «47 612,67». Копійки показуються лише тоді, коли вони є, —
 * як і в `formatCurrency` по всій картці.
 */
const amount = (value: number) => {
  const rounded = Math.round(value * 100) / 100 || 0;
  return num(rounded, Number.isInteger(rounded) ? 0 : 2);
};

export type QuoteRunRowsProps = {
  runs: QuoteRun[];
  /** Обраний тираж — саме його поля показані нижче в «Активному тиражі». */
  activeRunId?: string | null;
  /** «шт.», «компл.» — уже нормалізована одиниця позиції. */
  unitLabel: string;
  currency?: string | null;
  getPricing: (run: QuoteRun) => RunSalePricing;
  canAddRun: boolean;
  /** Чи має глядач право ставити й знімати позначку «Погодив клієнт». */
  canApproveRun: boolean;
  onSelect: (run: QuoteRun) => void;
  onAddRun: () => void;
  onToggleApproved: (run: QuoteRun) => void;
  /** Тиражів кілька, і жоден ще не позначений як погоджений клієнтом. */
  needsApprovedChoice?: boolean;
  /** Тиражі, що тримають КП зачиненим: нижче дна без чинного погодження. */
  blockingRunIds?: ReadonlySet<string>;
};

export function QuoteRunRows({
  runs,
  activeRunId,
  unitLabel,
  currency,
  getPricing,
  canAddRun,
  canApproveRun,
  onSelect,
  onAddRun,
  onToggleApproved,
  needsApprovedChoice = false,
  blockingRunIds,
}: QuoteRunRowsProps) {
  const money = currencyLabel(currency);
  // Шапка без жодного числа під собою обіцяла б колонки, яких немає: поки
  // собівартість не внесена, підписи ховаються разом із даними.
  const anyPriced = runs.some((run) => getPricing(run).costTotal > 0);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-foreground">
            Тиражі{" "}
            {runs.length > 0 ? (
              <span className="font-normal tabular-nums text-muted-foreground">{runs.length}</span>
            ) : null}
          </span>
          {/*
            Підказка стоїть у шапці ПЕРЕЛІКУ, а не смугою над полями ціни
            (REQ-175#p56). Вона про вибір у цьому списку — там їй і місце, і там
            її видно, коли на список дивишся. Повний текст під наведенням.
          */}
          {needsApprovedChoice ? (
            <HoverTip
              side="bottom"
              contentClassName="max-w-[300px] px-3 py-2 text-2xs leading-relaxed"
              label={
                <span>
                  <span className="font-semibold text-foreground">Тиражів кілька.</span> Позначте той,
                  який погодив клієнт: саме з нього підуть кількість і ціна в замовлення.
                </span>
              }
            >
              <span className="inline-flex h-6 cursor-default items-center gap-1.5 rounded-md border border-border/60 bg-muted px-2 text-2xs text-muted-foreground">
                <AlertTriangle className="h-3 w-3 shrink-0 text-warning-solid" />
                позначте погоджений клієнтом
              </span>
            </HoverTip>
          ) : null}
        </div>
        {canAddRun ? (
          <button
            type="button"
            onClick={onAddRun}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/70 px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            Тираж
          </button>
        ) : null}
      </div>

      {anyPriced ? (
        <div
          className={cn(
            "-mx-3 hidden gap-x-2.5 border-b border-border/40 px-3 pb-1.5 text-2xs text-muted-foreground sm:-mx-4 sm:px-4 lg:grid",
            GRID_COLS
          )}
          aria-hidden
        >
          <span>Тираж</span>
          <span className="text-right">Собівартість/од.</span>
          <span className="text-right">Нанесення/од.</span>
          <span className="text-right">Логістика</span>
          <span className="text-right">Накрутка</span>
          <span />
          <span />
          <span className="text-right">Сума</span>
        </div>
      ) : null}

      {/*
        Відʼємне поле дорівнює полю ярусу, а внутрішнє повертає числа на ту саму
        вертикаль, що назва товару вгорі. Тому риски між тиражами йдуть від краю
        до краю картки, а підсвітка ряду не має «полів усередині полів».
      */}
      <div role="radiogroup" aria-label="Тиражі позиції" className="-mx-3 sm:-mx-4">
        {runs.map((run, runIndex) => {
          const qty = Number(run.quantity) || 0;
          const isSelected = !!run.id && run.id === activeRunId;
          const isApproved = run.is_approved === true;
          // Замок у шапці каже, СКІЛЬКИ тиражів тримають двері; тут видно, ЯКІ
          // саме (REQ-175#p63). Без цього доводилось звіряти шість рядків із
          // підказкою вгорі сторінки.
          const isBlocking = !!run.id && !!blockingRunIds?.has(run.id);
          const pricing = getPricing(run);
          const priced = pricing.costTotal > 0;
          // Класи колонок — літералами: Tailwind читає вихідний код, а не
          // рантайм, тож зібраний з шматків `lg:col-start-${i}` не існував би.
          // Одиниця стоїть біля числа, а не тільки в шапці: відсоток при
          // накрутці був, а гривня при грошах — ні, і колонки читались як
          // числа різного роду.
          const costCells = [
            {
              key: "model",
              label: "Собівартість",
              value: num(Number(run.unit_price_model) || 0, 2),
              unit: money,
              col: "lg:col-start-2",
            },
            {
              key: "print",
              label: "Нанесення",
              value: num(Number(run.unit_price_print) || 0, 2),
              unit: money,
              col: "lg:col-start-3",
            },
            {
              key: "logistics",
              label: "Логістика",
              value: num(Number(run.logistics_cost) || 0),
              unit: money,
              col: "lg:col-start-4",
            },
            {
              key: "markup",
              label: "Накрутка",
              value: num(Math.round((Number(run.markup_rate) || 0) * 100) / 100, 2),
              unit: "%",
              col: "lg:col-start-5",
            },
          ];

          return (
            <div
              key={run.id ?? `run-row:${runIndex}`}
              id={run.id ? `quote-run-${run.id}` : undefined}
              role="radio"
              tabIndex={0}
              aria-checked={isSelected}
              onClick={() => onSelect(run)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                onSelect(run);
              }}
              className={cn(
                // Смужка стоїть на ВСІХ рядках, просто прозора: інакше вибір
                // зсував би вміст рядка на 3 px убік.
                "grid cursor-pointer items-center gap-x-4 gap-y-1.5 lg:gap-x-2.5 border-b border-l-[3px] border-border/40 border-l-transparent py-2.5 pl-[9px] pr-3 transition-colors last:border-b-0 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-foreground/20 sm:pl-[13px] sm:pr-4",
                "grid-cols-[minmax(0,1fr)_auto]",
                GRID_COLS,
                isSelected && "border-l-foreground bg-muted"
              )}
            >
              <span className="col-start-1 row-start-1 whitespace-nowrap">
                <span
                  className={cn(
                    "text-base tabular-nums text-foreground",
                    isSelected ? "font-semibold" : "font-medium"
                  )}
                >
                  {qty}
                </span>
                <span className="ml-1 text-2xs text-muted-foreground">{unitLabel}</span>
              </span>

              {/*
                До lg склад собівартості — один ярус із підписами; на lg обгортка
                розчиняється (`contents`), і кожне число стає своєю колонкою
                таблиці. Одна розмітка на обидва випадки: другої гілки, яку
                React комітив би вхолосту, тут немає.
              */}
              <div className="col-start-1 col-end-3 row-start-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 lg:contents">
                {priced ? (
                  costCells.map((cell) => (
                    <span key={cell.key} className={cn("whitespace-nowrap lg:row-start-1 lg:text-right", cell.col)}>
                      <span className="mr-1 text-2xs text-muted-foreground lg:hidden">{cell.label}</span>
                      <span className="text-sm tabular-nums text-foreground">{cell.value}</span>
                      <span className="ml-1 text-2xs text-muted-foreground">{cell.unit}</span>
                      {isBlocking && cell.key === "markup" ? (
                        <Lock
                          className="ml-1 inline h-3 w-3 shrink-0 -translate-y-px text-warning-solid"
                          aria-label="нижче дна — КП замкнено"
                        />
                      ) : null}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground lg:col-start-2 lg:col-end-6 lg:row-start-1">
                    собівартість не внесена
                  </span>
                )}
              </div>

              {/* Колонка рішення клієнта — тут воно й ухвалюється (REQ-155 p2).
                  Порожня — теж колонка: вона тримає ширину, щоб сума праворуч не
                  їздила туди-сюди, коли бейдж змінюється кнопкою й навпаки. */}
              <span className="col-start-1 col-end-3 row-start-3 flex items-center justify-start lg:col-start-7 lg:col-end-8 lg:row-start-1 lg:justify-end">
                {/*
                  Погоджувати нема чого, поки немає ціни (REQ-175#p67). Кнопка
                  стояла активною на тиражі з написом «собівартість не внесена»
                  — тобто пропонувала зафіксувати вибір клієнта на числі, якого
                  ще немає. Уже позначений тираж кнопку зберігає: інакше зняти
                  помилкову позначку до внесення собівартості було б нічим.
                */}
                {canApproveRun && (priced || isApproved) ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      // Погодження — рішення про ЦЕЙ тираж, а не про вибір активного:
                      // без зупинки бульбашки клік робив би обидві дії одразу.
                      event.stopPropagation();
                      onToggleApproved(run);
                    }}
                    title={
                      isApproved
                        ? "Зняти позначку погодження"
                        : "Цей тираж погодив клієнт — саме він піде в замовлення"
                    }
                    className={cn(
                      "inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-2xs font-semibold transition-colors",
                      isApproved
                        ? "border-success-soft-border bg-success-soft text-success-foreground hover:bg-success-soft/70"
                        : "border-dashed border-border text-muted-foreground hover:border-success-soft-border hover:bg-success-soft/40 hover:text-success-foreground"
                    )}
                  >
                    <Check className="h-3.5 w-3.5 shrink-0" />
                    {isApproved ? "Погоджено клієнтом" : "Погодити"}
                  </button>
                ) : isApproved ? (
                  <span className="inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-lg border border-success-soft-border bg-success-soft px-2.5 text-2xs font-semibold text-success-foreground">
                    <Check className="h-3.5 w-3.5 shrink-0" />
                    Погоджено клієнтом
                  </span>
                ) : null}
              </span>

              {/* Прочерка тут більше немає: він казав «нуль», хоч ішлося про «ще
                  невідомо», а це вже сказано словами ліворуч. */}
              <span className="col-start-2 row-start-1 whitespace-nowrap text-right lg:col-start-8">
                {priced ? (
                  <>
                    <span
                      className={cn(
                        "text-base tabular-nums text-foreground",
                        isSelected ? "font-semibold" : "font-medium"
                      )}
                    >
                      {amount(pricing.saleTotal)}
                    </span>
                    <span className="ml-1 text-2xs font-medium text-muted-foreground">{money}</span>
                    {pricing.saleUnitPrice === null ? null : (
                      <span className="block text-2xs tabular-nums text-muted-foreground">
                        {`${num(pricing.saleUnitPrice, 2)} /${unitLabel}`}
                      </span>
                    )}
                  </>
                ) : null}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
