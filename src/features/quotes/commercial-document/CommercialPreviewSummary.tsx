import { AlertTriangle } from "lucide-react";

import {
  documentHasVariantGroup,
  formatMoney,
  formatMoneyRange,
  isMoneyRangeSpread,
  pricelessVariantRows,
  RUN_CHOICE_NOTE,
  VARIANT_GROUP_NOTE,
  type CommercialDocument,
} from "./document";

/**
 * Дві смуги прев'ю КП, які говорять про підсумок: попередження менеджерові ПЕРЕД
 * відправкою і сам підсумок із пам'ятками для клієнта.
 *
 * ЧОМУ ОКРЕМИМ ФАЙЛОМ. Розмітка прев'ю живе в `QuotesPage` — сторінці на вісім
 * тисяч рядків із власною стелею розміру. Ці два блоки не читають зі сторінки
 * нічого, крім готового `doc`, тож тримати їх усередині нема за що; заразом
 * тексти пам'яток перестали бути копіями — вони поруч, у `document.ts`.
 */

/**
 * ПОПЕРЕДЖЕННЯ ПРО ВАРІАНТ БЕЗ ЦІНИ — і воно НЕ їде клієнтові.
 *
 * Ні HTML, ні PDF, ні TSV його не мають: документ читає замовник, а порожня
 * ціна — наша внутрішня дірка. Прев'ю ж дивиться той, хто може її залатати, і
 * дивиться саме перед тим, як натиснути «Друк» або «Експорт».
 *
 * Правило «яка позиція вважається без ціни» живе в `pricelessVariantRows` і
 * покрите тестами; тут лише показ.
 */
export function CommercialPreviewVariantWarning({ doc }: { doc: CommercialDocument }) {
  const rows = pricelessVariantRows(doc);
  if (rows.length === 0) return null;

  return (
    <div className="tone-warning-subtle flex flex-wrap items-start gap-3 rounded-xl border px-3.5 py-3 text-sm">
      <span
        className="tone-warning grid h-7 w-7 shrink-0 place-items-center rounded-lg border"
        aria-hidden
      >
        <AlertTriangle className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-[16rem] flex-1 space-y-2 leading-relaxed">
        <div>
          {rows.length === 1
            ? "У позиції-варіанта не внесена ціна — у документі вона стоїть як "
            : "У позицій-варіантів не внесена ціна — у документі вони стоять як "}
          <b className="font-semibold tabular-nums">{formatMoney(0)}</b>:
        </div>
        {/* Поіменно, з номером прорахунку й місцем у ньому: у наборі з кількох
            прорахунків «десь є нуль» означає перебирати таблиці очима. */}
        <ul className="space-y-0.5">
          {rows.map((row) => (
            <li key={`${row.quoteNumber}-${row.position}-${row.name}`} className="font-medium">
              {row.quoteNumber} · поз. {row.position} · {row.name}
            </li>
          ))}
        </ul>
        <div className="text-muted-foreground">
          Нижню межу підсумку документ рахує по найдешевшому варіанту, тому клієнт побачить{" "}
          <b className="font-semibold tabular-nums">«{formatMoneyRange(doc.totalRange)}»</b>. Внесіть
          ціну або зніміть позначку «Варіант» у меню позиції.
        </div>
      </div>
    </div>
  );
}

/** Підсумок прев'ю: число «Разом» і пам'ятки, які поїдуть і в друкований документ. */
export function CommercialPreviewSummary({ doc }: { doc: CommercialDocument }) {
  const hasRunChoice = doc.sections.some((section) =>
    section.items.some((item) => item.runs.length > 1)
  );

  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3 space-y-1">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">Загальна сума</span>
        <span className="text-lg font-semibold">{formatMoneyRange(doc.totalRange)}</span>
      </div>
      {documentHasVariantGroup(doc) ? (
        <p className="text-xs text-muted-foreground">{VARIANT_GROUP_NOTE}</p>
      ) : null}
      {/* І межі, І справді кілька тиражів. Сама лише «сума — це діапазон» більше
          не доводить тиражів: відколи є роль «варіант», межі беруться й від неї,
          і пам'ятка про тиражі вискакувала там, де тираж у кожної позиції один. */}
      {isMoneyRangeSpread(doc.totalRange) && hasRunChoice ? (
        <p className="text-xs text-muted-foreground">{RUN_CHOICE_NOTE}</p>
      ) : null}
    </div>
  );
}
