import { Check, CircleAlert, Clock, Eye, Info, Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  formatMarkupBenchmarkBasis,
  type MarkupBenchmark,
} from "@/lib/quoteMarkupBenchmark";
import {
  canRequestMarkupApproval,
  isMarkupBlockingRelease,
  type QuoteRunMarkupState,
} from "@/lib/quoteMarkupApproval";
import type { QuoteMarkupView } from "@/lib/quoteMarkupView";
import { MIN_MARKUP_RATE, type RunSalePricing } from "@/lib/quoteRuns";

import { formatCurrency } from "./config";

/**
 * Накрутка і ціна тиражу — один блок у шести виглядах за посадою (REQ-149).
 *
 * Прототипи, за якими це зроблено й які СЕО дивився:
 *   tmp/quote-markup-prototype.html — сама секція, 6 виглядів × 8 станів
 *   tmp/quote-window-prototype.html — те саме в цілому вікні картки
 *
 * ЧОМУ ОКРЕМИМ ФАЙЛОМ. QuoteDetailsPage під ратчетом розміру, і саме такий
 * шматок — розмітка зі своєю логікою показу — має жити окремо (REQ-109).
 *
 * ЧОГО ТУТ НЕМАЄ НАВМИСНО: числового поля накрутки. Воно лишається уверхній
 * четвірці полів тиражу поруч із собівартістю, нанесенням і логістикою — там
 * його місце за змістом, і там же стоїть підпис «заморожено до відповіді».
 * Смуга нижче — не другий інструмент введення, а спосіб побачити, де ти
 * стоїш відносно дна й орієнтира.
 */

/** Права межа смуги. 120 % — стеля показу, а не обмеження поля. */
const TRACK_MAX = 120;

const pctOfTrack = (value: number) => Math.min(100, Math.max(0, (value / TRACK_MAX) * 100));

const formatRate = (value: number) => {
  const rounded = Math.round((Number(value) || 0) * 100) / 100;
  return `${rounded.toLocaleString("uk-UA")} %`;
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
};

type BadgeTone = "mute" | "ok" | "info" | "warn" | "bad";

const BADGE_CLASS: Record<BadgeTone, string> = {
  mute: "bg-muted text-muted-foreground border-border",
  ok: "bg-success-soft text-success-foreground border-success-soft-border",
  info: "bg-info-soft text-info-foreground border-info-soft-border",
  warn: "bg-warning-soft text-warning-foreground border-warning-soft-border",
  bad: "bg-destructive/10 text-destructive border-destructive/40",
};

const NOTE_CLASS: Record<BadgeTone, string> = {
  mute: "bg-muted/60 text-muted-foreground border-border",
  ok: "bg-success-soft text-success-foreground border-success-soft-border",
  info: "bg-info-soft text-info-foreground border-info-soft-border",
  warn: "bg-warning-soft text-warning-copy border-warning-soft-border",
  bad: "bg-destructive/10 text-destructive border-destructive/40",
};

export type QuoteRunMarkupPanelProps = {
  view: QuoteMarkupView;
  state: QuoteRunMarkupState;
  pricing: RunSalePricing;
  markupRate: number;
  currency?: string | null;
  benchmark: MarkupBenchmark | null;
  benchmarkLoading?: boolean;
  /** Право на поле накрутки (canEditQuoteRunPriceField). */
  canEditMarkup: boolean;
  /** Чи має глядач право ухвалити рішення (canApproveQuoteMarkup). */
  canApprove: boolean;
  /** Ім'я менеджера прорахунку — для «просить Дар'я» й підпису заробітку. */
  managerName?: string | null;
  /** Хто ухвалив рішення — підставляється в текст під станом. */
  deciderName?: string | null;
  busy?: boolean;
  onChangeMarkupRate: (next: number) => void;
  onRequestApproval: () => void;
  onDecide: (decision: "approved" | "rejected") => void;
};

function StateBadge({ state }: { state: QuoteRunMarkupState }) {
  const map: Record<QuoteRunMarkupState["kind"], [BadgeTone, typeof Info, string]> = {
    draft: ["mute", Info, "Чекає на собівартість"],
    ok: ["ok", Check, "У нормі"],
    under: ["warn", CircleAlert, "Треба погодження"],
    pending: ["warn", Clock, "Очікує підтвердження"],
    rejected: ["bad", Lock, "Відхилено"],
    approved: ["ok", Check, "Погоджено"],
  };
  const [tone, Icon, label] = map[state.kind];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-2xs font-medium",
        BADGE_CLASS[tone]
      )}
    >
      <Icon className="h-3 w-3 shrink-0" />
      {label}
    </span>
  );
}

/**
 * Текст міняється разом із роллю, а не лише набір полів.
 *
 * Спільна фраза на всіх була б або незрозумілою погоджувачу (він не знає, чия
 * ціна й наскільки вона нижча за типову), або наказовою менеджеру. Тому один
 * стан звучить для менеджера як підказка, а для погоджувача — як опис чужого
 * рішення, під яким треба поставити підпис.
 */
function markupNote(params: {
  state: QuoteRunMarkupState;
  view: QuoteMarkupView;
  canApprove: boolean;
  pricing: RunSalePricing;
  markupRate: number;
  benchmark: MarkupBenchmark | null;
  currency?: string | null;
  managerName?: string | null;
  deciderName?: string | null;
}): { tone: BadgeTone; icon: typeof Info; text: React.ReactNode } | null {
  const { state, view, canApprove, pricing, markupRate, benchmark, currency } = params;
  const who = params.managerName?.trim() || "Менеджер";
  const decider = params.deciderName?.trim() || "Погоджувач";

  if (state.kind === "draft") {
    return {
      tone: "mute",
      icon: Info,
      text: "Ціни ще немає: собівартість вносить проєктний менеджер. Смуга ввімкнеться разом із нею.",
    };
  }

  if (state.kind === "pending") {
    const sent = formatDateTime(state.approval.requestedAt);
    if (canApprove) {
      // Погоджувачу треба одне: наскільки нижче й на скільки грошей. Ціну на
      // дні рахуємо тут-таки, щоб він не тримав арифметику в голові.
      const floorSale = state.approval.costTotal * (1 + MIN_MARKUP_RATE / 100);
      return {
        tone: "warn",
        icon: Clock,
        text: (
          <>
            <b className="font-semibold">
              {who} просить {formatRate(state.approval.markupRate)} замість {MIN_MARKUP_RATE} %.
            </b>{" "}
            {sent ? `Надіслано ${sent}. ` : ""}
            Ціна впаде з {formatCurrency(floorSale, currency)} до{" "}
            {formatCurrency(state.approval.costTotal + state.approval.markupRate * state.approval.costTotal / 100, currency)}.
            {state.approval.requestNote ? ` Пояснення: «${state.approval.requestNote}»` : ""}
          </>
        ),
      };
    }
    return {
      tone: "warn",
      icon: Clock,
      text: (
        <>
          <b className="font-semibold">Запит надіслано{sent ? ` ${sent}` : ""}.</b> Чекаємо на будь-кого з
          трьох: двоє СЕО і головний бухгалтер. Рахувати й зберігати можна далі.
        </>
      ),
    };
  }

  if (state.kind === "rejected") {
    const when = formatDateTime(state.approval.decidedAt);
    return {
      tone: "bad",
      icon: Lock,
      text: (
        <>
          <b className="font-semibold">
            Відхилив {decider}
            {when ? ` ${when}` : ""}.
          </b>{" "}
          {state.approval.decisionNote ? `«${state.approval.decisionNote}». ` : ""}
          Число не відкочується саме — підніміть накрутку або надішліть запит із поясненням.
        </>
      ),
    };
  }

  if (state.kind === "approved") {
    const when = formatDateTime(state.approval.decidedAt);
    return {
      tone: "mute",
      icon: Check,
      text: (
        <>
          Підтвердив {decider}
          {when ? ` ${when}` : ""} на {formatRate(state.approval.markupRate)}.
          {state.approval.decisionNote ? ` «${state.approval.decisionNote}».` : ""} Зміна собівартості або
          накрутки вниз відкриє запит наново.
        </>
      ),
    };
  }

  if (state.kind === "under") {
    if (canApprove) {
      return {
        tone: "warn",
        icon: CircleAlert,
        text: (
          <>
            <b className="font-semibold">
              {who} веде ціну нижче дна {MIN_MARKUP_RATE} %.
            </b>{" "}
            Запит прийде вам, щойно його надішлють.
          </>
        ),
      };
    }
    return {
      tone: "warn",
      icon: CircleAlert,
      text: (
        <>
          <b className="font-semibold">Нижче дна {MIN_MARKUP_RATE} %.</b> Рахувати й зберігати можна далі,
          але КП клієнту й перехід у «Затверджено» відкриються після підтвердження СЕО або головного
          бухгалтера.
        </>
      ),
    };
  }

  // Стан «у нормі»: єдине, що тут варто сказати, — де орієнтир. І тільки коли
  // накрутка справді нижча за нього: інакше це похвала без приводу.
  if (benchmark && markupRate < benchmark.rate) {
    const gap = pricing.costTotal * ((benchmark.rate - markupRate) / 100);
    // Розділяємо не за правом, а за мовою вигляду: у бек-офісу (СЕО,
    // бухгалтерія, проджект) це опис чужого рішення, у менеджера — підказка
    // про власні гроші.
    if (view.showEconomics) {
      return {
        tone: "info",
        icon: Info,
        text: (
          <>
            Менеджер поставив {formatRate(markupRate)} при орієнтирі {formatRate(benchmark.rate)} — на{" "}
            {formatCurrency(gap, currency)} нижче типового для цієї позиції.
          </>
        ),
      };
    }
    return {
      tone: "info",
      icon: Info,
      text: (
        <>
          <b className="font-semibold">Орієнтир для цієї позиції — {formatRate(benchmark.rate)}.</b> Це не
          стеля й не вимога: на такому замовленні зазвичай виходить на {formatCurrency(gap, currency)}{" "}
          більше.
        </>
      ),
    };
  }

  return null;
}

function EconomicsBreakdown({
  pricing,
  view,
  currency,
  benchmark,
  benchmarkLoading,
  managerName,
}: {
  pricing: RunSalePricing;
  view: QuoteMarkupView;
  currency?: string | null;
  benchmark: MarkupBenchmark | null;
  benchmarkLoading?: boolean;
  managerName?: string | null;
}) {
  const off = pricing.costTotal <= 0;
  const total = off ? 1 : pricing.saleTotal;
  const width = (value: number) => (off ? 0 : Math.max(0, (value / total) * 100));

  return (
    <div className="mt-3">
      <div
        className={cn(
          "flex h-2.5 overflow-hidden rounded-full border border-border/60 bg-muted",
          off && "opacity-50"
        )}
      >
        <span style={{ width: `${width(pricing.costTotal)}%` }} className="block h-full bg-muted-foreground/55" />
        <span style={{ width: `${width(pricing.requiredGrossProfit)}%` }} className="block h-full bg-primary" />
        <span style={{ width: `${width(pricing.fixedCosts)}%` }} className="block h-full bg-primary/45" />
        <span style={{ width: `${width(pricing.vatAmount)}%` }} className="block h-full bg-primary/20" />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-2xs text-muted-foreground">
        {[
          ["bg-muted-foreground/55", "собівартість", pricing.costTotal],
          ["bg-primary", "прибуток", pricing.requiredGrossProfit],
          ["bg-primary/45", "постійні", pricing.fixedCosts],
          ["bg-primary/20", "ПДВ", pricing.vatAmount],
        ].map(([dot, label, value]) => (
          <span key={label as string} className="inline-flex items-center gap-1.5">
            <span className={cn("h-2 w-2 shrink-0 rounded-sm", dot as string)} />
            {label as string} {off ? "—" : formatCurrency(value as number, currency)}
          </span>
        ))}
      </div>
      {/* Накрутки й ціни за штуку тут навмисно немає: обидві стоять у полі
          вище й у великому числі поруч. Лишається те, чого більше ніде не видно. */}
      <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 border-t border-border/60 pt-3 text-xs">
        {view.income ? (
          <>
            <dt className="text-muted-foreground">
              {view.income === "own"
                ? "Твій заробіток"
                : `Заробіток менеджера${managerName ? ` (${managerName})` : ""}`}
            </dt>
            <dd className="text-right font-medium tabular-nums">
              {off ? "—" : formatCurrency(pricing.managerIncome, currency)}
            </dd>
          </>
        ) : null}
        <dt className="text-muted-foreground">Орієнтир на цій позиції</dt>
        <dd className="text-right font-medium tabular-nums">
          {benchmarkLoading
            ? "…"
            : benchmark
              ? `${formatRate(benchmark.rate)} · ${formatMarkupBenchmarkBasis(benchmark.basis)}`
              : "замало даних"}
        </dd>
        <dt className="text-muted-foreground">Дно</dt>
        <dd className="text-right font-medium tabular-nums">{MIN_MARKUP_RATE} %</dd>
      </dl>
    </div>
  );
}

export function QuoteRunMarkupPanel({
  view,
  state,
  pricing,
  markupRate,
  currency,
  benchmark,
  benchmarkLoading,
  canEditMarkup,
  canApprove,
  managerName,
  deciderName,
  busy,
  onChangeMarkupRate,
  onRequestApproval,
  onDecide,
}: QuoteRunMarkupPanelProps) {
  const off = pricing.costTotal <= 0;
  // Три РІЗНІ питання, які легко злити в одне й отримати або зайвий повзунок,
  // або замкнене поле там, де воно має рухатись:
  //   view.hasSlider   — чи є повзунок у цієї посади взагалі;
  //   canEditMarkup    — чи належить їй поле накрутки;
  //   isMarkupFrozen   — чи не заморожене число зараз запитом.
  const frozen = state.kind === "pending" || state.kind === "approved";
  // Бурштиновою заливка стає рівно тоді, коли ЗАМКНЕНІ ДВЕРІ, — не «нижче
  // дна». Підтверджена накрутка теж нижче дна, але вона вже дозволена, і
  // тривожити нею око нема за що: бейдж на ній зелений, заливка синя.
  const doorsClosed = !off && isMarkupBlockingRelease(state);
  const canMove = view.hasSlider && canEditMarkup && !off && !frozen;
  const note = markupNote({
    state,
    view,
    canApprove,
    pricing,
    markupRate,
    benchmark,
    currency,
    managerName,
    deciderName,
  });
  const NoteIcon = note?.icon ?? Info;
  const showRequestButton = canEditMarkup && canRequestMarkupApproval(state);
  const showDecideButtons = canApprove && state.kind === "pending";

  // Два підписи, що стоять надто близько, злипаються в кашу. Орієнтир важливіший:
  // дно й так видно червоною зоною, і його число повторене в розкладі нижче.
  // Поріг у 9 пунктів шкали — це приблизно ширина «дно 20 %» на цій смузі.
  const showFloorLabel =
    !benchmark || Math.abs(pctOfTrack(benchmark.rate) - pctOfTrack(MIN_MARKUP_RATE)) > 9;

  const track = (
    <>
      {/*
        РЕЙКА, ПОВЗУНОК, ПОРОГИ — три яруси, а не все в одній смузі.

        До 30.08.2026 це була смуга 28 px, у якій впритул стояли чотири тонкі
        кольорові вертикалі: правий бордер заливки, хвіст повзунка, риска дна й
        риска орієнтира. Вони стикались і читались як заклепка, а не як
        повзунок. Плюс бордер заливки був `border-r-2` при `border-box`, тобто
        лежав УСЕРЕДИНІ її ширини — центр риски виходив на 1 px лівіше за край,
        а повзунок центрувався по краю. Звідси видимий зсув кружечка.

        Тепер: тонка рейка з суцільною заливкою, повзунок рівно на її кінці й
        БЕЗ бордера (нічому вилазити за кружечок), а пороги — окремим ярусом під
        рейкою, кожен рівно над своїм підписом. Кольори більше ніде не стикаються.
      */}
      <div className={cn("relative flex h-4 items-center", off && "opacity-50")}>
        <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
          {off ? null : (
            <div
              className={cn(
                "absolute inset-y-0 left-0 rounded-full",
                // Колір заливки несе стан дверей, а не «нижче дна»: підтверджена
                // накрутка теж нижче дна, але тривожити нею око нема за що.
                doorsClosed ? "bg-warning-solid" : "bg-primary"
              )}
              style={{ width: `${pctOfTrack(markupRate)}%` }}
            />
          )}
        </div>
        {off ? null : (
          <div
            className={cn(
              "pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-background",
              canMove ? "shadow-sm" : "opacity-70",
              doorsClosed ? "border-warning-solid" : "border-primary"
            )}
            style={{ left: `${pctOfTrack(markupRate)}%` }}
            aria-hidden
          />
        )}
        {canMove ? (
          <input
            type="range"
            min={0}
            max={TRACK_MAX}
            step={1}
            value={Math.min(TRACK_MAX, Math.round(markupRate))}
            disabled={busy}
            onChange={(event) => onChangeMarkupRate(Number(event.target.value))}
            className="absolute inset-0 m-0 h-full w-full cursor-grab opacity-0 active:cursor-grabbing"
            aria-label="Накрутка на собівартість, відсотки"
          />
        ) : null}
      </div>
      {/* Пороги живуть ПІД рейкою, а не в ній: так вони нічого не перетинають і
          стоять рівно над своїми підписами — око веде «риска → число» вертикаллю. */}
      <div className="relative mt-1 h-1.5" aria-hidden>
        <span
          className="absolute inset-y-0 w-0.5 -translate-x-1/2 rounded-full bg-destructive/70"
          style={{ left: `${pctOfTrack(MIN_MARKUP_RATE)}%` }}
        />
        {benchmark ? (
          <span
            className="absolute inset-y-0 w-0.5 -translate-x-1/2 rounded-full bg-success-solid"
            style={{ left: `${pctOfTrack(benchmark.rate)}%` }}
          />
        ) : null}
      </div>
      {/* Підпис стоїть ПІД своєю відміткою, а не рівномірно по ширині.
          Було `justify-between` — чотири слова розкидані порівну, і на смузі
          870 px «дно 20 %» опинялось на 30,9 % замість 16,6 %, а «орієнтир
          54,08 %» — на 64,9 % замість 45,2 %. Розбіг 124 і 171 піксель:
          підпис показував не туди, куди показує риска. Успадковано з
          прототипу, де числа були такі, що це не впадало в око. */}
      <div className="relative mt-0.5 h-4 text-2xs tabular-nums text-muted-foreground">
        <span className="absolute left-0 whitespace-nowrap">0 %</span>
        {showFloorLabel ? (
          <span
            className="absolute -translate-x-1/2 whitespace-nowrap"
            style={{ left: `${pctOfTrack(MIN_MARKUP_RATE)}%` }}
          >
            дно {MIN_MARKUP_RATE} %
          </span>
        ) : null}
        {benchmark ? (
          <span
            className="absolute -translate-x-1/2 whitespace-nowrap text-success-foreground"
            style={{ left: `${pctOfTrack(benchmark.rate)}%` }}
          >
            орієнтир {formatRate(benchmark.rate)}
          </span>
        ) : (
          <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap">
            {benchmarkLoading ? "рахуємо орієнтир…" : "орієнтира немає"}
          </span>
        )}
        <span className="absolute right-0 whitespace-nowrap">{TRACK_MAX} %</span>
      </div>
    </>
  );

  return (
    <div className="mt-4 rounded-xl border border-border/60 bg-muted/[0.03] p-4">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-foreground">Накрутка і ціна</span>
        <span className="flex items-center gap-2">
          {canEditMarkup ? null : (
            <span className="inline-flex items-center gap-1 text-2xs text-muted-foreground">
              <Eye className="h-3 w-3" />
              тільки очима
            </span>
          )}
          <StateBadge state={state} />
        </span>
      </div>

      {view.layout === "headline" ? (
        <>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="font-mono text-2xl font-semibold leading-tight tabular-nums text-foreground">
                {off ? "—" : formatCurrency(pricing.saleTotal, currency)}
              </div>
              <div className="mt-0.5 text-2xs text-muted-foreground">
                {off
                  ? "ціна з'явиться з собівартістю"
                  : `${formatCurrency(pricing.saleUnitPrice ?? 0, currency)} за штуку · накрутка ${formatRate(markupRate)} · ${formatCurrency(pricing.markupTotal, currency)}`}
              </div>
            </div>
            {view.income === "own" ? (
              <div className="text-right">
                <div className="text-2xs text-muted-foreground">твій заробіток</div>
                <div className="font-mono text-base font-semibold tabular-nums text-foreground">
                  {off ? "—" : formatCurrency(pricing.managerIncome, currency)}
                </div>
              </div>
            ) : null}
          </div>
          {track}
        </>
      ) : (
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
          <div className="font-mono text-2xl font-semibold leading-tight tabular-nums text-foreground">
            {off ? "—" : formatCurrency(pricing.saleTotal, currency)}
          </div>
          <div className="text-2xs text-muted-foreground">
            {off ? "чекає на собівартість" : `накрутка ${formatRate(markupRate)}`}
            {managerName ? ` · веде ${managerName}` : ""}
          </div>
        </div>
      )}

      {view.showEconomics ? (
        <EconomicsBreakdown
          pricing={pricing}
          view={view}
          currency={currency}
          benchmark={benchmark}
          benchmarkLoading={benchmarkLoading}
          managerName={managerName}
        />
      ) : null}

      {note ? (
        <div
          className={cn(
            "mt-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-2xs leading-relaxed",
            NOTE_CLASS[note.tone]
          )}
        >
          <NoteIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div>{note.text}</div>
        </div>
      ) : null}

      {showRequestButton || showDecideButtons ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {showRequestButton ? (
            <Button size="sm" className="h-8" disabled={busy} onClick={onRequestApproval}>
              {state.kind === "rejected" ? "Надіслати запит наново" : "Надіслати на погодження"}
            </Button>
          ) : null}
          {showDecideButtons ? (
            <>
              <Button size="sm" className="h-8" disabled={busy} onClick={() => onDecide("approved")}>
                Підтвердити {formatRate(state.approval.markupRate)}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 border-destructive/45 text-destructive hover:bg-destructive/10"
                disabled={busy}
                onClick={() => onDecide("rejected")}
              >
                Відхилити
              </Button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
