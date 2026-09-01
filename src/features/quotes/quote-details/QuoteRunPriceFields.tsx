import { Label } from "@/components/ui/label";
import { SEGMENTED_GROUP_SM, SEGMENTED_TRIGGER_SM } from "@/components/ui/controlStyles";
import { SegmentedGroup } from "@/components/ui/segmented-group";
import { CurrencyAmountInput } from "@/features/quotes/components/CurrencyAmountInput";
import { PercentAmountInput } from "@/features/quotes/components/PercentAmountInput";
import { cn } from "@/lib/utils";
import type { QuoteRunMarkupState } from "@/lib/quoteMarkupApproval";
import {
  DEFAULT_MARKUP_RATE,
  MODEL_PRICE_VAT_LABEL,
  normalizeQuoteRunModelPriceVat,
  type QuoteRunModelPriceVat,
  type RunSalePricing,
} from "@/lib/quoteRuns";
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
    label: "Вартість товару / од.",
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

export function QuoteRunPriceFields({
  run,
  pricing,
  access,
  markupState,
  markupFrozen,
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
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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
            className={cn(
              field === "unit_price_model" &&
                modelPriceVatMissing &&
                "border-warning-soft-border focus-visible:ring-warning-soft-border/40"
            )}
          />
          {/*
            Позначка ПДВ стоїть ПІД сумою, а не в її підписі, бо це не уточнення
            назви поля, а окреме рішення, яке треба ухвалити (REQ-232). Три
            стани: жодна кнопка не натиснута, поки не обрали, — і саме цей стан
            тримає збереження. Чекбокс тут не годиться: його «вимкнено»
            неможливо відрізнити від «ще не дивився».
          */}
          {field === "unit_price_model" ? (
            <div className="space-y-1">
              <SegmentedGroup className={cn("inline-flex", SEGMENTED_GROUP_SM)}>
                {(["incl", "excl"] as QuoteRunModelPriceVat[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    // `whitespace-nowrap` — не косметика: колонка вужча за
                    // 200 px, і «без ПДВ» ламалось на два рядки, роздуваючи
                    // групу вдвічі (побачено в прев'ю, не тестом).
                    className={cn(SEGMENTED_TRIGGER_SM, "whitespace-nowrap px-2.5")}
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
                <div className="text-xs leading-tight text-warning-copy">
                  Оберіть, з ПДВ ця сума чи без — інакше тираж не збережеться.
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
          placeholder={String(DEFAULT_MARKUP_RATE)}
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
            {pricing.saleUnitPrice === null ? null : (
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
  );
}
