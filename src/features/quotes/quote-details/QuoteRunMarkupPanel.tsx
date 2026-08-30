import { useState } from "react";

import { Check, ChevronDown, CircleAlert, Clock, Eye, Info, Lock } from "lucide-react";

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

import { SplitBar, type SplitPart } from "@/components/app/bento";

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

/**
 * Стан говорить КРАПКОЮ, а не заливкою (REQ-175#p54).
 *
 * Записка стояла в жовтому прямокутнику на всю ширину блока цін — і поруч із
 * такими самими жовтими плашками вгорі сторінки це читалось як «тут аварія»,
 * хоч дно нічого не блокує. Тепер тон — сім пікселів кольору перед рядком;
 * решта фарби лишається числам.
 */
const DOT_CLASS: Record<BadgeTone, string> = {
  mute: "bg-muted-foreground/50",
  // *-solid, а не *-foreground: у токенів це рівно та роль — «суцільні
  // заливки без тексту, крапки статусів». Текстовий бурштин у світлій темі
  // темний (26° 32 %), бо мусить триматись на світлому тлі, і крапка з нього
  // виходила брунатною; --warning-solid — справжній бурштин (41° 46,5 %), а в
  // темній темі світліший (42° 62 %).
  ok: "bg-success-solid",
  info: "bg-info-foreground",
  warn: "bg-warning-solid",
  bad: "bg-destructive",
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
}): {
  tone: BadgeTone;
  text: React.ReactNode;
  /** Те, що не влазить у рядок, але потрібне, щоб ухвалити рішення. */
  details: Array<{ label: string; value: string }>;
} | null {
  const { state, view, canApprove, pricing, markupRate, benchmark, currency } = params;
  const who = params.managerName?.trim() || "Менеджер";
  const decider = params.deciderName?.trim() || "Погоджувач";
  const money = (value: number) => formatCurrency(value, currency);
  const WHO_SIGNS = "Двоє СЕО або головний бухгалтер";
  const OPENS = "КП клієнту й перехід у «Затверджено»";

  if (state.kind === "draft") {
    return {
      tone: "mute",
      text: "Ціни ще немає: собівартість вносить проєктний менеджер. Смуга ввімкнеться разом із нею.",
      details: [],
    };
  }

  if (state.kind === "pending") {
    const sent = formatDateTime(state.approval.requestedAt);
    // Ціну на дні й ціну запиту рахуємо тут-таки, щоб ніхто не тримав
    // арифметику в голові: рішення ухвалюють про гроші, а не про відсотки.
    const floorSale = state.approval.costTotal * (1 + MIN_MARKUP_RATE / 100);
    const askedSale = state.approval.costTotal * (1 + state.approval.markupRate / 100);
    const pendingDetails = [
      { label: "Просить", value: sent ? `${who} · ${sent}` : who },
      { label: "Просить накрутку", value: `${formatRate(state.approval.markupRate)} замість ${MIN_MARKUP_RATE} %` },
      { label: "Ціна на дні", value: money(floorSale) },
      { label: "Ціна за запитом", value: `${money(askedSale)} · нижче на ${money(floorSale - askedSale)}` },
      { label: "Собівартість, при якій рахували", value: money(state.approval.costTotal) },
      { label: "Чекаємо на", value: WHO_SIGNS },
      ...(state.approval.requestNote
        ? [{ label: "Пояснення", value: `«${state.approval.requestNote}»` }]
        : []),
      { label: "Поле накрутки", value: "Заморожене до відповіді" },
    ];
    if (canApprove) {
      return {
        tone: "warn",
        details: pendingDetails,
        text: (
          <>
            <b className="font-semibold text-foreground">
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
      details: pendingDetails,
      text: (
        <>
          <b className="font-semibold text-foreground">Запит надіслано{sent ? ` ${sent}` : ""}.</b> Чекаємо на будь-кого з
          трьох: двоє СЕО і головний бухгалтер. Рахувати й зберігати можна далі.
        </>
      ),
    };
  }

  if (state.kind === "rejected") {
    const when = formatDateTime(state.approval.decidedAt);
    return {
      tone: "bad",
      details: [
        { label: "Відхилив", value: when ? `${decider} · ${when}` : decider },
        ...(state.approval.decisionNote
          ? [{ label: "Причина", value: `«${state.approval.decisionNote}»` }]
          : []),
        { label: "Просили", value: formatRate(state.approval.markupRate) },
        { label: "Число в тиражі", value: `Лишилось ${formatRate(markupRate)} — саме не відкотиться` },
        { label: "Замкнено", value: OPENS },
        { label: "Хто може підписати", value: WHO_SIGNS },
      ],
      text: (
        <>
          <b className="font-semibold text-foreground">
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
      tone: "ok",
      details: [
        { label: "Підтвердив", value: when ? `${decider} · ${when}` : decider },
        { label: "Погоджено накрутку", value: formatRate(state.approval.markupRate) },
        { label: "При собівартості", value: money(state.approval.costTotal) },
        ...(state.approval.decisionNote
          ? [{ label: "Коментар", value: `«${state.approval.decisionNote}»` }]
          : []),
        { label: "Відкрито", value: OPENS },
        { label: "Запит відкриється наново", value: "Якщо накрутка або собівартість піде вниз" },
      ],
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
    const floorSale = pricing.costTotal * (1 + MIN_MARKUP_RATE / 100);
    const underDetails = [
      { label: "Накрутка зараз", value: `${formatRate(markupRate)} · дно ${MIN_MARKUP_RATE} %` },
      { label: "Ціна на дні", value: money(floorSale) },
      { label: "Ціна зараз", value: `${money(pricing.saleTotal)} · нижче на ${money(floorSale - pricing.saleTotal)}` },
      { label: "Підписати можуть", value: WHO_SIGNS },
      { label: "Підпис відкриє", value: OPENS },
      { label: "Що не блокується", value: "Рахунок, редагування, збереження" },
    ];
    if (canApprove) {
      return {
        tone: "warn",
        details: underDetails,
        text: (
          <>
            <b className="font-semibold text-foreground">
              {who} веде ціну нижче дна {MIN_MARKUP_RATE} %.
            </b>{" "}
            Запит прийде вам, щойно його надішлють.
          </>
        ),
      };
    }
    return {
      tone: "warn",
      details: underDetails,
      text: (
        <>
          <b className="font-semibold text-foreground">Нижче дна {MIN_MARKUP_RATE} %.</b> Рахувати й зберігати можна далі,
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
    const benchmarkDetails = [
      { label: "Накрутка зараз", value: formatRate(markupRate) },
      { label: "Орієнтир позиції", value: `${formatRate(benchmark.rate)} · ${formatMarkupBenchmarkBasis(benchmark.basis)}` },
      { label: "Різниця в грошах", value: money(gap) },
    ];
    if (view.showEconomics) {
      return {
        tone: "info",
        details: benchmarkDetails,
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
      details: benchmarkDetails,
      text: (
        <>
          <b className="font-semibold text-foreground">Орієнтир для цієї позиції — {formatRate(benchmark.rate)}.</b> Це не
          стеля й не вимога: на такому замовленні зазвичай виходить на {formatCurrency(gap, currency)}{" "}
          більше.
        </>
      ),
    };
  }

  return null;
}

/**
 * Розклад ціни — смуга часток із легендою. Тільки смуга: числа, які раніше йшли
 * під нею окремим списком (заробіток, орієнтир, дно), розійшлися по своїх
 * місцях — орієнтир у шапку накрутки, заробіток і дно у виноску (REQ-155 p3).
 * Список під смугою повторював те, що вже сказано поруч, і робив із двох
 * повідомлень одне довге.
 */
function PriceSplit({
  pricing,
  currency,
}: {
  pricing: RunSalePricing;
  currency?: string | null;
}) {
  const off = pricing.costTotal <= 0;

  /**
   * Смуга часток — КАНОНІЧНА `SplitBar` з bento.tsx, а не своя копія.
   *
   * Своя тут була, і вона розходилась із рештою CRM у дрібницях, які й роблять
   * інтерфейс чужим: сегменти впритул замість зазору 3 px, рамка навколо смуги,
   * квадратик легенди 8 px замість 10, текст 2xs замість xs. Та сама смуга
   * стоїть в «Огляді», «Витратах» і «Стеку» — третьої редакції їй не треба.
   */
  const parts: SplitPart[] = [
    { key: "cost", label: "собівартість", weight: pricing.costTotal, color: "bg-muted-foreground/55" },
    { key: "profit", label: "прибуток", weight: pricing.requiredGrossProfit, color: "bg-primary" },
    { key: "fixed", label: "постійні", weight: pricing.fixedCosts, color: "bg-primary/45" },
    { key: "vat", label: "ПДВ", weight: pricing.vatAmount, color: "bg-primary/20" },
  ].map((part) => ({ ...part, valueText: formatCurrency(part.weight, currency) }));

  return (
    <div className="mt-3">
      {off ? (
        <div className="flex h-2.5 overflow-hidden rounded-full bg-muted opacity-50" aria-hidden />
      ) : (
        <SplitBar parts={parts} />
      )}
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
  // Подробиці згорнуті за замовчуванням: у щоденній роботі стан читають, а не
  // розбирають. Розгорнув один раз — лишається розгорнутим, поки не закриють.
  const [detailsOpen, setDetailsOpen] = useState(false);
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
      <div className={cn("relative", off && "opacity-50")}>
        {/* Трохи повітря зверху: лінія порогу починається НАД рейкою, інакше
            вона впирається в неї й перестає читатись як наскрізна. */}
        <div className="h-1.5" aria-hidden />
        <div className="relative flex h-4 items-center">
          <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted">
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
                "pointer-events-none absolute top-1/2 z-20 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-background ring-2 ring-card",
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
              className="absolute inset-0 z-30 m-0 h-full w-full cursor-grab opacity-0 active:cursor-grabbing"
              aria-label="Накрутка на собівартість, відсотки"
            />
          ) : null}
        </div>
        {/* Хвіст лінії — донизу, до самого підпису. Коротко: підпис має
            сидіти під рейкою, а не висіти окремо від неї. */}
        <div className="h-1.5" aria-hidden />

        {/* ПОРОГИ — НАСКРІЗНІ ЛІНІЇ.
            Ідуть від підпису вгору ЧЕРЕЗ рейку, а не тиснуться під нею коротким
            штрихом. Так поріг видно навіть тоді, коли заливка вже його минула, а
            підпис унизу й місце на рейці зв'язані однією лінією, а не здогадом.
            Лежать НАД заливкою (z-10) і ПІД повзунком (z-20): перекреслений
            кружечок виглядав би поламаним. */}
        <span
          className="pointer-events-none absolute inset-y-0 z-10 w-0.5 -translate-x-1/2 rounded-full bg-destructive/70"
          style={{ left: `${pctOfTrack(MIN_MARKUP_RATE)}%` }}
          aria-hidden
        />
        {benchmark ? (
          <span
            className="pointer-events-none absolute inset-y-0 z-10 w-0.5 -translate-x-1/2 rounded-full bg-success-solid"
            style={{ left: `${pctOfTrack(benchmark.rate)}%` }}
            aria-hidden
          />
        ) : null}
      </div>
      {/* Підпис стоїть ПІД своєю відміткою, а не рівномірно по ширині.
          Було `justify-between` — чотири слова розкидані порівну, і на смузі
          870 px «дно 20 %» опинялось на 30,9 % замість 16,6 %, а «орієнтир
          54,08 %» — на 64,9 % замість 45,2 %. Розбіг 124 і 171 піксель:
          підпис показував не туди, куди показує риска. Успадковано з
          прототипу, де числа були такі, що це не впадало в око. */}
      <div className="relative h-4 text-2xs tabular-nums text-muted-foreground">
        <span className="absolute left-0 whitespace-nowrap">0 %</span>
        {showFloorLabel ? (
          <span
            className="absolute -translate-x-1/2 whitespace-nowrap text-destructive/80"
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

  /**
   * НАКРУТКА І ЦІНА — ДВА ЯРУСИ НА ВСЮ ШИРИНУ (REQ-155 p3).
   *
   * До 30.08.2026 це була одна коробка з рамкою, у якій порядок ярусів залежав
   * від посади: менеджеру спершу велике число ціни, бек-офісу — розклад. Дві
   * різні відповіді на питання «що тут головне» коштували дорожче, ніж давали:
   * розмову про один екран доводилось вести двома мовами, а сама коробка була
   * вужча за картку й тиснула смугу часток у половину доступної ширини.
   *
   * Тепер порядок один для всіх і йде за ходом думки: спершу ЧОМУ така ціна
   * (накрутка на шкалі між дном і орієнтиром), потім СКІЛЬКИ вийшло (число,
   * ціна за штуку, з чого складається). Що саме показати з другого ярусу, і далі
   * вирішує посада — `view.showEconomics`.
   *
   * Заробіток менеджера пішов у виноску внизу: це не крок розрахунку, а його
   * наслідок, і в стовпчику з ПДВ та постійними він читався як ще одна складова
   * ціни.
   */
  return (
    <div className="mt-4 space-y-4">
      {/* ЯРУС ПЕРШИЙ — накрутка. Шкала між дном і орієнтиром відповідає на
          «чому саме стільки», і з неї починається розмова про ціну. */}
      <div className="border-t border-border/40 pt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5">
          <span className="text-sm font-semibold text-foreground">
            Накрутка на собівартість{" "}
            <span className="font-normal tabular-nums text-muted-foreground">{formatRate(markupRate)}</span>
          </span>
          <span className="flex flex-wrap items-center gap-2 text-2xs text-muted-foreground">
            орієнтир на цій позиції
            <span className="font-medium text-foreground">
              {benchmarkLoading
                ? "…"
                : benchmark
                  ? `${formatRate(benchmark.rate)} · ${formatMarkupBenchmarkBasis(benchmark.basis)}`
                  : "замало даних"}
            </span>
            {canEditMarkup ? null : (
              <span className="inline-flex items-center gap-1">
                <Eye className="h-3 w-3" />
                тільки очима
              </span>
            )}
            <StateBadge state={state} />
          </span>
        </div>
        <div className="mt-2.5">{track}</div>
      </div>

      {/* ЯРУС ДРУГИЙ — ціна. Скільки вийшло і, кому належить бачити, з чого. */}
      <div className="border-t border-border/40 pt-4">
        <span className="text-sm font-semibold text-foreground">
          {off ? "Ціна" : `Ціна з накруткою ${formatRate(markupRate)}`}
        </span>
        <div className="mt-1.5 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
          <div className="text-3xl font-semibold leading-none tracking-tight tabular-nums text-foreground">
            {off ? "—" : formatCurrency(pricing.saleTotal, currency)}
          </div>
          <div className="text-xs text-muted-foreground">
            {off
              ? "ціна з'явиться з собівартістю"
              : `${formatCurrency(pricing.saleUnitPrice ?? 0, currency)} за штуку · націнка ${formatCurrency(pricing.markupTotal, currency)}`}
          </div>
        </div>
        {view.showEconomics ? <PriceSplit pricing={pricing} currency={currency} /> : null}
      </div>

      {/*
        ЯРУС СТАНУ — ОДИН РЯДОК, А ПОДРОБИЦІ ПІД НИМ (REQ-175#p54).

        Було: жовтий прямокутник на всю ширину, під ним окремим ярусом кнопка.
        Два блоки на одну думку, і колір такий самий, як у попереджень угорі
        сторінки, — хоч дно нічого не блокує, а лише вмикає погодження.

        Стало: крапка тону, речення, дія — в один рядок. Усе, що потрібно, аби
        ухвалити рішення й не рахувати в голові (хто просить, скільки замість
        скількох, ціна на дні проти ціни запиту, хто підписує, що підпис
        відкриє), лежить під «Що це означає» й не займає місця, поки не спитали.
      */}
      {note || showRequestButton || showDecideButtons ? (
        /*
          БЕЗ ВЛАСНОЇ РИСКИ. Ярус ціни вже має свою зверху, виноска — свою
          знизу; третя посередині рубала блок на смужки, і поруч вони читались
          як випадкові. Стан належить ярусу ціни, а не окремій секції — його
          відділяє проміжок.
        */
        <div className="mt-1 rounded-lg border border-border/60 bg-muted/60 px-3 py-2.5">
          {/* items-center: контроли на 28 px і рядок тексту на 17 вирівнюються
              по середині, а не по верхньому краю — саме тому кнопки й напис
              стояли сходинкою. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {note ? (
              <>
                <span
                  className={cn("h-1.5 w-1.5 shrink-0 rounded-full", DOT_CLASS[note.tone])}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 text-2xs leading-relaxed text-muted-foreground">
                  {note.text}
                </span>
              </>
            ) : (
              <span className="flex-1" />
            )}

            {note && note.details.length > 0 ? (
              <button
                type="button"
                onClick={() => setDetailsOpen((open) => !open)}
                aria-expanded={detailsOpen}
                className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-border/60 px-2.5 text-2xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                Що це означає
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", detailsOpen && "rotate-180")} />
              </button>
            ) : null}

            {showRequestButton ? (
              <Button size="sm" className="h-7 shrink-0" disabled={busy} onClick={onRequestApproval}>
                {state.kind === "rejected" ? "Надіслати запит наново" : "Надіслати на погодження"}
              </Button>
            ) : null}
            {showDecideButtons ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0"
                  disabled={busy}
                  onClick={() => onDecide("rejected")}
                >
                  Відхилити
                </Button>
                <Button size="sm" className="h-7 shrink-0" disabled={busy} onClick={() => onDecide("approved")}>
                  Підтвердити {formatRate(state.approval.markupRate)}
                </Button>
              </>
            ) : null}
          </div>

          {note && detailsOpen && note.details.length > 0 ? (
            <div className="mt-3 grid gap-x-8 gap-y-1.5 border-t border-border/40 pt-3 sm:grid-cols-2">
              {note.details.map((row) => (
                <div key={row.label} className="flex items-baseline justify-between gap-4 text-2xs">
                  <span className="min-w-0 text-muted-foreground">{row.label}</span>
                  <span className="min-w-0 text-right font-medium tabular-nums text-foreground">
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ВИНОСКА. Два факти, які треба тримати в полі зору, але жоден із них не
          крок розрахунку: скільки з цієї ціни заробить менеджер і що дно —
          поріг погодження, а не заборона зберігати. У стовпчику разом із ПДВ
          і постійними заробіток читався як ще одна складова ціни, а дно —
          як межа, за яку не пускають. */}
      <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-border/40 pt-3 text-2xs text-muted-foreground">
        {view.income ? (
          <span>
            {view.income === "own"
              ? "Твій заробіток"
              : `Заробіток менеджера${managerName ? ` (${managerName})` : ""}`}{" "}
            <span className="font-medium tabular-nums text-foreground">
              {off ? "—" : formatCurrency(pricing.managerIncome, currency)}
            </span>
          </span>
        ) : null}
        <span>Дно {MIN_MARKUP_RATE} % вмикає погодження, а не блокує збереження</span>
      </div>
    </div>
  );
}
