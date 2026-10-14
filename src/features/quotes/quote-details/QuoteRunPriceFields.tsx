import { useRef } from "react";

import { AlertTriangle } from "@/components/icons/appIcons";

import { Label } from "@/components/ui/label";
import { SEGMENTED_GROUP_SM, SEGMENTED_TRIGGER_SM } from "@/components/ui/controlStyles";
import { SegmentedGroup } from "@/components/ui/segmented-group";
import { CurrencyAmountInput } from "@/features/quotes/components/CurrencyAmountInput";
import { PercentAmountInput } from "@/features/quotes/components/PercentAmountInput";
import { cn } from "@/lib/utils";
import type { QuoteRunMarkupState } from "@/lib/quoteMarkupApproval";
import {
  markupRateForUnitPrice,
  MODEL_PRICE_VAT_LABEL,
  roundUnitPrice,
  normalizeQuoteRunModelPriceVat,
  type QuoteRunModelPriceVat,
  type RunSalePricing,
} from "@/lib/quoteRuns";
import {
  defaultMarkupRateFor,
  formatRatePercent,
  type QuoteDealType,
} from "@/lib/quoteDealType";
import type { QuoteRunPriceFieldAccess } from "@/lib/permissions";
import type { QuoteRun } from "@/lib/toshoApi";

import { formatCurrency } from "./config";

/**
 * Чотири поля ціни тиражу: вартість товару, нанесення, логістика, накрутка.
 *
 * КОЖНЕ НАЛЕЖИТЬ СВОЇЙ ПОСАДІ (REQ-149 p7), і саме тому вони живуть разом, а не
 * розкидані по картці: поруч видно, хто що веде. Матриця — у
 * `canEditQuoteRunPriceField`, її дзеркало — тригер у базі; тут лише показ.
 *
 * Винесено зі сторінки під ратчет розміру (scripts/check-file-growth.mjs).
 */

type PriceField = "unit_price_model" | "unit_price_print" | "logistics_cost";

const COST_FIELDS: Array<{ field: PriceField; label: string; who: string; aria: string }> = [
  {
    field: "unit_price_model",
    // Не «собівартість» (REQ-229): цим словом на картці називається СУМА
    // товар + нанесення + логістика — та сама, на яку йде накрутка й на якій
    // стоїть дно 20 %. Одне слово на дві різні величини читалось так, ніби
    // накрутка рахується від закупівельної ціни моделі.
    // Підпис скорочено під сусіда «В-ть нанесення»: колонка вузька, і повна
    // назва з'їдала два рядки. Повне слово лишається в `aria` — читалка й
    // тести звуть поле по-людськи, бо у <Label> тут немає htmlFor.
    label: "В-ть товару / од",
    who: "проєктний менеджер",
    aria: "Вартість товару за одиницю",
  },
  { field: "unit_price_print", label: "В-ть нанесення", who: "проєктний менеджер", aria: "Вартість нанесення" },
  {
    field: "logistics_cost",
    label: "Логістика",
    who: "проєктний менеджер або логіст",
    aria: "Логістика",
  },
];

/**
 * Ціна за штуку, з якої рахується накрутка (REQ-332).
 *
 * ЗАКРІПЛЮЄТЬСЯ НА ВИХОДІ З ПОЛЯ, а не на кожній цифрі. Поле накрутки поруч
 * віддає число одразу, і там це безпечно: «1» на шляху до «16» — теж накрутка.
 * А «1» на шляху до «1020» — ціна нижче собівартості, тобто накрутка 0 %:
 * автозбереження, що спрацьовує за ~3 с, записало б її в базу посеред набору,
 * а смуга й бейдж миготіли б «Треба погодження». Порожнє поле нічого не міняє:
 * стерти ціну не означає попросити нульову накрутку.
 */
function UnitPriceInput({
  pricing,
  currency,
  onMarkupRate,
}: {
  pricing: RunSalePricing;
  currency?: string | null;
  onMarkupRate: (rate: number) => void;
}) {
  const typed = useRef<number | null>(null);
  return (
    <CurrencyAmountInput
      value={pricing.saleUnitPrice}
      emptyValue={null}
      onFocus={() => {
        typed.current = null;
      }}
      onValueChange={(next) => {
        typed.current = next;
      }}
      onBlur={() => {
        // Клік у поле й назад теж проходить через blur — і віддає ту саму ціну.
        // Перерахунок із неї зсунув би 16,9 % на 16,8999… й запустив збереження
        // на порожньому місці.
        if (typed.current === null || roundUnitPrice(typed.current) === pricing.saleUnitPrice) return;
        const rate = markupRateForUnitPrice({
          quantity: pricing.quantity,
          costTotal: pricing.costTotal,
          unitPrice: typed.current,
        });
        typed.current = null;
        if (rate !== null) onMarkupRate(rate);
      }}
      min={0}
      currency={currency ?? undefined}
      aria-label="Ціна за одиницю"
      title="Впишіть ціну — накрутка порахується сама"
      className="h-9 rounded-lg text-sm font-semibold"
    />
  );
}

export function QuoteRunPriceFields({
  run,
  pricing,
  access,
  markupState,
  markupFrozen,
  dealType,
  currency,
  lockHint,
  onChange,
  modelPriceVatMissing,
  onModelPriceVatChange,
}: {
  run: QuoteRun;
  pricing: RunSalePricing;
  access: QuoteRunPriceFieldAccess;
  markupState: QuoteRunMarkupState;
  markupFrozen: boolean;
  /** Тип угоди — з нього підказка в порожньому полі накрутки (REQ-182). */
  dealType: QuoteDealType | null | undefined;
  currency?: string | null;
  /** Підказка «це поле заповнює …» зі сторінки — вона знає статусний гейт. */
  lockHint: (allowed: boolean, who: string) => string | undefined;
  onChange: (field: PriceField | "markup_rate", value: number | null) => void;
  /** Вартість товару щойно змінили, а з ПДВ вона чи без — не сказали (REQ-232). */
  modelPriceVatMissing: boolean;
  onModelPriceVatChange: (value: QuoteRunModelPriceVat) => void;
}) {
  const modelPriceVat = normalizeQuoteRunModelPriceVat(run.unit_price_model_vat);
  const belowFloor = markupState.kind !== "draft" && markupState.kind !== "ok";
  const canEditMarkup = access.markup_rate && !markupFrozen;
  const frozenLabel =
    markupState.kind === "pending" ? "заморожено до відповіді" : "заморожено — погоджено";

  return (
    // Стовпці перемикає ШИРИНА ЦЬОГО БЛОКУ, а не вікна (REQ-294), як і в
    // переліку тиражів над ним: поруч із рейкою обговорення колонка буває
    // вузькою при широкому вікні, а без рейки — широкою при вузькому.
    // Чотири — від 36rem, тобто від ~135 px на поле: вужче «з ПДВ / без ПДВ»
    // під сумою вже не стає в рядок.
    <div className="@container">
    <div className="grid gap-3 @min-[28rem]:grid-cols-2 @min-[36rem]:grid-cols-4">
      {COST_FIELDS.map(({ field, label, who, aria }) => (
        <div key={field} className="space-y-1.5">
          {/* Реченням, а не капсом (REQ-175#p33): підписи полів, заголовки
              ярусів ціни й назви груп специфікації малювались однаково —
              text-2xs uppercase tracking-wide, — тож жоден рівень не мав рангу.
              Український текст капсом на 10 px до того ж найважчий для читання
              з усього, що є на сторінці. */}
          <Label className="block min-h-5 text-xs font-normal leading-tight text-muted-foreground">
            {label}
          </Label>
          <CurrencyAmountInput
            value={run[field]}
            disabled={!access[field]}
            title={lockHint(access[field], who)}
            onValueChange={(next) => onChange(field, next)}
            min={0}
            aria-label={aria}
            currency={currency ?? undefined}
            // Тон помилки, а не попередження (REQ-242): бурштиновий тут не
            // відрізнявся від нейтральних підказок поруч, а стан за ним — «сума
            // НЕ збережена», тобто вже помилка, а не ризик. Своїх класів не
            // додаємо: `aria-invalid` бере канонічний вигляд помилкового поля з
            // дизайн-системи й заразом каже те саме скрінрідеру.
            aria-invalid={field === "unit_price_model" && modelPriceVatMissing}
          />
          {/* Позначка ПДВ стоїть ПІД сумою, а не в її підписі: це не уточнення
              назви поля, а окреме рішення, яке треба ухвалити (REQ-232). Три
              стани, і жодна кнопка не натиснута, поки не обрали, — саме цей стан
              тримає збереження. Чекбокс тут не годиться: його «вимкнено»
              неможливо відрізнити від «ще не дивився». */}
          {field === "unit_price_model" ? (
            <div className="space-y-1">
              <SegmentedGroup className={cn("inline-flex w-full", SEGMENTED_GROUP_SM)}>
                {(["incl", "excl"] as QuoteRunModelPriceVat[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    // `whitespace-nowrap` — не косметика: колонка вужча за
                    // 200 px, і «без ПДВ» ламалось на два рядки, роздуваючи
                    // групу вдвічі (побачено в прев'ю, не тестом).
                    className={cn(SEGMENTED_TRIGGER_SM, "whitespace-nowrap px-2")}
                    data-state={modelPriceVat === value ? "active" : "inactive"}
                    aria-label={`Вартість товару ${MODEL_PRICE_VAT_LABEL[value]}`}
                    disabled={!access.unit_price_model}
                    title={lockHint(access.unit_price_model, who)}
                    onClick={() => onModelPriceVatChange(value)}
                  >
                    {MODEL_PRICE_VAT_LABEL[value]}
                  </button>
                ))}
              </SegmentedGroup>
              {modelPriceVatMissing ? (
                <div className="flex items-start gap-1.5 text-xs font-medium leading-tight text-destructive">
                  <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
                  <span>
                    <span className="font-semibold">Тираж не збережено.</span> Оберіть, з ПДВ ця сума чи
                    без.
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ))}
      <div className="space-y-1.5">
        <Label className="block min-h-5 text-xs font-normal leading-tight text-muted-foreground">
          Накрутка на собівартість
        </Label>
        <PercentAmountInput
          // У полі — округлене до сотих, у базі лишається повне. Перенесені з
          // історії відсотки на кшталт 30,840579710144926 інакше виглядають як
          // збій, а округлити їх У СХОВИЩІ не можна: на собівартості в 4 644 ₴
          // два знаки зсувають ціну на копійки, а на великих тиражах — на
          // гривні (заміряно, до 8,39 ₴).
          value={Math.round(Number(run.markup_rate) * 100) / 100}
          disabled={!canEditMarkup}
          title={
            markupFrozen
              ? markupState.kind === "pending"
                ? "Заморожено до відповіді на запит погодження"
                : "Заморожено — накрутку погоджено"
              : lockHint(access.markup_rate, "менеджер")
          }
          onValueChange={(next) => onChange("markup_rate", next)}
          className={cn(belowFloor && "border-warning-soft-border focus-visible:ring-warning-soft-border/40")}
          placeholder={formatRatePercent(defaultMarkupRateFor(dealType))}
          min={0}
        />
        {/* Зв'язок між відсотком і грошима стоїть просто під полем і рахується
            наживо: без нього «40 %» — абстракція, і саме тому попереднє поле
            роками лишалось нулем. */}
        {pricing.costTotal > 0 ? (
          /* Було одним реченням: «дає націнку 10 415,27 UAH · ціна 1 587,09
             UAH». Воно перевалювало на другий рядок і читалось як фраза, хоч це
             дві величини. Тепер це дві пари підпис → число, вирівняні по
             правому краю, як у специфікації вище. */
          <div className={cn("space-y-0.5 text-xs", belowFloor ? "text-warning-copy" : "text-muted-foreground")}>
            <div className="flex items-baseline justify-between gap-3">
              <span>Націнка</span>
              <span className="font-semibold tabular-nums">{formatCurrency(pricing.markupTotal, currency)}</span>
            </div>
            {pricing.saleUnitPrice === null ? null : canEditMarkup ? (
              /*
                ЦІНА ВПИСУЄТЬСЯ, А НЕ ЛИШЕ ЧИТАЄТЬСЯ (REQ-332).

                Ціну з тендера чи договору відсотком не виставити навіть із
                сотими: на TS-1026-0002 0,01 % — це ~9 коп за штуку, і 1 020,00
                лежить між двома сусідніми сотими. Тому тут другі двері в те
                саме число: вписав ціну — накрутка рахується з повною точністю,
                а в полі вище показується округленою. Погодження нижче дна від
                цього не міняється: воно дивиться на відсоток, хоч яким шляхом
                той прийшов.
              */
              // Своїм рядком на всю ширину колонки: поруч із підписом поле не
              // вміщалось — на вузькій колонці «Ціна / од.» ламалось на три
              // рядки, а суфікс валюти обрізався (побачено в прев'ю).
              <div className="space-y-1 pt-1">
                <span className="block">Ціна / од.</span>
                <UnitPriceInput
                  pricing={pricing}
                  currency={currency}
                  onMarkupRate={(rate) => onChange("markup_rate", rate)}
                />
              </div>
            ) : (
              <div className="flex items-baseline justify-between gap-3">
                <span>Ціна / од.</span>
                <span className="font-semibold tabular-nums">
                  {formatCurrency(pricing.saleUnitPrice, currency)}
                </span>
              </div>
            )}
            {/*
              «Нижче дна 20 %» тут більше не пишемо (REQ-175#p59): рядок висів
              без значення в списку пар підпис → число й ламав його. А сам факт
              і так сказаний тричі поруч — бурштиновою рамкою поля, бейджем
              «Треба погодження» під ним і рискою дна на смузі. Заморозка
              лишається: вона пояснює, чому поле не рухається.
            */}
            {markupFrozen ? <div>{frozenLabel}</div> : null}
          </div>
        ) : null}
      </div>
    </div>
    </div>
  );
}
